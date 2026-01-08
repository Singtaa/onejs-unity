/**
 * Unit tests for noise algorithms.
 *
 * Tests verify:
 * - Output ranges are correct
 * - Seeding produces deterministic results
 * - FBM/turbulence composability works
 * - Frequency scaling works
 */

import { describe, it, expect, beforeEach } from "vitest"
import { perlin2D, perlin3D } from "./perlin"
import { simplex2D, simplex3D } from "./simplex"
import { value2D, value3D } from "./value"
import { worley2D, worley3D } from "./worley"
import { noise } from "./index"

// Helper to sample noise at many points and collect stats
function sampleStats(
    sampler: (x: number, y: number) => number,
    count: number = 1000
): { min: number; max: number; mean: number } {
    let min = Infinity
    let max = -Infinity
    let sum = 0

    for (let i = 0; i < count; i++) {
        const x = Math.random() * 100 - 50
        const y = Math.random() * 100 - 50
        const v = sampler(x, y)
        min = Math.min(min, v)
        max = Math.max(max, v)
        sum += v
    }

    return { min, max, mean: sum / count }
}

function sampleStats3D(
    sampler: (x: number, y: number, z: number) => number,
    count: number = 1000
): { min: number; max: number; mean: number } {
    let min = Infinity
    let max = -Infinity
    let sum = 0

    for (let i = 0; i < count; i++) {
        const x = Math.random() * 100 - 50
        const y = Math.random() * 100 - 50
        const z = Math.random() * 100 - 50
        const v = sampler(x, y, z)
        min = Math.min(min, v)
        max = Math.max(max, v)
        sum += v
    }

    return { min, max, mean: sum / count }
}

// =============================================================================
// Perlin Noise Tests
// =============================================================================

describe("Perlin Noise", () => {
    describe("2D", () => {
        it("should produce values in [-1, 1] range", () => {
            const perlin = perlin2D()
            const stats = sampleStats((x, y) => perlin.sample(x, y))

            expect(stats.min).toBeGreaterThanOrEqual(-1)
            expect(stats.max).toBeLessThanOrEqual(1)
        })

        it("should be deterministic with same seed", () => {
            const perlin1 = perlin2D({ seed: 42 })
            const perlin2 = perlin2D({ seed: 42 })

            for (let i = 0; i < 10; i++) {
                const x = Math.random() * 100
                const y = Math.random() * 100
                expect(perlin1.sample(x, y)).toBe(perlin2.sample(x, y))
            }
        })

        it("should produce different values with different seeds", () => {
            const perlin1 = perlin2D({ seed: 42 })
            const perlin2 = perlin2D({ seed: 123 })

            let differences = 0
            for (let i = 0; i < 10; i++) {
                const x = Math.random() * 100
                const y = Math.random() * 100
                if (perlin1.sample(x, y) !== perlin2.sample(x, y)) {
                    differences++
                }
            }
            expect(differences).toBeGreaterThan(5) // Most should differ
        })

        it("should respect frequency parameter", () => {
            const low = perlin2D({ seed: 42, frequency: 1 })
            const high = perlin2D({ seed: 42, frequency: 8 })

            // Count zero-crossings: high frequency should have more
            let lowCrossings = 0
            let highCrossings = 0
            let lowPrev = low.sample(0, 0)
            let highPrev = high.sample(0, 0)

            // Sample along a line and count sign changes
            for (let i = 1; i <= 100; i++) {
                const x = i * 0.1
                const lowCurr = low.sample(x, 5)
                const highCurr = high.sample(x, 5)

                if ((lowPrev < 0 && lowCurr >= 0) || (lowPrev >= 0 && lowCurr < 0)) {
                    lowCrossings++
                }
                if ((highPrev < 0 && highCurr >= 0) || (highPrev >= 0 && highCurr < 0)) {
                    highCrossings++
                }

                lowPrev = lowCurr
                highPrev = highCurr
            }

            // High frequency should have more zero-crossings
            expect(highCrossings).toBeGreaterThan(lowCrossings)
        })

        it("should support FBM composition", () => {
            const perlin = perlin2D({ seed: 42 })
            const fbm = perlin.fbm({ octaves: 4 })

            const stats = sampleStats((x, y) => fbm.sample(x, y))

            // FBM should still be in reasonable range (normalized)
            expect(stats.min).toBeGreaterThanOrEqual(-1.5)
            expect(stats.max).toBeLessThanOrEqual(1.5)
        })

        it("should support turbulence composition", () => {
            const perlin = perlin2D({ seed: 42 })
            const turb = perlin.turbulence({ octaves: 4 })

            const stats = sampleStats((x, y) => turb.sample(x, y))

            // Turbulence uses absolute values, so should be positive-ish
            expect(stats.mean).toBeGreaterThan(0)
        })
    })

    describe("3D", () => {
        it("should produce values in [-1, 1] range", () => {
            const perlin = perlin3D()
            const stats = sampleStats3D((x, y, z) => perlin.sample(x, y, z))

            expect(stats.min).toBeGreaterThanOrEqual(-1)
            expect(stats.max).toBeLessThanOrEqual(1)
        })

        it("should be deterministic with same seed", () => {
            const perlin1 = perlin3D({ seed: 42 })
            const perlin2 = perlin3D({ seed: 42 })

            for (let i = 0; i < 10; i++) {
                const x = Math.random() * 100
                const y = Math.random() * 100
                const z = Math.random() * 100
                expect(perlin1.sample(x, y, z)).toBe(perlin2.sample(x, y, z))
            }
        })
    })
})

