/**
 * GPU-accelerated procedural texture generation via compute shaders.
 *
 * Uses Unity compute shaders for high-performance pattern generation.
 * Falls back gracefully when compute shaders are not available.
 *
 * @module onejs-unity/proc/texture
 */

import type { GPUTextureOptions } from "../types"

declare function require(id: string): any

// =============================================================================
// Types
// =============================================================================

/**
 * RenderTexture handle from gpu module.
 */
export interface RenderTexture {
    __handle: number
    width: number
    height: number
}

/**
 * ComputeShader handle.
 */
interface ComputeShader {
    kernel(name: string): KernelBuilder
    createDispatcher(name: string, schema: Record<string, string>): KernelDispatcher
}

interface KernelBuilder {
    float(name: string, value: number): KernelBuilder
    int(name: string, value: number): KernelBuilder
    vec2(name: string, value: [number, number] | { x: number; y: number }): KernelBuilder
    vec4(name: string, value: [number, number, number, number]): KernelBuilder
    textureRW(name: string, texture: RenderTexture): KernelBuilder
    dispatchAuto(texture: RenderTexture, threadGroupSize?: number): void
}

interface KernelDispatcher {
    float(name: string, value: number): KernelDispatcher
    int(name: string, value: number): KernelDispatcher
    vec2(name: string, x: number, y: number): KernelDispatcher
    vec4(name: string, x: number, y: number, z: number, w: number): KernelDispatcher
    textureRW(name: string, texture: RenderTexture): KernelDispatcher
    dispatchAuto(texture: RenderTexture, threadGroupSize?: number): void
}

/**
 * Extended options for GPU texture patterns.
 */
export interface GPUPatternOptions extends GPUTextureOptions {
    /** Pattern-specific scale */
    scale?: number
    /** FBM octaves */
    octaves?: number
    /** Persistence for FBM */
    persistence?: number
    /** Low color for gradient */
    colorLow?: [number, number, number, number]
    /** High color for gradient */
    colorHigh?: [number, number, number, number]
}

// =============================================================================
// GPU Module Integration
// =============================================================================

let _compute: {
    load(name: string): Promise<ComputeShader>
    register(shader: unknown): ComputeShader
    supportsCompute(): boolean
} | null = null

function getCompute() {
    if (_compute === null) {
        try {
            _compute = require("../../gpu").compute
        } catch {
            _compute = {
                load: () => Promise.reject(new Error("GPU module not available")),
                register: () => { throw new Error("GPU module not available") },
                supportsCompute: () => false
            }
        }
    }
    return _compute!
}

// =============================================================================
// Shader Cache
// =============================================================================

let _patternShader: ComputeShader | null = null
let _shaderPromise: Promise<ComputeShader> | null = null

async function loadPatternShader(): Promise<ComputeShader> {
    if (_patternShader) return _patternShader

    if (_shaderPromise) return _shaderPromise

    _shaderPromise = getCompute().load("ProceduralPatterns").then(shader => {
        _patternShader = shader
        return shader
    })

    return _shaderPromise
}

/**
 * Register an external pattern shader (e.g., from JSRunner globals).
 */
export function registerPatternShader(shader: unknown): void {
    _patternShader = getCompute().register(shader)
}

// =============================================================================
// Dispatcher Cache (Zero-Alloc)
// =============================================================================

const _dispatchers = new Map<string, KernelDispatcher>()

function getDispatcher(shader: ComputeShader, kernelName: string): KernelDispatcher {
    let dispatcher = _dispatchers.get(kernelName)

    if (!dispatcher) {
        dispatcher = shader.createDispatcher(kernelName, {
            _Resolution: "vec2",
            _Frequency: "float",
            _Time: "float",
            _Seed: "float",
            _Scale: "float",
            _Octaves: "int",
            _Persistence: "float",
            _Turbulence: "float",
            _CellCount: "int",
            _Rings: "int",
            _Sharpness: "float",
            _ColorLow: "vec4",
            _ColorHigh: "vec4",
            _Result: "textureRW"
        })
        _dispatchers.set(kernelName, dispatcher)
    }

    return dispatcher
}

// =============================================================================
// GPU Texture API
// =============================================================================

/**
 * GPU-accelerated texture pattern generation namespace.
 *
 * @example
 * ```typescript
 * import { texture } from "onejs-unity/proc"
 * import { useComputeTexture } from "onejs-unity/gpu"
 *
 * if (texture.gpu.available) {
 *     const rt = useComputeTexture({ width: 512, height: 512 })
 *
 *     // Generate marble pattern
 *     await texture.gpu.marble(rt, { frequency: 5, turbulence: 3 })
 *
 *     // Generate voronoi cells
 *     await texture.gpu.voronoi(rt, { cellCount: 16 })
 * }
 * ```
 */
