/**
 * Worley (Cellular/Voronoi) noise implementation.
 *
 * Produces cell-like patterns based on distance to randomly distributed
 * feature points. Useful for organic textures like stone, cells, caustics.
 *
 * Output range depends on configuration but is typically [0, ~1].
 *
 * @module onejs-unity/proc/noise
 */

import type { NoiseSource2D, NoiseSource3D, FBMConfig, WorleyConfig } from "../types"

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
 * Hash function for cell coordinates.
 */
function hash2D(x: number, y: number, seed: number): number {
    let n = x * 374761393 + y * 668265263 + seed * 1013904223
    n = (n ^ (n >> 13)) * 1274126177
    return n ^ (n >> 16)
}

/**
 * Hash function for 3D cell coordinates.
 */
function hash3D(x: number, y: number, z: number, seed: number): number {
    let n = x * 374761393 + y * 668265263 + z * 1013904223 + seed * 1376312589
    n = (n ^ (n >> 13)) * 1274126177
    return n ^ (n >> 16)
}

/**
 * Get pseudo-random point within a 2D cell.
 */
function cellPoint2D(cellX: number, cellY: number, seed: number): [number, number] {
    const h = hash2D(cellX, cellY, seed)
    const rand = mulberry32(h)
    return [cellX + rand(), cellY + rand()]
}

/**
 * Get pseudo-random point within a 3D cell.
 */
function cellPoint3D(cellX: number, cellY: number, cellZ: number, seed: number): [number, number, number] {
    const h = hash3D(cellX, cellY, cellZ, seed)
    const rand = mulberry32(h)
    return [cellX + rand(), cellY + rand(), cellZ + rand()]
}

// =============================================================================
// Distance Functions
// =============================================================================

type DistanceFn2D = (dx: number, dy: number) => number
type DistanceFn3D = (dx: number, dy: number, dz: number) => number

function euclidean2D(dx: number, dy: number): number {
    return Math.sqrt(dx * dx + dy * dy)
}

function euclidean3D(dx: number, dy: number, dz: number): number {
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function manhattan2D(dx: number, dy: number): number {
    return Math.abs(dx) + Math.abs(dy)
}

function manhattan3D(dx: number, dy: number, dz: number): number {
    return Math.abs(dx) + Math.abs(dy) + Math.abs(dz)
}

function chebyshev2D(dx: number, dy: number): number {
    return Math.max(Math.abs(dx), Math.abs(dy))
}

function chebyshev3D(dx: number, dy: number, dz: number): number {
    return Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
}

function getDistanceFn2D(type: string): DistanceFn2D {
    switch (type) {
        case "manhattan": return manhattan2D
        case "chebyshev": return chebyshev2D
        default: return euclidean2D
    }
}

function getDistanceFn3D(type: string): DistanceFn3D {
    switch (type) {
        case "manhattan": return manhattan3D
        case "chebyshev": return chebyshev3D
        default: return euclidean3D
    }
}

// =============================================================================
// Worley Noise Implementation
// =============================================================================

/**
 * Create a 2D Worley noise function.
 */
function createWorley2D(
    seed: number,
    frequency: number,
    distanceFn: DistanceFn2D,
    returnType: "f1" | "f2" | "f2-f1"
): (x: number, y: number) => number {
    return (x: number, y: number): number => {
        x *= frequency
        y *= frequency

        const cellX = Math.floor(x)
        const cellY = Math.floor(y)

        let f1 = Infinity  // Closest distance
        let f2 = Infinity  // Second closest distance

        // Check 3x3 neighborhood of cells
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const ncx = cellX + i
                const ncy = cellY + j

                const [px, py] = cellPoint2D(ncx, ncy, seed)
                const dist = distanceFn(x - px, y - py)

                if (dist < f1) {
                    f2 = f1
                    f1 = dist
                } else if (dist < f2) {
                    f2 = dist
                }
            }
        }

        switch (returnType) {
            case "f1": return f1
            case "f2": return f2
            case "f2-f1": return f2 - f1
        }
    }
}

/**
 * Create a 3D Worley noise function.
 */
function createWorley3D(
    seed: number,
    frequency: number,
    distanceFn: DistanceFn3D,
    returnType: "f1" | "f2" | "f2-f1"
): (x: number, y: number, z: number) => number {
    return (x: number, y: number, z: number): number => {
        x *= frequency
        y *= frequency
        z *= frequency

        const cellX = Math.floor(x)
        const cellY = Math.floor(y)
        const cellZ = Math.floor(z)

        let f1 = Infinity
        let f2 = Infinity

        // Check 3x3x3 neighborhood
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                for (let k = -1; k <= 1; k++) {
                    const ncx = cellX + i
                    const ncy = cellY + j
                    const ncz = cellZ + k

                    const [px, py, pz] = cellPoint3D(ncx, ncy, ncz, seed)
                    const dist = distanceFn(x - px, y - py, z - pz)

                    if (dist < f1) {
                        f2 = f1
                        f1 = dist
                    } else if (dist < f2) {
                        f2 = dist
                    }
                }
            }
        }

        switch (returnType) {
            case "f1": return f1
            case "f2": return f2
            case "f2-f1": return f2 - f1
        }
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
            // Worley is already positive, use it directly
            value += baseFn(x * frequency, y * frequency) * amplitude
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
            value += baseFn(x * frequency, y * frequency, z * frequency) * amplitude
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
 * Create a 2D Worley (Cellular/Voronoi) noise source.
 *
 * Worley noise creates cell-like patterns based on distance to randomly
 * distributed feature points. Great for organic textures.
 *
 * @param config - Worley noise configuration
 * @returns A NoiseSource2D that produces distance-based values
 *
 * @example
 * ```typescript
 * // Basic cellular pattern
 * const cells = worley2D({ frequency: 5 })
 * const dist = cells.sample(x, y)
 *
 * // Stone-like texture (f2 - f1 creates edges)
 * const stone = worley2D({
 *     frequency: 3,
 *     returnType: "f2-f1"
 * })
 *
 * // Manhattan distance for angular cells
 * const angular = worley2D({
 *     frequency: 4,
 *     distance: "manhattan"
 * })
 * ```
 */
export function worley2D(config: WorleyConfig = {}): NoiseSource2D {
    const seed = config.seed ?? 0
    const frequency = config.frequency ?? 1.0
    const distance = config.distance ?? "euclidean"
    const returnType = config.returnType ?? "f1"

    const distanceFn = getDistanceFn2D(distance)
    const fn = createWorley2D(seed, frequency, distanceFn, returnType)
    return wrapSource2D(fn)
}

/**
 * Create a 3D Worley (Cellular/Voronoi) noise source.
 *
 * @param config - Worley noise configuration
 * @returns A NoiseSource3D that produces distance-based values
 *
 * @example
 * ```typescript
 * const cells = worley3D({ frequency: 3, seed: 42 })
 * const dist = cells.sample(x, y, z)
 *
 * // Animated cells using z as time
 * const animated = worley3D({ frequency: 2 })
 * const dist = animated.sample(x, y, time * 0.5)
 * ```
 */
export function worley3D(config: WorleyConfig = {}): NoiseSource3D {
    const seed = config.seed ?? 0
    const frequency = config.frequency ?? 1.0
    const distance = config.distance ?? "euclidean"
    const returnType = config.returnType ?? "f1"

    const distanceFn = getDistanceFn3D(distance)
    const fn = createWorley3D(seed, frequency, distanceFn, returnType)
    return wrapSource3D(fn)
}
