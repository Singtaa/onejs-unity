/**
 * esbuild plugin for copying assets to StreamingAssets
 *
 * Handles two types of assets:
 * 1. User assets from {WorkingDir}/assets/ → StreamingAssets/onejs/
 * 2. npm package assets (with "onejs.assets" field) → StreamingAssets/onejs/
 *
 * npm packages should namespace their assets with @package-name/ prefix:
 * {
 *   "name": "rainbow-sample",
 *   "onejs": { "assets": "assets" }
 * }
 * With structure:
 *   rainbow-sample/assets/@rainbow-sample/bg.png
 *
 * This copies FLAT to StreamingAssets/onejs/@rainbow-sample/bg.png
 *
 * Also generates a manifest file for Editor path resolution.
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

    if (!fs.existsSync(src)) return 0

    fs.mkdirSync(dest, { recursive: true })

    const entries = fs.readdirSync(src, { withFileTypes: true })
    let copied = 0

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)

        // Apply filter if provided
        if (filter && !filter(srcPath, entry)) continue

        if (entry.isDirectory() || entry.isSymbolicLink()) {
            // For symlinks, check if target is directory
            try {
                const stat = fs.statSync(srcPath)
                if (stat.isDirectory()) {
                    copied += copyDirSync(srcPath, destPath, options)
                }
            } catch {
                continue
            }
        } else {
            // Check if file needs copying (hash comparison)
            const srcHash = getFileHash(srcPath)
            const destHash = getFileHash(destPath)

            if (srcHash !== destHash) {
                fs.copyFileSync(srcPath, destPath)
                copied++
                if (onCopy) onCopy(srcPath, destPath)
            }
        }
    }

    return copied
}

/**
 * Check if entry is a directory or symlink to directory
 */
function isDirectoryEntry(entry, parentPath) {
    if (entry.isDirectory()) return true
    if (entry.isSymbolicLink()) {
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

/**
 * Find all packages with onejs.assets configuration
 */
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
                    const assetsConfig = pkgJson.onejs?.assets

                    if (assetsConfig) {
                        packages.push({
                            name: `${entry.name}/${scopedEntry.name}`,
                            path: pkgPath,
                            assetsPath: path.join(pkgPath, assetsConfig),
                            assetsDir: assetsConfig,
                        })
                    }
                }
            }
        } else {
            // Non-scoped package
            const pkgJsonPath = path.join(entryPath, "package.json")

            if (fs.existsSync(pkgJsonPath)) {
                const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"))
                const assetsConfig = pkgJson.onejs?.assets

                if (assetsConfig) {
                    packages.push({
                        name: entry.name,
                        path: entryPath,
                        assetsPath: path.join(entryPath, assetsConfig),
                        assetsDir: assetsConfig,
                    })
                }
            }
        }
    }

    return packages
}

/**
 * Scan a directory for @-prefixed folders (package asset namespaces)
 */
function findAssetNamespaces(assetsPath) {
    const namespaces = []

    if (!fs.existsSync(assetsPath)) return namespaces

    const entries = fs.readdirSync(assetsPath, { withFileTypes: true })

    for (const entry of entries) {
        if (entry.name.startsWith("@") && isDirectoryEntry(entry, assetsPath)) {
            namespaces.push(entry.name)
        }
    }

    return namespaces
}

/**
 * Creates the esbuild plugin for copying assets
 *
 * @param {Object} options - Plugin options
 * @param {string} options.dest - Destination folder (default: "Assets/StreamingAssets/onejs")
 * @param {string} options.userAssets - User assets folder (default: "assets")
 * @param {string} options.manifestPath - Manifest file path (default: ".onejs/assets-manifest.json")
 * @param {Function} options.filter - Optional filter function (srcPath, entry) => boolean
 * @param {boolean} options.verbose - Log copied files (default: false)
 */
export function copyAssetsPlugin(options = {}) {
    const {
        dest = "Assets/StreamingAssets/onejs",
        userAssets = "assets",
        manifestPath = ".onejs/assets-manifest.json",
        filter = null,
        verbose = false,
    } = options

    return {
        name: "copy-assets",

        setup(build) {
            // Run after build completes
            build.onEnd(async (result) => {
                if (result.errors.length > 0) return

                const workingDir = process.cwd()
                const nodeModulesPath = path.resolve(workingDir, "node_modules")
                const destPath = path.resolve(workingDir, "..", dest)
                const userAssetsPath = path.resolve(workingDir, userAssets)
                const manifestFullPath = path.resolve(workingDir, manifestPath)

                let totalCopied = 0
                const manifest = {
                    // Maps @namespace to source path (for Editor resolution)
                    namespaces: {},
                    // User assets base path
                    userAssetsPath: userAssets,
                    // Build destination
                    destPath: dest,
                }

                // 1. Copy user assets (if exists)
                if (fs.existsSync(userAssetsPath)) {
                    const copied = copyDirSync(userAssetsPath, destPath, {
                        filter,
                        onCopy: (src, dst) => {
                            if (verbose) {
                                const relSrc = path.relative(workingDir, src)
                                const relDst = path.relative(workingDir, dst)
                                console.log(`[copy-assets] ${relSrc} -> ${relDst}`)
                            }
                        },
                    })
                    totalCopied += copied

                    // Find any @-namespaces in user assets
                    const userNamespaces = findAssetNamespaces(userAssetsPath)
                    for (const ns of userNamespaces) {
                        manifest.namespaces[ns] = {
                            type: "user",
                            path: path.join(userAssets, ns),
                        }
                    }
                }

                // 2. Copy npm package assets
                const packages = findAssetPackages(nodeModulesPath)

                for (const pkg of packages) {
                    if (!fs.existsSync(pkg.assetsPath)) {
                        console.warn(`[copy-assets] Assets path not found for ${pkg.name}: ${pkg.assetsPath}`)
                        continue
                    }

                    // Copy FLAT to dest (not nested under package name)
                    const copied = copyDirSync(pkg.assetsPath, destPath, {
                        filter,
                        onCopy: (src, dst) => {
                            if (verbose) {
                                const relSrc = path.relative(workingDir, src)
                                const relDst = path.relative(workingDir, dst)
                                console.log(`[copy-assets] ${relSrc} -> ${relDst}`)
                            }
                        },
                    })
                    totalCopied += copied

                    // Find @-namespaces in this package's assets
                    const pkgNamespaces = findAssetNamespaces(pkg.assetsPath)
                    for (const ns of pkgNamespaces) {
                        manifest.namespaces[ns] = {
                            type: "package",
                            package: pkg.name,
                            path: path.join("node_modules", pkg.name, pkg.assetsDir, ns),
                        }
                    }
                }

                // 3. Write manifest file
                fs.mkdirSync(path.dirname(manifestFullPath), { recursive: true })
                fs.writeFileSync(manifestFullPath, JSON.stringify(manifest, null, 2))

                if (verbose) {
                    console.log(`[copy-assets] Wrote manifest: ${manifestPath}`)
                }

                if (totalCopied > 0 || verbose) {
                    console.log(`[copy-assets] Copied ${totalCopied} files`)
                }
            })
        },
    }
}

export default copyAssetsPlugin
