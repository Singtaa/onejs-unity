/**
 * Utility class definitions for OneJS Tailwind
 *
 * Each utility is a function that takes a value and returns USS declarations.
 * Static utilities are pre-computed, dynamic utilities use patterns.
 */

import {
    spacing,
    percentages,
    colors,
    fontSize,
    fontWeight,
    borderRadius,
    borderWidth,
    opacity,
    zIndex,
    transitionDuration,
    rotate,
    scale,
    letterSpacing,
} from "./config.mjs"

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Generate spacing utilities for a property
 */
function spacingUtilities(prefix, properties) {
    const result = {}
    for (const [key, value] of Object.entries(spacing)) {
        const className = key === "0" ? `${prefix}-0` : `${prefix}-${key}`
        result[className] = Object.fromEntries(
            properties.map(prop => [prop, value])
        )
    }
    return result
}

/**
 * Generate negative spacing utilities
 */
function negativeSpacingUtilities(prefix, properties) {
    const result = {}
    for (const [key, value] of Object.entries(spacing)) {
        if (key === "0" || key === "px") continue
        const className = `-${prefix}-${key}`
        result[className] = Object.fromEntries(
            properties.map(prop => [prop, `-${value}`])
        )
    }
    return result
}

/**
 * Generate color utilities for a property
 */
function colorUtilities(prefix, property) {
    const result = {}
    for (const [key, value] of Object.entries(colors)) {
        result[`${prefix}-${key}`] = { [property]: value }
    }
    return result
}

// ============================================================================
// Static utilities (no values, just the class name)
// ============================================================================

