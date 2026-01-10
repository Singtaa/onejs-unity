/**
 * CPU-based procedural texture generators.
 *
 * Provides pure JavaScript texture pattern generation that works
 * on all platforms including WebGL.
 *
 * @module onejs-unity/proc/texture
 */

import { perlin2D, simplex2D, worley2D } from "../noise"
import type { TextureOptions, NoiseConfig, FBMConfig } from "../types"

// =============================================================================
// Types
// =============================================================================

/**
 * RGBA color tuple.
 */
export type RGBA = [number, number, number, number]

/**
 * Color mapping function.
 */
export type ColorMap = (value: number) => RGBA

/**
 * Base options for texture generation.
 */
export interface TextureGeneratorOptions extends TextureOptions {
    /** Random seed */
    seed?: number
}

/**
 * Noise texture options.
 */
export interface NoiseTextureOptions extends TextureGeneratorOptions {
    /** Noise type */
    type?: "perlin" | "simplex" | "value" | "worley"
    /** Frequency/scale */
    frequency?: number
    /** FBM configuration */
    fbm?: FBMConfig
}

/**
 * Voronoi texture options.
 */
export interface VoronoiTextureOptions extends TextureGeneratorOptions {
    /** Cell frequency */
    frequency?: number
    /** Return type */
    returnType?: "f1" | "f2" | "f2-f1"
    /** Distance function */
    distance?: "euclidean" | "manhattan" | "chebyshev"
}

/**
 * Marble texture options.
 */
export interface MarbleTextureOptions extends TextureGeneratorOptions {
    /** Base frequency */
    frequency?: number
    /** Turbulence amount */
    turbulence?: number
    /** Vein sharpness */
    sharpness?: number
    /** FBM octaves */
    octaves?: number
}

/**
 * Wood texture options.
 */
export interface WoodTextureOptions extends TextureGeneratorOptions {
    /** Ring frequency */
    frequency?: number
    /** Turbulence amount */
    turbulence?: number
    /** Ring count */
    rings?: number
    /** FBM octaves */
    octaves?: number
}

/**
 * Checkerboard texture options.
 */
export interface CheckerboardTextureOptions extends TextureGeneratorOptions {
    /** Number of cells horizontally */
    cellsX?: number
    /** Number of cells vertically */
    cellsY?: number
    /** First color */
    color1?: RGBA
    /** Second color */
    color2?: RGBA
}

/**
 * Gradient texture options.
 */
export interface GradientTextureOptions extends TextureGeneratorOptions {
    /** Gradient direction */
    direction?: "horizontal" | "vertical" | "diagonal" | "radial"
    /** Start color */
    startColor?: RGBA
    /** End color */
    endColor?: RGBA
}

// =============================================================================
// Color Maps
// =============================================================================

/**
 * Built-in color maps.
 */
export const colorMaps = {
    /** Grayscale (default) */
    grayscale: (value: number): RGBA => {
        const v = Math.max(0, Math.min(1, value))
        return [v, v, v, 1]
    },

    /** Heat map (blue -> red) */
    heat: (value: number): RGBA => {
        const v = Math.max(0, Math.min(1, value))
        if (v < 0.25) {
            return [0, v * 4, 1, 1]
        } else if (v < 0.5) {
            return [0, 1, 1 - (v - 0.25) * 4, 1]
        } else if (v < 0.75) {
            return [(v - 0.5) * 4, 1, 0, 1]
        } else {
            return [1, 1 - (v - 0.75) * 4, 0, 1]
        }
    },

    /** Terrain (water -> grass -> mountain -> snow) */
    terrain: (value: number): RGBA => {
        const v = Math.max(0, Math.min(1, value))
        if (v < 0.3) {
            return [0.2, 0.3, 0.8, 1] // Water
        } else if (v < 0.4) {
            return [0.76, 0.7, 0.5, 1] // Sand
        } else if (v < 0.7) {
            return [0.2, 0.6, 0.2, 1] // Grass
        } else if (v < 0.85) {
            return [0.5, 0.4, 0.3, 1] // Mountain
        } else {
            return [1, 1, 1, 1] // Snow
        }
    },

    /** Marble (white with dark veins) */
    marble: (value: number): RGBA => {
        const v = Math.max(0, Math.min(1, value))
        const base = 0.9 + v * 0.1
        const vein = Math.pow(v, 3)
        return [base - vein * 0.3, base - vein * 0.3, base - vein * 0.2, 1]
    },

    /** Wood (brown rings) */
    wood: (value: number): RGBA => {
        const v = Math.max(0, Math.min(1, value))
        const ring = Math.abs(Math.sin(v * Math.PI * 20))
        return [
            0.4 + ring * 0.2,
            0.25 + ring * 0.1,
            0.1 + ring * 0.05,
            1
        ]
    }
}

