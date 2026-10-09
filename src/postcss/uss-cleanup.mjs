/**
 * PostCSS plugin to remove CSS that USS cannot parse.
 *
 * Removes:
 * - CSS custom properties (--var)
 * - var() references
 * - @keyframes, @font-face, @supports, @layer and @container rules
 *
 * It does not judge properties by name. Which ones USS has depends on the Unity
 * version (filter arrived in 6.3, backdrop-filter in 6.6), and only the editor
 * knows that: OneJS's runtime USS compiler checks every property against the
 * running editor's own table and warns about each one UI Toolkit will ignore.
 * The list this plugin used to carry stripped filter, text-shadow and
 * transform-origin, all of which USS has.
 */

export function ussCleanup(opts = {}) {
    const { removeEmpty = true } = opts

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
        }
    }
}

ussCleanup.postcss = true
export default ussCleanup