export const staticUtilities = {
    // Display (USS uses display for visibility control)
    "hidden": { "display": "none" },
    "block": { "display": "flex" }, // USS doesn't have block, use flex
    "flex": { "display": "flex" },

    // Flex direction
    "flex-row": { "flex-direction": "row" },
    "flex-row-reverse": { "flex-direction": "row-reverse" },
    "flex-col": { "flex-direction": "column" },
    "flex-col-reverse": { "flex-direction": "column-reverse" },

    // Flex wrap
    "flex-wrap": { "flex-wrap": "wrap" },
    "flex-wrap-reverse": { "flex-wrap": "wrap-reverse" },
    "flex-nowrap": { "flex-wrap": "nowrap" },

    // Flex grow/shrink
    "flex-1": { "flex-grow": "1", "flex-shrink": "1" },
    "flex-auto": { "flex-grow": "1", "flex-shrink": "1" },
    "flex-initial": { "flex-grow": "0", "flex-shrink": "1" },
    "flex-none": { "flex-grow": "0", "flex-shrink": "0" },
    "grow": { "flex-grow": "1" },
    "grow-0": { "flex-grow": "0" },
    "shrink": { "flex-shrink": "1" },
    "shrink-0": { "flex-shrink": "0" },

    // Justify content
    "justify-start": { "justify-content": "flex-start" },
    "justify-end": { "justify-content": "flex-end" },
    "justify-center": { "justify-content": "center" },
    "justify-between": { "justify-content": "space-between" },
    "justify-around": { "justify-content": "space-around" },
    "justify-evenly": { "justify-content": "space-evenly" },

    // Align items
    "items-start": { "align-items": "flex-start" },
    "items-end": { "align-items": "flex-end" },
    "items-center": { "align-items": "center" },
    "items-baseline": { "align-items": "baseline" },
    "items-stretch": { "align-items": "stretch" },

    // Align self
    "self-auto": { "align-self": "auto" },
    "self-start": { "align-self": "flex-start" },
    "self-end": { "align-self": "flex-end" },
    "self-center": { "align-self": "center" },
    "self-stretch": { "align-self": "stretch" },

    // Align content
    "content-start": { "align-content": "flex-start" },
    "content-end": { "align-content": "flex-end" },
    "content-center": { "align-content": "center" },
    "content-between": { "align-content": "space-between" },
    "content-around": { "align-content": "space-around" },
    "content-stretch": { "align-content": "stretch" },

    // Position
    "static": { "position": "relative" }, // USS doesn't have static
    "relative": { "position": "relative" },
    "absolute": { "position": "absolute" },

    // Overflow
    "overflow-auto": { "overflow": "scroll" }, // USS uses scroll for auto
    "overflow-hidden": { "overflow": "hidden" },
    "overflow-visible": { "overflow": "visible" },
    "overflow-scroll": { "overflow": "scroll" },

    // Text alignment
    "text-left": { "-unity-text-align": "middle-left" },
    "text-center": { "-unity-text-align": "middle-center" },
    "text-right": { "-unity-text-align": "middle-right" },
    "text-justify": { "-unity-text-align": "middle-left" }, // USS doesn't support justify

    // Vertical text alignment (uses USS naming: upper/middle/lower)
    "align-top": { "-unity-text-align": "upper-center" },
    "align-middle": { "-unity-text-align": "middle-center" },
    "align-bottom": { "-unity-text-align": "lower-center" },
    // Spec aliases
    "align-upper": { "-unity-text-align": "upper-center" },
    "align-lower": { "-unity-text-align": "lower-center" },

    // Font style
    "italic": { "-unity-font-style": "italic" },
    "not-italic": { "-unity-font-style": "normal" },
    "font-normal": { "-unity-font-style": "normal" },
    "font-bold": { "-unity-font-style": "bold" },
    "font-italic": { "-unity-font-style": "italic" },
    "font-bold-italic": { "-unity-font-style": "bold-and-italic" },

    // Text transform (Note: USS may not support all text-transform values)
    "uppercase": { "text-transform": "uppercase" }, // Note: USS may not support this
    "lowercase": { "text-transform": "lowercase" },
    "capitalize": { "text-transform": "capitalize" },
    "normal-case": { "text-transform": "none" },

    // White space
    "whitespace-normal": { "white-space": "normal" },
    "whitespace-nowrap": { "white-space": "nowrap" },

    // Width/Height auto
    "w-auto": { "width": "auto" },
    "h-auto": { "height": "auto" },
    "w-full": { "width": "100%" },
    "h-full": { "height": "100%" },
    "w-screen": { "width": "100%" },
    "h-screen": { "height": "100%" },
    "min-w-0": { "min-width": "0" },
    "min-h-0": { "min-height": "0" },
    "min-w-full": { "min-width": "100%" },
    "min-h-full": { "min-height": "100%" },
    "max-w-none": { "max-width": "none" },
    "max-h-none": { "max-height": "none" },
    "max-w-full": { "max-width": "100%" },
    "max-h-full": { "max-height": "100%" },

    // Inset
    "inset-0": { "top": "0", "right": "0", "bottom": "0", "left": "0" },
    "inset-auto": { "top": "auto", "right": "auto", "bottom": "auto", "left": "auto" },
    "inset-x-0": { "left": "0", "right": "0" },
    "inset-y-0": { "top": "0", "bottom": "0" },
    "top-0": { "top": "0" },
    "right-0": { "right": "0" },
    "bottom-0": { "bottom": "0" },
    "left-0": { "left": "0" },
    "top-auto": { "top": "auto" },
    "right-auto": { "right": "auto" },
    "bottom-auto": { "bottom": "auto" },
    "left-auto": { "left": "auto" },

    // Visibility
    "visible": { "visibility": "visible" },
    "invisible": { "visibility": "hidden" },

    // Border styles
    "border-solid": { "border-style": "solid" }, // Note: USS may not use this
    "border-none": { "border-width": "0" },

    // Background
    "bg-transparent": { "background-color": "transparent" },
    "bg-current": { "background-color": "currentColor" },

    // Text colors
    "text-transparent": { "color": "transparent" },
    "text-current": { "color": "currentColor" },

    // Border colors
    "border-transparent": { "border-color": "transparent" },
    "border-current": { "border-color": "currentColor" },
}

// ============================================================================
// Dynamic utilities (generated from config values)
// ============================================================================

// Padding utilities
export const paddingUtilities = {
    ...spacingUtilities("p", ["padding-top", "padding-right", "padding-bottom", "padding-left"]),
    ...spacingUtilities("px", ["padding-left", "padding-right"]),
    ...spacingUtilities("py", ["padding-top", "padding-bottom"]),
    ...spacingUtilities("pt", ["padding-top"]),
    ...spacingUtilities("pr", ["padding-right"]),
    ...spacingUtilities("pb", ["padding-bottom"]),
    ...spacingUtilities("pl", ["padding-left"]),
}