// =============================================================================
// Generator Functions
// =============================================================================

/**
 * Generate a noise texture.
 *
 * @param options - Noise texture options
 * @returns RGBA pixel data as Uint8ClampedArray
 *
 * @example
 * ```typescript
 * const data = generateNoise({
 *     width: 256,
 *     height: 256,
 *     type: "simplex",
 *     frequency: 4,
 *     fbm: { octaves: 5 },
 *     colorMap: colorMaps.terrain
 * })
 * ```
 */
export function generateNoise(options: NoiseTextureOptions): Uint8ClampedArray {
    const {
        width,
        height,
        seed = 0,
        type = "perlin",
        frequency = 1,
        fbm,
        colorMap = colorMaps.grayscale
    } = options

    const data = new Uint8ClampedArray(width * height * 4)

    // Create noise source
    let source = type === "simplex"
        ? simplex2D({ seed, frequency })
        : type === "worley"
            ? worley2D({ seed, frequency })
            : perlin2D({ seed, frequency })

    if (fbm) {
        source = source.fbm(fbm)
    }

    // Generate pixels
    let idx = 0
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x / width
            const ny = y / height
            let value = source.sample(nx, ny)

            // Normalize to [0, 1]
            value = value * 0.5 + 0.5

            const [r, g, b, a] = colorMap(value)
            data[idx++] = r * 255
            data[idx++] = g * 255
            data[idx++] = b * 255
            data[idx++] = a * 255
        }
    }

    return data
}

/**
 * Generate a voronoi/cellular texture.
 *
 * @param options - Voronoi texture options
 * @returns RGBA pixel data
 */
export function generateVoronoi(options: VoronoiTextureOptions): Uint8ClampedArray {
    const {
        width,
        height,
        seed = 0,
        frequency = 8,
        returnType = "f1",
        distance = "euclidean",
        colorMap = colorMaps.grayscale
    } = options

    const data = new Uint8ClampedArray(width * height * 4)
    const source = worley2D({ seed, frequency, returnType, distance })

    let idx = 0
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x / width
            const ny = y / height
            const value = source.sample(nx, ny)

            const [r, g, b, a] = colorMap(value)
            data[idx++] = r * 255
            data[idx++] = g * 255
            data[idx++] = b * 255
            data[idx++] = a * 255
        }
    }

    return data
}

/**
 * Generate a marble texture.
 *
 * @param options - Marble texture options
 * @returns RGBA pixel data
 */
export function generateMarble(options: MarbleTextureOptions): Uint8ClampedArray {
    const {
        width,
        height,
        seed = 0,
        frequency = 5,
        turbulence = 5,
        sharpness = 2,
        octaves = 4,
        colorMap = colorMaps.marble
    } = options

    const data = new Uint8ClampedArray(width * height * 4)
    const noise = perlin2D({ seed }).fbm({ octaves, persistence: 0.5 })

    let idx = 0
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x / width
            const ny = y / height

            // Base sine pattern with noise turbulence
            const n = noise.sample(nx * frequency, ny * frequency)
            const pattern = Math.sin(nx * frequency + n * turbulence)

            // Sharpen the veins
            const value = Math.pow(Math.abs(pattern), 1 / sharpness) * 0.5 + 0.5

            const [r, g, b, a] = colorMap(value)
            data[idx++] = r * 255
            data[idx++] = g * 255
            data[idx++] = b * 255
            data[idx++] = a * 255
        }
    }

    return data
}

