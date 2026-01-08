/**
 * Perlin noise implementation.
 *
 * Classic gradient noise algorithm by Ken Perlin. Produces smooth,
 * natural-looking noise with values in the range [-1, 1].
 *
 * @module onejs-unity/proc/noise
 */

import type { NoiseConfig, NoiseSource2D, NoiseSource3D, FBMConfig } from "../types"

// =============================================================================
// Constants
// =============================================================================

// Permutation table (doubled to avoid index wrapping)
const PERM_SIZE = 256

// Gradient vectors for 2D (8 directions)
const GRAD_2D = [
    [1, 1], [-1, 1], [1, -1], [-1, -1],
    [1, 0], [-1, 0], [0, 1], [0, -1]
] as const

// Gradient vectors for 3D (12 directions)
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
    const perm = new Uint8Array(PERM_SIZE * 2)
    const rand = mulberry32(seed)

    // Initialize with identity
    for (let i = 0; i < PERM_SIZE; i++) {
        perm[i] = i
    }

    // Fisher-Yates shuffle
    for (let i = PERM_SIZE - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        const tmp = perm[i]
        perm[i] = perm[j]
        perm[j] = tmp
    }

    // Double the permutation to avoid wrapping
    for (let i = 0; i < PERM_SIZE; i++) {
        perm[i + PERM_SIZE] = perm[i]
    }

    return perm
}

/**
 * Improved smoothstep (quintic curve): 6t^5 - 15t^4 + 10t^3
 * Has zero first and second derivatives at t=0 and t=1.
 */
function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * Linear interpolation.
 */
function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a)
}

/**
 * Dot product for 2D gradient.
 */
function dot2(gx: number, gy: number, x: number, y: number): number {
    return gx * x + gy * y
}

/**
 * Dot product for 3D gradient.
 */
function dot3(gx: number, gy: number, gz: number, x: number, y: number, z: number): number {
    return gx * x + gy * y + gz * z
}

// =============================================================================
// Perlin Noise Implementation
// =============================================================================

/**
 * Create a 2D Perlin noise function.
 */
function createPerlin2D(perm: Uint8Array, frequency: number): (x: number, y: number) => number {
    return (x: number, y: number): number => {
        x *= frequency
        y *= frequency

        // Grid cell coordinates
        const xi = Math.floor(x) & 255
        const yi = Math.floor(y) & 255

        // Relative position within cell
        const xf = x - Math.floor(x)
        const yf = y - Math.floor(y)

        // Fade curves for interpolation
        const u = fade(xf)
        const v = fade(yf)

        // Hash coordinates of the 4 corners
        const aa = perm[perm[xi] + yi]
        const ab = perm[perm[xi] + yi + 1]
        const ba = perm[perm[xi + 1] + yi]
        const bb = perm[perm[xi + 1] + yi + 1]

        // Gradient indices (mod 8 for 2D gradients)
        const g00 = GRAD_2D[aa & 7]
        const g01 = GRAD_2D[ab & 7]
        const g10 = GRAD_2D[ba & 7]
        const g11 = GRAD_2D[bb & 7]

        // Dot products with distance vectors
        const n00 = dot2(g00[0], g00[1], xf, yf)
        const n01 = dot2(g01[0], g01[1], xf, yf - 1)
        const n10 = dot2(g10[0], g10[1], xf - 1, yf)
        const n11 = dot2(g11[0], g11[1], xf - 1, yf - 1)

        // Bilinear interpolation
        const nx0 = lerp(n00, n10, u)
        const nx1 = lerp(n01, n11, u)

        return lerp(nx0, nx1, v)
    }
}

/**
 * Create a 3D Perlin noise function.
 */
