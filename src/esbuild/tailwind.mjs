/**
 * esbuild plugin for OneJS Tailwind -> USS transformation
 *
 * Usage:
 *   import "onejs:tailwind"
 *
 * This scans your source files for Tailwind class names and generates
 * USS (Unity Style Sheets) that gets embedded in the bundle.
 *
 * No external tailwindcss dependency required.
 */

import { generateFromFiles } from "../tailwind/generator.mjs"

/**
 * Create the Tailwind esbuild plugin
 *
 * @param {Object} options
 * @param {string[]} options.content - Content patterns to scan for classes
 */
export function tailwindPlugin(options = {}) {
    const {
        content = ["./index.tsx", "./**/*.{tsx,ts,jsx,js}"],
    } = options

    return {
        name: "tailwind-uss",

        setup(build) {
            // Handle virtual import: import "onejs:tailwind"
            build.onResolve({ filter: /^onejs:tailwind$/ }, (args) => {
                return {
                    path: "onejs:tailwind",
                    namespace: "onejs-tailwind",
                }
            })

            // Generate USS for the virtual module
            build.onLoad({ filter: /.*/, namespace: "onejs-tailwind" }, async () => {
                try {
                    // Scan source files and generate USS
                    const ussContent = await generateFromFiles(content, {
                        includeReset: true,
                    })

                    // Escape USS for JavaScript string embedding
                    const escapedUss = ussContent
                        .replace(/\\/g, "\\\\")
                        .replace(/`/g, "\\`")
                        .replace(/\$/g, "\\$")

                    // Generate JavaScript module that embeds USS and compiles at runtime
                    const jsContent = `// OneJS Tailwind USS
// Auto-generated from source files - do not edit

const css = \`${escapedUss}\`
compileStyleSheet(css, "tailwind.uss")

export default css
`

                    console.log(`[tailwind-uss] Generated ${ussContent.split("\n").length} lines`)

                    return {
                        contents: jsContent,
                        loader: "js",
                    }
                } catch (error) {
                    console.error(`[tailwind-uss] Error:`, error.message)
                    return {
                        errors: [{ text: error.message }],
                    }
                }
            })
        },
    }
}

export default tailwindPlugin