/**
 * Generate a wood grain texture.
 *
 * @param options - Wood texture options
 * @returns RGBA pixel data
 */
export function generateWood(options: WoodTextureOptions): Uint8ClampedArray {
    const {
        width,
        height,
        seed = 0,
        frequency = 1,
        turbulence = 0.1,
        rings = 12,
        octaves = 3,
        colorMap = colorMaps.wood
    } = options

    const data = new Uint8ClampedArray(width * height * 4)
    const noise = perlin2D({ seed }).fbm({ octaves, persistence: 0.5 })

    let idx = 0
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = (x / width - 0.5) * 2
            const ny = (y / height - 0.5) * 2

            // Distance from center with noise distortion
            const n = noise.sample(nx * frequency, ny * frequency)
            const dist = Math.sqrt(nx * nx + ny * ny) + n * turbulence

            // Ring pattern
            const ring = Math.abs(Math.sin(dist * rings * Math.PI))
            const value = ring

            const [r, g, b, a] = colorMap(value)
            data[idx++] = r * 255
            data[idx++] = g * 255
            data[idx++] = b * 255
            data[idx++] = a * 255
        }
    }

    return data
}

/**
 * Generate a checkerboard texture.
 *
 * @param options - Checkerboard texture options
 * @returns RGBA pixel data
 */
export function generateCheckerboard(options: CheckerboardTextureOptions): Uint8ClampedArray {
    const {
        width,
        height,
        cellsX = 8,
        cellsY = 8,
        color1 = [1, 1, 1, 1],
        color2 = [0, 0, 0, 1]
    } = options

    const data = new Uint8ClampedArray(width * height * 4)

    let idx = 0
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cx = Math.floor((x / width) * cellsX)
            const cy = Math.floor((y / height) * cellsY)
            const isEven = (cx + cy) % 2 === 0
            const color = isEven ? color1 : color2

            data[idx++] = color[0] * 255
            data[idx++] = color[1] * 255
            data[idx++] = color[2] * 255
            data[idx++] = color[3] * 255
        }
    }

    return data
}

/**
 * Generate a gradient texture.
 *
 * @param options - Gradient texture options
 * @returns RGBA pixel data
 */
export function generateGradient(options: GradientTextureOptions): Uint8ClampedArray {
    const {
        width,
        height,
        direction = "horizontal",
        startColor = [0, 0, 0, 1],
        endColor = [1, 1, 1, 1]
    } = options

    const data = new Uint8ClampedArray(width * height * 4)

    let idx = 0
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const nx = x / (width - 1)
            const ny = y / (height - 1)

            let t: number
            switch (direction) {
                case "horizontal":
                    t = nx
                    break
                case "vertical":
                    t = ny
                    break
                case "diagonal":
                    t = (nx + ny) / 2
                    break
                case "radial":
                    const dx = nx - 0.5
                    const dy = ny - 0.5
                    t = Math.min(1, Math.sqrt(dx * dx + dy * dy) * 2)
                    break
            }

            data[idx++] = (startColor[0] + (endColor[0] - startColor[0]) * t) * 255
            data[idx++] = (startColor[1] + (endColor[1] - startColor[1]) * t) * 255
            data[idx++] = (startColor[2] + (endColor[2] - startColor[2]) * t) * 255
            data[idx++] = (startColor[3] + (endColor[3] - startColor[3]) * t) * 255
        }
    }

    return data
}

/**
 * Create a CPU texture from pixel data.
 *
 * @param data - RGBA pixel data
 * @param width - Texture width
 * @param height - Texture height
 * @returns Texture handle (platform-dependent)
 */
