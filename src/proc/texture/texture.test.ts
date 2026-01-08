/**
 * Unit tests for texture generators.
 *
 * Tests verify:
 * - Output dimensions are correct
 * - RGBA format is valid
 * - Color maps work correctly
 * - Patterns produce expected characteristics
 */

import { describe, it, expect } from "vitest"
import {
    generateNoise,
    generateVoronoi,
    generateMarble,
    generateWood,
    generateCheckerboard,
    generateGradient,
    colorMaps
} from "./generators"

// Helper to verify RGBA data format
function verifyRGBAData(data: Uint8ClampedArray, width: number, height: number): void {
    expect(data.length).toBe(width * height * 4)

    // All values should be 0-255
    for (let i = 0; i < data.length; i++) {
        expect(data[i]).toBeGreaterThanOrEqual(0)
        expect(data[i]).toBeLessThanOrEqual(255)
    }
}

// Helper to get pixel at (x, y)
function getPixel(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number, number] {
    const idx = (y * width + x) * 4
    return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]]
}

// =============================================================================
// Color Map Tests
// =============================================================================

describe("Color Maps", () => {
    it("grayscale should return black at 0 and white at 1", () => {
        expect(colorMaps.grayscale(0)).toEqual([0, 0, 0, 1])
        expect(colorMaps.grayscale(1)).toEqual([1, 1, 1, 1])
        expect(colorMaps.grayscale(0.5)).toEqual([0.5, 0.5, 0.5, 1])
    })

    it("heat should return blue at 0 and red at 1", () => {
        const blue = colorMaps.heat(0)
        const red = colorMaps.heat(1)

        expect(blue[2]).toBeGreaterThan(blue[0]) // More blue
        expect(red[0]).toBeGreaterThan(red[2]) // More red
    })

    it("terrain should return water color at low values", () => {
        const water = colorMaps.terrain(0.1)
        expect(water[2]).toBeGreaterThan(water[0]) // Blue-ish
    })

    it("colorMaps should handle edge cases", () => {
        // Values outside [0,1] should be clamped
        expect(colorMaps.grayscale(-0.5)).toEqual([0, 0, 0, 1])
        expect(colorMaps.grayscale(1.5)).toEqual([1, 1, 1, 1])
    })
})

// =============================================================================
// Noise Texture Tests
// =============================================================================

describe("generateNoise", () => {
    it("should generate correct dimensions", () => {
        const data = generateNoise({ width: 64, height: 32 })
        verifyRGBAData(data, 64, 32)
    })

    it("should be deterministic with same seed", () => {
        const data1 = generateNoise({ width: 32, height: 32, seed: 42 })
        const data2 = generateNoise({ width: 32, height: 32, seed: 42 })

        for (let i = 0; i < data1.length; i++) {
            expect(data1[i]).toBe(data2[i])
        }
    })

    it("should produce different results with different seeds", () => {
        const data1 = generateNoise({ width: 32, height: 32, seed: 42 })
        const data2 = generateNoise({ width: 32, height: 32, seed: 123 })

        let differences = 0
        for (let i = 0; i < data1.length; i++) {
            if (data1[i] !== data2[i]) differences++
        }
        expect(differences).toBeGreaterThan(0)
    })

    it("should apply custom color map", () => {
        const redMap = (_v: number): [number, number, number, number] => [1, 0, 0, 1]
        const data = generateNoise({
            width: 8,
            height: 8,
            colorMap: redMap
        })

        // All pixels should be red (255, 0, 0, 255)
        for (let i = 0; i < data.length; i += 4) {
            expect(data[i]).toBe(255) // R
            expect(data[i + 1]).toBe(0) // G
            expect(data[i + 2]).toBe(0) // B
            expect(data[i + 3]).toBe(255) // A
        }
    })

    it("should support different noise types", () => {
        const perlin = generateNoise({ width: 32, height: 32, type: "perlin", seed: 42 })
        const simplex = generateNoise({ width: 32, height: 32, type: "simplex", seed: 42 })

        // Different algorithms should produce different results
        let differences = 0
        for (let i = 0; i < perlin.length; i++) {
            if (perlin[i] !== simplex[i]) differences++
        }
        expect(differences).toBeGreaterThan(perlin.length * 0.1) // At least 10% different
    })

    it("should support FBM", () => {
        const simple = generateNoise({ width: 32, height: 32, seed: 42 })
        const fbm = generateNoise({
            width: 32,
            height: 32,
            seed: 42,
            fbm: { octaves: 4 }
        })

        // FBM should produce different results
        let differences = 0
        for (let i = 0; i < simple.length; i++) {
            if (simple[i] !== fbm[i]) differences++
        }
        expect(differences).toBeGreaterThan(0)
    })
})

// =============================================================================
// Voronoi Texture Tests
// =============================================================================

describe("generateVoronoi", () => {
    it("should generate correct dimensions", () => {
        const data = generateVoronoi({ width: 64, height: 64 })
        verifyRGBAData(data, 64, 64)
    })

    it("should be deterministic with same seed", () => {
        const data1 = generateVoronoi({ width: 32, height: 32, seed: 42 })
        const data2 = generateVoronoi({ width: 32, height: 32, seed: 42 })

        for (let i = 0; i < data1.length; i++) {
            expect(data1[i]).toBe(data2[i])
        }
    })

    it("should produce cellular patterns", () => {
        const data = generateVoronoi({
            width: 64,
            height: 64,
            frequency: 4,
            seed: 42
        })

        // Voronoi should have low values (dark) at cell centers
        // and higher values (lighter) between cells
        // Check that we have a range of values
        let min = 255, max = 0
        for (let i = 0; i < data.length; i += 4) {
            min = Math.min(min, data[i])
            max = Math.max(max, data[i])
        }

        expect(max - min).toBeGreaterThan(50) // Should have contrast
    })
})

