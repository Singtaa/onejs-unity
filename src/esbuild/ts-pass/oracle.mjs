/**
 * The type oracle: the only code in the pass that touches TypeScript.
 *
 * The rewrites ask it questions (what is this node's type, which declaration
 * does this name resolve to, is this a C# struct) and make their changes as
 * text edits, so moving to TypeScript 7.1's sync API later means writing a
 * second oracle, not touching a rewrite.
 *
 * It holds one LanguageService for the life of the build context. A watch
 * rebuild hands it the edited file's text; the service reuses every unchanged
 * SourceFile, so only that file is parsed and bound again.
 */
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)

/**
 * Loads TypeScript 6. It is an optional peer: an app that never turns the pass
 * on never installs it.
 */
export function loadTypeScript() {
    try {
        return require("@typescript/typescript6")
    } catch {
        throw new Error(
            "onejs-unity: tsPass needs TypeScript 6 beside the app's own TypeScript. " +
            "Run `npm install -D @typescript/typescript6`, or turn tsPass off.",
        )
    }
}

/**
 * @param {object} options
 * @param {string} options.root The app folder, where its tsconfig.json is
 * @param {string} [options.tsconfig] A tsconfig other than `<root>/tsconfig.json`
 * @param {any} [options.ts] The TypeScript module, for tests
 */
export function createOracle({ root, tsconfig, ts = loadTypeScript() }) {
    const configPath = tsconfig ? path.resolve(root, tsconfig) : ts.findConfigFile(root, ts.sys.fileExists)
    let options = { strict: true, skipLibCheck: true, noEmit: true, allowJs: true, jsx: ts.JsxEmit.ReactJSX }
    let rootNames = []
    if (configPath) {
        const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: () => {},
        })
        if (parsed) {
            options = parsed.options
            rootNames = parsed.fileNames
        }
    }

    // Text esbuild handed us, which wins over the disk for that file
    const overrides = new Map()
    const versions = new Map()
    const roots = new Set(rootNames.map(normalize))

    const host = {
        getCompilationSettings: () => options,
        getScriptFileNames: () => [...roots],
        getScriptVersion: (fileName) => {
            const key = normalize(fileName)
            if (overrides.has(key)) return String(versions.get(key))
            const stat = ts.sys.getModifiedTime?.(fileName)
            return stat ? String(stat.getTime()) : "0"
        },
        getScriptSnapshot: (fileName) => {
            const key = normalize(fileName)
            const text = overrides.has(key) ? overrides.get(key) : ts.sys.readFile(fileName)
            return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
        },
        getCurrentDirectory: () => root,
        getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
        fileExists: (f) => overrides.has(normalize(f)) || ts.sys.fileExists(f),
        readFile: (f) => overrides.get(normalize(f)) ?? ts.sys.readFile(f),
        readDirectory: ts.sys.readDirectory,
        directoryExists: ts.sys.directoryExists,
        getDirectories: ts.sys.getDirectories,
        realpath: ts.sys.realpath,
        useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    }
    const service = ts.createLanguageService(host, ts.createDocumentRegistry())

    return {
        ts,
        /**
         * Sets a file's text and returns a view of it: its SourceFile and the
         * checker of the program that holds it. The view is valid until the
         * next update.
         */
        update(fileName, text) {
            const key = normalize(fileName)
            if (overrides.get(key) !== text) {
                overrides.set(key, text)
                versions.set(key, (versions.get(key) ?? 0) + 1)
            }
            roots.add(key)
            const program = service.getProgram()
            const sourceFile = program?.getSourceFile(key)
            if (!program || !sourceFile) return null
            return { program, sourceFile, checker: program.getTypeChecker() }
        },
        dispose() {
            service.dispose()
        },
    }
}

function normalize(fileName) {
    return path.resolve(fileName).replace(/\\/g, "/")
}