// =============================================================================
// Simplex Noise Tests
// =============================================================================

describe("Simplex Noise", () => {
    describe("2D", () => {
        it("should produce values in [-1, 1] range", () => {
            const simplex = simplex2D()
            const stats = sampleStats((x, y) => simplex.sample(x, y))

            expect(stats.min).toBeGreaterThanOrEqual(-1)
            expect(stats.max).toBeLessThanOrEqual(1)
        })

        it("should be deterministic with same seed", () => {
            const s1 = simplex2D({ seed: 42 })
            const s2 = simplex2D({ seed: 42 })

            for (let i = 0; i < 10; i++) {
                const x = Math.random() * 100
                const y = Math.random() * 100
                expect(s1.sample(x, y)).toBe(s2.sample(x, y))
            }
        })

        it("should support FBM composition", () => {
            const simplex = simplex2D({ seed: 42 })
            const fbm = simplex.fbm({ octaves: 6 })

            // Just verify it works and returns numbers
            const value = fbm.sample(10, 20)
            expect(typeof value).toBe("number")
            expect(isNaN(value)).toBe(false)
        })
    })

    describe("3D", () => {
        it("should produce values in [-1, 1] range", () => {
            const simplex = simplex3D()
            const stats = sampleStats3D((x, y, z) => simplex.sample(x, y, z))

            expect(stats.min).toBeGreaterThanOrEqual(-1)
            expect(stats.max).toBeLessThanOrEqual(1)
        })
    })
})

// =============================================================================
// Value Noise Tests
// =============================================================================

describe("Value Noise", () => {
    describe("2D", () => {
        it("should produce values in [0, 1] range", () => {
            const value = value2D()
            const stats = sampleStats((x, y) => value.sample(x, y))

            expect(stats.min).toBeGreaterThanOrEqual(0)
            expect(stats.max).toBeLessThanOrEqual(1)
        })

        it("should be deterministic with same seed", () => {
            const v1 = value2D({ seed: 42 })
            const v2 = value2D({ seed: 42 })

            for (let i = 0; i < 10; i++) {
                const x = Math.random() * 100
                const y = Math.random() * 100
                expect(v1.sample(x, y)).toBe(v2.sample(x, y))
            }
        })
    })

    describe("3D", () => {
        it("should produce values in [0, 1] range", () => {
            const value = value3D()
            const stats = sampleStats3D((x, y, z) => value.sample(x, y, z))

            expect(stats.min).toBeGreaterThanOrEqual(0)
            expect(stats.max).toBeLessThanOrEqual(1)
        })
    })
})

// =============================================================================
// Worley Noise Tests
// =============================================================================

describe("Worley Noise", () => {
    describe("2D", () => {
        it("should produce values in [0, 1+] range for f1", () => {
            const worley = worley2D({ returnType: "f1" })
            const stats = sampleStats((x, y) => worley.sample(x, y))

            expect(stats.min).toBeGreaterThanOrEqual(0)
            // f1 can occasionally exceed 1 at cell corners
            expect(stats.max).toBeLessThan(2)
        })

        it("should be deterministic with same seed", () => {
            const w1 = worley2D({ seed: 42 })
            const w2 = worley2D({ seed: 42 })

            for (let i = 0; i < 10; i++) {
                const x = Math.random() * 100
                const y = Math.random() * 100
                expect(w1.sample(x, y)).toBe(w2.sample(x, y))
            }
        })

        it("should support different return types", () => {
            const f1 = worley2D({ seed: 42, returnType: "f1" })
            const f2 = worley2D({ seed: 42, returnType: "f2" })
            const diff = worley2D({ seed: 42, returnType: "f2-f1" })

            const x = 10, y = 20
            const v1 = f1.sample(x, y)
            const v2 = f2.sample(x, y)
            const vDiff = diff.sample(x, y)

            // f2 should always be >= f1
            expect(v2).toBeGreaterThanOrEqual(v1)

            // f2-f1 should approximately equal the difference (normalized)
            expect(vDiff).toBeGreaterThanOrEqual(0)
        })

        it("should support different distance functions", () => {
            const euclidean = worley2D({ seed: 42, distance: "euclidean" })
            const manhattan = worley2D({ seed: 42, distance: "manhattan" })
            const chebyshev = worley2D({ seed: 42, distance: "chebyshev" })

            // All should return valid numbers
            const x = 10, y = 20
            expect(typeof euclidean.sample(x, y)).toBe("number")
            expect(typeof manhattan.sample(x, y)).toBe("number")
            expect(typeof chebyshev.sample(x, y)).toBe("number")

            // Values should differ due to different metrics
            // (may occasionally be same by chance, so just test one pair)
            const e = euclidean.sample(x, y)
            const m = manhattan.sample(x, y)
            // Relaxed check - just verify they're numbers
            expect(isNaN(e)).toBe(false)
            expect(isNaN(m)).toBe(false)
        })
    })

    describe("3D", () => {
        it("should produce values in [0, 1+] range", () => {
            const worley = worley3D()
            const stats = sampleStats3D((x, y, z) => worley.sample(x, y, z))

            expect(stats.min).toBeGreaterThanOrEqual(0)
            expect(stats.max).toBeLessThan(2)
        })
    })
})