// Margin utilities
export const marginUtilities = {
    ...spacingUtilities("m", ["margin-top", "margin-right", "margin-bottom", "margin-left"]),
    ...spacingUtilities("mx", ["margin-left", "margin-right"]),
    ...spacingUtilities("my", ["margin-top", "margin-bottom"]),
    ...spacingUtilities("mt", ["margin-top"]),
    ...spacingUtilities("mr", ["margin-right"]),
    ...spacingUtilities("mb", ["margin-bottom"]),
    ...spacingUtilities("ml", ["margin-left"]),
    // Negative margins
    ...negativeSpacingUtilities("m", ["margin-top", "margin-right", "margin-bottom", "margin-left"]),
    ...negativeSpacingUtilities("mx", ["margin-left", "margin-right"]),
    ...negativeSpacingUtilities("my", ["margin-top", "margin-bottom"]),
    ...negativeSpacingUtilities("mt", ["margin-top"]),
    ...negativeSpacingUtilities("mr", ["margin-right"]),
    ...negativeSpacingUtilities("mb", ["margin-bottom"]),
    ...negativeSpacingUtilities("ml", ["margin-left"]),
    // Auto margins
    "m-auto": { "margin-top": "auto", "margin-right": "auto", "margin-bottom": "auto", "margin-left": "auto" },
    "mx-auto": { "margin-left": "auto", "margin-right": "auto" },
    "my-auto": { "margin-top": "auto", "margin-bottom": "auto" },
    "mt-auto": { "margin-top": "auto" },
    "mr-auto": { "margin-right": "auto" },
    "mb-auto": { "margin-bottom": "auto" },
    "ml-auto": { "margin-left": "auto" },
}

// Gap utilities - NOTE: USS does NOT support the gap property!
// These are kept for API compatibility but will have no effect.
// Use margin/padding on child elements instead.
export const gapUtilities = {
    // Intentionally empty - gap is not supported in USS
    // Users should use margins on children as a workaround
}

// Width utilities
export const widthUtilities = {
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`w-${key}`, { "width": value }])
    ),
    ...Object.fromEntries(
        Object.entries(percentages).map(([key, value]) => [`w-${key}`, { "width": value }])
    ),
}

// Height utilities
export const heightUtilities = {
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`h-${key}`, { "height": value }])
    ),
    ...Object.fromEntries(
        Object.entries(percentages).map(([key, value]) => [`h-${key}`, { "height": value }])
    ),
}

// Min/Max width utilities
export const minMaxWidthUtilities = {
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`min-w-${key}`, { "min-width": value }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`max-w-${key}`, { "max-width": value }])
    ),
}

// Min/Max height utilities
export const minMaxHeightUtilities = {
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`min-h-${key}`, { "min-height": value }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`max-h-${key}`, { "max-height": value }])
    ),
}

// Background color utilities
export const backgroundColorUtilities = colorUtilities("bg", "background-color")

// Text color utilities
export const textColorUtilities = colorUtilities("text", "color")

// Border color utilities
export const borderColorUtilities = colorUtilities("border", "border-color")

// Font size utilities
export const fontSizeUtilities = Object.fromEntries(
    Object.entries(fontSize).map(([key, value]) => [`text-${key}`, { "font-size": value }])
)

// Font weight utilities
export const fontWeightUtilities = Object.fromEntries(
    Object.entries(fontWeight).map(([key, value]) => [`font-${key}`, { "-unity-font-style": value === "700" ? "bold" : "normal" }])
)
// Also add direct font-weight for USS
Object.entries(fontWeight).forEach(([key, value]) => {
    fontWeightUtilities[`font-${key}`] = { "font-weight": value }
})

// Border radius utilities
export const borderRadiusUtilities = {
    ...Object.fromEntries(
        Object.entries(borderRadius).map(([key, value]) => {
            const className = key === "" ? "rounded" : `rounded-${key}`
            return [className, { "border-radius": value }]
        })
    ),
    // Individual corners
    ...Object.fromEntries(
        Object.entries(borderRadius).map(([key, value]) => {
            const suffix = key === "" ? "" : `-${key}`
            return [`rounded-t${suffix}`, { "border-top-left-radius": value, "border-top-right-radius": value }]
        })
    ),
    ...Object.fromEntries(
        Object.entries(borderRadius).map(([key, value]) => {
            const suffix = key === "" ? "" : `-${key}`
            return [`rounded-r${suffix}`, { "border-top-right-radius": value, "border-bottom-right-radius": value }]
        })
    ),
    ...Object.fromEntries(
        Object.entries(borderRadius).map(([key, value]) => {
            const suffix = key === "" ? "" : `-${key}`
            return [`rounded-b${suffix}`, { "border-bottom-left-radius": value, "border-bottom-right-radius": value }]
        })
    ),
    ...Object.fromEntries(
        Object.entries(borderRadius).map(([key, value]) => {
            const suffix = key === "" ? "" : `-${key}`
            return [`rounded-l${suffix}`, { "border-top-left-radius": value, "border-bottom-left-radius": value }]
        })
    ),
}

