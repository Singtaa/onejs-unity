/**
 * esbuild plugin for `.sl` shader programs.
 *
 * Phase B of `Specs/SL_TEXT.md` section 5.
 *
 *     import plasma from "./plasma.sl"
 *     <ShaderProgram program={plasma} uniforms={{ warp: 0.3 }} />
 *
 * The file is parsed, checked and encoded AT BUILD TIME, so the bundle carries
 * neither the parser nor the source: an import resolves to a small object of
 * numbers. A parse error is an esbuild error with the `.sl` file, line and
 * column, which the Play editor surfaces and every terminal editor links.
 *
 * On the way out it writes `app.sl.json` beside the bundle, the manifest
 * `SLShaderGenerator` already watches for. That is what the file format makes
 * possible and the EDSL cannot: a program in a file is known statically, so an
 * ejected game is compiled from its FIRST frame rather than from its second.
 * Runtime recording stays for EDSL programs and for a build older than this
 * plugin; the editor reads every `*.sl.json` it can find.
 *
 * WHY THE PARSER IS COMPILED HERE RATHER THAN IMPORTED.
 *
 * The parser is TypeScript, and this plugin runs under plain Node: an app's
 * `esbuild.config.mjs` is executed by `node`, which cannot load a `.ts` file.
 * Every sibling plugin in this folder has the same constraint, which is why
 * the Tailwind generator beside them is `.mjs`; a parser with two hundred
 * tests is not going to be maintained twice.
 *
 * So the plugin compiles the parser once per process, with the esbuild that is
 * already running the build, and imports the result. One source of truth, no
 * generated artifact to go stale, and about thirty milliseconds once.
 *
 * A Cloudflare Worker cannot evaluate code it builds, so the caller there
 * (`onejs-play/build/game.mjs`, through `PlaySite`) hands in a `compiler` it
 * imported statically and this path never runs.
 */

import path from "path"
import { getFs } from "../fs-provider.mjs"

/** Compiled once per process, because the parser does not change inside one. */
let compiling = null

/**
 * The manifest of a project with no programs.
 *
 * Spelled out rather than built by `manifest([])`, so a build with no `.sl`
 * file never compiles the parser at all. `sl.test.ts` compares it against what
 * `manifest([])` really returns, so the version cannot drift.
 */
const EMPTY_MANIFEST = { version: 1, programs: [] }

/** An fs provider that cannot stat is a reason to skip, never to fail a build. */
function exists(file) {
    try {
        return getFs().existsSync(file)
    } catch {
        return false
    }
}

/**
 * `{ parse, encode, manifest }`, as JavaScript this Node process can load.
 *
 * `build.esbuild` is the exact esbuild running the build, so there is no second
 * copy to resolve and no version to disagree with. A data URL rather than a
 * temp file: nothing to clean up, nothing to collide with another user's file
 * in a shared temp directory, and nothing to go stale.
 */
function loadCompiler(esbuild) {
    if (compiling === null) {
        compiling = (async () => {
            const entry = new URL("../sl/compiler.ts", import.meta.url)
            const built = await esbuild.build({
                entryPoints: [entry.pathname],
                absWorkingDir: new URL("./", import.meta.url).pathname,
                bundle: true,
                format: "esm",
                platform: "neutral",
                target: "es2022",
                write: false,
                logLevel: "silent",
            })
            const code = built.outputFiles[0].text
            const url = "data:text/javascript;base64," + Buffer.from(code).toString("base64")
            return import(url)
        })()
    }
    return compiling
}

/**
 * The `.d.ts` beside a `.sl` file, the way a USS module gets one.
 *
 * The uniform names ride in the type, so `uniforms={{ wrap: 1 }}` is a type
 * error at the call site rather than the console warning it would otherwise be
 * at runtime, on a frame nobody is looking at.
 */
function generateDts(uniformNames) {
    const names = uniformNames.length === 0
        ? "never"
        : uniformNames.map((n) => JSON.stringify(n)).join(" | ")
    return `// Generated from the .sl file beside this one. Do not edit.
declare const program: import("onejs-react").EncodedProgram<${names}>
export default program
/** The file's own text, for showing a program beside what it draws. */
export const source: string
`
}

/** What an import of a `.sl` file resolves to. Numbers only: no parser, no source. */
function moduleFor(encoded, relativePath, source) {
    const payload = {
        data: [...encoded.data],
        instructions: encoded.instructions,
        resultRegister: encoded.resultRegister,
        uniforms: encoded.uniforms,
        defaults: encoded.defaults,
        textures: encoded.textures,
        hash: encoded.hash,
    }
    // The source is a NAMED export, so esbuild drops it from any bundle that
    // does not ask for it: the default import stays numbers only. Something
    // showing a shader beside its own output can then show the file rather
    // than a copy of it, which is the only way that copy cannot drift.
    return `// Shader program: ${relativePath}
// Auto-generated from the .sl source at build time: do not edit

export default ${JSON.stringify(payload)}
export const source = ${JSON.stringify(source)}
`
}

/**
 * An SLParseError as the shape esbuild puts a marker on.
 *
 * Anything else is rethrown with the file named, because a parse failure an
 * author cannot locate is worse than a crash.
 */
