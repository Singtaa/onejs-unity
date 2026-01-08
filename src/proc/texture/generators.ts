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
