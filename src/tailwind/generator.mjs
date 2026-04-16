/**
 * USS Generator for OneJS Tailwind
 *
 * Scans source files for class names, matches against utility definitions,
 * and generates USS output.
 */

import fs from "node:fs/promises"
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
 * Extract class names from a source file content
 * Handles: className="...", className={`...`}, className={expr},
 *          className={clsx(...)}, ternaries, logical &&, etc.
 */
export function extractClassNames(content) {
    const classNames = new Set()

    // Match className="..." or class="..."
    const stringPattern = /class(?:Name)?=["']([^"']+)["']/g
    let match
    while ((match = stringPattern.exec(content)) !== null) {
        const classes = match[1].split(/\s+/).filter(Boolean)
        classes.forEach(c => classNames.add(c))
    }

    // Match className={`...`} (template literals)
    // Extract static parts AND string literals inside ${...} expressions
    const templatePattern = /class(?:Name)?=\{`([^`]+)`\}/g
    while ((match = templatePattern.exec(content)) !== null) {
        // Extract static parts
        const staticParts = match[1].replace(/\$\{[^}]+\}/g, " ")
        staticParts.split(/\s+/).filter(Boolean).forEach(c => classNames.add(c))

        // Also extract string literals inside ${...} expressions
        // e.g. className={`p-4 ${active ? "bg-blue-500" : "bg-gray-500"}`}
        const exprMatches = match[1].matchAll(/\$\{([^}]+)\}/g)
        for (const exprMatch of exprMatches) {
            extractStringLiterals(exprMatch[1]).forEach(c => classNames.add(c))
        }
    }

    // Match className={...} (any expression)
    // Uses brace-depth tracking to handle nested braces correctly
    const exprStarts = [...content.matchAll(/class(?:Name)?=\{/g)]
    for (const exprStart of exprStarts) {
        const startIdx = exprStart.index + exprStart[0].length
        const expr = extractBracedExpression(content, startIdx)
        if (expr !== null) {
            // Skip template literals (already handled above)
            if (expr.trimStart().startsWith("`")) continue
            extractStringLiterals(expr).forEach(c => classNames.add(c))
        }
    }

    return classNames
}

/**
 * Extract the content of a braced expression, handling nested braces.
 * Starts after the opening brace. Returns the content before the matching close brace.
 */
function extractBracedExpression(content, startIdx) {
    let depth = 1
    let i = startIdx
    while (i < content.length && depth > 0) {
        const ch = content[i]
        if (ch === "{") depth++
        else if (ch === "}") depth--
        // Skip string contents
        else if (ch === '"' || ch === "'" || ch === "`") {
            i = skipString(content, i)
            continue
        }
        i++
    }
    if (depth !== 0) return null
    return content.slice(startIdx, i - 1)
}

/**
 * Skip past a quoted string (handles escape sequences).
 * Returns the index after the closing quote.
 */
function skipString(content, startIdx) {
    const quote = content[startIdx]
    let i = startIdx + 1
    while (i < content.length) {
        if (content[i] === "\\") { i += 2; continue }
        if (content[i] === quote) return i + 1
        // Template literal ${} nesting
        if (quote === "`" && content[i] === "$" && content[i + 1] === "{") {
            i += 2
            let depth = 1
            while (i < content.length && depth > 0) {
                if (content[i] === "{") depth++
                else if (content[i] === "}") depth--
                else if (content[i] === '"' || content[i] === "'" || content[i] === "`") {
                    i = skipString(content, i)
                    continue
                }
                i++
            }
            continue
        }
        i++
    }
    return i
}

/**
 * Extract all Tailwind class names from string literals within an expression.
 * Finds all "..." and '...' strings and splits them into individual class names.
 */
function extractStringLiterals(expr) {
    const classes = new Set()
    const stringLitPattern = /["']([^"']+)["']/g
    let match
    while ((match = stringLitPattern.exec(expr)) !== null) {
        match[1].split(/\s+/).filter(Boolean).forEach(c => classes.add(c))
    }
    return classes
}

/**
 * Scan multiple files and extract all class names
 */
