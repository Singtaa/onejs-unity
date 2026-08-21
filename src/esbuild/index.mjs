/**
 * OneJS Unity: esbuild plugins
 *
 * Usage:
 *   import { ussModulesPlugin, tailwindPlugin, copyAssetsPlugin, importTransformPlugin } from "onejs-unity/esbuild"
 */

export { ussModulesPlugin } from "./uss-modules.mjs"
export { tailwindPlugin } from "./tailwind.mjs"
export { themesPlugin } from "./themes.mjs"
export { copyAssetsPlugin } from "./copy-assets.mjs"
import nodeFs from "node:fs"
import { setFsProvider } from "../fs-provider.mjs"

// Node callers get the real filesystem without asking. A Worker imports the
// plugin modules directly and installs its own provider instead; see
// ../fs-provider.mjs.
setFsProvider(nodeFs)

export { setFsProvider, getFsProvider, getFs } from "../fs-provider.mjs"
export { importTransformPlugin, importTransformation, importTransform } from "./import-transform.mjs"
