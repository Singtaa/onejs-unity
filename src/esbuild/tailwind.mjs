/**
 * esbuild plugin for Tailwind CSS -> USS transformation
 *
 * Processes .css files through:
 * 1. Tailwind CSS (JIT compilation)
 * 2. PostCSS USS transform (character escaping, media query conversion)
 * 3. PostCSS USS cleanup (remove unsupported properties)
 * 4. PostCSS USS unwrap-is (flatten :is() selectors)
 *
 * Like CSS Modules, the USS is embedded in the JS bundle and loaded via
 * compileStyleSheet() at runtime. This ensures it works in standalone builds.
 */

import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

// Import our custom PostCSS plugins
import { ussTransform, ussCleanup, ussUnwrapIs } from "../postcss/index.mjs"

// Use createRequire to resolve dependencies from the consumer's context
// This allows the plugin to work when used via file: references
const require = createRequire(path.join(process.cwd(), "package.json"))
const postcss = require("postcss")
const tailwindcss = require("tailwindcss")

/**
 * Create the Tailwind esbuild plugin
 *
 * @param {Object} options
 * @param {string} options.tailwindConfig - Path to tailwind.config.js
 */
export function tailwindPlugin(options = {}) {
    const {
        tailwindConfig = "./tailwind.config.js",
    } = options

    // Track processed files for incremental builds
    const processedFiles = new Map()

    return {
        name: "tailwind-uss",

        setup(build) {
            // Resolve config path relative to working directory
            const configPath = path.resolve(process.cwd(), tailwindConfig)

            // Handle .css imports (Tailwind entry points)
            build.onResolve({ filter: /\.css$/ }, (args) => {
                // Only process CSS files in styles directory or explicitly marked
                if (args.path.includes("tailwind") || args.path.startsWith("./styles/")) {
                    const resolved = path.resolve(args.resolveDir, args.path)
                    return {
                        path: resolved,
                        namespace: "tailwind-css",
                    }
                }
                return null // Let other plugins handle it
            })

            // Process Tailwind CSS files
            build.onLoad({ filter: /.*/, namespace: "tailwind-css" }, async (args) => {
                const cssPath = args.path
                const cssContent = await fs.readFile(cssPath, "utf8")
                const relativePath = path.relative(process.cwd(), cssPath)

                // Check if file has changed (for watch mode)
                const lastHash = processedFiles.get(cssPath)
                const currentHash = simpleHash(cssContent)

                // In watch mode, return cached JS if content unchanged
                if (lastHash === currentHash) {
                    const cached = processedFiles.get(cssPath + "_js")
                    if (cached) {
                        return {
                            contents: cached,
                            loader: "js",
                        }
                    }
                }
                processedFiles.set(cssPath, currentHash)

                try {
                    // Process through PostCSS pipeline
                    const result = await postcss([
                        tailwindcss(configPath),
                        ussTransform(),
                        ussUnwrapIs(),
                        ussCleanup({ removeEmpty: true }),
                    ]).process(cssContent, {
                        from: cssPath,
                        to: cssPath.replace(".css", ".uss"),
                    })

                    const ussContent = result.css

                    // Escape USS for JavaScript string embedding
                    const escapedUss = ussContent
                        .replace(/\\/g, "\\\\")
                        .replace(/`/g, "\\`")
                        .replace(/\$/g, "\\$")

                    // Generate JavaScript module that embeds USS and compiles at runtime
                    const jsContent = `// Tailwind USS: ${relativePath}
// Auto-generated - do not edit

const css = \`${escapedUss}\`
compileStyleSheet(css, "tailwind.uss")

export default css
`
                    // Cache the generated JS
                    processedFiles.set(cssPath + "_js", jsContent)

                    console.log(`[tailwind-uss] Compiled ${relativePath}`)

                    return {
                        contents: jsContent,
                        loader: "js",
                    }
                } catch (error) {
                    console.error(`[tailwind-uss] Error processing ${cssPath}:`, error.message)
                    return {
                        errors: [{
                            text: error.message,
                            location: { file: cssPath },
                        }],
                    }
                }
            })
        },
    }
}

/**
 * Simple hash function for change detection
 */
function simpleHash(str) {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString(36)
}

export default tailwindPlugin
