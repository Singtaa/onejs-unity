import { getFs } from "../fs-provider.mjs"
import path from "path"
import crypto from "crypto"

/**
 * esbuild plugin for USS Modules support in OneJS
 *
 * Transforms .module.uss files into JavaScript modules with scoped class names.
 *
 * Example input (Button.module.uss):
 *   .container { padding: 10px; }
 *   .primary { background-color: blue; }
 *
 * Example output:
 *   const css = `.container__a1b2c3 { padding: 10px; }
 *   .primary__a1b2c3 { background-color: blue; }`;
 *   compileStyleSheet(css, "components/Button.module.uss");
 *   export default { container: "container__a1b2c3", primary: "primary__a1b2c3" };
 *
 * `:global(...)` (standard CSS Modules syntax) opts a selector segment out of
 * scoping: `.button:global(.focus-ring)` emits `.button__a1b2c3.focus-ring`.
 * Use it for classes applied at runtime by shared managers (e.g. the
 * focus-visible manager's literal `focus-ring`). Global names are not exported
 * in the styles map / .d.ts.
 */

/**
 * Generates a short hash from file path for class scoping
 * @param {string} filePath: Path to the module file
 * @returns {string} 6-character hash
 */
function generateHash(filePath) {
    const hash = crypto.createHash("md5").update(filePath).digest("hex")
    return hash.slice(0, 6)
}

/**
 * The path to identify a module by, relative to the project that owns it.
 *
 * Not relative to the working directory, which is where this started: the same
 * source then produced different class names on two machines simply because
 * one checkout sat deeper than the other, and on Windows the separators
 * differed as well. Bundles churned for no reason, and comparing a rebuilt
 * bundle against an old one stopped being able to tell a real change from a
 * different desk.
 *
 * `fallback` is used when no project root is found: the resolver's own project
 * relative path, which is machine independent for the same reason. It is a
 * parameter rather than a bare `path.basename`, because a basename is not an
 * identity. Two modules both called `style.module.uss`, in different folders,
 * would hash to the same six characters and scope their classes to the same
 * names, which is the exact collision CSS module scoping exists to prevent. A
 * tree with no marker above it is not exotic either: it is what an in-memory
 * build sees, and what the tests here build.
 */
function moduleIdentity(filePath, fallback) {
    let dir = path.dirname(filePath)
    for (let up = 0; up < 20; up++) {
        for (const marker of ["oj.json", "package.json"]) {
            try {
                if (getFs().existsSync(path.join(dir, marker))) {
                    return path.relative(dir, filePath).split(path.sep).join("/")
                }
            } catch {
                // An fs provider that cannot stat is a reason to keep walking,
                // never a reason to fail a build over a class name.
            }
        }
        const parent = path.dirname(dir)
        if (parent === dir) break
        dir = parent
    }
    return fallback ?? path.basename(filePath)
}

/**
 * Masks `:global(...)` segments with dot-free placeholders so their classes are
 * neither extracted nor scoped, and returns the segments for later restoration
 * (unwrapped: `:global(.foo)` restores as `.foo`).
 * @param {string} ussContent: Raw USS content
 * @returns {{ masked: string, globals: string[] }}
 */
function maskGlobals(ussContent) {
    const globals = []
    //  delimiters: not word characters, so a placeholder butting up against a
    // class name in a compound selector (`.button:global(.focus-ring)`) does not
    // block that class's own scoping regex, and the class regex can't capture into it.
    const masked = ussContent.replace(/:global\(([^)]*)\)/g, (_, inner) => {
        globals.push(inner.trim())
        return `G${globals.length - 1}`
    })
    return { masked, globals }
}

/**
 * Restores masked `:global(...)` segments as their unwrapped (unscoped) content.
 */
function restoreGlobals(content, globals) {
    // The mask markers are literal \x01 bytes on purpose: a control character
    // cannot appear in real USS, so it cannot collide with user content.
    // eslint-disable-next-line no-control-regex
    return content.replace(/G(\d+)/g, (_, i) => globals[Number(i)])
}

/**
 * Extracts class names from USS content
 * Handles:
 * - Simple class selectors: .className
 * - Pseudo-classes: .className:hover (extracts className, not hover)
 * - Descendant selectors: .parent .child
 * - Multiple selectors: .a, .b
 * - `:global(.name)` segments are excluded (masked before extraction)
 *
 * @param {string} ussContent: USS content with :global segments already masked
 * @param {string} hash: Hash to append to class names
 * @returns {Object} Map of original class name to scoped name
 */
