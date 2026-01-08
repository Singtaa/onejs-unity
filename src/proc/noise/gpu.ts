/**
 * GPU-accelerated noise generation via compute shaders.
 *
 * Uses Unity compute shaders for high-performance noise texture generation.
 * Falls back gracefully when compute shaders are not available.
 *
 * @module onejs-unity/proc/noise
 */

import type { GPUNoiseOptions, NoiseType } from "../types"

// =============================================================================
// Types
// =============================================================================

/**
 * RenderTexture handle from gpu module.
 */
interface RenderTexture {
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

// =============================================================================
// GPU Module Integration
// =============================================================================

// Lazy import to avoid circular dependencies
let _compute: {
    load(name: string): Promise<ComputeShader>
    register(shader: unknown): ComputeShader
    supportsCompute(): boolean
} | null = null

function getCompute() {
    if (_compute === null) {
        try {
            // Dynamic import at runtime
            _compute = require("../../gpu").compute
        } catch {
            _compute = {
                load: () => Promise.reject(new Error("GPU module not available")),
                register: () => { throw new Error("GPU module not available") },
                supportsCompute: () => false
            }
        }
    }
    return _compute
}

// =============================================================================
// Shader Cache
// =============================================================================

let _noiseShader: ComputeShader | null = null
let _shaderPromise: Promise<ComputeShader> | null = null

/**
 * Load the procedural noise compute shader.
 */
async function loadNoiseShader(): Promise<ComputeShader> {
    if (_noiseShader) return _noiseShader

    if (_shaderPromise) return _shaderPromise

    _shaderPromise = getCompute().load("ProceduralNoise").then(shader => {
        _noiseShader = shader
        return shader
    })

    return _shaderPromise
}

/**
 * Register an external noise shader (e.g., from JSRunner globals).
 */
export function registerNoiseShader(shader: unknown): void {
    _noiseShader = getCompute().register(shader)
}

// =============================================================================
// Kernel Names
// =============================================================================

const KERNEL_MAP: Record<NoiseType, string> = {
    perlin: "Perlin2D",
    simplex: "Simplex2D",
    value: "Value2D",
    worley: "Worley2D"
}

const FBM_KERNEL_MAP: Record<string, string> = {
    perlin: "FBM_Perlin2D",
    simplex: "FBM_Simplex2D"
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
            _Offset: "vec2",
            _Octaves: "int",
            _Lacunarity: "float",
            _Persistence: "float",
            _OutputMode: "int",
            _ColorLow: "vec4",
            _ColorHigh: "vec4",
            _Result: "textureRW"
        })
        _dispatchers.set(kernelName, dispatcher)
    }

    return dispatcher
}

// =============================================================================
// GPU Noise API
// =============================================================================

/**
 * GPU-accelerated noise generation namespace.
 *
 * @example
 * ```typescript
 * import { noise } from "onejs-unity/proc"
 * import { useComputeTexture } from "onejs-unity/gpu"
 *
 * // Check if GPU noise is available
 * if (noise.gpu.available) {
 *     const texture = useComputeTexture({ width: 512, height: 512 })
 *
 *     // Generate Perlin noise
 *     await noise.gpu.perlin(texture, { frequency: 4 })
 *
 *     // Generate FBM noise
 *     await noise.gpu.fbm(texture, {
 *         type: "simplex",
 *         frequency: 2,
 *         octaves: 6,
 *         persistence: 0.5
 *     })
 * }
 * ```
 */
