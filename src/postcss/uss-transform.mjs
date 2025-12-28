/**
 * PostCSS plugin to transform Tailwind CSS to USS-compatible format
 *
 * Handles:
 * - Character escaping in selectors (: -> _c_, / -> _s_, etc.)
 * - Media query conversion to breakpoint class prefixes
 * - rem to px conversion
 * - Modern color syntax to rgba()
 */

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

// Breakpoint mappings (Tailwind defaults)
const BREAKPOINTS = [
    { name: "sm", minWidth: 640 },
    { name: "md", minWidth: 768 },
    { name: "lg", minWidth: 1024 },
    { name: "xl", minWidth: 1280 },
    { name: "2xl", minWidth: 1536 },
]

/**
 * Escape special characters in a class name
 */
function escapeClassName(name) {
    // Handle numeric prefix (class names can't start with numbers in USS)
    if (/^[0-9]/.test(name)) {
        name = "_" + name
    }

    let escaped = name
    for (const [char, replacement] of Object.entries(ESCAPE_MAP)) {
        // Use split/join for global replace (faster than regex for single chars)
        escaped = escaped.split(char).join(replacement)
    }
    return escaped
}

/**
 * Get breakpoint prefix for a given min-width
 */
function getBreakpointPrefix(minWidth) {
    for (const bp of BREAKPOINTS) {
        if (bp.minWidth === minWidth) {
            return bp.name
        }
    }
    // For non-standard breakpoints, use the width value
    return `_${minWidth}_`
}

/**
 * Convert rem values to px (1rem = 16px)
 */
function remToPx(value, baseFontSize = 16) {
    return value.replace(
        /(-?[\d.]+)rem/g,
        (match, num) => (parseFloat(num) * baseFontSize) + "px"
    )
}

/**
 * Convert modern rgb()/hsl() syntax with slash to rgba()/hsla()
 * e.g., rgb(255 0 0 / 0.5) -> rgba(255, 0, 0, 0.5)
 */
function modernColorToLegacy(value) {
    // Handle rgb(r g b / a) -> rgba(r, g, b, a)
    value = value.replace(
        /rgb\(\s*([^)]+)\s+\/\s+([\d.]+%?)\s*\)/g,
        (match, colors, alpha) => {
            const parts = colors.trim().split(/\s+/)
            if (parts.length === 3) {
                return `rgba(${parts.join(", ")}, ${alpha})`
            }
            return match
        }
    )

    // Handle hsl(h s l / a) -> hsla(h, s, l, a)
    value = value.replace(
        /hsl\(\s*([^)]+)\s+\/\s+([\d.]+%?)\s*\)/g,
        (match, colors, alpha) => {
            const parts = colors.trim().split(/\s+/)
            if (parts.length === 3) {
                return `hsla(${parts.join(", ")}, ${alpha})`
            }
            return match
        }
    )

    return value
}

/**
 * Convert 8-digit hex colors to rgba
 * e.g., #FF0000FF -> rgba(255, 0, 0, 1)
 */
function hex8ToRgba(value) {
    return value.replace(
        /#([0-9A-Fa-f]{8})\b/g,
        (match, hex) => {
            const r = parseInt(hex.slice(0, 2), 16)
            const g = parseInt(hex.slice(2, 4), 16)
            const b = parseInt(hex.slice(4, 6), 16)
            const a = parseInt(hex.slice(6, 8), 16) / 255
            return `rgba(${r}, ${g}, ${b}, ${a.toFixed(2)})`
        }
    )
}

/**
 * Transform class selectors in a selector string
 * Handles Tailwind's backslash-escaped characters like hover\:bg-red-500
 *
 * Key insight: In CSS, `:` starts a pseudo-class UNLESS it's escaped with `\`
 * So `.hover\:bg-red-500:hover` has:
 *   - class name: `hover\:bg-red-500` (escaped colon is part of name)
 *   - pseudo-class: `:hover` (unescaped colon starts pseudo)
 */
function transformSelector(selector) {
    // Match class selectors including backslash escapes
    // Captures characters OR backslash+any char, but stops at unescaped : # [ etc.
    return selector.replace(
        /\.(-?[_a-zA-Z](?:[^\s,.#:\[\]{}()+>~\\]|\\.)*)(?=[:\s,.#\[\]{}()+>~]|$)/g,
        (match, className) => {
            // Remove any backslash escapes that Tailwind adds
            const unescaped = className.replace(/\\/g, "")
            return "." + escapeClassName(unescaped)
        }
    )
}

export function ussTransform(opts = {}) {
    const baseFontSize = opts.baseFontSize || 16

    return {
        postcssPlugin: "postcss-uss-transform",

        // Transform at-rules (media queries)
        AtRule: {
            media(atRule) {
                // Match min-width media queries
                const widthMatch = atRule.params.match(/\(\s*min-width\s*:\s*(\d+)px\s*\)/)
                if (!widthMatch) return

                const minWidth = parseInt(widthMatch[1], 10)
                const breakpointPrefix = getBreakpointPrefix(minWidth)

                // Add breakpoint class prefix to all selectors inside
                atRule.walkRules(rule => {
                    // Transform existing selectors
                    const transformedSelector = transformSelector(rule.selector)

                    // Add breakpoint prefix as ancestor selector
                    // .foo becomes .sm .foo (for sm breakpoint)
                    const selectors = transformedSelector.split(",").map(s => s.trim())
                    rule.selector = selectors
                        .map(s => `.${breakpointPrefix} ${s}`)
                        .join(", ")
                })

                // Unwrap the media query (move rules to parent)
                atRule.replaceWith(atRule.nodes)
            }
        },

        // Transform rules
        Rule(rule) {
            // Skip if already inside a media query (handled above)
            if (rule.parent.type === "atrule" && rule.parent.name === "media") {
                return
            }

            // Transform selectors
            rule.selector = transformSelector(rule.selector)
        },

        // Transform declarations
        Declaration(decl) {
            let value = decl.value

            // Convert rem to px
            if (value.includes("rem")) {
                value = remToPx(value, baseFontSize)
            }

            // Convert modern color syntax
            if (value.includes("rgb(") || value.includes("hsl(")) {
                value = modernColorToLegacy(value)
            }

            // Convert 8-digit hex
            if (/#[0-9A-Fa-f]{8}\b/.test(value)) {
                value = hex8ToRgba(value)
            }

            if (value !== decl.value) {
                decl.value = value
            }
        }
    }
}

ussTransform.postcss = true
export default ussTransform