export function createTexture(
    data: Uint8ClampedArray,
    width: number,
    height: number
): unknown {
    // This would call into the C# bridge to create a Texture2D
    // For now, return the data for the caller to handle
    return { data, width, height }
}

// =============================================================================
// ProceduralTexture Class
// =============================================================================

declare const CS: any

/**
 * Filter mode for textures.
 */
export type FilterMode = "point" | "bilinear" | "trilinear"

/**
 * Wrap mode for textures.
 */
export type WrapMode = "repeat" | "clamp"

/**
 * A procedural texture that wraps Unity's Texture2D.
 *
 * Provides a fluent API for texture configuration and lazy Unity texture creation.
 *
 * @example
 * ```typescript
 * const tex = texture.checker({ colors: ["#fff", "#333"] })
 *     .filter("point")
 *     .wrap("repeat")
 *
 * // Use in material
 * meshObject.material({ texture: tex, tiling: 10 })
 * ```
 */
export class ProceduralTexture {
    private _texture: any = null
    private _filterMode: FilterMode = "point"
    private _wrapMode: WrapMode = "repeat"
    private _width: number
    private _height: number
    private _data: Uint8ClampedArray

    constructor(data: Uint8ClampedArray, width: number, height: number) {
        this._data = data
        this._width = width
        this._height = height
    }

    /** Get texture width */
    get width(): number {
        return this._width
    }

    /** Get texture height */
    get height(): number {
        return this._height
    }

    /**
     * Set texture filter mode.
     * @param mode - "point" for pixelated, "bilinear" for smooth, "trilinear" for smooth with mipmaps
     */
    filter(mode: FilterMode): this {
        this._filterMode = mode
        if (this._texture) {
            const filterEnum = mode === "point" ? 0 : mode === "bilinear" ? 1 : 2
            this._texture.filterMode = filterEnum
        }
        return this
    }

    /**
     * Set texture wrap mode.
     * @param mode - "repeat" for tiling, "clamp" for edge clamping
     */
    wrap(mode: WrapMode): this {
        this._wrapMode = mode
        if (this._texture) {
            const wrapEnum = mode === "repeat" ? 0 : 1
            this._texture.wrapMode = wrapEnum
        }
        return this
    }

    /**
     * Get the underlying Unity Texture2D.
     * Creates the texture on first access (lazy initialization).
     */
    getUnityTexture(): any {
        if (!this._texture) {
            this._texture = this._createUnityTexture()
        }
        return this._texture
    }

    private _createUnityTexture(): any {
        // Create Texture2D with RGBA32 format
        const tex = new CS.UnityEngine.Texture2D(
            this._width,
            this._height,
            CS.UnityEngine.TextureFormat.RGBA32,
            false  // No mipmaps for procedural textures
        )

        // Set filter mode
        const filterEnum = this._filterMode === "point" ? 0 : this._filterMode === "bilinear" ? 1 : 2
        tex.filterMode = filterEnum

        // Set wrap mode
        const wrapEnum = this._wrapMode === "repeat" ? 0 : 1
        tex.wrapMode = wrapEnum

        // Convert pixel data to Unity Color array
        const colors: any[] = []
        for (let i = 0; i < this._data.length; i += 4) {
            colors.push({
                r: this._data[i] / 255,
                g: this._data[i + 1] / 255,
                b: this._data[i + 2] / 255,
                a: this._data[i + 3] / 255
            })
        }

        // Set pixels using array marshaling
        ;(tex as any).SetPixels(colors)
        tex.Apply()

        return tex
    }

    /**
     * Dispose Unity resources.
     * Call when the texture is no longer needed.
     */
    dispose(): void {
        if (this._texture) {
            CS.UnityEngine.Object.Destroy(this._texture)
            this._texture = null
        }
    }
}

// =============================================================================
// Convenience Texture Factories
// =============================================================================

/**
 * Parse a color from hex string or RGBA tuple.
 */
