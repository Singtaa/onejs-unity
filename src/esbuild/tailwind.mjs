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
 * @param {string[]} options.content: Content patterns to scan for classes
 * @param {string[]} [options.safelist]: Class names to always include (for dynamic/variable classes)
 * @param {boolean} [options.preflight]: Strip the runtime theme's control chrome, like web Tailwind's preflight (default false)
 */
export function tailwindPlugin(options = {}) {
    const {
        content = ["./index.tsx", "./**/*.{tsx,ts,jsx,js}"],
        safelist = [],
        preflight = false,
    } = options

    return {
        name: "tailwind-uss",

        setup(build) {
            // Handle virtual import: import "onejs:tailwind"
            build.onResolve({ filter: /^onejs:tailwind$/ }, () => {
                return {
                    path: "onejs:tailwind",
                    namespace: "onejs-tailwind",
                }
            })

            // Generate USS for the virtual module
            build.onLoad({ filter: /.*/, namespace: "onejs-tailwind" }, async () => {
                // Every file the scan read. esbuild watches only what it loaded
                // itself, and a file `content` names need not be in the bundle
                // (markup the bundle never imports, say), so without these an
                // edit to one leaves the stylesheet stale until something the
                // bundle does import changes.
                const files = new Set()
                try {
                    // Scan source files and generate USS
                    const ussContent = await generateFromFiles(content, {
                        includeReset: true,
                        preflight,
                        safelist,
                        files,
                    })

                    // Escape USS for JavaScript string embedding
                    const escapedUss = ussContent
                        .replace(/\\/g, "\\\\")
                        .replace(/`/g, "\\`")
                        .replace(/\$/g, "\\$")

                    // Generate JavaScript module that embeds USS and compiles at runtime
                    const jsContent = `// OneJS Tailwind USS
// Auto-generated from source files: do not edit

const css = \`${escapedUss}\`
compileStyleSheet(css, "tailwind.uss")

export default css
`

                    console.log(`[tailwind-uss] Generated ${ussContent.split("\n").length} lines`)

                    return {
                        contents: jsContent,
                        loader: "js",
                        watchFiles: [...files],
                    }
                } catch (error) {
                    console.error(`[tailwind-uss] Error:`, error.message)
                    return {
                        errors: [{ text: error.message }],
                        watchFiles: [...files],
                    }
                }
            })
        },
    }
}

export default tailwindPlugin