// Border width utilities
export const borderWidthUtilities = {
    ...Object.fromEntries(
        Object.entries(borderWidth).map(([key, value]) => {
            const className = key === "" ? "border" : `border-${key}`
            return [className, { "border-width": value }]
        })
    ),
    // Individual sides
    ...Object.fromEntries(
        Object.entries(borderWidth).map(([key, value]) => {
            const suffix = key === "" ? "" : `-${key}`
            return [`border-t${suffix}`, { "border-top-width": value }]
        })
    ),
    ...Object.fromEntries(
        Object.entries(borderWidth).map(([key, value]) => {
            const suffix = key === "" ? "" : `-${key}`
            return [`border-r${suffix}`, { "border-right-width": value }]
        })
    ),
    ...Object.fromEntries(
        Object.entries(borderWidth).map(([key, value]) => {
            const suffix = key === "" ? "" : `-${key}`
            return [`border-b${suffix}`, { "border-bottom-width": value }]
        })
    ),
    ...Object.fromEntries(
        Object.entries(borderWidth).map(([key, value]) => {
            const suffix = key === "" ? "" : `-${key}`
            return [`border-l${suffix}`, { "border-left-width": value }]
        })
    ),
}

// Opacity utilities
export const opacityUtilities = Object.fromEntries(
    Object.entries(opacity).map(([key, value]) => [`opacity-${key}`, { "opacity": value }])
)

// Z-index utilities
export const zIndexUtilities = Object.fromEntries(
    Object.entries(zIndex).map(([key, value]) => [`z-${key}`, { "z-index": value }])
)

// Position utilities (top, right, bottom, left with spacing values)
export const positionUtilities = {
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`top-${key}`, { "top": value }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`right-${key}`, { "right": value }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`bottom-${key}`, { "bottom": value }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`left-${key}`, { "left": value }])
    ),
    // Negative positions
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0" && k !== "px").map(([key, value]) => [`-top-${key}`, { "top": `-${value}` }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0" && k !== "px").map(([key, value]) => [`-right-${key}`, { "right": `-${value}` }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0" && k !== "px").map(([key, value]) => [`-bottom-${key}`, { "bottom": `-${value}` }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0" && k !== "px").map(([key, value]) => [`-left-${key}`, { "left": `-${value}` }])
    ),
}

// Flex basis utilities
export const flexBasisUtilities = {
    "basis-auto": { "flex-basis": "auto" },
    "basis-0": { "flex-basis": "0" },
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0").map(([key, value]) => [`basis-${key}`, { "flex-basis": value }])
    ),
    ...Object.fromEntries(
        Object.entries(percentages).map(([key, value]) => [`basis-${key}`, { "flex-basis": value }])
    ),
}

// Inset utilities (all sides, x-axis, y-axis)
export const insetUtilities = {
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0").map(([key, value]) => [
            `inset-${key}`, { "top": value, "right": value, "bottom": value, "left": value }
        ])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0").map(([key, value]) => [
            `inset-x-${key}`, { "left": value, "right": value }
        ])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0").map(([key, value]) => [
            `inset-y-${key}`, { "top": value, "bottom": value }
        ])
    ),
}

// Border side color utilities
export const borderSideColorUtilities = {
    ...Object.fromEntries(
        Object.entries(colors).map(([key, value]) => [`border-t-${key}`, { "border-top-color": value }])
    ),
    ...Object.fromEntries(
        Object.entries(colors).map(([key, value]) => [`border-r-${key}`, { "border-right-color": value }])
    ),
    ...Object.fromEntries(
        Object.entries(colors).map(([key, value]) => [`border-b-${key}`, { "border-bottom-color": value }])
    ),
    ...Object.fromEntries(
        Object.entries(colors).map(([key, value]) => [`border-l-${key}`, { "border-left-color": value }])
    ),
}