function createPerlin3D(perm: Uint8Array, frequency: number): (x: number, y: number, z: number) => number {
    return (x: number, y: number, z: number): number => {
        x *= frequency
        y *= frequency
        z *= frequency

        // Grid cell coordinates
        const xi = Math.floor(x) & 255
        const yi = Math.floor(y) & 255
        const zi = Math.floor(z) & 255

        // Relative position within cell
        const xf = x - Math.floor(x)
        const yf = y - Math.floor(y)
        const zf = z - Math.floor(z)

        // Fade curves
        const u = fade(xf)
        const v = fade(yf)
        const w = fade(zf)

        // Hash coordinates of the 8 corners
        const aaa = perm[perm[perm[xi] + yi] + zi]
        const aab = perm[perm[perm[xi] + yi] + zi + 1]
        const aba = perm[perm[perm[xi] + yi + 1] + zi]
        const abb = perm[perm[perm[xi] + yi + 1] + zi + 1]
        const baa = perm[perm[perm[xi + 1] + yi] + zi]
        const bab = perm[perm[perm[xi + 1] + yi] + zi + 1]
        const bba = perm[perm[perm[xi + 1] + yi + 1] + zi]
        const bbb = perm[perm[perm[xi + 1] + yi + 1] + zi + 1]

        // Gradient indices (mod 12 for 3D gradients)
        const g000 = GRAD_3D[aaa % 12]
        const g001 = GRAD_3D[aab % 12]
        const g010 = GRAD_3D[aba % 12]
        const g011 = GRAD_3D[abb % 12]
        const g100 = GRAD_3D[baa % 12]
        const g101 = GRAD_3D[bab % 12]
        const g110 = GRAD_3D[bba % 12]
        const g111 = GRAD_3D[bbb % 12]

        // Dot products with distance vectors
        const n000 = dot3(g000[0], g000[1], g000[2], xf, yf, zf)
        const n001 = dot3(g001[0], g001[1], g001[2], xf, yf, zf - 1)
        const n010 = dot3(g010[0], g010[1], g010[2], xf, yf - 1, zf)
        const n011 = dot3(g011[0], g011[1], g011[2], xf, yf - 1, zf - 1)
        const n100 = dot3(g100[0], g100[1], g100[2], xf - 1, yf, zf)
        const n101 = dot3(g101[0], g101[1], g101[2], xf - 1, yf, zf - 1)
        const n110 = dot3(g110[0], g110[1], g110[2], xf - 1, yf - 1, zf)
        const n111 = dot3(g111[0], g111[1], g111[2], xf - 1, yf - 1, zf - 1)

        // Trilinear interpolation
        const nx00 = lerp(n000, n100, u)
        const nx01 = lerp(n001, n101, u)
        const nx10 = lerp(n010, n110, u)
        const nx11 = lerp(n011, n111, u)

        const nxy0 = lerp(nx00, nx10, v)
        const nxy1 = lerp(nx01, nx11, v)

        return lerp(nxy0, nxy1, w)
    }
}

// =============================================================================
// NoiseSource Implementations
// =============================================================================

/**
 * Creates FBM wrapper for 2D noise.
 */
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

/**
 * Creates turbulence wrapper for 2D noise.
 */
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

/**
 * Creates FBM wrapper for 3D noise.
 */
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

/**
 * Creates turbulence wrapper for 3D noise.
 */
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

/**
 * NoiseSource2D implementation for Perlin noise.
 */
class PerlinNoiseSource2D implements NoiseSource2D {
    private _fn: (x: number, y: number) => number
    private _perm: Uint8Array

    constructor(perm: Uint8Array, frequency: number) {
        this._perm = perm
        this._fn = createPerlin2D(perm, frequency)
    }

    sample(x: number, y: number): number {
        return this._fn(x, y)
    }

    fbm(config: FBMConfig = {}): NoiseSource2D {
        const fbmFn = createFBM2D(this._fn, config)
        return {
            sample: fbmFn,
            fbm: (c) => {
                const nested = createFBM2D(fbmFn, c ?? {})
                return this._wrapSource2D(nested)
            },
            turbulence: (c) => {
                const turb = createTurbulence2D(fbmFn, c ?? {})
                return this._wrapSource2D(turb)
            }
        }
    }

