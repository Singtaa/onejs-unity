/**
 * Procedural texture generation module.
 *
 * Provides CPU and GPU-accelerated texture pattern generation.
 *
 * @module onejs-unity/proc/texture
 *
 * @example CPU texture generation
 * ```typescript
 * import { texture } from "onejs-unity/proc"
 *
 * // Generate noise texture
 * const data = texture.noise({
 *     width: 256,
 *     height: 256,
 *     type: "simplex",
 *     fbm: { octaves: 4 }
 * })
 *
 * // Generate marble pattern
 * const marble = texture.marble({
 *     width: 512,
 *     height: 512,
 *     frequency: 5,
 *     turbulence: 3
 * })
 * ```
 *
 * @example GPU texture generation
 * ```typescript
 * import { texture } from "onejs-unity/proc"
 * import { useComputeTexture } from "onejs-unity/gpu"
 *
 * if (texture.gpu.available) {
 *     const rt = useComputeTexture({ width: 512, height: 512 })
 *     await texture.gpu.voronoi(rt, { cellCount: 16 })
 * }
 * ```
 */

import {
    generateNoise,
    generateVoronoi,
    generateMarble,
    generateWood,
    generateCheckerboard,
    generateGradient,
    colorMaps,
    createTexture
} from "./generators"
import { gpuTexture, registerPatternShader } from "./gpu"
import type {
    NoiseTextureOptions,
    VoronoiTextureOptions,
    MarbleTextureOptions,
    WoodTextureOptions,
    CheckerboardTextureOptions,
    GradientTextureOptions,
    ColorMap,
    RGBA
} from "./generators"
import type { GPUPatternOptions } from "./gpu"

// Re-export types
export type {
    NoiseTextureOptions,
    VoronoiTextureOptions,
    MarbleTextureOptions,
    WoodTextureOptions,
    CheckerboardTextureOptions,
    GradientTextureOptions,
    ColorMap,
    RGBA,
    GPUPatternOptions
}

// Re-export generators
export {
    generateNoise,
    generateVoronoi,
    generateMarble,
    generateWood,
    generateCheckerboard,
    generateGradient,
    colorMaps,
    createTexture
} from "./generators"

// Re-export GPU
export { gpuTexture, registerPatternShader } from "./gpu"

/**
 * Unified texture generation API.
 *
 * Provides access to all texture generators through a single namespace.
 */
export const texture = {
    // =========================================================================
    // CPU Generators
    // =========================================================================

    /**
     * Generate a noise texture (CPU).
     *
     * @param options - Noise texture options
     * @returns RGBA pixel data as Uint8ClampedArray
     */
    noise: generateNoise,

    /**
     * Generate a voronoi/cellular texture (CPU).
     *
     * @param options - Voronoi texture options
     * @returns RGBA pixel data
     */
    voronoi: generateVoronoi,

    /**
     * Generate a marble texture (CPU).
     *
     * @param options - Marble texture options
     * @returns RGBA pixel data
     */
    marble: generateMarble,

    /**
     * Generate a wood grain texture (CPU).
     *
     * @param options - Wood texture options
     * @returns RGBA pixel data
     */
    wood: generateWood,

    /**
     * Generate a checkerboard texture (CPU).
     *
     * @param options - Checkerboard texture options
     * @returns RGBA pixel data
     */
    checkerboard: generateCheckerboard,

    /**
     * Generate a gradient texture (CPU).
     *
     * @param options - Gradient texture options
     * @returns RGBA pixel data
     */
    gradient: generateGradient,

    /**
     * Built-in color maps for noise-to-color conversion.
     */
    colorMaps,

    /**
     * Create a texture from pixel data.
     */
    create: createTexture,

    // =========================================================================
    // GPU Patterns
    // =========================================================================

    /**
     * GPU-accelerated texture pattern generation.
     *
     * @example
     * ```typescript
     * import { texture } from "onejs-unity/proc"
     *
     * if (texture.gpu.available) {
     *     await texture.gpu.preload()
     *
     *     // Generate patterns
     *     await texture.gpu.marble(renderTexture, { frequency: 5 })
     *     await texture.gpu.voronoi(renderTexture, { cellCount: 16 })
     *
     *     // Sync dispatch for animation loops
     *     texture.gpu.dispatchSync(renderTexture, "marble", { time: t })
     * }
     * ```
     */
    gpu: gpuTexture
}