export const gpuNoise = {
    /**
     * Check if GPU noise generation is available.
     */
    get available(): boolean {
        return getCompute().supportsCompute()
    },

    /**
     * Load the noise shader. Call once at startup to preload.
     */
    async preload(): Promise<void> {
        await loadNoiseShader()
    },

    /**
     * Generate Perlin noise to a texture.
     */
    async perlin(
        texture: RenderTexture,
        options: GPUNoiseOptions = {}
    ): Promise<void> {
        const shader = await loadNoiseShader()
        dispatchNoise(shader, "Perlin2D", texture, options)
    },

    /**
     * Generate Simplex noise to a texture.
     */
    async simplex(
        texture: RenderTexture,
        options: GPUNoiseOptions = {}
    ): Promise<void> {
        const shader = await loadNoiseShader()
        dispatchNoise(shader, "Simplex2D", texture, options)
    },

    /**
     * Generate Value noise to a texture.
     */
    async value(
        texture: RenderTexture,
        options: GPUNoiseOptions = {}
    ): Promise<void> {
        const shader = await loadNoiseShader()
        dispatchNoise(shader, "Value2D", texture, options)
    },

    /**
     * Generate Worley (cellular) noise to a texture.
     */
    async worley(
        texture: RenderTexture,
        options: GPUNoiseOptions = {}
    ): Promise<void> {
        const shader = await loadNoiseShader()
        dispatchNoise(shader, "Worley2D", texture, options)
    },

    /**
     * Generate FBM noise to a texture.
     */
    async fbm(
        texture: RenderTexture,
        options: GPUNoiseOptions & { type?: "perlin" | "simplex" } = {}
    ): Promise<void> {
        const shader = await loadNoiseShader()
        const type = options.type ?? "perlin"
        const kernelName = FBM_KERNEL_MAP[type] ?? "FBM_Perlin2D"
        dispatchNoise(shader, kernelName, texture, options)
    },

    /**
     * Generate turbulence noise to a texture.
     */
    async turbulence(
        texture: RenderTexture,
        options: GPUNoiseOptions = {}
    ): Promise<void> {
        const shader = await loadNoiseShader()
        dispatchNoise(shader, "Turbulence2D", texture, options)
    },

    /**
     * Dispatch noise generation by type name.
     */
    async dispatch(
        texture: RenderTexture,
        type: NoiseType | "fbm" | "turbulence",
        options: GPUNoiseOptions = {}
    ): Promise<void> {
        const shader = await loadNoiseShader()

        let kernelName: string
        if (type === "fbm") {
            const baseType = (options as { type?: string }).type ?? "perlin"
            kernelName = FBM_KERNEL_MAP[baseType] ?? "FBM_Perlin2D"
        } else if (type === "turbulence") {
            kernelName = "Turbulence2D"
        } else {
            kernelName = KERNEL_MAP[type] ?? "Perlin2D"
        }

        dispatchNoise(shader, kernelName, texture, options)
    },

    /**
     * Synchronous dispatch (shader must be preloaded).
     * Use this for per-frame updates after calling preload().
     */
    dispatchSync(
        texture: RenderTexture,
        type: NoiseType | "fbm" | "turbulence",
        options: GPUNoiseOptions = {}
    ): void {
        if (!_noiseShader) {
            throw new Error("Noise shader not loaded. Call gpuNoise.preload() first.")
        }

        let kernelName: string
        if (type === "fbm") {
            const baseType = (options as { type?: string }).type ?? "perlin"
            kernelName = FBM_KERNEL_MAP[baseType] ?? "FBM_Perlin2D"
        } else if (type === "turbulence") {
            kernelName = "Turbulence2D"
        } else {
            kernelName = KERNEL_MAP[type] ?? "Perlin2D"
        }

        dispatchNoise(_noiseShader, kernelName, texture, options)
    }
}

// =============================================================================
// Internal Dispatch
// =============================================================================

function dispatchNoise(
    shader: ComputeShader,
    kernelName: string,
    texture: RenderTexture,
    options: GPUNoiseOptions
): void {
    const {
        frequency = 1,
        seed = 0,
        time = 0,
        octaves = 4,
        lacunarity = 2,
        persistence = 0.5
    } = options

    const dispatcher = getDispatcher(shader, kernelName)

    dispatcher
        .vec2("_Resolution", texture.width, texture.height)
        .float("_Frequency", frequency)
        .float("_Time", time)
        .float("_Seed", seed)
        .vec2("_Offset", 0, 0)
        .int("_Octaves", octaves)
        .float("_Lacunarity", lacunarity)
        .float("_Persistence", persistence)
        .int("_OutputMode", 1) // Normalized [0,1]
        .vec4("_ColorLow", 0, 0, 0, 1)
        .vec4("_ColorHigh", 1, 1, 1, 1)
        .textureRW("_Result", texture)
        .dispatchAuto(texture, 8)
}