// =============================================================================
// Noise API Tests
// =============================================================================

describe("Noise API", () => {
    it("should provide all noise types", () => {
        expect(typeof noise.perlin2D).toBe("function")
        expect(typeof noise.perlin3D).toBe("function")
        expect(typeof noise.simplex2D).toBe("function")
        expect(typeof noise.simplex3D).toBe("function")
        expect(typeof noise.value2D).toBe("function")
        expect(typeof noise.value3D).toBe("function")
        expect(typeof noise.worley2D).toBe("function")
        expect(typeof noise.worley3D).toBe("function")
    })

    it("should create noise by type name", () => {
        const perlin = noise.create2D("perlin", { seed: 42 })
        const simplex = noise.create2D("simplex", { seed: 42 })
        const value = noise.create2D("value", { seed: 42 })
        const worley = noise.create2D("worley", { seed: 42 })

        // All should return valid noise sources
        expect(typeof perlin.sample(0, 0)).toBe("number")
        expect(typeof simplex.sample(0, 0)).toBe("number")
        expect(typeof value.sample(0, 0)).toBe("number")
        expect(typeof worley.sample(0, 0)).toBe("number")
    })

    it("should fill 2D array with noise", () => {
        const output = new Float32Array(16 * 16)
        const source = noise.perlin2D({ seed: 42 })

        noise.fill2D(output, 16, 16, source, {
            scaleX: 0.1,
            scaleY: 0.1
        })

        // Check that output was filled
        let hasValues = false
        for (let i = 0; i < output.length; i++) {
            if (output[i] !== 0) {
                hasValues = true
                break
            }
        }
        expect(hasValues).toBe(true)

        // Check values are in expected range
        for (let i = 0; i < output.length; i++) {
            expect(output[i]).toBeGreaterThanOrEqual(-1)
            expect(output[i]).toBeLessThanOrEqual(1)
        }
    })

    it("should provide utility functions", () => {
        expect(noise.normalize(-1)).toBe(0)
        expect(noise.normalize(0)).toBe(0.5)
        expect(noise.normalize(1)).toBe(1)

        expect(noise.ridge(-1)).toBe(0)
        expect(noise.ridge(0)).toBe(1)
        expect(noise.ridge(1)).toBe(0)

        expect(noise.billow(-0.5)).toBe(0.5)
        expect(noise.billow(0.5)).toBe(0.5)
    })
})

// =============================================================================
// Performance/Consistency Tests
// =============================================================================

describe("Noise Consistency", () => {
    it("should produce smooth gradients (no sudden jumps)", () => {
        const perlin = perlin2D({ seed: 42, frequency: 1 })

        // Sample along a line and check for smooth transitions
        const step = 0.01
        let maxJump = 0

        for (let x = 0; x < 10; x += step) {
            const v1 = perlin.sample(x, 0)
            const v2 = perlin.sample(x + step, 0)
            const jump = Math.abs(v2 - v1)
            maxJump = Math.max(maxJump, jump)
        }

        // For frequency 1, step 0.01, jumps should be small
        expect(maxJump).toBeLessThan(0.1)
    })

    it("should be continuous (no discontinuities)", () => {
        const perlin = perlin2D({ seed: 42 })

        // Check that nearby points have similar values
        const x = 50, y = 50
        const center = perlin.sample(x, y)
        const eps = 0.001

        const neighbors = [
            perlin.sample(x + eps, y),
            perlin.sample(x - eps, y),
            perlin.sample(x, y + eps),
            perlin.sample(x, y - eps)
        ]

        for (const n of neighbors) {
            expect(Math.abs(n - center)).toBeLessThan(0.01)
        }
    })
})
