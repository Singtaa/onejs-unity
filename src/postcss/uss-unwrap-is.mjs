/**
 * PostCSS plugin to flatten :is() pseudo-class selectors
 *
 * USS doesn't support :is(), which Tailwind v3 uses for selector grouping.
 * This plugin expands :is() into multiple selectors.
 *
 * Example:
 *   .button:is(.primary, .secondary) { color: blue; }
 * Becomes:
 *   .button.primary { color: blue; }
 *   .button.secondary { color: blue; }
 */

/**
 * Parse the contents of :is() and return array of alternatives
 */
function parseIsContents(contents) {
    const alternatives = []
    let current = ""
    let depth = 0

    for (const char of contents) {
        if (char === "(" || char === "[") {
            depth++
            current += char
        } else if (char === ")" || char === "]") {
            depth--
            current += char
        } else if (char === "," && depth === 0) {
            alternatives.push(current.trim())
            current = ""
        } else {
            current += char
        }
    }

    if (current.trim()) {
        alternatives.push(current.trim())
    }

    return alternatives
}

/**
 * Expand a single :is() in a selector
 * Returns array of expanded selectors
 */
function expandIsOnce(selector) {
    // Match :is(...) - need to handle nested parens
    const isMatch = selector.match(/:is\(/)
    if (!isMatch) return [selector]

    const startIdx = isMatch.index
    const parenStart = startIdx + 4 // after ":is("

    // Find matching closing paren
    let depth = 1
    let endIdx = parenStart
    while (depth > 0 && endIdx < selector.length) {
        if (selector[endIdx] === "(") depth++
        else if (selector[endIdx] === ")") depth--
        endIdx++
    }

    if (depth !== 0) {
        // Malformed :is(), return as-is
        return [selector]
    }

    const before = selector.slice(0, startIdx)
    const contents = selector.slice(parenStart, endIdx - 1)
    const after = selector.slice(endIdx)

    const alternatives = parseIsContents(contents)

    return alternatives.map(alt => before + alt + after)
}

/**
 * Recursively expand all :is() in a selector
 */
function expandIsSelector(selector) {
    let current = [selector]
    let hasIs = true

    // Keep expanding until no more :is() remain
    while (hasIs) {
        hasIs = false
        const next = []

        for (const sel of current) {
            if (sel.includes(":is(")) {
                hasIs = true
                next.push(...expandIsOnce(sel))
            } else {
                next.push(sel)
            }
        }

        current = next

        // Safety limit to prevent infinite loops
        if (current.length > 1000) {
            console.warn("[postcss-uss-unwrap-is] Selector expansion exceeded limit")
            break
        }
    }

    return current
}

/**
 * Also handle :where() which is similar to :is() but with 0 specificity
 * Since USS doesn't have specificity concerns the same way, we can treat it the same
 */
function expandWhereSelector(selector) {
    // Replace :where( with :is( and use the same expansion logic
    const normalized = selector.replace(/:where\(/g, ":is(")
    return expandIsSelector(normalized)
}

export function ussUnwrapIs(opts = {}) {
    return {
        postcssPlugin: "postcss-uss-unwrap-is",

        Rule(rule) {
            // Check if selector contains :is() or :where()
            if (!rule.selector.includes(":is(") && !rule.selector.includes(":where(")) {
                return
            }

            // Split by comma to handle multiple selectors
            const selectors = rule.selector.split(",").map(s => s.trim())
            const expanded = []

            for (const selector of selectors) {
                // Handle :where() first (convert to :is())
                const normalized = selector.replace(/:where\(/g, ":is(")

                // Expand :is()
                const results = expandIsSelector(normalized)
                expanded.push(...results)
            }

            // Deduplicate
            const unique = [...new Set(expanded)]

            // Update selector
            rule.selector = unique.join(", ")
        }
    }
}

ussUnwrapIs.postcss = true
export default ussUnwrapIs
