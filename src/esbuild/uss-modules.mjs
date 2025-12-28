import fs from "fs"
import path from "path"
import crypto from "crypto"

/**
 * esbuild plugin for USS Modules support in OneJS
 *
 * Transforms .module.uss files into JavaScript modules with scoped class names.
 *
 * Example input (Button.module.uss):
 *   .container { padding: 10px; }
 *   .primary { background-color: blue; }
 *
 * Example output:
 *   const css = `.container__a1b2c3 { padding: 10px; }
 *   .primary__a1b2c3 { background-color: blue; }`;
 *   compileStyleSheet(css, "components/Button.module.uss");
 *   export default { container: "container__a1b2c3", primary: "primary__a1b2c3" };
 */

/**
 * Generates a short hash from file path for class scoping
 * @param {string} filePath - Path to the module file
 * @returns {string} 6-character hash
 */
function generateHash(filePath) {
    const hash = crypto.createHash("md5").update(filePath).digest("hex")
    return hash.slice(0, 6)
}

/**
 * Extracts class names from USS content
 * Handles:
 * - Simple class selectors: .className
 * - Pseudo-classes: .className:hover (extracts className, not hover)
 * - Descendant selectors: .parent .child
 * - Multiple selectors: .a, .b
 *
 * @param {string} ussContent - Raw USS content
 * @param {string} hash - Hash to append to class names
 * @returns {Object} Map of original class name to scoped name
 */
function extractClassNames(ussContent, hash) {
    // Match class selectors that start with a dot followed by valid CSS identifier
    // This regex captures class names but not pseudo-class names (which follow :)
    const classRegex = /\.([a-zA-Z_][\w-]*)/g
    const classMap = {}
    let match

    while ((match = classRegex.exec(ussContent)) !== null) {
        const className = match[1]

        // Skip:
        // - Already scoped names (contain __)
        // - Unity built-in classes (start with unity-)
        // - Pseudo-class parts that might leak through
        if (!className.includes("__") &&
            !className.startsWith("unity-") &&
            !className.startsWith("hover") &&
            !className.startsWith("active") &&
            !className.startsWith("focus") &&
            !className.startsWith("checked") &&
            !className.startsWith("disabled")) {
            classMap[className] = `${className}__${hash}`
        }
    }

    return classMap
}

/**
 * Replaces class names in USS content with scoped versions
 * @param {string} ussContent - Raw USS content
 * @param {Object} classMap - Map of original to scoped names
 * @returns {string} USS content with scoped class names
 */
function scopeClassNames(ussContent, classMap) {
    let scoped = ussContent

    // Sort by length (longest first) to avoid partial replacements
    // e.g., ".button" shouldn't match ".button-primary"
    const sortedNames = Object.keys(classMap).sort((a, b) => b.length - a.length)

    for (const className of sortedNames) {
        // Match .className but:
        // - Not followed by __ (already scoped)
        // - Not followed by - (part of longer name like button-primary)
        // - Must be followed by word boundary, space, comma, colon, or bracket
        const regex = new RegExp(
            `\\.${escapeRegex(className)}(?![-_a-zA-Z0-9])(?!__)`,
            "g"
        )
        scoped = scoped.replace(regex, `.${classMap[className]}`)
    }

    return scoped
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Generates TypeScript declaration file content
 * @param {Object} classMap - Map of class names
 * @returns {string} TypeScript .d.ts content
 */
function generateDts(classMap) {
    const entries = Object.keys(classMap)
        .sort()
        .map(name => `    readonly "${name}": string`)
        .join("\n")

    return `declare const styles: {
${entries}
}
export default styles
`
}

/**
 * Creates the esbuild plugin for USS Modules
 * @param {Object} options - Plugin options
 * @param {boolean} options.generateTypes - Whether to generate .d.ts files (default: true)
 * @returns {Object} esbuild plugin
 */
export function ussModulesPlugin(options = {}) {
    const { generateTypes = true } = options

    return {
        name: "uss-modules",

        setup(build) {
            // Handle .module.uss imports
            build.onResolve({ filter: /\.module\.uss$/ }, (args) => {
                const resolved = path.resolve(args.resolveDir, args.path)
                return {
                    path: resolved,
                    namespace: "uss-module"
                }
            })

            // Transform .module.uss files
            build.onLoad({ filter: /.*/, namespace: "uss-module" }, async (args) => {
                const ussContent = await fs.promises.readFile(args.path, "utf8")
                const relativePath = path.relative(process.cwd(), args.path)
                const hash = generateHash(relativePath)

                // Extract and scope class names
                const classMap = extractClassNames(ussContent, hash)
                const scopedUss = scopeClassNames(ussContent, classMap)

                // Generate TypeScript declarations
                if (generateTypes) {
                    const dtsPath = args.path + ".d.ts"
                    const dtsContent = generateDts(classMap)
                    await fs.promises.writeFile(dtsPath, dtsContent)
                }

                // Escape USS for JavaScript string
                const escapedUss = scopedUss
                    .replace(/\\/g, "\\\\")
                    .replace(/`/g, "\\`")
                    .replace(/\$/g, "\\$")

                // Generate JavaScript module
                const classMapJson = JSON.stringify(classMap, null, 4)

                const jsContent = `// USS Module: ${relativePath}
// Auto-generated - do not edit

const css = \`${escapedUss}\`
compileStyleSheet(css, "${relativePath}")

const styles = ${classMapJson}
export default styles
`

                return {
                    contents: jsContent,
                    loader: "js"
                }
            })
        }
    }
}

export default ussModulesPlugin
