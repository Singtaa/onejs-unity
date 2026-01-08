/**
 * Procedural noise generation module.
 *
 * Provides pure JavaScript implementations of various noise algorithms
 * that work on all platforms including WebGL.
 *
 * @module onejs-unity/proc/noise
 *
 * @example Basic usage
 * ```typescript
 * import { noise } from "onejs-unity/proc"
 *
 * // Simple 2D Perlin noise
 * const perlin = noise.perlin2D({ seed: 42 })
 * const value = perlin.sample(x, y)  // Returns [-1, 1]
 *
 * // FBM layered noise for terrain
 * const terrain = noise.perlin2D().fbm({ octaves: 6 })
 * const height = terrain.sample(x, y)
 *
 * // Turbulence for fire/smoke effects
 * const fire = noise.simplex3D().turbulence({ octaves: 4 })
 * const distortion = fire.sample(x, y, time)
 * ```
 */

import { perlin2D, perlin3D } from "./perlin"
import { simplex2D, simplex3D } from "./simplex"
import { value2D, value3D } from "./value"
import { worley2D, worley3D } from "./worley"
import { gpuNoise, registerNoiseShader } from "./gpu"
import type {
    NoiseConfig,
    NoiseSource2D,
    NoiseSource3D,
    FBMConfig,
    WorleyConfig,
    GPUNoiseOptions,
    NoiseType
} from "../types"

// Re-export types
export type {
    NoiseConfig,
    NoiseSource2D,
    NoiseSource3D,
    FBMConfig,
    WorleyConfig,
    GPUNoiseOptions,
    NoiseType
}

// Re-export individual noise functions
export { perlin2D, perlin3D } from "./perlin"
export { simplex2D, simplex3D } from "./simplex"
export { value2D, value3D } from "./value"
export { worley2D, worley3D } from "./worley"

// Re-export GPU noise
export { gpuNoise, registerNoiseShader } from "./gpu"

/**
 * Unified noise API.
 *
 * Provides access to all noise algorithms through a single namespace.
 *
 * @example
 * ```typescript
 * import { noise } from "onejs-unity/proc"
 *
 * // Perlin noise
 * const perlin = noise.perlin2D({ seed: 123 })
 *
 * // Simplex noise (faster, fewer artifacts)
 * const simplex = noise.simplex3D({ frequency: 0.1 })
 *
 * // FBM composition
 * const mountains = noise.perlin2D().fbm({
 *     octaves: 6,
 *     lacunarity: 2.0,
 *     persistence: 0.5
 * })
 * ```
 */
