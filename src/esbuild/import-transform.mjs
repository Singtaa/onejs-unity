/**
 * esbuild plugin that transforms imports from C# namespaces to CS.* references.
 *
 * Transforms:
 *   import { Texture2D, Material } from "UnityEngine"
 *   import { List } from "System.Collections.Generic"
 *
 * Into:
 *   const { Texture2D, Material } = CS.UnityEngine
 *   const { List } = CS.System.Collections.Generic
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
            // Mark matching imports as external so esbuild doesn't try to resolve them
            build.onResolve({ filter: /.*/ }, (args) => {
                if (args.kind === "import-statement" && shouldTransform(args.path)) {
                    return {
                        path: args.path,
                        namespace: "cs-namespace",
                        external: false,
                    }
                }
                return null
            })

            // Transform the import into a CS.* reference
            build.onLoad({ filter: /.*/, namespace: "cs-namespace" }, (args) => {
                // Generate code that exports from CS global
                const modulePath = args.path.replace(/\//g, ".")
                return {
                    contents: `module.exports = CS.${modulePath}`,
                    loader: "js",
                }
            })
        },
    }
}

// Aliases for compatibility
export const importTransformation = importTransformPlugin
export const importTransform = importTransformPlugin