export async function scanFiles(patterns, cwd = process.cwd()) {
    const classNames = new Set()

    // Simple glob implementation for common patterns
    async function walkDir(dir, pattern) {
        const entries = await fs.readdir(dir, { withFileTypes: true })

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
                        const content = await fs.readFile(fullPath, "utf8")
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
            // Glob pattern - walk directory
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
                const content = await fs.readFile(filePath, "utf8")
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
    let base = parts[parts.length - 1]
    let variant = null
    let breakpoint = null

    // Check for breakpoint prefix
    if (parts.length >= 2) {
        const firstPart = parts[0]
        if (breakpoints[firstPart] !== undefined || firstPart === "2xl") {
            breakpoint = firstPart
            if (parts.length === 3) {
                variant = parts[1]
            }
        } else {
            // First part is a variant (hover, focus, etc.)
            variant = firstPart
            if (parts.length === 3) {
                breakpoint = parts[0]
                variant = parts[1]
            }
        }
    }

    // Re-parse for correct order: breakpoint:variant:base
    if (parts.length === 3) {
        breakpoint = parts[0]
        variant = parts[1]
        base = parts[2]
    } else if (parts.length === 2) {
        const first = parts[0]
        if (breakpoints[first] !== undefined || first === "2xl") {
            breakpoint = first
            base = parts[1]
        } else {
            variant = first
            base = parts[1]
        }
    }

    return { base, variant, breakpoint }
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
        // NOTE: "gap" is NOT supported in USS - use margins on children instead
        "rounded": "border-radius",
        "border": "border-width",
        "text": value.startsWith("#") ? "color" : "font-size",
        "bg": "background-color",
        "opacity": "opacity",
        "rotate": "rotate",
        "scale": "scale",
        "translate-x": "translate",
        "translate-y": "translate",
    }

    const property = propertyMap[prefix]
    if (!property) return null

    // Handle translate specially
    if (prefix === "translate-x") {
        value = `${value} 0`
    } else if (prefix === "translate-y") {
        value = `0 ${value}`
    }

    // Handle multi-property values
    if (Array.isArray(property)) {
        return Object.fromEntries(property.map(p => [p, value]))
    }

    return { [property]: value }
}

/**
 * Generate USS for a set of class names
 */
export function generateUSS(classNames, options = {}) {
    const { includeReset = false } = options
    const rules = []
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

        // If not found, try to parse as arbitrary value
        if (!declarations) {
            declarations = parseArbitraryValue(base)
        }

        if (!declarations) {
            // Unknown utility class, skip
            continue
        }

        // Escape the full class name for USS
        const escapedClass = escapeClassName(className)

        // Build the selector
        //
        // `group-<pseudo>:` and `peer-<pseudo>:` variants are not real pseudo-
        // classes — they mean "apply when an ancestor (.group) or sibling
        // (.peer) has the given state". In USS this becomes a descendant or
        // sibling combinator, NOT a pseudo-class on the target element. Naive
        // `${selector}:${variant}` produced e.g. `.group-focus_c_X:group-focus`
        // which Unity's USS parser rejects with "Unknown pseudo class 'group-focus'".
        let selector
        if (variant && variant.startsWith("group-")) {
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

        // Generate the rule
        const rule = `${selector} {\n${generateDeclarations(declarations)}\n}`

        if (breakpoint) {
            breakpointRules[breakpoint].push(rule)
        } else {
            rules.push(rule)
        }
    }

    // Build final USS
    let uss = ""

    if (includeReset) {
        uss += `/* OneJS Tailwind Reset */\n* {\n    margin: 0;\n    padding: 0;\n}\n\n`
    }

    uss += `/* USS variable declarations */\n* {\n    --tw-scale-x: 1;\n    --tw-scale-y: 1;\n    --tw-translate-x: 0;\n    --tw-translate-y: 0;\n}\n\n`
    
    uss += `/* Base utilities */\n`
    uss += rules.join("\n\n")

    // Add breakpoint-scoped rules
    for (const [bp, bpRules] of Object.entries(breakpointRules)) {
        if (bpRules.length === 0) continue

        uss += `\n\n/* ${bp} breakpoint (${breakpoints[bp] || 1536}px+) */\n`
        // For USS, we use ancestor selectors instead of media queries
        // .sm .sm_c_p-4 { ... }
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