function esbuildError(error, file, source) {
    const line = typeof error?.line === "number" ? error.line : undefined
    if (line === undefined) {
        return { text: error instanceof Error ? error.message : String(error), location: { file } }
    }
    const text = String(error.message).replace(/^\[onejs sl] [^\s]*?:\d+:\d+: /, "")
    return {
        text,
        location: {
            file,
            line,
            column: Math.max(0, error.column - 1),
            length: error.length ?? 1,
            lineText: source.split("\n")[line - 1] ?? "",
        },
    }
}

/**
 * Creates the esbuild plugin for `.sl` programs.
 *
 * @param {Object} options
 * @param {boolean} [options.generateTypes] Write a `.d.ts` beside each file. Default true.
 * @param {Object} [options.compiler] `{ parse, encode, manifest }` for a host that
 *   cannot evaluate what it builds. A Worker passes this; Node does not need to.
 * @param {string} [options.manifest] Where to write the manifest. Defaults to
 *   `app.sl.json` beside the bundle, and nothing is written when the build has
 *   no outfile.
 * @param {(manifest: { version: number, programs: unknown[] }) => void} [options.onManifest]
 *   Called with the manifest on every build, whether or not one is written.
 */
export function slPlugin(options = {}) {
    const { generateTypes = true, compiler = null, onManifest = null } = options

    return {
        name: "sl-program",

        setup(build) {
            /** Programs seen in this build, by hash. Cleared per build so a watch rebuild is not cumulative. */
            const programs = new Map()

            build.onStart(() => { programs.clear() })

            build.onResolve({ filter: /\.sl$/ }, (args) => {
                const resolved = path.resolve(args.resolveDir, args.path)
                return {
                    path: identify(resolved),
                    namespace: "sl-program",
                    pluginData: { absolutePath: resolved },
                }
            })

            build.onLoad({ filter: /.*/, namespace: "sl-program" }, async (args) => {
                const absolutePath = args.pluginData?.absolutePath
                    ?? path.resolve(process.cwd(), args.path)
                const source = await getFs().promises.readFile(absolutePath, "utf8")
                const sl = compiler ?? await loadCompiler(build.esbuild)

                let program
                try {
                    program = sl.parse(source, { file: args.path })
                } catch (e) {
                    return { errors: [esbuildError(e, args.path, source)] }
                }

                let encoded
                try {
                    encoded = sl.encode(program)
                } catch (e) {
                    // The instruction and register ceilings are enforced by the
                    // encoder, not the parser, so they arrive here. There is no
                    // one line to blame for "this program is too long", so the
                    // marker goes on the file.
                    return { errors: [{ text: String(e?.message ?? e), location: { file: args.path } }] }
                }

                programs.set(program.hash, program)

                if (generateTypes) {
                    await getFs().promises.writeFile(absolutePath + ".d.ts", generateDts(encoded.uniforms))
                }

                return { contents: moduleFor(encoded, args.path, source), loader: "js" }
            })

            build.onEnd(async () => {
                const where = manifestPath(options, build.initialOptions)
                if (programs.size === 0) {
                    // An empty manifest is written only over one that is
                    // already there: deleting the last `.sl` file has to stop
                    // its shaders being generated, but a project that has never
                    // had one should not find a new file beside its bundle.
                    // Built without the parser, so a project with no shaders
                    // pays nothing for having the plugin in its config.
                    if (onManifest !== null) onManifest(EMPTY_MANIFEST)
                    if (where === null || !exists(where)) return
                    await getFs().promises.writeFile(where, JSON.stringify(EMPTY_MANIFEST, null, 1))
                    return
                }
                const sl = compiler ?? await loadCompiler(build.esbuild)
                const written = sl.manifest([...programs.values()])
                if (onManifest !== null) onManifest(written)
                if (where === null) return
                await getFs().promises.writeFile(where, JSON.stringify(written, null, 1))
            })
        },
    }
}

/**
 * What to call a `.sl` file, in the bundle and in an error.
 *
 * esbuild writes `// <namespace>:<path>` into the bundle and puts this path in
 * every error location, so it is both committed and read by a person. Project
 * relative and forward slashed, for the reason uss-modules gives at length: an
 * absolute path puts the builder's home directory in the output and makes two
 * machines produce different bundles.
 *
 * A path that escapes the working directory falls back to the file's own path
 * with its root removed. The virtual tree a Worker builds is rooted at "/"
 * while the process is somewhere else entirely, so `path.relative` answered
 * `../../../../../../../bad.sl` and every shader error on the site pointed at
 * a file nobody could open.
 */
function identify(resolved) {
    const relative = path.relative(process.cwd(), resolved).replace(/\\/g, "/")
    if (relative !== "" && !relative.startsWith("../")) return relative
    return resolved.replace(/\\/g, "/").replace(/^([A-Za-z]:)?\/+/, "")
}

/**
 * Where the manifest goes: beside the bundle, named the way the editor looks.
 *
 * `SLShaderGenerator.FindManifests` walks Assets and Packages for `*.sl.json`
 * and skips anything inside a `~` folder, which is where the app's source
 * lives. The bundle is written out of that folder by design, so beside the
 * bundle is both the obvious place and the only one Unity can see.
 */
function manifestPath(options, initial) {
    if (options.manifest !== undefined) return options.manifest
    if (initial?.write === false) return null
    const outfile = initial?.outfile
    if (typeof outfile !== "string" || outfile === "") return null
    return path.join(path.dirname(outfile), "app.sl.json")
}

export default slPlugin
