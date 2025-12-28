/**
 * PostCSS plugin to remove CSS features unsupported by USS
 *
 * Removes:
 * - CSS custom properties (--var)
 * - var() references
 * - Unsupported properties (filter, box-shadow, etc.)
 * - @keyframes rules
 * - @font-face rules
 * - @supports rules
 */

// Properties that USS doesn't support
const UNSUPPORTED_PROPERTIES = new Set([
    // Filters and effects
    "filter",
    "backdrop-filter",
    "box-shadow",
    "text-shadow",
    "drop-shadow",

    // Transforms (partial support - keep basic ones)
    "transform-origin",
    "transform-style",
    "perspective",
    "perspective-origin",
    "backface-visibility",

    // Animations
    "animation",
    "animation-name",
    "animation-duration",
    "animation-timing-function",
    "animation-delay",
    "animation-iteration-count",
    "animation-direction",
    "animation-fill-mode",
    "animation-play-state",

    // Grid (USS doesn't support CSS Grid)
    "grid",
    "grid-template",
    "grid-template-columns",
    "grid-template-rows",
    "grid-template-areas",
    "grid-auto-columns",
    "grid-auto-rows",
    "grid-auto-flow",
    "grid-column",
    "grid-column-start",
    "grid-column-end",
    "grid-row",
    "grid-row-start",
    "grid-row-end",
    "grid-area",
    "gap",
    "column-gap",
    "row-gap",

    // Other unsupported
    "will-change",
    "contain",
    "content-visibility",
    "aspect-ratio",
    "object-fit",
    "object-position",
    "mix-blend-mode",
    "background-blend-mode",
    "isolation",
    "clip-path",
    "mask",
    "mask-image",

    // Typography (some unsupported)
    "text-decoration-line",
    "text-decoration-style",
    "text-decoration-color",
    "text-decoration-thickness",
    "text-underline-offset",
    "line-clamp",
    "-webkit-line-clamp",
    "hyphens",
    "word-break",
    "writing-mode",
    "text-orientation",

    // Scrolling
    "scroll-behavior",
    "scroll-snap-type",
    "scroll-snap-align",
    "overscroll-behavior",

    // Cursors and pointers
    "cursor",
    "caret-color",
    "pointer-events",
    "touch-action",
    "user-select",
    "-webkit-user-select",

    // Lists
    "list-style",
    "list-style-type",
    "list-style-position",
    "list-style-image",

    // Tables
    "border-collapse",
    "border-spacing",
    "table-layout",
    "caption-side",

    // Columns
    "columns",
    "column-count",
    "column-width",
    "column-gap",
    "column-rule",
    "column-fill",
    "column-span",

    // Outlines (USS uses border instead)
    "outline",
    "outline-width",
    "outline-style",
    "outline-color",
    "outline-offset",

    // Resize
    "resize",
])

// Properties that might be partially supported but need review
const WARN_PROPERTIES = new Set([
    "transform", // Supported but limited
    "transition", // Supported but limited
])

export function ussCleanup(opts = {}) {
    const { removeEmpty = true, warn = false } = opts
    const removedProperties = new Map()

    return {
        postcssPlugin: "postcss-uss-cleanup",

        // Remove unsupported at-rules
        AtRule(atRule) {
            const unsupportedAtRules = ["keyframes", "font-face", "supports", "layer", "container"]

            if (unsupportedAtRules.includes(atRule.name)) {
                atRule.remove()
            }
        },

        // Remove unsupported declarations
        Declaration(decl) {
            // Remove CSS custom properties
            if (decl.prop.startsWith("--")) {
                decl.remove()
                return
            }

            // Remove var() references
            if (decl.value.includes("var(")) {
                decl.remove()
                return
            }

            // Remove calc() with var() inside
            if (decl.value.includes("calc(") && decl.value.includes("var(")) {
                decl.remove()
                return
            }

            // Remove unsupported properties
            if (UNSUPPORTED_PROPERTIES.has(decl.prop)) {
                if (warn) {
                    const count = removedProperties.get(decl.prop) || 0
                    removedProperties.set(decl.prop, count + 1)
                }
                decl.remove()
                return
            }

            // Warn about partially supported properties
            if (warn && WARN_PROPERTIES.has(decl.prop)) {
                console.warn(`[postcss-uss-cleanup] Property "${decl.prop}" has limited USS support`)
            }
        },

        // Remove empty rules after cleanup
        OnceExit(root) {
            if (removeEmpty) {
                root.walkRules(rule => {
                    if (rule.nodes.length === 0) {
                        rule.remove()
                    }
                })
            }

            // Report removed properties
            if (warn && removedProperties.size > 0) {
                console.warn("\n[postcss-uss-cleanup] Removed unsupported properties:")
                for (const [prop, count] of removedProperties) {
                    console.warn(`  ${prop}: ${count} occurrence(s)`)
                }
            }
        }
    }
}

ussCleanup.postcss = true
export default ussCleanup