// =============================================================================
// Marble Texture Tests
// =============================================================================

describe("generateMarble", () => {
    it("should generate correct dimensions", () => {
        const data = generateMarble({ width: 64, height: 64 })
        verifyRGBAData(data, 64, 64)
    })

    it("should produce vein-like patterns", () => {
        const data = generateMarble({
            width: 128,
            height: 128,
            frequency: 5,
            turbulence: 3,
            seed: 42
        })

        // Marble should have mostly light values with dark veins
        let lightCount = 0
        let darkCount = 0

        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 180) lightCount++
            if (data[i] < 100) darkCount++
        }

        // Should be mostly light with some dark veins
        expect(lightCount).toBeGreaterThan(darkCount)
    })
})

// =============================================================================
// Wood Texture Tests
// =============================================================================

describe("generateWood", () => {
    it("should generate correct dimensions", () => {
        const data = generateWood({ width: 64, height: 64 })
        verifyRGBAData(data, 64, 64)
    })

    it("should produce ring patterns", () => {
        const data = generateWood({
            width: 128,
            height: 128,
            rings: 8,
            seed: 42
        })

        // Wood should have alternating light/dark rings
        // Check horizontal line through center for variations
        const y = 64
        let variations = 0
        let prevBright = data[(y * 128 + 0) * 4] > 128

        for (let x = 1; x < 128; x++) {
            const bright = data[(y * 128 + x) * 4] > 128
            if (bright !== prevBright) {
                variations++
                prevBright = bright
            }
        }

        // Should have multiple ring transitions
        expect(variations).toBeGreaterThan(2)
    })
})

// =============================================================================
// Checkerboard Texture Tests
// =============================================================================

describe("generateCheckerboard", () => {
    it("should generate correct dimensions", () => {
        const data = generateCheckerboard({ width: 64, height: 64 })
        verifyRGBAData(data, 64, 64)
    })

    it("should produce alternating pattern", () => {
        const data = generateCheckerboard({
            width: 8,
            height: 8,
            cellsX: 2,
            cellsY: 2,
            color1: [1, 1, 1, 1],
            color2: [0, 0, 0, 1]
        })

        // Top-left cell should be white
        const topLeft = getPixel(data, 8, 0, 0)
        expect(topLeft[0]).toBe(255) // White

        // Top-right cell should be black (since cellsX=2, each cell is 4 pixels wide)
        const topRight = getPixel(data, 8, 4, 0)
        expect(topRight[0]).toBe(0) // Black

        // Bottom-left should be black
        const bottomLeft = getPixel(data, 8, 0, 4)
        expect(bottomLeft[0]).toBe(0) // Black

        // Bottom-right should be white
        const bottomRight = getPixel(data, 8, 4, 4)
        expect(bottomRight[0]).toBe(255) // White
    })

    it("should respect custom colors", () => {
        const data = generateCheckerboard({
            width: 8,
            height: 8,
            cellsX: 2,
            cellsY: 2,
            color1: [1, 0, 0, 1], // Red
            color2: [0, 0, 1, 1] // Blue
        })

        const topLeft = getPixel(data, 8, 0, 0)
        expect(topLeft[0]).toBe(255) // R
        expect(topLeft[2]).toBe(0) // B (red cell)

        const topRight = getPixel(data, 8, 4, 0)
        expect(topRight[0]).toBe(0) // R
        expect(topRight[2]).toBe(255) // B (blue cell)
    })
})

// =============================================================================
// Gradient Texture Tests
// =============================================================================

describe("generateGradient", () => {
    it("should generate correct dimensions", () => {
        const data = generateGradient({ width: 64, height: 64 })
        verifyRGBAData(data, 64, 64)
    })

    it("should produce horizontal gradient", () => {
        const data = generateGradient({
            width: 100,
            height: 10,
            direction: "horizontal",
            startColor: [0, 0, 0, 1],
            endColor: [1, 1, 1, 1]
        })

        // Left should be dark, right should be light
        const left = getPixel(data, 100, 0, 5)
        const right = getPixel(data, 100, 99, 5)

        expect(left[0]).toBe(0)
        expect(right[0]).toBe(255)
    })

    it("should produce vertical gradient", () => {
        const data = generateGradient({
            width: 10,
            height: 100,
            direction: "vertical",
            startColor: [0, 0, 0, 1],
            endColor: [1, 1, 1, 1]
        })

        // Top should be dark, bottom should be light
        const top = getPixel(data, 10, 5, 0)
        const bottom = getPixel(data, 10, 5, 99)

        expect(top[0]).toBe(0)
        expect(bottom[0]).toBe(255)
    })

    it("should produce diagonal gradient", () => {
        const data = generateGradient({
            width: 100,
            height: 100,
            direction: "diagonal",
            startColor: [0, 0, 0, 1],
            endColor: [1, 1, 1, 1]
        })

        // Top-left should be dark, bottom-right should be light
        const topLeft = getPixel(data, 100, 0, 0)
        const bottomRight = getPixel(data, 100, 99, 99)

        expect(topLeft[0]).toBe(0)
        expect(bottomRight[0]).toBe(255)
    })

    it("should produce radial gradient", () => {
        const data = generateGradient({
            width: 100,
            height: 100,
            direction: "radial",
            startColor: [0, 0, 0, 1],
            endColor: [1, 1, 1, 1]
        })

        // Center should be dark, edges should be light
        const center = getPixel(data, 100, 50, 50)
        const corner = getPixel(data, 100, 0, 0)

        expect(center[0]).toBeLessThan(corner[0])
    })
})
