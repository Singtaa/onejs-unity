/**
 * Value noise implementation.
 *
 * Simple lattice-based noise that interpolates between random values at
 * integer coordinates. Produces values in the range [0, 1].
 *
 * Value noise is faster than gradient noise but has more visible grid
 * artifacts. Best for applications where speed matters more than quality.
 *
 * @module onejs-unity/proc/noise
 */

import type { NoiseConfig, NoiseSource2D, NoiseSource3D, FBMConfig } from "../types"

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Seeded pseudo-random number generator (mulberry32).
 */
function mulberry32(seed: number): () => number {
    return () => {
        let t = seed += 0x6D2B79F5
        t = Math.imul(t ^ t >>> 15, t | 1)
        t ^= t + Math.imul(t ^ t >>> 7, t | 61)
        return ((t ^ t >>> 14) >>> 0) / 4294967296
    }
}

/**
 * Generate a seeded random value table.
 */
function generateValueTable(seed: number): Float32Array {
    const table = new Float32Array(256)
    const rand = mulberry32(seed)

    for (let i = 0; i < 256; i++) {
        table[i] = rand()
    }

    return table
}

/**
 * Generate a seeded permutation table.
 */
function generatePermutation(seed: number): Uint8Array {
    const perm = new Uint8Array(512)
    const rand = mulberry32(seed)

    for (let i = 0; i < 256; i++) {
        perm[i] = i
    }

    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        const tmp = perm[i]
        perm[i] = perm[j]
        perm[j] = tmp
    }

    for (let i = 0; i < 256; i++) {
        perm[i + 256] = perm[i]
    }

    return perm
}

/**
 * Smoothstep interpolation: 3t^2 - 2t^3
 */
function smoothstep(t: number): number {
    return t * t * (3 - 2 * t)
}

/**
 * Linear interpolation.
 */
function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a)
}

// =============================================================================
// Value Noise Implementation
// =============================================================================

/**
 * Create a 2D value noise function.
 */
function createValue2D(
    perm: Uint8Array,
    values: Float32Array,
    frequency: number
): (x: number, y: number) => number {
    return (x: number, y: number): number => {
        x *= frequency
        y *= frequency

        const xi = Math.floor(x) & 255
        const yi = Math.floor(y) & 255

        const xf = x - Math.floor(x)
        const yf = y - Math.floor(y)

        const u = smoothstep(xf)
        const v = smoothstep(yf)

        // Hash coordinates to get random values
        const aa = values[perm[perm[xi] + yi]]
        const ab = values[perm[perm[xi] + yi + 1]]
        const ba = values[perm[perm[xi + 1] + yi]]
        const bb = values[perm[perm[xi + 1] + yi + 1]]

        // Bilinear interpolation
        const nx0 = lerp(aa, ba, u)
        const nx1 = lerp(ab, bb, u)

        return lerp(nx0, nx1, v)
    }
}

/**
 * Create a 3D value noise function.
 */
function createValue3D(
    perm: Uint8Array,
    values: Float32Array,
    frequency: number
): (x: number, y: number, z: number) => number {
    return (x: number, y: number, z: number): number => {
        x *= frequency
        y *= frequency
        z *= frequency

        const xi = Math.floor(x) & 255
        const yi = Math.floor(y) & 255
        const zi = Math.floor(z) & 255

        const xf = x - Math.floor(x)
        const yf = y - Math.floor(y)
        const zf = z - Math.floor(z)

        const u = smoothstep(xf)
        const v = smoothstep(yf)
        const w = smoothstep(zf)

        // Hash coordinates
        const aaa = values[perm[perm[perm[xi] + yi] + zi]]
        const aab = values[perm[perm[perm[xi] + yi] + zi + 1]]
        const aba = values[perm[perm[perm[xi] + yi + 1] + zi]]
        const abb = values[perm[perm[perm[xi] + yi + 1] + zi + 1]]
        const baa = values[perm[perm[perm[xi + 1] + yi] + zi]]
        const bab = values[perm[perm[perm[xi + 1] + yi] + zi + 1]]
        const bba = values[perm[perm[perm[xi + 1] + yi + 1] + zi]]
        const bbb = values[perm[perm[perm[xi + 1] + yi + 1] + zi + 1]]

        // Trilinear interpolation
        const nx00 = lerp(aaa, baa, u)
        const nx01 = lerp(aab, bab, u)
        const nx10 = lerp(aba, bba, u)
        const nx11 = lerp(abb, bbb, u)

        const nxy0 = lerp(nx00, nx10, v)
        const nxy1 = lerp(nx01, nx11, v)

        return lerp(nxy0, nxy1, w)
    }
}

// =============================================================================
// FBM/Turbulence Helpers
// =============================================================================

