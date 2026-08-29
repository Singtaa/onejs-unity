/**
 * USS Generator for OneJS Tailwind
 *
 * Scans source files for class names, matches against utility definitions,
 * and generates USS output.
 */

import { getFs } from "../fs-provider.mjs"
import path from "node:path"
import { allUtilities } from "./utilities.mjs"
import { breakpoints } from "./config.mjs"

// ============================================================================
// Character escaping for USS class names
// ============================================================================

const ESCAPE_MAP = {
    ":": "_c_",
    "/": "_s_",
    ".": "_d_",
    "[": "_lb_",
    "]": "_rb_",
    "(": "_lp_",
    ")": "_rp_",
    "#": "_n_",
    "%": "_p_",
    ",": "_cm_",
    "&": "_amp_",
    ">": "_gt_",
    "<": "_lt_",
    "*": "_ast_",
    "'": "_sq_",
}

/**
 * Escape special characters in a class name for USS
 */
export function escapeClassName(name) {
    // Handle numeric prefix (class names can't start with numbers in USS)
    if (/^[0-9]/.test(name)) {
        name = "_" + name
    }

    let escaped = name
    for (const [char, replacement] of Object.entries(ESCAPE_MAP)) {
        escaped = escaped.split(char).join(replacement)
    }
    return escaped
}

// ============================================================================
// Class name extraction from source files
// ============================================================================

/**
 * Extract class-name candidates from a source file.
 *
 * Tailwind-JIT model: every string and template literal in the file is a
 * candidate source, not just className= attributes, so classes held in
 * variant maps, variables, and helper arguments are all seen. Candidates
 * that don't match a known utility are dropped later by generateUSS, so
 * over-collection only ever adds unused rules, it never breaks styling.
 * Classes assembled at runtime ("bg-" + color) are still invisible: use
 * the plugin's `safelist` option for those.
 *
 * The scanner walks the source once, skipping // and block comments and
 * regex literals, so quote characters inside them never shift string
 * pairing (a `// don't` comment must not eat the classes after it).
 */
export function extractClassNames(content) {
    const classNames = new Set()
    scanCode(content, 0, classNames, false)
    return classNames
}

// After these keywords a `/` starts a regex literal, not division, even
// though the keyword looks like an ordinary identifier to the char scanner.
const REGEX_PRECEDING_KEYWORDS = new Set([
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
    "case", "do", "else", "yield", "await",
])

/**
 * Can a `/` at the current position start a regex literal? A regex is only
 * valid where an expression is expected. Misclassification is line-capped
 * either way (regex literals and normal strings cannot contain raw
 * newlines), but JSX makes two cases worth special care: `</Tag>` (prev is
 * `<`) and self-closing `/>` (prev is `>`, `}`, `]`, `)`, or a word char;
 * scanCode also sets prev to `)` after any string/template/regex literal,
 * so `bar="x" />` lands here too). The one `>` that does expect an
 * expression is an arrow `=>`.
 */
function regexAllowed(prev, prev2, lastWord) {
    if (prev === "") return true
    if (/[\w$]/.test(prev)) return REGEX_PRECEDING_KEYWORDS.has(lastWord)
    if (prev === ")" || prev === "]" || prev === "}") return false
    if (prev === ">") return prev2 === "="
    if (prev === "<") return false
    return true
}

/**
 * Walk source code from `start`, adding the contents of every string and
 * template literal to `candidates`. Skips comments and regex literals.
 * When `stopAtBrace` is true (inside a template `${...}` expression),
 * returns the index of the matching unnested `}`; otherwise scans to the
 * end and returns content.length.
 */