    turbulence(config: FBMConfig = {}): NoiseSource2D {
        const turbFn = createTurbulence2D(this._fn, config)
        return {
            sample: turbFn,
            fbm: (c) => {
                const nested = createFBM2D(turbFn, c ?? {})
                return this._wrapSource2D(nested)
            },
            turbulence: (c) => {
                const nested = createTurbulence2D(turbFn, c ?? {})
                return this._wrapSource2D(nested)
            }
        }
    }

    private _wrapSource2D(fn: (x: number, y: number) => number): NoiseSource2D {
        return {
            sample: fn,
            fbm: (c) => {
                const nested = createFBM2D(fn, c ?? {})
                return this._wrapSource2D(nested)
            },
            turbulence: (c) => {
                const turb = createTurbulence2D(fn, c ?? {})
                return this._wrapSource2D(turb)
            }
        }
    }
}

/**
 * NoiseSource3D implementation for Perlin noise.
 */
class PerlinNoiseSource3D implements NoiseSource3D {
    private _fn: (x: number, y: number, z: number) => number
    private _perm: Uint8Array

    constructor(perm: Uint8Array, frequency: number) {
        this._perm = perm
        this._fn = createPerlin3D(perm, frequency)
    }

    sample(x: number, y: number, z: number): number {
        return this._fn(x, y, z)
    }

    fbm(config: FBMConfig = {}): NoiseSource3D {
        const fbmFn = createFBM3D(this._fn, config)
        return {
            sample: fbmFn,
            fbm: (c) => {
                const nested = createFBM3D(fbmFn, c ?? {})
                return this._wrapSource3D(nested)
            },
            turbulence: (c) => {
                const turb = createTurbulence3D(fbmFn, c ?? {})
                return this._wrapSource3D(turb)
            }
        }
    }

    turbulence(config: FBMConfig = {}): NoiseSource3D {
        const turbFn = createTurbulence3D(this._fn, config)
        return {
            sample: turbFn,
            fbm: (c) => {
                const nested = createFBM3D(turbFn, c ?? {})
                return this._wrapSource3D(nested)
            },
            turbulence: (c) => {
                const nested = createTurbulence3D(turbFn, c ?? {})
                return this._wrapSource3D(nested)
            }
        }
    }

    private _wrapSource3D(fn: (x: number, y: number, z: number) => number): NoiseSource3D {
        return {
            sample: fn,
            fbm: (c) => {
                const nested = createFBM3D(fn, c ?? {})
                return this._wrapSource3D(nested)
            },
            turbulence: (c) => {
                const turb = createTurbulence3D(fn, c ?? {})
                return this._wrapSource3D(turb)
            }
        }
    }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a 2D Perlin noise source.
 *
 * @param config - Noise configuration
 * @returns A NoiseSource2D that produces values in [-1, 1]
 *
 * @example
 * ```typescript
 * const perlin = perlin2D({ seed: 42, frequency: 0.1 })
 * const value = perlin.sample(x, y)
 *
 * // With FBM for terrain-like noise
 * const terrain = perlin2D().fbm({ octaves: 6 })
 * const height = terrain.sample(x, y)
 * ```
 */
export function perlin2D(config: NoiseConfig = {}): NoiseSource2D {
    const seed = config.seed ?? 0
    const frequency = config.frequency ?? 1.0
    const perm = generatePermutation(seed)
    return new PerlinNoiseSource2D(perm, frequency)
}

/**
 * Create a 3D Perlin noise source.
 *
 * @param config - Noise configuration
 * @returns A NoiseSource3D that produces values in [-1, 1]
 *
 * @example
 * ```typescript
 * const perlin = perlin3D({ seed: 42 })
 * const value = perlin.sample(x, y, z)
 *
 * // Animated noise using z as time
 * const animated = perlin3D({ frequency: 0.1 })
 * const value = animated.sample(x, y, time)
 * ```
 */
export function perlin3D(config: NoiseConfig = {}): NoiseSource3D {
    const seed = config.seed ?? 0
    const frequency = config.frequency ?? 1.0
    const perm = generatePermutation(seed)
    return new PerlinNoiseSource3D(perm, frequency)
}