// Transform utilities
export const transformUtilities = {
    // Rotate
    ...Object.fromEntries(
        Object.entries(rotate).map(([key, value]) => [`rotate-${key}`, { "rotate": value }])
    ),
    // Negative rotate
    ...Object.fromEntries(
        Object.entries(rotate).filter(([k]) => k !== "0").map(([key, value]) => [`-rotate-${key}`, { "rotate": `-${value.replace("deg", "")}deg` }])
    ),
    // Scale (uniform)
    ...Object.fromEntries(
        Object.entries(scale).map(([key, value]) => [`scale-${key}`, { "scale": `${value} ${value}` }])
    ),
    // Scale X
    ...Object.fromEntries(
        Object.entries(scale).map(([key, value]) => [`scale-x-${key}`, { "scale": `${value} 1` }])
    ),
    // Scale Y
    ...Object.fromEntries(
        Object.entries(scale).map(([key, value]) => [`scale-y-${key}`, { "scale": `1 ${value}` }])
    ),
    // Translate X (using spacing values)
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`translate-x-${key}`, { "translate": `${value} 0` }])
    ),
    // Translate Y (using spacing values)
    ...Object.fromEntries(
        Object.entries(spacing).map(([key, value]) => [`translate-y-${key}`, { "translate": `0 ${value}` }])
    ),
    // Negative translate
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0" && k !== "px").map(([key, value]) => [`-translate-x-${key}`, { "translate": `-${value} 0` }])
    ),
    ...Object.fromEntries(
        Object.entries(spacing).filter(([k]) => k !== "0" && k !== "px").map(([key, value]) => [`-translate-y-${key}`, { "translate": `0 -${value}` }])
    ),
    // Transform origin
    "origin-center": { "transform-origin": "center" },
    "origin-top": { "transform-origin": "top" },
    "origin-top-right": { "transform-origin": "top right" },
    "origin-right": { "transform-origin": "right" },
    "origin-bottom-right": { "transform-origin": "bottom right" },
    "origin-bottom": { "transform-origin": "bottom" },
    "origin-bottom-left": { "transform-origin": "bottom left" },
    "origin-left": { "transform-origin": "left" },
    "origin-top-left": { "transform-origin": "top left" },
}

// Transition utilities
export const transitionUtilities = {
    // Base transitions
    "transition": { "transition-property": "all", "transition-duration": "150ms", "transition-timing-function": "ease" },
    "transition-none": { "transition-property": "none" },
    "transition-all": { "transition-property": "all", "transition-duration": "150ms", "transition-timing-function": "ease" },
    "transition-colors": { "transition-property": "background-color, border-color, color", "transition-duration": "150ms", "transition-timing-function": "ease" },
    "transition-opacity": { "transition-property": "opacity", "transition-duration": "150ms", "transition-timing-function": "ease" },
    "transition-transform": { "transition-property": "rotate, scale, translate", "transition-duration": "150ms", "transition-timing-function": "ease" },
    // Duration
    ...Object.fromEntries(
        Object.entries(transitionDuration).map(([key, value]) => [`duration-${key}`, { "transition-duration": value }])
    ),
    // Timing functions
    "ease-linear": { "transition-timing-function": "linear" },
    "ease-in": { "transition-timing-function": "ease-in" },
    "ease-out": { "transition-timing-function": "ease-out" },
    "ease-in-out": { "transition-timing-function": "ease-in-out" },
    // Delay
    ...Object.fromEntries(
        Object.entries(transitionDuration).map(([key, value]) => [`delay-${key}`, { "transition-delay": value }])
    ),
}

// Aspect ratio utilities (Note: USS aspect-ratio support may be limited)
export const aspectRatioUtilities = {
    "aspect-auto": { "aspect-ratio": "auto" },
    "aspect-square": { "aspect-ratio": "1 / 1" },
    "aspect-video": { "aspect-ratio": "16 / 9" },
}

// Letter spacing (tracking)
export const letterSpacingUtilities = Object.fromEntries(
    Object.entries(letterSpacing).map(([key, value]) => [`tracking-${key}`, { "letter-spacing": value }])
)

// ============================================================================
// Combine all utilities
// ============================================================================

export const allUtilities = {
    ...staticUtilities,
    ...paddingUtilities,
    ...marginUtilities,
    ...gapUtilities,
    ...widthUtilities,
    ...heightUtilities,
    ...minMaxWidthUtilities,
    ...minMaxHeightUtilities,
    ...backgroundColorUtilities,
    ...textColorUtilities,
    ...borderColorUtilities,
    ...fontSizeUtilities,
    ...fontWeightUtilities,
    ...borderRadiusUtilities,
    ...borderWidthUtilities,
    ...opacityUtilities,
    ...zIndexUtilities,
    ...positionUtilities,
    ...flexBasisUtilities,
    ...insetUtilities,
    ...borderSideColorUtilities,
    ...transformUtilities,
    ...transitionUtilities,
    ...aspectRatioUtilities,
    ...letterSpacingUtilities,
}

export default allUtilities
