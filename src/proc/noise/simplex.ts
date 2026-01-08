/**
 * Simplex noise implementation.
 *
 * Improved gradient noise algorithm by Ken Perlin. Faster than classic Perlin
 * with fewer directional artifacts. Produces values in the range [-1, 1].
 *
 * @module onejs-unity/proc/noise
 */

import type { NoiseConfig, NoiseSource2D, NoiseSource3D, FBMConfig } from "../types"

// =============================================================================
// Constants
// =============================================================================

// Skewing factors for 2D
const F2 = 0.5 * (Math.sqrt(3) - 1)  // 0.3660254037844386
const G2 = (3 - Math.sqrt(3)) / 6    // 0.21132486540518713

// Skewing factors for 3D
const F3 = 1 / 3
const G3 = 1 / 6

// Gradient vectors for 2D (12 directions)
const GRAD_2D = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [-1, 1], [1, -1], [-1, -1]
] as const

// Gradient vectors for 3D
const GRAD_3D = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]
] as const

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
 * Generate a seeded permutation table.
 */
function generatePermutation(seed: number): Uint8Array {
    const perm = new Uint8Array(512)
    const rand = mulberry32(seed)

    // Initialize with identity
    for (let i = 0; i < 256; i++) {
        perm[i] = i
    }

    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        const tmp = perm[i]
        perm[i] = perm[j]
        perm[j] = tmp
    }

    // Double the permutation to avoid wrapping
    for (let i = 0; i < 256; i++) {
        perm[i + 256] = perm[i]
    }

    return perm
}

// =============================================================================
// Simplex Noise Implementation
// =============================================================================

/**
 * Create a 2D Simplex noise function.
 */
function createSimplex2D(perm: Uint8Array, frequency: number): (x: number, y: number) => number {
    return (x: number, y: number): number => {
        x *= frequency
        y *= frequency

        // Skew input space to determine which simplex cell we're in
        const s = (x + y) * F2
        const i = Math.floor(x + s)
        const j = Math.floor(y + s)

        // Unskew back to (x, y) space
        const t = (i + j) * G2
        const X0 = i - t
        const Y0 = j - t

        // Distances from cell origin
        const x0 = x - X0
        const y0 = y - Y0

        // Determine which simplex we're in (upper or lower triangle)
        let i1: number, j1: number
        if (x0 > y0) {
            i1 = 1
            j1 = 0
        } else {
            i1 = 0
            j1 = 1
        }

        // Offsets for corners
        const x1 = x0 - i1 + G2
        const y1 = y0 - j1 + G2
        const x2 = x0 - 1 + 2 * G2
        const y2 = y0 - 1 + 2 * G2

        // Hash coordinates
        const ii = i & 255
        const jj = j & 255

        // Calculate contributions from the three corners
        let n0 = 0, n1 = 0, n2 = 0

        // Corner 0
        let t0 = 0.5 - x0 * x0 - y0 * y0
        if (t0 >= 0) {
            const gi0 = perm[ii + perm[jj]] % 12
            t0 *= t0
            n0 = t0 * t0 * (GRAD_2D[gi0][0] * x0 + GRAD_2D[gi0][1] * y0)
        }

        // Corner 1
        let t1 = 0.5 - x1 * x1 - y1 * y1
        if (t1 >= 0) {
            const gi1 = perm[ii + i1 + perm[jj + j1]] % 12
            t1 *= t1
            n1 = t1 * t1 * (GRAD_2D[gi1][0] * x1 + GRAD_2D[gi1][1] * y1)
        }

        // Corner 2
        let t2 = 0.5 - x2 * x2 - y2 * y2
        if (t2 >= 0) {
            const gi2 = perm[ii + 1 + perm[jj + 1]] % 12
            t2 *= t2
            n2 = t2 * t2 * (GRAD_2D[gi2][0] * x2 + GRAD_2D[gi2][1] * y2)
        }

        // Scale to [-1, 1]
        return 70 * (n0 + n1 + n2)
    }
}

/**
 * Create a 3D Simplex noise function.
 */
