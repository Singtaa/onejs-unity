/**
 * The filesystem the build plugins read through.
 *
 * The plugins normally read real files, which is right for a Unity project and
 * impossible in a Cloudflare Worker: OneJS Play accepts a game as source and
 * bundles it server-side, where there is no disk and the "files" are an
 * uploaded tree held in memory.
 *
 * Rather than forking the plugins, they read through a provider a host can
 * replace. Same shape as the input backend seam in src/input/backend.ts: one
 * implementation, a swappable source.
 *
 * This module deliberately imports nothing from node, so bundling a plugin for
 * a Worker never drags node:fs in. Node callers get the real thing installed
 * for them by src/esbuild/index.mjs, which is the entry they already import.
 *
 *     // in a Worker, importing plugin modules directly rather than the index
 *     import { setFsProvider } from "onejs-unity/fs-provider"
 *     setFsProvider(virtualFsBackedByTheUploadedTree)
 *
 * The provider needs only what the plugins actually call:
 *
 *     existsSync(path)                  readdirSync(path, opts)
 *     statSync(path)                    writeFileSync(path, data)
 *     mkdirSync(path, opts)
 *     promises.readFile(path, encoding) promises.writeFile(path, data)
 *     promises.readdir(path, opts)
 *
 * readdirSync and promises.readdir are called with { withFileTypes: true }, so
 * entries must carry isDirectory() and isFile().
 */

let provider = null

/** Installs the filesystem the plugins read through. Pass null to clear it. */
export function setFsProvider(next) {
    provider = next
}

/** The installed filesystem, or null when none has been set. */
export function getFsProvider() {
    return provider
}

/**
 * The filesystem to read through.
 *
 * Throws rather than falling back to node:fs, because a silent fallback in a
 * Worker would fail later and further away, with an error that says nothing
 * about the real problem.
 */
export function getFs() {
    if (provider === null) {
        throw new Error(
            "[onejs-unity] no fs provider installed. Node callers get one from " +
            "onejs-unity/esbuild; other hosts must call setFsProvider first.",
        )
    }
    return provider
}