export const gpuTexture = {
    /**
     * Check if GPU texture generation is available.
     */
    get available(): boolean {
        return getCompute().supportsCompute()
    },

    /**
     * Preload the pattern shader.
     */
    async preload(): Promise<void> {
        await loadPatternShader()
    },

    /**
     * Generate a voronoi/cellular pattern.
     */
    async voronoi(
        texture: RenderTexture,
        options: GPUPatternOptions = {}
    ): Promise<void> {
        const shader = await loadPatternShader()
        dispatchPattern(shader, "Voronoi", texture, options)
    },

    /**
     * Generate a marble pattern.
     */
    async marble(
        texture: RenderTexture,
        options: GPUPatternOptions = {}
    ): Promise<void> {
        const shader = await loadPatternShader()
        dispatchPattern(shader, "Marble", texture, options)
    },

    /**
     * Generate a wood grain pattern.
     */
    async wood(
        texture: RenderTexture,
        options: GPUPatternOptions = {}
    ): Promise<void> {
        const shader = await loadPatternShader()
        dispatchPattern(shader, "Wood", texture, options)
    },

    /**
     * Generate a checkerboard pattern.
     */
    async checkerboard(
        texture: RenderTexture,
        options: GPUPatternOptions = {}
    ): Promise<void> {
        const shader = await loadPatternShader()
        dispatchPattern(shader, "Checkerboard", texture, options)
    },

    /**
     * Generate a gradient pattern.
     */
    async gradient(
        texture: RenderTexture,
        options: GPUPatternOptions = {}
    ): Promise<void> {
        const shader = await loadPatternShader()
        dispatchPattern(shader, "Gradient", texture, options)
    },

    /**
     * Generate a radial gradient pattern.
     */
    async radialGradient(
        texture: RenderTexture,
        options: GPUPatternOptions = {}
    ): Promise<void> {
        const shader = await loadPatternShader()
        dispatchPattern(shader, "RadialGradient", texture, options)
    },

    /**
     * Dispatch pattern generation by type name.
     */
    async dispatch(
        texture: RenderTexture,
        type: "voronoi" | "marble" | "wood" | "checkerboard" | "gradient" | "radialGradient",
        options: GPUPatternOptions = {}
    ): Promise<void> {
        const shader = await loadPatternShader()

        const kernelMap: Record<string, string> = {
            voronoi: "Voronoi",
            marble: "Marble",
            wood: "Wood",
            checkerboard: "Checkerboard",
            gradient: "Gradient",
            radialGradient: "RadialGradient"
        }

        const kernelName = kernelMap[type] ?? "Voronoi"
        dispatchPattern(shader, kernelName, texture, options)
    },

    /**
     * Synchronous dispatch (shader must be preloaded).
     */
    dispatchSync(
        texture: RenderTexture,
        type: "voronoi" | "marble" | "wood" | "checkerboard" | "gradient" | "radialGradient",
        options: GPUPatternOptions = {}
    ): void {
        if (!_patternShader) {
            throw new Error("Pattern shader not loaded. Call gpuTexture.preload() first.")
        }

        const kernelMap: Record<string, string> = {
            voronoi: "Voronoi",
            marble: "Marble",
            wood: "Wood",
            checkerboard: "Checkerboard",
            gradient: "Gradient",
            radialGradient: "RadialGradient"
        }

        const kernelName = kernelMap[type] ?? "Voronoi"
        dispatchPattern(_patternShader, kernelName, texture, options)
    }
}

// =============================================================================
// Internal Dispatch
// =============================================================================

function dispatchPattern(
    shader: ComputeShader,
    kernelName: string,
    texture: RenderTexture,
    options: GPUPatternOptions
): void {
    const {
        frequency = 1,
        time = 0,
        scale = 1,
        octaves = 4,
        persistence = 0.5,
        turbulence = 1,
        cellCount = 8,
        rings = 12,
        colorLow = [0, 0, 0, 1],
        colorHigh = [1, 1, 1, 1]
    } = options

    const seed = options.time ?? 0

    const dispatcher = getDispatcher(shader, kernelName)

    dispatcher
        .vec2("_Resolution", texture.width, texture.height)
        .float("_Frequency", frequency)
        .float("_Time", time)
        .float("_Seed", seed)
        .float("_Scale", scale)
        .int("_Octaves", octaves)
        .float("_Persistence", persistence)
        .float("_Turbulence", turbulence)
        .int("_CellCount", cellCount)
        .int("_Rings", rings)
        .float("_Sharpness", 2)
        .vec4("_ColorLow", colorLow[0], colorLow[1], colorLow[2], colorLow[3])
        .vec4("_ColorHigh", colorHigh[0], colorHigh[1], colorHigh[2], colorHigh[3])
        .textureRW("_Result", texture)
        .dispatchAuto(texture, 8)
}
