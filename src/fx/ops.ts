/**
 * The FxBridge wire contract.
 *
 * Shared with Assets/Singtaa/OneJS/Runtime/Fx/FxBridge.cs and kept in sync by
 * fx.test.ts on this side and FxTests.cs on the other. Change both together.
 *
 * A chain is encoded as a flat Float32Array:
 *
 *     [WIRE_VERSION, opCount, (opcode, argCount, ...args) * opCount]
 *
 * Everything that is not a number, which today means a texture, crosses
 * separately as an integer handle and is referenced from the buffer by that
 * handle. That keeps the chain itself a pure float buffer, so it marshals
 * through the same __csArray float path PainterBridge uses and costs one
 * crossing per render rather than one per operation.
 */

/** Bumped when the encoding changes. C# accepts 1..CURRENT and refuses newer. */
export const WIRE_VERSION = 1

/**
 * Per pixel operations, evaluated by a bounded loop in OneJS/FxOps.shader.
 *
 * The numbering deliberately matches Spark2D's `maop` kernel, which grouped ops
 * so a reader can tell the family from the value. There are gaps; leave them.
 */
export const OP = {
    // Sources: begin a chain. Exactly one, and it must come first.
    SOURCE_TEXTURE: 0, // args: handle
    SOURCE_COLOR: 1,   // args: width, height, r, g, b, a
    SOURCE_NOISE: 2,    // args: w, h, scaleX, scaleY, octaves, seed, offsetX, offsetY, rotation, [lacunarity, gain, kind]
    SOURCE_GRADIENT: 3, // args: w, h, angle, stopCount, then (r, g, b, a, pos) per stop
    SOURCE_SDF: 4,      // args: w, h, shapeId, f1..f6, x, y, rot, scaleX, rounded, onion, softness, field, [scaleY]

    // Basic maths
    ADD: 16,
    SUBTRACT: 17,
    MULTIPLY: 18,
    DIVIDE: 19,
    POW: 20,
    SQRT: 21,

    // Range
    CLAMP: 32,      // args: min, max
    FRACTION: 33,
    MAXIMUM: 34,
    MINIMUM: 35,
    ONE_MINUS: 36,
    REMAP: 37,      // args: fromMin, fromMax, toMin, toMax
    SATURATE: 38,

    // Advanced
    ABSOLUTE: 48,
    EXPONENTIAL: 49,
    LOG: 50,
    MODULO: 51,
    NEGATE: 52,
    POSTERIZE: 53,
    RECIPROCAL: 54,

    // Interpolation
    LERP: 64,        // operand, then t
    SMOOTHSTEP: 65,  // args: edge0, edge1
    INVERSE_LERP: 66,

    // Colour. These leave alpha alone: an adjustment that silently
    // changed opacity would surprise everywhere it is used.
    GRAYSCALE: 80,
    BRIGHTNESS: 81,
    CONTRAST: 82,
    SATURATION: 83,
    HUE_SHIFT: 84,
    LEVELS: 85,   // inBlack, inWhite, gamma
    SWIZZLE: 86,  // per channel source index, 0..3, or 4 to keep
    RAMP: 87,     // stopCount, then (r, g, b, a, pos) per stop

    // Composite. The last two args are always the blend mode and the
    // opacity; everything before them is the operand.
    BLEND: 96,

    // Spatial. These change uv BEFORE the sample, so unlike every op
    // above they cannot fuse and always take a pass of their own.
    TRANSFORM: 112, // offX, offY, rotation, scale, pivotX, pivotY, wrap, bg rgba
    TILE: 113,      // repeatX, repeatY, offsetX, offsetY
    FLIP: 114,      // horizontal, vertical
    CROP: 115,      // x, y, w, h in uv

    // Neighbourhood filters. These read MANY pixels, so they need the
    // texel size and cannot fuse either. One of them can be several
    // passes: the separable ones run horizontal then vertical.
    BLUR: 128,    // radius in pixels
    SHARPEN: 129, // amount
    EDGE: 130,    // amount
    DILATE: 131,  // radius in pixels
    ERODE: 132,   // radius in pixels
    OUTLINE: 133, // width, rgba, then 1 to key on luminance instead of alpha
} as const

export type OpCode = (typeof OP)[keyof typeof OP]

/**
 * How a two operand op reads its right hand side. The shader switches on this
 * because the three cases sample from different places.
 */
export const MODE = {
    /** The operand is one float, broadcast to every channel. */
    SCALAR: 0,
    /** The operand is a float4. */
    VECTOR: 1,
    /**
     * The operand is another texture. Only ONE of these fits in a pass, because
     * the shader has a single spare sampler, so the C# side flushes and starts a
     * new pass when it meets a second one.
     */
    TEXTURE: 2,
} as const

export type Mode = (typeof MODE)[keyof typeof MODE]

/** Must match MAX_OPS in OneJS/FxOps.shader. The fusion window. */
export const MAX_FUSED_OPS = 16

/** Ops at or above this value are per pixel and therefore fusable. */
export const FIRST_PIXEL_OP = 16

export function isPixelOp(op: number): boolean {
    return op >= FIRST_PIXEL_OP
}

/**
 * Sources that generate rather than read. They run through OneJS/FxSources,
 * which is a separate shader from the fused op pass because it takes no input
 * texture: folding both into one would make every fused pass carry generator
 * code it never runs.
 */
export const SOURCE = {
    NOISE: OP.SOURCE_NOISE,
    GRADIENT: OP.SOURCE_GRADIENT,
    SDF: OP.SOURCE_SDF,
} as const

/** Must match MAX_STOPS in OneJS/FxSources.shader and MaxGradientStops in FxBridge.cs. */
export const MAX_GRADIENT_STOPS = 8

/**
 * The Photoshop blend modes, in the order onejsBlend switches on them in
 * OneJS/FxColor.cginc.
 *
 * Order is the PDF blend spec's grouping (darken, lighten, contrast, inversion,
 * component) rather than alphabetical, so a reader can see the families.
 */
export const BLEND = {
    normal: 0, dissolve: 1,
    darken: 2, multiply: 3, colorBurn: 4, linearBurn: 5, darkerColor: 6,
    lighten: 7, screen: 8, colorDodge: 9, linearDodge: 10, lighterColor: 11,
    overlay: 12, hardLight: 13, softLight: 14, vividLight: 15, linearLight: 16,
    pinLight: 17, hardMix: 18,
    difference: 19, exclusion: 20, subtract: 21, divide: 22,
    hue: 23, saturation: 24, color: 25, luminosity: 26,
} as const

export type BlendMode = keyof typeof BLEND

/** Ops at or above this change uv before sampling, so they never fuse. */
export const FIRST_SPATIAL_OP = 112

/** Ops at or above this sample their neighbours, so they never fuse either. */
export const FIRST_FILTER_OP = 128

export function isSpatialOp(op: number): boolean {
    // A range, not just a floor: the filter ops sit above the spatial ones, so
    // a bare `op >= FIRST_SPATIAL_OP` calls every filter spatial too. FxBridge
    // avoids this by testing the filter range first; a predicate has no order
    // to lean on and has to say what it means.
    return op >= FIRST_SPATIAL_OP && op < FIRST_FILTER_OP
}

export function isFilterOp(op: number): boolean {
    return op >= FIRST_FILTER_OP
}

/**
 * Taps per side in OneJS/FxFilter. A blur wider than this is split into
 * repeated passes by the runtime rather than sampling more sparsely, so the
 * cap is not a ceiling on blur radius, only on the cost of one pass.
 */
export const MAX_FILTER_TAPS = 32