function scanCode(content, start, candidates, stopAtBrace) {
    let i = start
    let depth = 0
    let prev = ""      // last significant char outside comments/strings
    let prev2 = ""     // significant char before prev (for `=>` detection)
    let lastWord = ""  // identifier ending at prev (for regex-vs-division)
    while (i < content.length) {
        const ch = content[i]
        const next = content[i + 1]
        if (ch === "/" && next === "/") {
            const nl = content.indexOf("\n", i + 2)
            i = nl === -1 ? content.length : nl + 1
            continue
        }
        if (ch === "/" && next === "*") {
            const close = content.indexOf("*/", i + 2)
            i = close === -1 ? content.length : close + 2
            continue
        }
        if (ch === '"' || ch === "'") {
            const end = readString(content, i, candidates)
            if (end !== -1) {
                i = end
                prev2 = prev
                prev = ")" // a string ends an expression, like `)`
                continue
            }
            // No closing quote before the newline, so this is not a string
            // (an apostrophe in JSX text, typically): treat as a plain char
            // and keep scanning so later literals on the line are still seen.
        } else if (ch === "`") {
            i = readTemplate(content, i, candidates)
            prev2 = prev
            prev = ")"
            continue
        } else if (ch === "/" && regexAllowed(prev, prev2, lastWord)) {
            const end = skipRegex(content, i)
            if (end !== -1) {
                i = end
                prev2 = prev
                prev = ")"
                continue
            }
            // No closing `/` on this line: it was division after all.
        }
        if (stopAtBrace) {
            if (ch === "{") depth++
            else if (ch === "}") {
                if (depth === 0) return i
                depth--
            }
        }
        if (!/\s/.test(ch)) {
            if (/[\w$]/.test(ch)) {
                lastWord = /[\w$]/.test(content[i - 1] || "") ? lastWord + ch : ch
            }
            prev2 = prev
            prev = ch
        }
        i++
    }
    return i
}

/**
 * Read a quoted string starting at content[startIdx], adding its contents
 * as candidates. Returns the index after the closing quote, or -1 if the
 * line ends first (JS strings cannot span a raw newline), in which case
 * nothing is added and the caller should treat the quote as a plain char.
 */
function readString(content, startIdx, candidates) {
    const quote = content[startIdx]
    let i = startIdx + 1
    while (i < content.length) {
        const ch = content[i]
        if (ch === "\\") { i += 2; continue }
        if (ch === "\n") return -1
        if (ch === quote) {
            addCandidates(content.slice(startIdx + 1, i), candidates)
            return i + 1
        }
        i++
    }
    return -1
}

/**
 * Read a template literal starting at the backtick. Static parts become
 * candidates; each ${...} expression is scanned recursively as code (its
 * own strings, comments, and nested templates all handled).
 * Returns the index after the closing backtick.
 */
function readTemplate(content, startIdx, candidates) {
    let i = startIdx + 1
    let staticStart = i
    while (i < content.length) {
        const ch = content[i]
        if (ch === "\\") { i += 2; continue }
        if (ch === "`") {
            addCandidates(content.slice(staticStart, i), candidates)
            return i + 1
        }
        if (ch === "$" && content[i + 1] === "{") {
            addCandidates(content.slice(staticStart, i), candidates)
            i = scanCode(content, i + 2, candidates, true) + 1
            staticStart = i
            continue
        }
        i++
    }
    addCandidates(content.slice(staticStart, i), candidates)
    return i
}

/**
 * Skip a regex literal starting at `/`. Returns the index after the closing
 * `/` and its flags, or -1 if the line ends before it closes (a regex
 * cannot contain a raw newline, so the `/` was division).
 */
function skipRegex(content, startIdx) {
    let i = startIdx + 1
    let inClass = false
    while (i < content.length) {
        const ch = content[i]
        if (ch === "\\") { i += 2; continue }
        if (ch === "\n") return -1
        if (ch === "[") inClass = true
        else if (ch === "]") inClass = false
        else if (ch === "/" && !inClass) {
            i++
            while (i < content.length && /[a-z]/i.test(content[i])) i++
            return i
        }
        i++
    }
    return -1
}

/**
 * Split literal contents into candidate tokens. Quote characters count as
 * separators alongside whitespace so that when JSX-text apostrophes pair
 * across markup, class names quoted inside the mis-read span still surface
 * as candidates instead of being lost.
 */