function extractClassNames(ussContent, hash) {
    // Strip /* ... */ comments first so prose like "e.g. a frame" isn't scraped as a
    // phantom `.g` class into the generated styles map / .d.ts.
    const withoutComments = ussContent.replace(/\/\*[\s\S]*?\*\//g, "")
    // Match class selectors that start with a dot followed by valid CSS identifier
    // This regex captures class names but not pseudo-class names (which follow :)
    const classRegex = /\.([a-zA-Z_][\w-]*)/g
    const classMap = {}
    let match

    while ((match = classRegex.exec(withoutComments)) !== null) {
        const className = match[1]

        // Skip:
        // - Already scoped names (contain __)
        // - Unity built-in classes (start with unity-)
        // Note: pseudo-classes (:hover, :active, ...) follow a ":" and so are never
        // captured by the dot-anchored regex above. Earlier code also skipped any
        // class *starting with* a pseudo-class word, which wrongly dropped legitimate
        // classes like .hoverCard / .activeTab / .disabled (left unscoped, missing
        // from the .d.ts, resolving to `undefined` at runtime). Those checks are gone.
        if (!className.includes("__") &&
            !className.startsWith("unity-")) {
            classMap[className] = `${className}__${hash}`
        }
    }

    return classMap
}

/**
 * Replaces class names in USS content with scoped versions
 * @param {string} ussContent: Raw USS content
 * @param {Object} classMap: Map of original to scoped names
 * @returns {string} USS content with scoped class names
 */
function scopeClassNames(ussContent, classMap) {
    let scoped = ussContent

    // Sort by length (longest first) to avoid partial replacements
    // e.g., ".button" shouldn't match ".button-primary"
    const sortedNames = Object.keys(classMap).sort((a, b) => b.length - a.length)

    for (const className of sortedNames) {
        // Match .className but:
        // - Not followed by __ (already scoped)
        // - Not followed by: (part of longer name like button-primary)
        // - Must be followed by word boundary, space, comma, colon, or bracket
        const regex = new RegExp(
            `\\.${escapeRegex(className)}(?![-_a-zA-Z0-9])(?!__)`,
            "g"
        )
        scoped = scoped.replace(regex, `.${classMap[className]}`)
    }

    return scoped
}

/**
 * Escapes special regex characters in a string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Generates TypeScript declaration file content
 * @param {Object} classMap: Map of class names
 * @returns {string} TypeScript .d.ts content
 */
function generateDts(classMap) {
    const entries = Object.keys(classMap)
        .sort()
        .map(name => `    readonly "${name}": string`)
        .join("\n")

    return `declare const styles: {
${entries}
}
export default styles
`
}

/**
 * Creates the esbuild plugin for USS Modules
 * @param {Object} options: Plugin options
 * @param {boolean} options.generateTypes: Whether to generate .d.ts files (default: true)
 *
 * No @returns tag on purpose. Annotating it as {Object} widens the inferred
 * shape to the near-useless Object type, which then fails to satisfy esbuild's
 * Plugin at every call site. Letting the object literal speak for itself is
 * what makes the sibling plugins typecheck.
 */
export function ussModulesPlugin(options = {}) {
    const { generateTypes = true } = options

    return {
        name: "uss-modules",

        setup(build) {
            // Handle .module.uss imports
            build.onResolve({ filter: /\.module\.uss$/ }, (args) => {
                const resolved = path.resolve(args.resolveDir, args.path)
                // esbuild annotates each bundled module with `// <namespace>:<path>`,
                // so whatever goes in `path` is baked into the output. Handing it
                // the absolute path put the builder's home directory in a committed
                // bundle, which then differed on every machine. Give it the project
                // relative, forward-slashed path and carry the real one alongside.
                return {
                    path: path.relative(process.cwd(), resolved).replace(/\\/g, "/"),
                    namespace: "uss-module",
                    pluginData: { absolutePath: resolved },
                }
            })

            // Transform .module.uss files
            build.onLoad({ filter: /.*/, namespace: "uss-module" }, async (args) => {
                // args.path is the project-relative, forward-slashed form, so
                // read through the absolute path carried on pluginData.
                const absolutePath = args.pluginData?.absolutePath
                    ?? path.resolve(process.cwd(), args.path)
                const ussContent = await getFs().promises.readFile(absolutePath, "utf8")
                // Identity from the absolute path, so it anchors to the project
                // rather than to wherever the build was started, and comes back
                // forward-slashed so Windows and macOS agree. Hashing the plain
                // relative path did neither, and the committed bundle flipped
                // every class name whenever the other machine rebuilt it.
                const relativePath = moduleIdentity(absolutePath, args.path)
                const hash = generateHash(relativePath)

                // Extract and scope class names. :global(...) segments are masked
                // first so they are neither extracted nor scoped, then restored
                // unwrapped (`.button:global(.focus-ring)` -> `.button__hash.focus-ring`).
                const { masked, globals } = maskGlobals(ussContent)
                const classMap = extractClassNames(masked, hash)
                const scopedUss = restoreGlobals(scopeClassNames(masked, classMap), globals)

                // Generate TypeScript declarations
                if (generateTypes) {
                    // Absolute, not args.path: that is project-relative now, and a
                    // relative write would land wherever the process happens to be.
                    const dtsPath = absolutePath + ".d.ts"
                    const dtsContent = generateDts(classMap)
                    await getFs().promises.writeFile(dtsPath, dtsContent)
                }

                // Escape USS for JavaScript string
                const escapedUss = scopedUss
                    .replace(/\\/g, "\\\\")
                    .replace(/`/g, "\\`")
                    .replace(/\$/g, "\\$")

                // Generate JavaScript module
                const classMapJson = JSON.stringify(classMap, null, 4)
                // Normalize to forward slashes to avoid \u being
                // interpreted as a Unicode escape sequence on Windows
                // relativePath is already forward-slashed above, so this is just a
                // clearer name for the same string at its point of use.
                const safeRelativePath = relativePath

                const jsContent = `// USS Module: ${safeRelativePath}
// Auto-generated: do not edit

const css = \`${escapedUss}\`
compileStyleSheet(css, "${safeRelativePath}")

const styles = ${classMapJson}
export default styles
`

                return {
                    contents: jsContent,
                    loader: "js"
                }
            })
        }
    }
}

export default ussModulesPlugin