function parseColor(color: string | RGBA): RGBA {
    if (Array.isArray(color)) return color

    const hex = color.replace("#", "")
    const r = parseInt(hex.slice(0, 2), 16) / 255
    const g = parseInt(hex.slice(2, 4), 16) / 255
    const b = parseInt(hex.slice(4, 6), 16) / 255
    const a = hex.length > 6 ? parseInt(hex.slice(6, 8), 16) / 255 : 1

    return [r, g, b, a]
}

/**
 * Options for checker texture.
 */
export interface CheckerOptions {
    /** Two colors as hex strings or RGBA tuples */
    colors: [string | RGBA, string | RGBA]
    /** Texture size in pixels (default: 2 for minimal 2x2) */
    size?: number
}

/**
 * Create a checkerboard texture.
 *
 * Creates a minimal 2x2 checker pattern by default, which tiles efficiently.
 *
 * @example
 * ```typescript
 * const tex = checker({ colors: ["#e5e5e5", "#333333"] })
 * meshObject.material({ texture: tex, tiling: 10 })
 * ```
 */
export function checker(options: CheckerOptions): ProceduralTexture {
    const { colors, size = 2 } = options
    const color1 = parseColor(colors[0])
    const color2 = parseColor(colors[1])

    // For a proper checker, each pixel should be its own cell
    // A 2x2 texture with cellsX=2, cellsY=2 gives the classic checker pattern
    const data = generateCheckerboard({
        width: size,
        height: size,
        cellsX: size,
        cellsY: size,
        color1,
        color2
    })

    return new ProceduralTexture(data, size, size)
        .filter("point")
        .wrap("repeat")
}

/**
 * Options for gradient texture.
 */
export interface SimpleGradientOptions {
    /** Two colors as hex strings or RGBA tuples */
    colors: [string | RGBA, string | RGBA]
    /** Gradient direction (default: "horizontal") */
    direction?: "horizontal" | "vertical" | "diagonal" | "radial"
    /** Texture size in pixels (default: 256) */
    size?: number
}

/**
 * Create a gradient texture.
 *
 * @example
 * ```typescript
 * const tex = gradient({
 *     colors: ["#ff0000", "#0000ff"],
 *     direction: "horizontal"
 * })
 * ```
 */
export function gradient(options: SimpleGradientOptions): ProceduralTexture {
    const { colors, direction = "horizontal", size = 256 } = options
    const startColor = parseColor(colors[0])
    const endColor = parseColor(colors[1])

    const data = generateGradient({
        width: size,
        height: size,
        direction,
        startColor,
        endColor
    })

    return new ProceduralTexture(data, size, size)
        .filter("bilinear")
        .wrap("clamp")
}

/**
 * Options for solid color texture.
 */
export interface SolidOptions {
    /** Color as hex string or RGBA tuple */
    color: string | RGBA
    /** Texture size in pixels (default: 1) */
    size?: number
}

/**
 * Create a solid color texture.
 *
 * @example
 * ```typescript
 * const tex = solid({ color: "#ff5500" })
 * ```
 */
export function solid(options: SolidOptions): ProceduralTexture {
    const { color, size = 1 } = options
    const rgba = parseColor(color)

    const data = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < data.length; i += 4) {
        data[i] = rgba[0] * 255
        data[i + 1] = rgba[1] * 255
        data[i + 2] = rgba[2] * 255
        data[i + 3] = rgba[3] * 255
    }

    return new ProceduralTexture(data, size, size)
        .filter("point")
        .wrap("repeat")
}

/**
 * Options for creating texture from raw data.
 */
export interface FromDataOptions {
    /** RGBA pixel data */
    data: Uint8ClampedArray
    /** Texture width */
    width: number
    /** Texture height */
    height: number
}

/**
 * Create a ProceduralTexture from raw pixel data.
 *
 * @example
 * ```typescript
 * const customData = new Uint8ClampedArray(256 * 256 * 4)
 * // ... fill data ...
 * const tex = fromData({ data: customData, width: 256, height: 256 })
 * ```
 */
export function fromData(options: FromDataOptions): ProceduralTexture {
    return new ProceduralTexture(options.data, options.width, options.height)
}