function createFBM2D(
    baseFn: (x: number, y: number) => number,
    config: FBMConfig
): (x: number, y: number) => number {
    const octaves = config.octaves ?? 4
    const lacunarity = config.lacunarity ?? 2.0
    const persistence = config.persistence ?? 0.5

    return (x: number, y: number): number => {
        let value = 0
        let amplitude = 1
        let frequency = 1
        let maxValue = 0

        for (let i = 0; i < octaves; i++) {
            value += baseFn(x * frequency, y * frequency) * amplitude
            maxValue += amplitude
            amplitude *= persistence
            frequency *= lacunarity
        }

        return value / maxValue
    }
}

function createTurbulence2D(
    baseFn: (x: number, y: number) => number,
    config: FBMConfig
): (x: number, y: number) => number {
    const octaves = config.octaves ?? 4
    const lacunarity = config.lacunarity ?? 2.0
    const persistence = config.persistence ?? 0.5

    return (x: number, y: number): number => {
        let value = 0
        let amplitude = 1
        let frequency = 1
        let maxValue = 0

        for (let i = 0; i < octaves; i++) {
            // For value noise [0,1], shift to [-0.5, 0.5] before abs
            const n = baseFn(x * frequency, y * frequency) - 0.5
            value += Math.abs(n) * 2 * amplitude
            maxValue += amplitude
            amplitude *= persistence
            frequency *= lacunarity
        }

        return value / maxValue
    }
}

function createFBM3D(
    baseFn: (x: number, y: number, z: number) => number,
    config: FBMConfig
): (x: number, y: number, z: number) => number {
    const octaves = config.octaves ?? 4
    const lacunarity = config.lacunarity ?? 2.0
    const persistence = config.persistence ?? 0.5

    return (x: number, y: number, z: number): number => {
        let value = 0
        let amplitude = 1
        let frequency = 1
        let maxValue = 0

        for (let i = 0; i < octaves; i++) {
            value += baseFn(x * frequency, y * frequency, z * frequency) * amplitude
            maxValue += amplitude
            amplitude *= persistence
            frequency *= lacunarity
        }

        return value / maxValue
    }
}

function createTurbulence3D(
    baseFn: (x: number, y: number, z: number) => number,
    config: FBMConfig
): (x: number, y: number, z: number) => number {
    const octaves = config.octaves ?? 4
    const lacunarity = config.lacunarity ?? 2.0
    const persistence = config.persistence ?? 0.5

    return (x: number, y: number, z: number): number => {
        let value = 0
        let amplitude = 1
        let frequency = 1
        let maxValue = 0

        for (let i = 0; i < octaves; i++) {
            const n = baseFn(x * frequency, y * frequency, z * frequency) - 0.5
            value += Math.abs(n) * 2 * amplitude
            maxValue += amplitude
            amplitude *= persistence
            frequency *= lacunarity
        }

        return value / maxValue
    }
}

// =============================================================================
// NoiseSource Wrappers
// =============================================================================

function wrapSource2D(fn: (x: number, y: number) => number): NoiseSource2D {
    return {
        sample: fn,
        fbm: (c) => wrapSource2D(createFBM2D(fn, c ?? {})),
        turbulence: (c) => wrapSource2D(createTurbulence2D(fn, c ?? {}))
    }
}

function wrapSource3D(fn: (x: number, y: number, z: number) => number): NoiseSource3D {
    return {
        sample: fn,
        fbm: (c) => wrapSource3D(createFBM3D(fn, c ?? {})),
        turbulence: (c) => wrapSource3D(createTurbulence3D(fn, c ?? {}))
    }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a 2D value noise source.
 *
 * Value noise interpolates between random values at grid points.
 * Faster than gradient noise but with more visible grid artifacts.
 *
 * @param config - Noise configuration
 * @returns A NoiseSource2D that produces values in [0, 1]
 *
 * @example
 * ```typescript
 * const value = value2D({ seed: 42, frequency: 0.1 })
 * const n = value.sample(x, y)  // Returns [0, 1]
 *
 * // With FBM
 * const layered = value2D().fbm({ octaves: 4 })
 * ```
 */
export function value2D(config: NoiseConfig = {}): NoiseSource2D {
    const seed = config.seed ?? 0
    const frequency = config.frequency ?? 1.0
    const perm = generatePermutation(seed)
    const values = generateValueTable(seed + 12345)
    const fn = createValue2D(perm, values, frequency)
    return wrapSource2D(fn)
}

/**
 * Create a 3D value noise source.
 *
 * @param config - Noise configuration
 * @returns A NoiseSource3D that produces values in [0, 1]
 *
 * @example
 * ```typescript
 * const value = value3D({ seed: 42 })
 * const n = value.sample(x, y, z)
 * ```
 */
export function value3D(config: NoiseConfig = {}): NoiseSource3D {
    const seed = config.seed ?? 0
    const frequency = config.frequency ?? 1.0
    const perm = generatePermutation(seed)
    const values = generateValueTable(seed + 12345)
    const fn = createValue3D(perm, values, frequency)
    return wrapSource3D(fn)
}
