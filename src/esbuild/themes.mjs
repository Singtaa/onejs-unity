/**
 * esbuild plugin for OneJS cartridge theme registration
 *
 * Usage:
 *   import "onejs:themes"
 *
 * Resolves to a generated module that side-effect-imports every extracted
 * cartridge theme module (files matching *Theme.ts / *Theme.tsx under the
 * working directory's @cartridges/ folder), so each one registers its theme
 * name. One stable import replaces the per-theme relative imports, which were
 * easy to typo, invisible to autocomplete before extraction, and routinely
 * stripped by unused-import lint fixes.
 *
 * The explicit relative import (`import "./@cartridges/@singtaa/kawaii/kawaiiTheme"`)
 * keeps working and remains the way to register a strict subset.
 */

import { getFs } from "../fs-provider.mjs"
import path from "path"

/**
 * Recursively collect theme modules under a directory.
 * Returns { files, dirs }: matched file paths and every directory visited
 * (the directories feed esbuild's watch so a new extraction triggers a rebuild).
 *
 * @param {string} rootDir Directory to scan (typically {app}/@cartridges)
 * @param {RegExp} pattern File-name pattern identifying a theme module
 */
export function findThemeModules(rootDir, pattern = /Theme\.(ts|tsx)$/) {
    const files = []
    const dirs = []
    // Resolved outside the walk so a missing fs provider throws. Inside, the
    // catch would swallow it as though the directory were simply absent, and a
    // misconfigured host would silently find no themes at all.
    const fs = getFs()
    const walk = (dir) => {
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
            return // missing or unreadable: same as empty
        }
        dirs.push(dir)
        for (const entry of entries) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) walk(full)
            else if (pattern.test(entry.name)) files.push(full)
        }
    }
    walk(rootDir)
    files.sort()
    return { files, dirs }
}

/**
 * Create the themes esbuild plugin
 *
 * @param {Object} options
 * @param {string} [options.dir] Cartridges folder relative to the working directory (default "@cartridges")
 * @param {RegExp} [options.pattern] File-name pattern identifying a theme module (default /Theme\.(ts|tsx)$/)
 */
export function themesPlugin(options = {}) {
    const {
        dir = "@cartridges",
        pattern = /Theme\.(ts|tsx)$/,
    } = options

    return {
        name: "onejs-themes",

        setup(build) {
            build.onResolve({ filter: /^onejs:themes$/ }, () => ({
                path: "onejs:themes",
                namespace: "onejs-themes",
            }))

            build.onLoad({ filter: /.*/, namespace: "onejs-themes" }, () => {
                const root = build.initialOptions.absWorkingDir || process.cwd()
                const cartridgesDir = path.resolve(root, dir)
                const { files, dirs } = findThemeModules(cartridgesDir, pattern)

                const relatives = files.map((f) =>
                    "./" + path.relative(root, f)
                        .split(path.sep).join("/")
                        .replace(/\.(ts|tsx)$/, ""))

                const lines = [
                    "// OneJS cartridge theme registrations",
                    `// Auto-generated from ${dir}/**/*Theme.ts: do not edit`,
                    ...relatives.map((r) => `import "${r}"`),
                    "export {}",
                    "",
                ]

                if (files.length > 0) {
                    console.log(`[onejs:themes] registered ${files.length} theme module(s): ${relatives.join(", ")}`)
                } else {
                    console.warn(`[onejs:themes] no *Theme.ts modules found under ${dir}/. Assign the theme cartridge to your JSRunner so it extracts, then rebuild.`)
                }

                return {
                    contents: lines.join("\n"),
                    loader: "js",
                    // Relative imports in the generated module resolve against the app root
                    resolveDir: root,
                    // A new extraction (new folder or file) must invalidate this module in watch mode
                    watchFiles: files,
                    watchDirs: dirs.length > 0 ? dirs : [root],
                }
            })
        },
    }
}