function addCandidates(text, candidates) {
    for (const token of text.split(/[\s"'`]+/)) {
        if (token) candidates.add(token)
    }
}

/**
 * Scan multiple files and extract all class names
 */
export async function scanFiles(patterns, cwd = process.cwd()) {
    const classNames = new Set()

    // Simple glob implementation for common patterns
    async function walkDir(dir, pattern) {
        const entries = await getFs().promises.readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name)
            const relativePath = path.relative(cwd, fullPath)

            if (entry.isDirectory()) {
                // Skip node_modules and hidden directories
                if (entry.name === "node_modules" || entry.name.startsWith(".")) {
                    continue
                }
                await walkDir(fullPath, pattern)
            } else if (entry.isFile()) {
                // Check if file matches pattern
                if (matchesPattern(relativePath, pattern)) {
                    try {
                        const content = await getFs().promises.readFile(fullPath, "utf8")
                        const fileClasses = extractClassNames(content)
                        fileClasses.forEach(c => classNames.add(c))
                    } catch (err) {
                        // Ignore read errors
                    }
                }
            }
        }
    }

    // Process each pattern
    for (const pattern of patterns) {
        // Handle patterns like "./index.tsx" or "./samples/**/*.tsx"
        if (pattern.includes("**")) {
            // Glob pattern: walk directory
            const basePath = pattern.split("**")[0].replace(/^\.\//, "")
            const startDir = basePath ? path.join(cwd, basePath) : cwd
            try {
                await walkDir(startDir, pattern)
            } catch (err) {
                // Directory doesn't exist, skip
            }
        } else {
            // Direct file path
            const filePath = path.join(cwd, pattern.replace(/^\.\//, ""))
            try {
                const content = await getFs().promises.readFile(filePath, "utf8")
                const fileClasses = extractClassNames(content)
                fileClasses.forEach(c => classNames.add(c))
            } catch (err) {
                // File doesn't exist, skip
            }
        }
    }

    return classNames
}

/**
 * Simple pattern matching for file paths
 */
function matchesPattern(filePath, pattern) {
    // Extract extension pattern from glob
    const extMatch = pattern.match(/\*\.(\{[^}]+\}|\w+)$/)
    if (!extMatch) return false

    let extensions
    if (extMatch[1].startsWith("{")) {
        // {tsx,ts,jsx,js} format
        extensions = extMatch[1].slice(1, -1).split(",")
    } else {
        extensions = [extMatch[1]]
    }

    const fileExt = path.extname(filePath).slice(1)
    return extensions.includes(fileExt)
}

// ============================================================================
// USS Generation
// ============================================================================

/**
 * Parse a class name into its components
 * Examples:
 *   "p-4" -> { base: "p-4", variant: null, breakpoint: null }
 *   "hover:bg-red-500" -> { base: "bg-red-500", variant: "hover", breakpoint: null }
 *   "sm:p-4" -> { base: "p-4", variant: null, breakpoint: "sm" }
 *   "lg:hover:bg-blue-600" -> { base: "bg-blue-600", variant: "hover", breakpoint: "lg" }
 */
export function parseClassName(className) {
    const parts = className.split(":")
    const base = parts[parts.length - 1]
    const prefixes = parts.slice(0, -1) // everything before the base utility
    let variant = null
    let breakpoint = null

    // Classify each prefix independently. `breakpoint` is only ever set to a known
    // breakpoint token, so downstream `breakpointRules[breakpoint]` is always a real
    // bucket: an unrecognized prefix (e.g. the leading "active" in
    // "active:hover:bg-blue-500", an unsupported stacked variant) becomes the variant
    // rather than a bogus breakpoint that would crash generation. Order-independent:
    // both "lg:hover:..." and "hover:lg:..." resolve correctly.
    for (const p of prefixes) {
        if (breakpoint === null && isBreakpoint(p)) {
            breakpoint = p
        } else if (variant === null) {
            variant = p
        }
        // Extra prefixes beyond one breakpoint + one variant are ignored: OneJS's
        // generator models a single variant, so stacked variants degrade gracefully.
    }

    return { base, variant, breakpoint }
}

// A prefix token is a breakpoint if it's a configured breakpoint or the built-in
// "2xl" (which is tracked as a separate bucket, not part of the `breakpoints` map).
function isBreakpoint(token) {
    return breakpoints[token] !== undefined || token === "2xl"
}

/**
 * Generate USS declarations for a utility
 */
function generateDeclarations(declarations) {
    return Object.entries(declarations)
        .map(([prop, value]) => `    ${prop}: ${value};`)
        .join("\n")
}

/**
 * Parse arbitrary value from a class name like w-[200] or bg-[#ff5733]
 * Returns { property, value } or null if not an arbitrary value
 */
function parseArbitraryValue(className) {
    const match = className.match(/^(-?)([a-z]+(?:-[a-z]+)?)-\[([^\]]+)\]$/)
    if (!match) return null

    const [, negative, prefix, rawValue] = match
    let value = rawValue

    // Handle percentage
    if (value.endsWith("%")) {
        // Keep as-is
    }
    // Handle hex colors
    else if (value.startsWith("#")) {
        // Keep as-is
    }
    // Handle plain numbers (default to px)
    else if (/^-?\d+(\.\d+)?$/.test(value)) {
        value = `${negative}${value}px`
    }

    // Map prefix to CSS property
    const propertyMap = {
        "w": "width",
        "h": "height",
        "min-w": "min-width",
        "min-h": "min-height",
        "max-w": "max-width",
        "max-h": "max-height",
        "p": ["padding-top", "padding-right", "padding-bottom", "padding-left"],
        "px": ["padding-left", "padding-right"],
        "py": ["padding-top", "padding-bottom"],
        "pt": "padding-top",
        "pr": "padding-right",
        "pb": "padding-bottom",
        "pl": "padding-left",
        "m": ["margin-top", "margin-right", "margin-bottom", "margin-left"],
        "mx": ["margin-left", "margin-right"],
        "my": ["margin-top", "margin-bottom"],
        "mt": "margin-top",
        "mr": "margin-right",
        "mb": "margin-bottom",
        "ml": "margin-left",
        "top": "top",
        "right": "right",
        "bottom": "bottom",
        "left": "left",
        // NOTE: "gap" is NOT supported in USS, use margins on children instead
        "rounded": "border-radius",
        "border": "border-width",
        "text": value.startsWith("#") ? "color" : "font-size",
        "bg": "background-color",
        "opacity": "opacity",
        "rotate": "rotate",
        "scale": "scale",
        "translate-x": "translate",
        "translate-y": "translate",
        "translate": "translate",
        "duration": "transition-duration",
        "delay": "transition-delay",
    }

    const property = propertyMap[prefix]
    if (!property) return null

    // Handle translate specially
    if (prefix === "translate-x") {
        value = `${value} 0`
    } else if (prefix === "translate-y") {
        value = `0 ${value}`
    } else if (prefix === "translate") {
        // Two-component translate uses underscore as the value separator, e.g.
        //   translate-[-50%_50%] → "-50% 50%"
        // Bare numbers (no unit) default to px like the single-axis case.
        value = value.split("_").map((v) => {
            if (/^-?\d+(\.\d+)?$/.test(v)) return `${v}px`
            return v
        }).join(" ")
    }

    // Handle multi-property values
    if (Array.isArray(property)) {
        return Object.fromEntries(property.map(p => [p, value]))
    }

    return { [property]: value }
}

// ============================================================================
// Opacity modifier ("bg-primary-bg/95")
// ============================================================================

/**
 * Detect Tailwind-style opacity modifiers:
 *   - `<name>/<N>` where N is an integer 0–100 (percentage)
 *   - `<name>/[<D>]` where D is a decimal 0.0–1.0 (arbitrary value syntax)
 * Returns { base, opacity: 0..1 } or null.
 */
function parseOpacityModifier(className) {
    const slashIdx = className.lastIndexOf("/")
    if (slashIdx <= 0) return null
    const opacityStr = className.slice(slashIdx + 1)

    let opacity
    if (/^\d+$/.test(opacityStr)) {
        const pct = parseInt(opacityStr, 10)
        if (pct < 0 || pct > 100) return null
        opacity = pct / 100
    } else if (/^\[[\d.]+\]$/.test(opacityStr)) {
        const decimal = parseFloat(opacityStr.slice(1, -1))
        if (Number.isNaN(decimal) || decimal < 0 || decimal > 1) return null
        opacity = decimal
    } else {
        return null
    }

    return { base: className.slice(0, slashIdx), opacity }
}

/**
 * Convert `#rgb` / `#rrggbb` / `#rrggbbaa` to `rgba(r, g, b, a)` with the
 * supplied alpha. If the hex already carries alpha we multiply rather than
 * replace so stacking opacity modifiers on pre-transparent colors composes.
 */
function hexToRgba(hex, alpha) {
    let h = hex.replace(/^#/, "")
    let a = 1
    if (h.length === 3 || h.length === 4) {
        h = h.split("").map((c) => c + c).join("")
    }
    if (h.length === 8) {
        a = parseInt(h.slice(6, 8), 16) / 255
        h = h.slice(0, 6)
    }
    if (h.length !== 6) return null
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    if ([r, g, b].some(Number.isNaN)) return null
    const finalA = +(a * alpha).toFixed(3)
    return `rgba(${r}, ${g}, ${b}, ${finalA})`
}

/**
 * Clone declarations, applying opacity to any recognisably-color values.
 * Hex → rgba(); `rgb(...)` → `rgba(...)`; other string values are passed
 * through unchanged (e.g. USS variable references).
 */
function applyOpacityToDeclarations(decls, opacity) {
    const result = {}
    for (const [prop, value] of Object.entries(decls)) {
        if (typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value)) {
            const rgba = hexToRgba(value, opacity)
            result[prop] = rgba ?? value
        } else if (typeof value === "string" && /^rgb\(/i.test(value)) {
            const m = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i)
            result[prop] = m
                ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${opacity.toFixed(3)})`
                : value
        } else {
            result[prop] = value
        }
    }
    return result
}

/**
 * Generate USS for a set of class names
 */
/**
 * Tailwind families USS cannot express, and what to do instead.
 *
 * These are not typos, so they never reach the unknown-class path a user would
 * notice: they are real Tailwind classes that compile to nothing here. Silence
 * is the worst outcome, because the layout simply comes out wrong with no
 * indication why, which is exactly how every Wordle tile ended up flush against
 * its neighbour.
 *
 * gap is not polyfillable cleanly. USS supports `> *`, so half-margins on the
 * children are expressible, but cancelling the outer half needs a negative
 * margin on the parent, and that silently clobbers any margin the author put on
 * the same element (`gap-2 mb-3` is a real and common pairing). Saying so beats
 * guessing.
 */
const UNSUPPORTED_FAMILIES = [
    {
        test: (base) => /^gap(-x|-y)?-/.test(base),
        name: "gap-*",
        advice: "UI Toolkit has no gap property. Put a margin on the children instead: " +
            "half the gap on each child gives the same spacing between them.",
    },
]

/**
 * Near-miss detection for the unknown-class branch.
 *
 * The scanner deliberately harvests every string literal, so most unknown
 * candidates are ordinary strings and a blanket warning would be all noise.
 * But a candidate whose head matches a real utility family and whose tail is
 * a number ("bg-gray-90", "p-45", "w-13") is almost certainly an intended
 * class with a wrong scale value, which today emits nothing and renders the
 * element unstyled with no indication why. Heads come from the utility table
 * itself ("bg-gray-300" contributes "bg-gray", "p-4" contributes "p"), so
 * the check can never disagree with what the generator actually supports.
 */
let _familyHeads = null
function familyHeads() {
    if (_familyHeads) return _familyHeads
    _familyHeads = new Set()
    for (const key of Object.keys(allUtilities)) {
        const cut = key.lastIndexOf("-")
        if (cut > 0) _familyHeads.add(key.slice(0, cut))
    }
    return _familyHeads
}

function isNearMiss(base) {
    const cut = base.lastIndexOf("-")
    if (cut <= 0) return false
    const tail = base.slice(cut + 1)
    if (!/^\d+(\.\d+)?$/.test(tail)) return false
    return familyHeads().has(base.slice(0, cut))
}

/**
 * Canonical property order, mirroring the order Tailwind emits its own utility
 * layers in.
 *
 * Every utility here compiles to a single-class rule, so they all carry the
 * same specificity and USS falls back to document order to pick a winner. That
 * order used to be file-scan order, which meant `p-4 pt-0` resolved by which
 * file the scanner happened to read first: sometimes `pt-0` won, sometimes it
 * silently did nothing. On the web `pt-0` always wins, because Tailwind emits
 * the per-side utilities after the shorthand.
 *
 * Sorting by the earliest property a rule touches reproduces that, and it
 * ranks the emitted CSS rather than the class name, so arbitrary values
 * (`p-[10px]`) and opacity modifiers (`bg-red-500/50`) fall into place without
 * knowing anything about how they were written. Sides run top, right, bottom,
 * left so that `px-2 pl-0` also lands the way it reads.
 *
 * Adding a utility that emits a property missing from this list is safe: it
 * sorts to the end, after everything ranked, and stays deterministic. Add the
 * property here if it needs to interact with the ones above it.
 */
const PROPERTY_ORDER = [
    // Layout
    "aspect-ratio",
    "display",
    "visibility",
    "overflow",
    "position",
    "top", "right", "bottom", "left",

    // Flex
    "flex-direction",
    "flex-wrap",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "justify-content",
    "align-content",
    "align-items",
    "align-self",

    // Sizing
    "width", "min-width", "max-width",
    "height", "min-height", "max-height",

    // Spacing
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",

    // Typography
    "font-size",
    "-unity-font-style",
    "-unity-text-align",
    "letter-spacing",
    "white-space",
    "color",

    // Background
    "background-color",

    // Border: each shorthand ahead of the sides it expands to
    "border-radius",
    "border-top-left-radius", "border-top-right-radius",
    "border-bottom-right-radius", "border-bottom-left-radius",
    "border-width",
    "border-top-width", "border-right-width",
    "border-bottom-width", "border-left-width",
    "border-color",
    "border-top-color", "border-right-color",
    "border-bottom-color", "border-left-color",

    // Effects
    "opacity",

    // Transform
    "transform-origin",
    "translate", "scale", "rotate",
    "--tw-translate-x", "--tw-translate-y",
    "--tw-scale-x", "--tw-scale-y",

    // Transition
    "transition-property",
    "transition-duration",
    "transition-timing-function",
    "transition-delay",
]

const PROPERTY_RANK = new Map(PROPERTY_ORDER.map((p, i) => [p, i]))

/**
 * Orders two emitted rules. Earliest property first, then the rule declaring
 * the most properties, so a shorthand lands before the side override that
 * refines it (`p-4` before `pt-0`, `rounded` before `rounded-t-lg`). Class name
 * settles the rest, which keeps the output byte-identical no matter what order
 * the filesystem handed the scanner its files in.
 */
function compareRules(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank
    if (a.count !== b.count) return b.count - a.count
    return a.className < b.className ? -1 : a.className > b.className ? 1 : 0
}

function rankOf(declarations) {
    let rank = PROPERTY_ORDER.length
    for (const property of Object.keys(declarations)) {
        const r = PROPERTY_RANK.get(property)
        if (r !== undefined && r < rank) rank = r
    }
    return rank
}

/**
 * Opt-in preflight, the OneJS analogue of web Tailwind's: strip the control
 * chrome the runtime theme paints on Button, TextField and Label, the way web
 * preflight strips the browser's, so utilities start from a bare element.
 *
 * Two things decide its shape. First, it sits in the same stylesheet as the
 * utilities, BEFORE them, so a utility beats it on the cascade tie exactly as
 * utilities beat web preflight. Second, the theme styles the states of
 * composite controls through selectors like
 * `.unity-text-field:focus .unity-text-field__input`, which outrank any single
 * utility class; the preflight neutralizes those at the same selector shapes,
 * permanently. The consequence is a deliberate one: with preflight on, the
 * inner input is a transparent text region in every state, and the visible box
 * is painted on the field itself (`className`) or inline on the input
 * (`inputStyle`), both of which always win.
 *
 * Toggle and Slider keep their look: web preflight leaves native checkbox and
 * range rendering alone too, and a fully unstyled slider is unusable. Only
 * their outer margins are zeroed, matching preflight's `margin: 0` on inputs.
 */
export const PREFLIGHT_USS = `/* Preflight: strip the runtime theme's control chrome */
.unity-button {
    margin-top: 0; margin-right: 0; margin-bottom: 0; margin-left: 0;
    padding-top: 0; padding-right: 0; padding-bottom: 0; padding-left: 0;
    border-top-width: 0; border-right-width: 0; border-bottom-width: 0; border-left-width: 0;
    border-top-left-radius: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; border-bottom-left-radius: 0;
    background-color: rgba(0, 0, 0, 0);
    background-image: none;
}

.unity-button:hover, .unity-button:active, .unity-button:focus, .unity-button:disabled {
    background-color: rgba(0, 0, 0, 0);
    border-top-color: rgba(0, 0, 0, 0); border-right-color: rgba(0, 0, 0, 0); border-bottom-color: rgba(0, 0, 0, 0); border-left-color: rgba(0, 0, 0, 0);
}

.unity-text-field, .unity-base-text-field {
    margin-top: 0; margin-right: 0; margin-bottom: 0; margin-left: 0;
}

.unity-text-field__input, .unity-base-text-field__input {
    padding-top: 0; padding-right: 0; padding-bottom: 0; padding-left: 0;
    border-top-width: 0; border-right-width: 0; border-bottom-width: 0; border-left-width: 0;
    border-top-left-radius: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; border-bottom-left-radius: 0;
    background-color: rgba(0, 0, 0, 0);
}

.unity-text-field:hover .unity-text-field__input,
.unity-base-text-field:hover .unity-base-text-field__input,
.unity-text-field:focus .unity-text-field__input,
.unity-base-text-field:focus .unity-base-text-field__input,
.unity-text-field:disabled .unity-text-field__input,
.unity-base-text-field:disabled .unity-base-text-field__input {
    background-color: rgba(0, 0, 0, 0);
    border-top-color: rgba(0, 0, 0, 0); border-right-color: rgba(0, 0, 0, 0); border-bottom-color: rgba(0, 0, 0, 0); border-left-color: rgba(0, 0, 0, 0);
}

.unity-label {
    margin-top: 0; margin-right: 0; margin-bottom: 0; margin-left: 0;
    padding-top: 0; padding-right: 0; padding-bottom: 0; padding-left: 0;
}

.unity-toggle, .unity-base-slider {
    margin-top: 0; margin-right: 0; margin-bottom: 0; margin-left: 0;
}
`

export function generateUSS(classNames, options = {}) {
    const {
        includeReset = false,
        preflight = false,
        onUnsupported = defaultUnsupportedWarning,
        onUnknown = defaultUnknownWarning,
    } = options
    const rules = []
    const unsupported = new Map()
    const nearMisses = new Set()
    const breakpointRules = {} // Group by breakpoint

    // Initialize breakpoint groups
    for (const bp of Object.keys(breakpoints)) {
        breakpointRules[bp] = []
    }
    breakpointRules["2xl"] = []

    for (const className of classNames) {
        const { base, variant, breakpoint } = parseClassName(className)

        // Look up the base utility
        let declarations = allUtilities[base]

        // Tailwind color/opacity modifier: "<color-utility>/<N>".
        // Built-in colors are already pre-expanded with opacity in
        // `utilities.mjs` (8-digit hex), so this fallback only fires for
        // user-injected colors (via tailwind.config.js extend.colors) and
        // arbitrary hex values like `bg-[#ff5733]/50`.
        if (!declarations) {
            const mod = parseOpacityModifier(base)
            if (mod) {
                const baseDecls =
                    allUtilities[mod.base] ?? parseArbitraryValue(mod.base)
                if (baseDecls) {
                    declarations = applyOpacityToDeclarations(
                        baseDecls,
                        mod.opacity,
                    )
                }
            }
        }

        // If still not found, try to parse as arbitrary value
        if (!declarations) {
            declarations = parseArbitraryValue(base)
        }

        if (!declarations) {
            // Unknown utility class. Most are not Tailwind at all (CSS module
            // names, arbitrary strings the scanner picked up), so staying quiet
            // is right, except for the families we know are real Tailwind and
            // silently do nothing here, and for near-misses that name a real
            // family with a scale value that does not exist.
            for (const family of UNSUPPORTED_FAMILIES) {
                if (!family.test(base)) continue
                if (!unsupported.has(family.name)) unsupported.set(family.name, { family, used: new Set() })
                unsupported.get(family.name).used.add(className)
            }
            if (isNearMiss(base)) nearMisses.add(className)
            continue
        }

        // Escape the full class name for USS
        const escapedClass = escapeClassName(className)

        // Build the selector
        //
        // `group-<pseudo>:` and `peer-<pseudo>:` variants are not real pseudo-
        // classes: they mean "apply when an ancestor (.group) or sibling
        // (.peer) has the given state". In USS this becomes a descendant or
        // sibling combinator, NOT a pseudo-class on the target element. Naive
        // `${selector}:${variant}` produced e.g. `.group-focus_c_X:group-focus`
        // which Unity's USS parser rejects with "Unknown pseudo class 'group-focus'".
        //
        // Arbitrary variants wrap a raw selector fragment in square brackets,
        // e.g. `[&>TextElement]:ml-[6px]`. `&` stands for the current class
        // selector and must be substituted in; the brackets are stripped.
        // Without this, `:${variant}` produced `.escaped:[&>TextElement]`
        // which is invalid USS.
        let selector
        if (variant && variant.startsWith("[") && variant.endsWith("]")) {
            const rawSelector = variant.slice(1, -1)
            selector = rawSelector.replace(/&/g, `.${escapedClass}`)
        } else if (variant === "*") {
            // Tailwind's `*` variant targets every direct child, not the
            // element itself. Attaching `:*` as a pseudo-class would be
            // invalid USS: emit a universal-child combinator instead.
            selector = `.${escapedClass} > *`
        } else if (variant && variant.startsWith("group-")) {
            const pseudo = variant.slice("group-".length)
            selector = `.group:${pseudo} .${escapedClass}`
        } else if (variant && variant.startsWith("peer-")) {
            const pseudo = variant.slice("peer-".length)
            selector = `.peer:${pseudo} ~ .${escapedClass}`
        } else if (variant) {
            selector = `.${escapedClass}:${variant}`
        } else {
            selector = `.${escapedClass}`
        }

        // Generate the rule. Carry the sort key alongside it: the rules are
        // ordered by property, not by the order the scanner found them.
        const entry = {
            rule: `${selector} {\n${generateDeclarations(declarations)}\n}`,
            rank: rankOf(declarations),
            count: Object.keys(declarations).length,
            className,
        }

        // parseClassName only ever yields a known breakpoint, but guard the bucket
        // lookup anyway so an unexpected value degrades to an unscoped rule instead
        // of throwing and failing the whole build.
        if (breakpoint && breakpointRules[breakpoint]) {
            breakpointRules[breakpoint].push(entry)
        } else {
            rules.push(entry)
        }
    }

    if (unsupported.size > 0 && typeof onUnsupported === "function") {
        onUnsupported([...unsupported.values()].map(({ family, used }) => ({
            name: family.name,
            advice: family.advice,
            used: [...used].sort(),
        })))
    }

    if (nearMisses.size > 0 && typeof onUnknown === "function") {
        onUnknown([...nearMisses].sort())
    }

    // Build final USS
    let uss = ""

    if (includeReset) {
        uss += `/* OneJS Tailwind Reset */\n* {\n    margin: 0;\n    padding: 0;\n}\n\n`
    }

    // Before the utilities, so a utility wins the cascade tie against it.
    if (preflight) {
        uss += PREFLIGHT_USS + "\n"
    }

    uss += `/* USS variable declarations */\n* {\n    --tw-scale-x: 1;\n    --tw-scale-y: 1;\n    --tw-translate-x: 0;\n    --tw-translate-y: 0;\n}\n\n`
    
    uss += `/* Base utilities */\n`
    uss += rules.sort(compareRules).map((e) => e.rule).join("\n\n")

    // Add breakpoint-scoped rules
    for (const [bp, bpEntries] of Object.entries(breakpointRules)) {
        if (bpEntries.length === 0) continue

        uss += `\n\n/* ${bp} breakpoint (${breakpoints[bp] || 1536}px+) */\n`
        // For USS, we use ancestor selectors instead of media queries
        // .sm .sm_c_p-4 { ... }
        // Each bucket is a cascade of its own, so it gets the same ordering.
        const bpRules = bpEntries.sort(compareRules).map((e) => e.rule)
        for (const rule of bpRules) {
            // Wrap with breakpoint ancestor selector
            const wrappedRule = rule.replace(
                /^(\.[^\s{]+)/,
                `.${bp} $1`
            )
            uss += wrappedRule + "\n\n"
        }
    }

    return uss.trim()
}

/** Reports classes that name a real utility family with a value that does not
 * exist ("bg-gray-90"), once per build, on stderr. Without this the class
 * emits nothing and the element renders unstyled with no indication why. */
function defaultUnknownWarning(classNames) {
    const shown = classNames.slice(0, 12).join(" ")
    const more = classNames.length > 12 ? ` (and ${classNames.length - 12} more)` : ""
    console.warn(`[tailwind] matched a known family but no utility, so emitted nothing: ${shown}${more}`)
}

/** Reports unsupported utilities once per build, on stderr. */
function defaultUnsupportedWarning(families) {
    for (const { name, advice, used } of families) {
        const shown = used.slice(0, 8).join(" ")
        const more = used.length > 8 ? ` (and ${used.length - 8} more)` : ""
        console.warn(`[tailwind] ${name} is not supported and was skipped: ${shown}${more}\n            ${advice}`)
    }
}

/**
 * Main function: scan files and generate USS
 */
export async function generateFromFiles(contentPatterns, options = {}) {
    const classNames = await scanFiles(contentPatterns)

    // Merge safelist classes
    const { safelist = [] } = options
    for (const cls of safelist) {
        classNames.add(cls)
    }

    return generateUSS(classNames, options)
}

export default {
    escapeClassName,
    extractClassNames,
    scanFiles,
    parseClassName,
    generateUSS,
    generateFromFiles,
}
