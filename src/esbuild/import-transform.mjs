import { getFs } from "../fs-provider.mjs"

/**
 * esbuild plugin that transforms imports from C# namespaces to CS.* references.
 *
 * Transforms:
 *   import { Texture2D, Material } from "UnityEngine"
 *   import { List } from "System.Collections.Generic"
 *   import DefaultName from "UnityEngine"
 *   import * as UE from "UnityEngine"
 *
 * Into:
 *   const { Texture2D, Material } = CS.UnityEngine
 *   const { List } = CS.System.Collections.Generic
 *   const DefaultName = CS.UnityEngine
 *   const UE = CS.UnityEngine
 *
 * Only transforms imports where the module name starts with an uppercase letter,
 * which matches the convention for C# namespaces (UnityEngine, System, etc.)
 *
 * Which strings are real import declarations is decided by esbuild, not by a
 * regex. The regex this once used rewrote matches wherever they appeared, so a
 * string, template literal or JSX text that merely contained the text of an
 * import was corrupted in place, and a commented-out import came back to life
 * as a const. The TypeScript compiler API that replaced it is gone from
 * TypeScript 7, and depending on TypeScript 5 for it cost every project a
 * second compiler (onejs-unity#7). esbuild is already here: every quoted
 * string naming a C# namespace is tagged in a copy of the file, esbuild parses
 * that copy, and the tags it asks to resolve as import statements are the real
 * ones. A small grammar then reads each one's import clause, which is all that
 * is rewritten. `import type` is erased by esbuild before it resolves
 * anything, so it is left for the build to erase in the same way, and
 * `import { A as B }` becomes `{ A: B }`.
 *
 * @param {Object} options
 * @param {(moduleName: string) => boolean} [options.filter]. Custom filter for which modules to transform
 */

