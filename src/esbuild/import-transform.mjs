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
 * Sources are parsed with the TypeScript compiler rather than scanned with a
 * regex. The regex this replaces rewrote matches wherever they appeared, so a
 * string or template literal that merely contained the text of an import (a
 * code sample in a demo, say) was corrupted in place, and a commented-out
 * import came back to life as a const. A parser knows a string when it sees
 * one. It also gets right what the regex quietly got wrong: `import type` is
 * erased instead of becoming a runtime destructure, and `import { A as B }`
 * becomes `{ A: B }` instead of invalid syntax.
 *
 * @param {Object} options
 * @param {(moduleName: string) => boolean} [options.filter]. Custom filter for which modules to transform
 */

let tsModulePromise = null
function loadTypeScript() {
    if (!tsModulePromise) {
        // Lazy and cached: typescript is only pulled in when a file actually
        // needs transforming, so a host that imports this module but never
        // builds app code (or a bundler tracing the barrel) does not pay for
        // or require it.
        tsModulePromise = import("typescript").then(
            (m) => m.default ?? m,
            (e) => {
                tsModulePromise = null
                throw new Error(
                    "[onejs] import-transform parses source files with the \"typescript\" " +
                    "package, which did not resolve from this project. Every OneJS app " +
                    "template ships it in devDependencies; `npm install -D typescript` " +
                    "restores it. (Original error: " + (e && e.message ? e.message : e) + ")")
            })
    }
    return tsModulePromise
}

// A real transformable import necessarily contains one of these textually, so
// files without them can skip the parse (and the typescript load) entirely.
// A hit only means "worth parsing": the parser is what decides.
function mightHaveCsImport(source) {
    return /from\s*["'][A-Z]/.test(source) || /import\s*["'][A-Z]/.test(source)
}

const countNewlines = (s) => (s.match(/\n/g) || []).length

/**
 * Rewrites C# namespace imports in one source file. Returns the transformed
 * text, or null when nothing needed transforming.
 *
 * Exported for tests, and takes the typescript module as an argument so it
 * stays synchronous; the plugin resolves typescript once and passes it in.
 */
export function transformCsImports(ts, source, filePath, shouldTransform) {
    if (!mightHaveCsImport(source)) return null

    const ext = filePath.split(".").pop()
    const scriptKind =
        ext === "tsx" ? ts.ScriptKind.TSX :
        ext === "jsx" ? ts.ScriptKind.JSX :
        ext === "ts" ? ts.ScriptKind.TS : ts.ScriptKind.JS
    const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false, scriptKind)

    const replacements = []
    for (const stmt of sf.statements) {
        if (!ts.isImportDeclaration(stmt)) continue
        if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue
        const moduleName = stmt.moduleSpecifier.text
        if (!shouldTransform(moduleName)) continue

        const csPath = "CS." + moduleName.replace(/\//g, ".")
        const clause = stmt.importClause
        const parts = []

        if (clause && !clause.isTypeOnly) {
            if (clause.name) parts.push(`const ${clause.name.text} = ${csPath}`)
            const nb = clause.namedBindings
            if (nb) {
                if (ts.isNamespaceImport(nb)) {
                    parts.push(`const ${nb.name.text} = ${csPath}`)
                } else if (ts.isNamedImports(nb)) {
                    const entries = nb.elements
                        .filter((el) => !el.isTypeOnly)
                        .map((el) => el.propertyName
                            ? `${el.propertyName.text}: ${el.name.text}`
                            : el.name.text)
                    if (entries.length > 0) parts.push(`const { ${entries.join(", ")} } = ${csPath}`)
                }
            }
        }

        // getStart skips leading trivia, so a comment above the import is not
        // consumed by the replacement.
        const start = stmt.getStart(sf)
        const end = stmt.end
        const original = source.slice(start, end)

        let replacement = parts.length > 0
            ? parts.join("; ")
            // Side-effect imports and type-only imports bind nothing at
            // runtime; a comment keeps the removal visible in the bundle.
            : `/* ${original.replace(/\*\//g, "*\/")} - removed, no runtime binding */`

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

                const ts = await loadTypeScript()
                const transformed = transformCsImports(ts, source, args.path, shouldTransform)
                if (transformed === null) return null

                const ext = args.path.split(".").pop()
                const loader = ext === "tsx" ? "tsx" : ext === "ts" ? "ts" : ext === "jsx" ? "jsx" : "js"
                return { contents: transformed, loader }
            })
        },
    }
}

// Aliases for compatibility
export const importTransformation = importTransformPlugin
export const importTransform = importTransformPlugin
