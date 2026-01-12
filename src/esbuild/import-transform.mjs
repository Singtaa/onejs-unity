import fs from "fs"

/**
 * esbuild plugin that transforms imports from C# namespaces to CS.* references.
 *
 * Transforms:
 *   import { Texture2D, Material } from "UnityEngine"
 *   import { List } from "System.Collections.Generic"
 *   import DefaultName from "UnityEngine"
 *   import * as UE from "UnityEngine"
 *
 * Into:
 *   const { Texture2D, Material } = CS.UnityEngine
 *   const { List } = CS.System.Collections.Generic
 *   const DefaultName = CS.UnityEngine
 *   const UE = CS.UnityEngine
 *
 * Only transforms imports where the module name starts with an uppercase letter,
 * which matches the convention for C# namespaces (UnityEngine, System, etc.)
 *
 * @param {Object} options
 * @param {(moduleName: string) => boolean} [options.filter] - Custom filter for which modules to transform
 */
export function importTransformPlugin(options = {}) {
    const { filter } = options

    // Default: transform modules starting with uppercase letter
    const shouldTransform = filter || ((name) => /^[A-Z]/.test(name))

    return {
        name: "import-transform",
        setup(build) {
            // Transform source files to replace C# namespace imports with CS.* references
            build.onLoad({ filter: /\.(tsx?|jsx?|mjs)$/ }, async (args) => {
                // Skip node_modules except for local packages
                if (args.path.includes("node_modules") && !args.path.includes("onejs-")) {
                    return null
                }

                const source = await fs.promises.readFile(args.path, "utf8")

                // Check if this file has any imports that need transformation
                // Match import statements with uppercase module names
                const importRegex = /import\s+(?:(\*\s+as\s+(\w+))|(?:(\w+)(?:\s*,\s*)?)?(?:\{([^}]*)\})?)\s+from\s+["']([^"']+)["']/g

                let transformed = source
                let hasTransforms = false
                const replacements = []

                let match
                while ((match = importRegex.exec(source)) !== null) {
                    const [fullMatch, starImport, starAlias, defaultImport, namedImports, moduleName] = match

                    if (!shouldTransform(moduleName)) continue

                    hasTransforms = true
                    const csPath = "CS." + moduleName.replace(/\//g, ".")

                    let replacement = ""

                    // Handle: import * as UE from "UnityEngine"
                    if (starImport && starAlias) {
                        replacement = `const ${starAlias} = ${csPath}`
                    }
                    // Handle: import Default from "UnityEngine"
                    else if (defaultImport && !namedImports) {
                        replacement = `const ${defaultImport} = ${csPath}`
                    }
                    // Handle: import { A, B } from "UnityEngine"
                    else if (namedImports && !defaultImport) {
                        replacement = `const {${namedImports}} = ${csPath}`
                    }
                    // Handle: import Default, { A, B } from "UnityEngine"
                    else if (defaultImport && namedImports) {
                        replacement = `const ${defaultImport} = ${csPath}; const {${namedImports}} = ${csPath}`
                    }
                    // Handle: import "UnityEngine" (side-effect only - rare but valid)
                    else {
                        replacement = `/* ${fullMatch} - side-effect import removed */`
                    }

                    replacements.push({ start: match.index, end: match.index + fullMatch.length, replacement })
                }

                if (!hasTransforms) {
                    return null // Let esbuild handle normally
                }

                // Apply replacements in reverse order to maintain correct positions
                for (let i = replacements.length - 1; i >= 0; i--) {
                    const { start, end, replacement } = replacements[i]
                    transformed = transformed.slice(0, start) + replacement + transformed.slice(end)
                }

                // Determine loader from file extension
                const ext = args.path.split(".").pop()
                const loader = ext === "tsx" ? "tsx" : ext === "ts" ? "ts" : ext === "jsx" ? "jsx" : "js"

                return {
                    contents: transformed,
                    loader,
                }
            })
        },
    }
}

// Aliases for compatibility
export const importTransformation = importTransformPlugin
export const importTransform = importTransformPlugin