// A real transformable import necessarily contains one of these textually, so
// files without them can skip the probe entirely. A hit only means "worth
// probing": esbuild is what decides.
function mightHaveCsImport(source) {
    return /from\s*["'][A-Z]/.test(source) || /import\s*["'][A-Z]/.test(source)
}

const countNewlines = (s) => (s.match(/\n/g) || []).length

// A quoted string with nothing in it that could end it early. Real import
// specifiers are always this; a misaligned match is a candidate esbuild rejects.
const QUOTED = /(["'])([^"'\\\n]+)\1/g
const TAG = "?onejs-cs-import="

/**
 * The candidates esbuild reads as import statements, by index. Each is tagged
 * with its index in a copy of the source, so even a module imported twice
 * (which esbuild resolves once per distinct path) reports every declaration.
 * Null when the source does not parse: the build itself then reports why.
 */
async function realImports(esbuild, source, filePath, candidates) {
    let probe = source
    for (let i = candidates.length - 1; i >= 0; i--) {
        const at = candidates[i].end - 1
        probe = probe.slice(0, at) + TAG + i + probe.slice(at)
    }
    const real = new Set()
    const ext = filePath.split(".").pop()
    try {
        await esbuild.build({
            stdin: { contents: probe, loader: loaderFor(ext), sourcefile: filePath },
            bundle: true,
            write: false,
            format: "esm",
            platform: "neutral",
            jsx: "preserve",
            logLevel: "silent",
            // Keeps a value import whose bindings go unused, which esbuild
            // would otherwise drop before resolving it
            tsconfigRaw: { compilerOptions: { verbatimModuleSyntax: true } },
            plugins: [{
                name: "onejs-cs-import-probe",
                setup(probeBuild) {
                    probeBuild.onResolve({ filter: /.*/ }, (args) => {
                        const tag = args.path.lastIndexOf(TAG)
                        if (tag >= 0 && args.kind === "import-statement") real.add(Number(args.path.slice(tag + TAG.length)))
                        return { path: args.path, external: true }
                    })
                },
            }],
        })
    } catch {
        return null
    }
    return real
}

function loaderFor(ext) {
    return ext === "tsx" ? "tsx" : ext === "ts" ? "ts" : ext === "jsx" ? "jsx" : "js"
}

const ID = "[\\p{ID_Start}$_][\\p{ID_Continue}$\\u200c\\u200d]*"
const IS_ID = new RegExp(`^${ID}$`, "u")
const TOKEN = new RegExp(`${ID}|\\S`, "gu")

/**
 * Reads what sits between `import` and a real specifier: nothing (a
 * side-effect import), or a clause and `from`. Null when it is not that, which
 * is how the search for the statement's own `import` keyword knows to look
 * further back. The text is real code, so a comment in it is a comment.
 */
function parseClause(text) {
    const tokens = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, " ").match(TOKEN) ?? []
    if (tokens.length === 0) return { named: [] }
    if (tokens.pop() !== "from") return null
    const clause = { typeOnly: false, named: [] }
    let i = 0
    const isId = (t) => t !== undefined && IS_ID.test(t)
    // `import type X from`, `import type { A } from`; but `import type from`
    // and `import type, { A } from` bind a default named type
    if (tokens[0] === "type" && tokens.length > 1 && tokens[1] !== ",") {
        clause.typeOnly = true
        i = 1
    }
    if (isId(tokens[i])) {
        clause.defaultName = tokens[i++]
        if (tokens[i] === ",") i++
        else return i === tokens.length ? clause : null
    }
    if (tokens[i] === "*") {
        if (tokens[i + 1] !== "as" || !isId(tokens[i + 2])) return null
        clause.namespace = tokens[i + 2]
        i += 3
    } else if (tokens[i] === "{") {
        i++
        while (tokens[i] !== "}") {
            let typeOnly = false
            if (tokens[i] === "type" && isId(tokens[i + 1]) && tokens[i + 1] !== "as") {
                typeOnly = true
                i++
            }
            if (!isId(tokens[i])) return null
            const entry = { name: tokens[i++], typeOnly }
            if (tokens[i] === "as") {
                if (!isId(tokens[i + 1])) return null
                entry.alias = tokens[i + 1]
                i += 2
            }
            clause.named.push(entry)
            if (tokens[i] === ",") i++
            else if (tokens[i] !== "}") return null
        }
        i++
    } else {
        return null
    }
    return i === tokens.length ? clause : null
}

/**
 * Rewrites C# namespace imports in one source file. Returns the transformed
 * text, or null when nothing needed transforming.
 *
 * Exported for tests. Takes the esbuild module, so the plugin can pass the
 * instance running the build (esbuild-wasm in a browser included).
 */
export async function transformCsImports(esbuild, source, filePath, shouldTransform) {
    if (!mightHaveCsImport(source)) return null

    const candidates = []
    for (const m of source.matchAll(QUOTED)) {
        if (shouldTransform(m[2])) candidates.push({ start: m.index, end: m.index + m[0].length, name: m[2] })
    }
    if (candidates.length === 0) return null
    const real = await realImports(esbuild, source, filePath, candidates)
    if (real === null || real.size === 0) return null

    const keywords = [...source.matchAll(/(?<![\w$.])import\b/g)].map((m) => m.index)
    const replacements = []
    for (const i of [...real].sort((a, b) => a - b)) {
        const { start: specStart, end: specEnd, name: moduleName } = candidates[i]

        // The statement's own `import`: the nearest one before the specifier
        // whose clause reads. An `import` in a comment inside the clause
        // reads as nothing and is passed over. An `export ... from` finds
        // none, and is left as it is.
        let start = -1, clause = null
        for (let k = keywords.length - 1; k >= 0 && clause === null; k--) {
            if (keywords[k] >= specStart) continue
            clause = parseClause(source.slice(keywords[k] + "import".length, specStart))
            if (clause !== null) start = keywords[k]
        }
        if (clause === null) continue
        const end = source[specEnd] === ";" ? specEnd + 1 : specEnd

        const csPath = "CS." + moduleName.replace(/\//g, ".")
        const parts = []
        if (!clause.typeOnly) {
            if (clause.defaultName) parts.push(`const ${clause.defaultName} = ${csPath}`)
            if (clause.namespace) parts.push(`const ${clause.namespace} = ${csPath}`)
            const entries = clause.named
                .filter((el) => !el.typeOnly)
                .map((el) => el.alias ? `${el.name}: ${el.alias}` : el.name)
            if (entries.length > 0) parts.push(`const { ${entries.join(", ")} } = ${csPath}`)
        }

        const original = source.slice(start, end)

        let replacement = parts.length > 0
            ? parts.join("; ")
            // A side-effect import binds nothing at runtime; a comment keeps
            // the removal visible in the bundle.
            : `/* ${original.replace(/\*\//g, "*\\/")} - removed, no runtime binding */`

        if (original.endsWith(";") && !replacement.endsWith(";")) replacement += ";"

        // The transform returns no sourcemap, so hold every following line at
        // its original number by preserving the span's line count.
        const missing = countNewlines(original) - countNewlines(replacement)
        if (missing > 0) replacement += "\n".repeat(missing)

        replacements.push({ start, end, replacement })
    }

    if (replacements.length === 0) return null

    let out = source
    for (let i = replacements.length - 1; i >= 0; i--) {
        const { start, end, replacement } = replacements[i]
        out = out.slice(0, start) + replacement + out.slice(end)
    }
    return out
}

export function importTransformPlugin(options = {}) {
    const { filter } = options

    // Default: transform modules starting with uppercase letter
    const shouldTransform = filter || ((name) => /^[A-Z]/.test(name))

    return {
        name: "import-transform",
        setup(build) {
            build.onLoad({ filter: /\.(tsx?|jsx?|mjs)$/ }, async (args) => {
                // Skip node_modules except for local packages
                if (args.path.includes("node_modules") && !args.path.includes("onejs-")) {
                    return null
                }

                const source = await getFs().promises.readFile(args.path, "utf8")
                if (!mightHaveCsImport(source)) return null

                // The instance running this build, so the probe parses with the
                // same esbuild (wasm in a browser) as everything else
                const esbuild = build.esbuild ?? await import("esbuild")
                const transformed = await transformCsImports(esbuild, source, args.path, shouldTransform)
                if (transformed === null) return null
                return { contents: transformed, loader: loaderFor(args.path.split(".").pop()) }
            })
        },
    }
}

// Aliases for compatibility
export const importTransformation = importTransformPlugin
export const importTransform = importTransformPlugin
