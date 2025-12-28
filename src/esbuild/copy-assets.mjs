/**
 * esbuild plugin for copying assets from npm packages to StreamingAssets
 *
 * Scans node_modules for packages with "onejs.assets" field in their package.json.
 * Copies their assets to a destination folder (typically StreamingAssets/onejs/).
 *
 * Usage in package.json:
 * {
 *   "name": "@my-scope/my-ui-kit",
 *   "onejs": {
 *     "assets": "assets"  // folder containing images, fonts, etc.
 *   }
 * }
 *
 * Assets will be copied to: <dest>/@my-scope/my-ui-kit/...
 */

import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

/**
 * Get MD5 hash of a file for change detection
 */
function getFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath)
        return crypto.createHash("md5").update(content).digest("hex")
    } catch {
        return null
    }
}

/**
 * Recursively copy directory with optional filtering
 */
function copyDirSync(src, dest, options = {}) {
    const { filter, onCopy } = options

    if (!fs.existsSync(src)) return

    fs.mkdirSync(dest, { recursive: true })

    const entries = fs.readdirSync(src, { withFileTypes: true })

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)

        // Apply filter if provided
        if (filter && !filter(srcPath, entry)) continue

        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath, options)
        } else {
            // Check if file needs copying (hash comparison)
            const srcHash = getFileHash(srcPath)
            const destHash = getFileHash(destPath)

            if (srcHash !== destHash) {
                fs.copyFileSync(srcPath, destPath)
                if (onCopy) onCopy(srcPath, destPath)
            }
        }
    }
}

/**
 * Find all packages with onejs.assets configuration
 */
/**
 * Check if entry is a directory or symlink to directory
 */
function isDirectoryEntry(entry, parentPath) {
    if (entry.isDirectory()) return true
    if (entry.isSymbolicLink()) {
        // Check if symlink target is a directory
        try {
            const fullPath = path.join(parentPath, entry.name)
            const stat = fs.statSync(fullPath)
            return stat.isDirectory()
        } catch {
            return false
        }
    }
    return false
}

function findAssetPackages(nodeModulesPath) {
    const packages = []

    if (!fs.existsSync(nodeModulesPath)) return packages

    const entries = fs.readdirSync(nodeModulesPath, { withFileTypes: true })

    for (const entry of entries) {
        if (!isDirectoryEntry(entry, nodeModulesPath)) continue

        const entryPath = path.join(nodeModulesPath, entry.name)

        // Handle scoped packages (@scope/name)
        if (entry.name.startsWith("@")) {
            const scopedEntries = fs.readdirSync(entryPath, { withFileTypes: true })
            for (const scopedEntry of scopedEntries) {
                if (!isDirectoryEntry(scopedEntry, entryPath)) continue

                const pkgPath = path.join(entryPath, scopedEntry.name)
                const pkgJsonPath = path.join(pkgPath, "package.json")

                if (fs.existsSync(pkgJsonPath)) {
                    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"))
                    const assetsPath = pkgJson.onejs?.assets

                    if (assetsPath) {
                        packages.push({
                            name: `${entry.name}/${scopedEntry.name}`,
                            path: pkgPath,
                            assetsPath: path.join(pkgPath, assetsPath),
                        })
                    }
                }
            }
        } else {
            // Non-scoped package
            const pkgJsonPath = path.join(entryPath, "package.json")

            if (fs.existsSync(pkgJsonPath)) {
                const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"))
                const assetsPath = pkgJson.onejs?.assets

                if (assetsPath) {
                    packages.push({
                        name: entry.name,
                        path: entryPath,
                        assetsPath: path.join(entryPath, assetsPath),
                    })
                }
            }
        }
    }

    return packages
}

/**
 * Creates the esbuild plugin for copying assets
 *
 * @param {Object} options - Plugin options
 * @param {string} options.dest - Destination folder (default: "Assets/StreamingAssets/onejs")
 * @param {Function} options.filter - Optional filter function (srcPath, entry) => boolean
 * @param {boolean} options.verbose - Log copied files (default: false)
 */
export function copyAssetsPlugin(options = {}) {
    const {
        dest = "Assets/StreamingAssets/onejs",
        filter = null,
        verbose = false,
    } = options

    return {
        name: "copy-assets",

        setup(build) {
            // Run after build completes
            build.onEnd(async (result) => {
                if (result.errors.length > 0) return

                const nodeModulesPath = path.resolve(process.cwd(), "node_modules")
                const destPath = path.resolve(process.cwd(), "..", dest)

                const packages = findAssetPackages(nodeModulesPath)

                if (packages.length === 0) {
                    if (verbose) {
                        console.log("[copy-assets] No packages with onejs.assets found")
                    }
                    return
                }

                let totalCopied = 0

                for (const pkg of packages) {
                    if (!fs.existsSync(pkg.assetsPath)) {
                        console.warn(`[copy-assets] Assets path not found for ${pkg.name}: ${pkg.assetsPath}`)
                        continue
                    }

                    const pkgDestPath = path.join(destPath, pkg.name)

                    copyDirSync(pkg.assetsPath, pkgDestPath, {
                        filter,
                        onCopy: (src, dst) => {
                            totalCopied++
                            if (verbose) {
                                const relSrc = path.relative(process.cwd(), src)
                                const relDst = path.relative(process.cwd(), dst)
                                console.log(`[copy-assets] ${relSrc} -> ${relDst}`)
                            }
                        },
                    })
                }

                if (totalCopied > 0 || verbose) {
                    console.log(`[copy-assets] Copied ${totalCopied} files from ${packages.length} packages`)
                }
            })
        },
    }
}

export default copyAssetsPlugin