function createSimplex3D(perm: Uint8Array, frequency: number): (x: number, y: number, z: number) => number {
    return (x: number, y: number, z: number): number => {
        x *= frequency
        y *= frequency
        z *= frequency

        // Skew input space
        const s = (x + y + z) * F3
        const i = Math.floor(x + s)
        const j = Math.floor(y + s)
        const k = Math.floor(z + s)

        // Unskew back
        const t = (i + j + k) * G3
        const X0 = i - t
        const Y0 = j - t
        const Z0 = k - t

        // Distances from cell origin
        const x0 = x - X0
        const y0 = y - Y0
        const z0 = z - Z0

        // Determine which simplex we're in
        let i1: number, j1: number, k1: number
        let i2: number, j2: number, k2: number

        if (x0 >= y0) {
            if (y0 >= z0) {
                i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0
            } else if (x0 >= z0) {
                i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1
            } else {
                i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1
            }
        } else {
            if (y0 < z0) {
                i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1
            } else if (x0 < z0) {
                i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1
            } else {
                i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0
            }
        }

        // Offsets for corners
        const x1 = x0 - i1 + G3
        const y1 = y0 - j1 + G3
        const z1 = z0 - k1 + G3
        const x2 = x0 - i2 + 2 * G3
        const y2 = y0 - j2 + 2 * G3
        const z2 = z0 - k2 + 2 * G3
        const x3 = x0 - 1 + 3 * G3
        const y3 = y0 - 1 + 3 * G3
        const z3 = z0 - 1 + 3 * G3

        // Hash coordinates
        const ii = i & 255
        const jj = j & 255
        const kk = k & 255

        // Calculate contributions from the four corners
        let n0 = 0, n1 = 0, n2 = 0, n3 = 0

        // Corner 0
        let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0
        if (t0 >= 0) {
            const gi0 = perm[ii + perm[jj + perm[kk]]] % 12
            t0 *= t0
            n0 = t0 * t0 * (GRAD_3D[gi0][0] * x0 + GRAD_3D[gi0][1] * y0 + GRAD_3D[gi0][2] * z0)
        }

        // Corner 1
        let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1
        if (t1 >= 0) {
            const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12
            t1 *= t1
            n1 = t1 * t1 * (GRAD_3D[gi1][0] * x1 + GRAD_3D[gi1][1] * y1 + GRAD_3D[gi1][2] * z1)
        }

        // Corner 2
        let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2
        if (t2 >= 0) {
            const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12
            t2 *= t2
            n2 = t2 * t2 * (GRAD_3D[gi2][0] * x2 + GRAD_3D[gi2][1] * y2 + GRAD_3D[gi2][2] * z2)
        }

        // Corner 3
        let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3
        if (t3 >= 0) {
            const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12
            t3 *= t3
            n3 = t3 * t3 * (GRAD_3D[gi3][0] * x3 + GRAD_3D[gi3][1] * y3 + GRAD_3D[gi3][2] * z3)
        }

        // Scale to [-1, 1]
        return 32 * (n0 + n1 + n2 + n3)
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
            value += Math.abs(baseFn(x * frequency, y * frequency)) * amplitude
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
            value += Math.abs(baseFn(x * frequency, y * frequency, z * frequency)) * amplitude
            maxValue += amplitude
            amplitude *= persistence
            frequency *= lacunarity
        }

        return value / maxValue
    }
}

// =============================================================================
// NoiseSource Implementations
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
 * Create a 2D Simplex noise source.
 *
 * Simplex noise is faster than Perlin noise and has fewer directional artifacts.
 *
 * @param config - Noise configuration
 * @returns A NoiseSource2D that produces values in [-1, 1]
 *
 * @example
 * ```typescript
 * const simplex = simplex2D({ seed: 42, frequency: 0.1 })
 * const value = simplex.sample(x, y)
 *
 * // With FBM for clouds
 * const clouds = simplex2D().fbm({ octaves: 5, persistence: 0.6 })
 * const density = clouds.sample(x, y)
 * ```
 */
export function simplex2D(config: NoiseConfig = {}): NoiseSource2D {
    const seed = config.seed ?? 0
    const frequency = config.frequency ?? 1.0
    const perm = generatePermutation(seed)
    const fn = createSimplex2D(perm, frequency)
    return wrapSource2D(fn)
}

/**
 * Create a 3D Simplex noise source.
 *
 * @param config - Noise configuration
 * @returns A NoiseSource3D that produces values in [-1, 1]
 *
 * @example
 * ```typescript
 * const simplex = simplex3D({ seed: 42 })
 * const value = simplex.sample(x, y, z)
 *
 * // Animated clouds using z as time
 * const animated = simplex3D({ frequency: 0.05 }).fbm({ octaves: 4 })
 * const density = animated.sample(x, y, time * 0.1)
 * ```
 */
export function simplex3D(config: NoiseConfig = {}): NoiseSource3D {
    const seed = config.seed ?? 0
    const frequency = config.frequency ?? 1.0
    const perm = generatePermutation(seed)
    const fn = createSimplex3D(perm, frequency)
    return wrapSource3D(fn)
}
