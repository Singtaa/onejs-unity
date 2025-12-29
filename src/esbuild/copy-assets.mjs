/**
 * esbuild plugin for generating asset manifest (and optionally copying assets)
 *
 * By default, this plugin ONLY generates a manifest file for Editor path resolution.
 * Asset copying to StreamingAssets is handled by Unity's JSRunnerBuildProcessor during
 * actual Unity builds - this keeps StreamingAssets clean during development.
 *
 * Handles two types of assets:
 * 1. User assets from {WorkingDir}/assets/
 * 2. npm package assets (packages with "onejs.assets" field in package.json)
 *
 * npm packages should namespace their assets with @package-name/ prefix:
 * {
 *   "name": "rainbow-sample",
 *   "onejs": { "assets": "assets" }
 * }
 * With structure:
 *   rainbow-sample/assets/@rainbow-sample/bg.png
 *
 * During Unity build, assets are copied FLAT to StreamingAssets/onejs/assets/@rainbow-sample/bg.png
 */

import fs from "node:fs"
import path from "node:path"

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
 * Creates the esbuild plugin for generating asset manifest
 *
 * By default, only generates a manifest file. Asset copying is handled by Unity's
 * build processor to keep StreamingAssets clean during development.
 *
 * @param {Object} options - Plugin options
 * @param {string} options.dest - Destination folder for manifest reference (default: "Assets/StreamingAssets/onejs/assets")
 * @param {string} options.userAssets - User assets folder (default: "assets")
 * @param {string} options.manifestPath - Manifest file path (default: ".onejs/assets-manifest.json")
 * @param {boolean} options.verbose - Log details (default: false)
 */
export function copyAssetsPlugin(options = {}) {
    const {
        dest = "Assets/StreamingAssets/onejs/assets",
        userAssets = "assets",
        manifestPath = ".onejs/assets-manifest.json",
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
                const userAssetsPath = path.resolve(workingDir, userAssets)
                const manifestFullPath = path.resolve(workingDir, manifestPath)

                const manifest = {
                    // Maps @namespace to source path (for Editor resolution)
                    namespaces: {},
                    // User assets base path
                    userAssetsPath: userAssets,
                    // Build destination (used by Unity build processor)
                    destPath: dest,
                }

                // 1. Scan user assets for @-namespaces
                if (fs.existsSync(userAssetsPath)) {
                    const userNamespaces = findAssetNamespaces(userAssetsPath)
                    for (const ns of userNamespaces) {
                        manifest.namespaces[ns] = {
                            type: "user",
                            path: path.join(userAssets, ns),
                        }
                    }
                }

                // 2. Scan npm packages for assets
                const packages = findAssetPackages(nodeModulesPath)

                for (const pkg of packages) {
                    if (!fs.existsSync(pkg.assetsPath)) {
                        console.warn(`[copy-assets] Assets path not found for ${pkg.name}: ${pkg.assetsPath}`)
                        continue
                    }

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
                    console.log(`[copy-assets] Generated manifest: ${manifestPath}`)
                    console.log(`[copy-assets] Found ${Object.keys(manifest.namespaces).length} asset namespace(s)`)
                }
            })
        },
    }
}

export default copyAssetsPlugin