export const noise = {
    // =========================================================================
    // Perlin Noise
    // =========================================================================

    /**
     * Create a 2D Perlin noise source.
     *
     * Classic gradient noise by Ken Perlin. Produces smooth, natural-looking
     * noise with values in the range [-1, 1].
     *
     * @param config - Optional seed and frequency configuration
     * @returns A composable 2D noise source
     *
     * @example
     * ```typescript
     * const perlin = noise.perlin2D({ seed: 42, frequency: 0.1 })
     * const value = perlin.sample(x, y)
     *
     * // Layer with FBM for terrain
     * const terrain = perlin.fbm({ octaves: 6 })
     * ```
     */
    perlin2D,

    /**
     * Create a 3D Perlin noise source.
     *
     * @param config - Optional seed and frequency configuration
     * @returns A composable 3D noise source
     *
     * @example
     * ```typescript
     * const perlin = noise.perlin3D({ seed: 42 })
     *
     * // Use z for animation
     * const animated = perlin.sample(x, y, time * 0.5)
     * ```
     */
    perlin3D,

    // =========================================================================
    // Simplex Noise
    // =========================================================================

    /**
     * Create a 2D Simplex noise source.
     *
     * Improved gradient noise that's faster than Perlin with fewer
     * directional artifacts. Values in range [-1, 1].
     *
     * @param config - Optional seed and frequency configuration
     * @returns A composable 2D noise source
     *
     * @example
     * ```typescript
     * const simplex = noise.simplex2D({ frequency: 0.05 })
     *
     * // Great for clouds
     * const clouds = simplex.fbm({ octaves: 5, persistence: 0.6 })
     * ```
     */
    simplex2D,

    /**
     * Create a 3D Simplex noise source.
     *
     * @param config - Optional seed and frequency configuration
     * @returns A composable 3D noise source
     */
    simplex3D,

    // =========================================================================
    // Value Noise
    // =========================================================================

    /**
     * Create a 2D Value noise source.
     *
     * Value noise interpolates between random values at grid points.
     * Faster than gradient noise but with more visible grid artifacts.
     * Values in range [0, 1].
     *
     * @param config - Optional seed and frequency configuration
     * @returns A composable 2D noise source
     *
     * @example
     * ```typescript
     * const value = noise.value2D({ frequency: 0.1 })
     * const n = value.sample(x, y)  // Returns [0, 1]
     * ```
     */
    value2D,

    /**
     * Create a 3D Value noise source.
     *
     * @param config - Optional seed and frequency configuration
     * @returns A composable 3D noise source
     */
    value3D,

    // =========================================================================
    // Worley (Cellular) Noise
    // =========================================================================

    /**
     * Create a 2D Worley (Cellular/Voronoi) noise source.
     *
     * Creates cell-like patterns based on distance to randomly distributed
     * feature points. Great for organic textures like stone, cells, caustics.
     *
     * @param config - Worley noise configuration
     * @returns A composable 2D noise source
     *
     * @example
     * ```typescript
     * // Basic cellular pattern
     * const cells = noise.worley2D({ frequency: 5 })
     *
     * // Stone-like texture
     * const stone = noise.worley2D({
     *     frequency: 3,
     *     returnType: "f2-f1"
     * })
     * ```
     */
    worley2D,

    /**
     * Create a 3D Worley (Cellular/Voronoi) noise source.
     *
     * @param config - Worley noise configuration
     * @returns A composable 3D noise source
     */
    worley3D,

    // =========================================================================
    // Utility Functions
    // =========================================================================

    /**
     * Create a noise source by type name.
     *
     * Useful when the noise type is determined at runtime.
     *
     * @param type - The noise type
     * @param config - Optional configuration
     * @returns A 2D noise source of the specified type
     *
     * @example
     * ```typescript
     * const noiseType = settings.noiseType
     * const source = noise.create2D(noiseType, { seed: 42 })
     * ```
     */
    create2D(type: NoiseType, config?: NoiseConfig | WorleyConfig): NoiseSource2D {
        switch (type) {
            case "perlin":
                return perlin2D(config)
            case "simplex":
                return simplex2D(config)
            case "value":
                return value2D(config)
            case "worley":
                return worley2D(config as WorleyConfig)
            default:
                throw new Error(`Unknown noise type: ${type}`)
        }
    },

    /**
     * Create a 3D noise source by type name.
     *
     * @param type - The noise type
     * @param config - Optional configuration
     * @returns A 3D noise source of the specified type
     */
    create3D(type: NoiseType, config?: NoiseConfig | WorleyConfig): NoiseSource3D {
        switch (type) {
            case "perlin":
                return perlin3D(config)
            case "simplex":
                return simplex3D(config)
            case "value":
                return value3D(config)
            case "worley":
                return worley3D(config as WorleyConfig)
            default:
                throw new Error(`Unknown noise type: ${type}`)
        }
    },

    /**
     * Fill a Float32Array with 2D noise values.
     *
     * Efficient batch sampling for generating noise textures or heightmaps.
     *
     * @param output - Array to fill (length should be width * height)
     * @param width - Grid width
     * @param height - Grid height
     * @param source - Noise source to sample from
     * @param options - Sampling options
     *
     * @example
     * ```typescript
     * const data = new Float32Array(256 * 256)
     * const perlin = noise.perlin2D().fbm({ octaves: 4 })
     *
     * noise.fill2D(data, 256, 256, perlin, {
     *     scaleX: 0.01,
     *     scaleY: 0.01,
     *     offsetX: 0,
     *     offsetY: 0
     * })
     * ```
     */
    fill2D(
        output: Float32Array,
        width: number,
        height: number,
        source: NoiseSource2D,
        options: {
            scaleX?: number
            scaleY?: number
            offsetX?: number
            offsetY?: number
        } = {}
    ): void {
        const {
            scaleX = 1,
            scaleY = 1,
            offsetX = 0,
            offsetY = 0
        } = options

        let idx = 0
        for (let y = 0; y < height; y++) {
            const ny = (y + offsetY) * scaleY
            for (let x = 0; x < width; x++) {
                const nx = (x + offsetX) * scaleX
                output[idx++] = source.sample(nx, ny)
            }
        }
    },

    /**
     * Fill a Float32Array with 3D noise values (2D grid at specific z).
     *
     * @param output - Array to fill
     * @param width - Grid width
     * @param height - Grid height
     * @param source - 3D noise source to sample from
     * @param z - Z coordinate (useful for animation)
     * @param options - Sampling options
     */
    fill3D(
        output: Float32Array,
        width: number,
        height: number,
        source: NoiseSource3D,
        z: number,
        options: {
            scaleX?: number
            scaleY?: number
            offsetX?: number
            offsetY?: number
        } = {}
    ): void {
        const {
            scaleX = 1,
            scaleY = 1,
            offsetX = 0,
            offsetY = 0
        } = options

        let idx = 0
        for (let y = 0; y < height; y++) {
            const ny = (y + offsetY) * scaleY
            for (let x = 0; x < width; x++) {
                const nx = (x + offsetX) * scaleX
                output[idx++] = source.sample(nx, ny, z)
            }
        }
    },

    /**
     * Remap noise value from [-1, 1] to [0, 1].
     *
     * @param value - Noise value in [-1, 1]
     * @returns Value in [0, 1]
     */
    normalize(value: number): number {
        return value * 0.5 + 0.5
    },

    /**
     * Apply ridge transform for sharp mountain ridges.
     *
     * @param value - Noise value in [-1, 1]
     * @returns Ridged value in [0, 1]
     */
    ridge(value: number): number {
        return 1 - Math.abs(value)
    },

    /**
     * Apply billowed/abs transform for cloud-like shapes.
     *
     * @param value - Noise value in [-1, 1]
     * @returns Billowed value in [0, 1]
     */
    billow(value: number): number {
        return Math.abs(value)
    },

    // =========================================================================
    // GPU Noise
    // =========================================================================

    /**
     * GPU-accelerated noise generation.
     *
     * Uses compute shaders for high-performance noise texture generation.
     * Falls back gracefully when compute shaders are not available.
     *
     * @example
     * ```typescript
     * import { noise } from "onejs-unity/proc"
     * import { useComputeTexture } from "onejs-unity/gpu"
     *
     * // Check availability
     * if (noise.gpu.available) {
     *     const texture = useComputeTexture({ width: 512, height: 512 })
     *
     *     // Async generation
     *     await noise.gpu.perlin(texture, { frequency: 4 })
     *
     *     // Sync per-frame updates (after preload)
     *     await noise.gpu.preload()
     *     noise.gpu.dispatchSync(texture, "simplex", { time: t })
     * }
     * ```
     */
    gpu: gpuNoise
}
