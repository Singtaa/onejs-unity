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
 * Handles: className="...", className={`...`}, className={clsx(...)}
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
    const templatePattern = /class(?:Name)?=\{`([^`]+)`\}/g
    while ((match = templatePattern.exec(content)) !== null) {
        // Extract static parts, ignore ${...} expressions
        const staticParts = match[1].replace(/\$\{[^}]+\}/g, " ")
        const classes = staticParts.split(/\s+/).filter(Boolean)
        classes.forEach(c => classNames.add(c))
    }

    // Match className={clsx(...)} or className={cn(...)} patterns
    // This is a simplified extraction - gets string literals inside
    const clsxPattern = /class(?:Name)?=\{(?:clsx|cn|classnames)\(([^)]+)\)\}/g
    while ((match = clsxPattern.exec(content)) !== null) {
        // Extract string literals from the arguments
        const stringLiterals = match[1].match(/["']([^"']+)["']/g) || []
        stringLiterals.forEach(lit => {
            const classes = lit.slice(1, -1).split(/\s+/).filter(Boolean)
            classes.forEach(c => classNames.add(c))
        })
    }

    return classNames
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
        let selector = `.${escapedClass}`
        if (variant) {
            // Add pseudo-class
            selector += `:${variant}`
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
