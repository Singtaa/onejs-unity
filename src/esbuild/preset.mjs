/**
 * The build every OneJS app runs, as one call.
 *
 *   // esbuild.config.mjs
 *   import { oneJSConfig } from "onejs-unity/esbuild"
 *   export default oneJSConfig({ entry: "index.tsx" })
 *
 * `onejs-unity build` and `onejs-unity watch` (src/cli.mjs) run it. The config
 * stays plain data, so a project can read it, spread it or pass it to esbuild
 * itself, and a fix to how OneJS apps build reaches every project through an
 * npm update instead of a file each project copied once.
 */

import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { importTransformPlugin } from "./import-transform.mjs"
import { slPlugin } from "./sl.mjs"
import { tailwindPlugin } from "./tailwind.mjs"
import { themesPlugin } from "./themes.mjs"
import { ussModulesPlugin } from "./uss-modules.mjs"

/**
 * @typedef {Object} OneJSConfigOptions
 * @property {string} [entry] The app's entry file, relative to `root`. Default `"index.tsx"`.
 * @property {string} [outfile] Where the bundle goes, relative to `root`. Default `"../app.js.txt"`,
 *   beside the app folder, where JSRunner reads it.
 * @property {string} [root] The app's working directory (the `~` folder). Default: the current directory,
 *   which is the app's folder whenever npm runs the build.
 * @property {import("esbuild").Plugin[]} [plugins] The project's own plugins, run after OneJS's.
 * @property {Parameters<typeof tailwindPlugin>[0]} [tailwind] Options for the Tailwind plugin
 *   (`content`, `safelist`, `preflight`).
 */

/**
 * esbuild options for a OneJS app.
 *
 * Any other esbuild option passes straight through. `alias`, `define` and
 * `loader` are merged with OneJS's rather than replacing them, so adding one
 * alias keeps React deduplicated.
 *
 * `process.env.NODE_ENV` picks React's build: production when the build runs
 * with `NODE_ENV=production`, which is how OneJS builds a player, and
 * development otherwise, which keeps React's warnings in the editor.
 *
 * @param {OneJSConfigOptions & import("esbuild").BuildOptions} [options]
 * @returns {import("esbuild").BuildOptions}
 */
export function oneJSConfig(options = {}) {
    const {
        entry = "index.tsx",
        outfile = "../app.js.txt",
        root = process.cwd(),
        plugins = [],
        tailwind = {},
        alias = {},
        define = {},
        loader = {},
        ...esbuildOptions
    } = options

    return {
        absWorkingDir: root,
        entryPoints: [entry],
        outfile,
        // Everything in one file, node_modules included: QuickJS has no module loader.
        bundle: true,
        // An IIFE, because QuickJS evaluates the bundle as a script, where an
        // ES module's export is a syntax error. Exports land on __exports,
        // which is where JSRunner finds onPlay and onStop.
        format: "iife",
        globalName: "__exports",
        target: "es2022",
        jsx: "automatic",
        // Packages like onejs-react ship TypeScript source.
        resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".json"],
        sourcemap: true,
        // A plain .uss import is its text, for compileStyleSheet(), which embeds
        // the styles in the bundle so they work in a build.
        loader: { ".uss": "text", ...loader },
        alias: { ...appAliases(root), ...alias },
        define: { "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"), ...define },
        plugins: [
            importTransformPlugin(),
            tailwindPlugin({ content: ["./**/*.{tsx,ts,jsx,js}"], ...tailwind }),
            themesPlugin(),
            ussModulesPlugin({ generateTypes: true }),
            slPlugin({ generateTypes: true }),
            ...plugins,
            unitySourceMapName(),
        ],
        ...esbuildOptions,
    }
}

/**
 * React and oj, each pinned to the app's own copy.
 *
 * Two copies of React in one bundle break every hook, and a package that
 * brings its own would add a second. oj is ojplay's app-facing name, bundled
 * from source like React. Both resolve from `root`, never the current
 * directory, so a build started from anywhere bundles the same thing.
 */
function appAliases(root) {
    const require = createRequire(path.join(root, "package.json"))
    const aliases = {}
    const react = packageDir(require, "react")
    if (react) {
        aliases["react"] = react
        aliases["react/jsx-runtime"] = path.join(react, "jsx-runtime")
        aliases["react/jsx-dev-runtime"] = path.join(react, "jsx-dev-runtime")
    }
    const ojplay = packageDir(require, "ojplay")
    if (ojplay) aliases["oj"] = path.join(ojplay, "src/index.ts")
    return aliases
}

/**
 * The folder Node would load a package from, or null when it is not
 * installed. Found by walking the lookup path rather than resolving
 * "<name>/package.json", which a package's exports map may not allow
 * (ojplay's does not).
 */
function packageDir(require, name) {
    for (const dir of require.resolve.paths(name) ?? []) {
        const candidate = path.join(dir, name)
        if (fs.existsSync(path.join(candidate, "package.json"))) return candidate
    }
    return null
}

/**
 * Renames the source map from app.js.txt.map to app.js.map.txt, a name Unity
 * imports as a TextAsset so a build can carry it.
 */
function unitySourceMapName() {
    return {
        name: "unity-source-map-name",
        setup(build) {
            const { outfile, absWorkingDir = process.cwd() } = build.initialOptions
            if (!outfile || !outfile.endsWith(".txt")) return
            const from = path.resolve(absWorkingDir, `${outfile}.map`)
            const to = path.resolve(absWorkingDir, outfile.replace(/\.txt$/, ".map.txt"))
            build.onEnd(() => {
                if (fs.existsSync(from)) fs.renameSync(from, to)
            })
        },
    }
}
