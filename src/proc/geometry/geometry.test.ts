/**
 * Unit tests for procedural geometry generators.
 *
 * Tests verify:
 * - Correct vertex/index counts
 * - Valid mesh data format
 * - Proper UV and normal generation
 * - Builder API works correctly
 */

import { describe, it, expect } from "vitest"
import {
    generateCube,
    generateSphere,
    generatePlane,
    generateCylinder,
    generateCone,
    generateTorus,
    generateQuad
} from "./primitives"
import { builder, combine } from "./builder"
import type { MeshData } from "../types"

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Verify mesh data format is valid.
 */
function verifyMeshData(data: MeshData, name: string): void {
    // Vertices must exist and have 3 components per vertex
    expect(data.vertices).toBeInstanceOf(Float32Array)
    expect(data.vertices.length % 3).toBe(0)

    const vertexCount = data.vertices.length / 3
    expect(vertexCount).toBeGreaterThan(0)

    // Indices must exist and have 3 components per triangle
    expect(data.indices).toBeInstanceOf(Uint32Array)
    expect(data.indices.length % 3).toBe(0)

    // All indices must reference valid vertices
    for (let i = 0; i < data.indices.length; i++) {
        expect(data.indices[i]).toBeLessThan(vertexCount)
        expect(data.indices[i]).toBeGreaterThanOrEqual(0)
    }

    // Normals should have same length as vertices if present
    if (data.normals) {
        expect(data.normals).toBeInstanceOf(Float32Array)
        expect(data.normals.length).toBe(data.vertices.length)
    }

    // UVs should have 2 components per vertex if present
    if (data.uvs) {
        expect(data.uvs).toBeInstanceOf(Float32Array)
        expect(data.uvs.length).toBe(vertexCount * 2)
    }
}

/**
 * Verify normals are normalized (length ~1).
 */
function verifyNormalsNormalized(data: MeshData): void {
    if (!data.normals) return

    for (let i = 0; i < data.normals.length; i += 3) {
        const nx = data.normals[i]
        const ny = data.normals[i + 1]
        const nz = data.normals[i + 2]
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz)
        expect(len).toBeCloseTo(1, 2)
    }
}

/**
 * Verify UVs are in [0, 1] range.
 */
function verifyUVsInRange(data: MeshData): void {
    if (!data.uvs) return

    for (let i = 0; i < data.uvs.length; i++) {
        expect(data.uvs[i]).toBeGreaterThanOrEqual(0)
        expect(data.uvs[i]).toBeLessThanOrEqual(1)
    }
}

// =============================================================================
// Cube Tests
// =============================================================================

describe("generateCube", () => {
    it("should generate valid mesh data", () => {
        const data = generateCube()
        verifyMeshData(data, "cube")
        verifyNormalsNormalized(data)
        verifyUVsInRange(data)
    })

    it("should have 24 vertices (4 per face)", () => {
        const data = generateCube()
        expect(data.vertices.length / 3).toBe(24)
    })

    it("should have 12 triangles (2 per face)", () => {
        const data = generateCube()
        expect(data.indices.length / 3).toBe(12)
    })

    it("should respect size option", () => {
        const data = generateCube({ size: 2 })

        // Find max extents
        let maxX = -Infinity, minX = Infinity
        for (let i = 0; i < data.vertices.length; i += 3) {
            maxX = Math.max(maxX, data.vertices[i])
            minX = Math.min(minX, data.vertices[i])
        }

        // Size 2 means extents from -1 to 1
        expect(maxX).toBeCloseTo(1)
        expect(minX).toBeCloseTo(-1)
    })

    it("should respect per-axis size option", () => {
        const data = generateCube({ size: [2, 4, 6] })

        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
        for (let i = 0; i < data.vertices.length; i += 3) {
            maxX = Math.max(maxX, data.vertices[i])
            maxY = Math.max(maxY, data.vertices[i + 1])
            maxZ = Math.max(maxZ, data.vertices[i + 2])
        }

        expect(maxX).toBeCloseTo(1)  // 2/2
        expect(maxY).toBeCloseTo(2)  // 4/2
        expect(maxZ).toBeCloseTo(3)  // 6/2
    })
})

// =============================================================================
// Sphere Tests
// =============================================================================

describe("generateSphere", () => {
    it("should generate valid mesh data", () => {
        const data = generateSphere()
        verifyMeshData(data, "sphere")
        verifyNormalsNormalized(data)
        verifyUVsInRange(data)
    })

    it("should have correct vertex count", () => {
        const lon = 24, lat = 16
        const data = generateSphere({ longitudeSegments: lon, latitudeSegments: lat })
        const expectedVerts = (lon + 1) * (lat + 1)
        expect(data.vertices.length / 3).toBe(expectedVerts)
    })

    it("should respect radius option", () => {
        const data = generateSphere({ radius: 2 })

        // All vertices should be at distance 2 from origin (on sphere surface)
        for (let i = 0; i < data.vertices.length; i += 3) {
            const x = data.vertices[i]
            const y = data.vertices[i + 1]
            const z = data.vertices[i + 2]
            const dist = Math.sqrt(x * x + y * y + z * z)
            expect(dist).toBeCloseTo(2, 1)
        }
    })

    it("should have poles at top and bottom", () => {
        const data = generateSphere({ radius: 1 })

        // Find Y extents
        let maxY = -Infinity, minY = Infinity
        for (let i = 0; i < data.vertices.length; i += 3) {
            maxY = Math.max(maxY, data.vertices[i + 1])
            minY = Math.min(minY, data.vertices[i + 1])
        }

        expect(maxY).toBeCloseTo(1)
        expect(minY).toBeCloseTo(-1)
    })
})

// =============================================================================
// Plane Tests
// =============================================================================

describe("generatePlane", () => {
    it("should generate valid mesh data", () => {
        const data = generatePlane()
        verifyMeshData(data, "plane")
        verifyNormalsNormalized(data)
        verifyUVsInRange(data)
    })

    it("should have flat Y=0 surface", () => {
        const data = generatePlane()

        for (let i = 0; i < data.vertices.length; i += 3) {
            expect(data.vertices[i + 1]).toBe(0)
        }
    })

    it("should respect dimensions", () => {
        const data = generatePlane({ width: 10, height: 20 })

        let maxX = -Infinity, minX = Infinity
        let maxZ = -Infinity, minZ = Infinity

        for (let i = 0; i < data.vertices.length; i += 3) {
            maxX = Math.max(maxX, data.vertices[i])
            minX = Math.min(minX, data.vertices[i])
            maxZ = Math.max(maxZ, data.vertices[i + 2])
            minZ = Math.min(minZ, data.vertices[i + 2])
        }

        expect(maxX - minX).toBeCloseTo(10)
        expect(maxZ - minZ).toBeCloseTo(20)
    })

    it("should have correct vertex count with subdivisions", () => {
        const segX = 4, segZ = 3
        const data = generatePlane({ segmentsX: segX, segmentsZ: segZ })
        const expectedVerts = (segX + 1) * (segZ + 1)
        expect(data.vertices.length / 3).toBe(expectedVerts)
    })

    it("should have upward normals", () => {
        const data = generatePlane()

        for (let i = 0; i < data.normals!.length; i += 3) {
            expect(data.normals![i]).toBe(0)     // X
            expect(data.normals![i + 1]).toBe(1) // Y (up)
            expect(data.normals![i + 2]).toBe(0) // Z
        }
    })
})

// =============================================================================
// Cylinder Tests
// =============================================================================

describe("generateCylinder", () => {
    it("should generate valid mesh data", () => {
        const data = generateCylinder()
        verifyMeshData(data, "cylinder")
    })

    it("should have caps at top and bottom", () => {
        const data = generateCylinder({ height: 2 })

        let maxY = -Infinity, minY = Infinity
        for (let i = 0; i < data.vertices.length; i += 3) {
            maxY = Math.max(maxY, data.vertices[i + 1])
            minY = Math.min(minY, data.vertices[i + 1])
        }

        expect(maxY).toBeCloseTo(1)  // height/2
        expect(minY).toBeCloseTo(-1) // -height/2
    })

    it("should respect radius option", () => {
        const data = generateCylinder({ radius: 2 })

        // Check that side vertices are at correct radius
        for (let i = 0; i < data.vertices.length; i += 3) {
            const x = data.vertices[i]
            const z = data.vertices[i + 2]
            const dist = Math.sqrt(x * x + z * z)

            // Either at radius or at center (cap centers)
            if (dist > 0.1) {
                expect(dist).toBeCloseTo(2, 1)
            }
        }
    })
})

// =============================================================================
// Cone Tests
// =============================================================================

describe("generateCone", () => {
    it("should generate valid mesh data", () => {
        const data = generateCone()
        verifyMeshData(data, "cone")
    })

    it("should have apex at top", () => {
        const data = generateCone({ height: 2 })

        // Apex should be at y = height/2
        expect(data.vertices[1]).toBeCloseTo(1)  // First vertex Y (apex)
    })

    it("should have base at bottom", () => {
        const data = generateCone({ height: 2, radius: 1 })

        let minY = Infinity
        for (let i = 0; i < data.vertices.length; i += 3) {
            minY = Math.min(minY, data.vertices[i + 1])
        }

        expect(minY).toBeCloseTo(-1) // -height/2
    })
})

// =============================================================================
// Torus Tests
// =============================================================================

describe("generateTorus", () => {
    it("should generate valid mesh data", () => {
        const data = generateTorus()
        verifyMeshData(data, "torus")
        verifyNormalsNormalized(data)
        verifyUVsInRange(data)
    })

    it("should have correct vertex count", () => {
        const radial = 16, tubular = 32
        const data = generateTorus({ radialSegments: radial, tubularSegments: tubular })
        const expectedVerts = (radial + 1) * (tubular + 1)
        expect(data.vertices.length / 3).toBe(expectedVerts)
    })

    it("should be centered at origin", () => {
        const data = generateTorus()

        // Center of mass should be near origin
        let sumX = 0, sumY = 0, sumZ = 0
        const vertCount = data.vertices.length / 3

        for (let i = 0; i < data.vertices.length; i += 3) {
            sumX += data.vertices[i]
            sumY += data.vertices[i + 1]
            sumZ += data.vertices[i + 2]
        }

        expect(sumX / vertCount).toBeCloseTo(0, 1)
        expect(sumY / vertCount).toBeCloseTo(0, 1)
        expect(sumZ / vertCount).toBeCloseTo(0, 1)
    })
})

// =============================================================================
// Quad Tests
// =============================================================================

describe("generateQuad", () => {
    it("should generate valid mesh data", () => {
        const data = generateQuad()
        verifyMeshData(data, "quad")
        verifyNormalsNormalized(data)
        verifyUVsInRange(data)
    })

    it("should have exactly 4 vertices", () => {
        const data = generateQuad()
        expect(data.vertices.length / 3).toBe(4)
    })

    it("should have exactly 2 triangles", () => {
        const data = generateQuad()
        expect(data.indices.length / 3).toBe(2)
    })

    it("should be flat on Z=0", () => {
        const data = generateQuad()

        for (let i = 0; i < data.vertices.length; i += 3) {
            expect(data.vertices[i + 2]).toBe(0)
        }
    })

    it("should have forward normals", () => {
        const data = generateQuad()

        for (let i = 0; i < data.normals!.length; i += 3) {
            expect(data.normals![i]).toBe(0)     // X
            expect(data.normals![i + 1]).toBe(0) // Y
            expect(data.normals![i + 2]).toBe(1) // Z (forward)
        }
    })
})

// =============================================================================
// Builder Tests
// =============================================================================

describe("MeshBuilder", () => {
    it("should build a simple triangle", () => {
        const b = builder()
        b.vertex(0, 1, 0)
        b.vertex(-1, 0, 0)
        b.vertex(1, 0, 0)
        const mesh = b.triangle(0, 1, 2).build()

        expect(mesh.vertexCount).toBe(3)
        expect(mesh.triangleCount).toBe(1)
    })

    it("should set normals correctly", () => {
        const b = builder()
        b.vertex(0, 0, 0)
        b.normal(0, 1, 0)
        b.vertex(1, 0, 0)
        b.normal(0, 1, 0)
        b.vertex(0, 1, 0)
        b.normal(0, 1, 0)
        const mesh = b.triangle(0, 1, 2).build()

        const data = mesh.data

        // Check first vertex normal
        expect(data.normals![0]).toBe(0)
        expect(data.normals![1]).toBe(1)
        expect(data.normals![2]).toBe(0)
    })

    it("should set UVs correctly", () => {
        const b = builder()
        b.vertex(0, 0, 0)
        b.uv(0, 0)
        b.vertex(1, 0, 0)
        b.uv(1, 0)
        b.vertex(0.5, 1, 0)
        b.uv(0.5, 1)
        const mesh = b.triangle(0, 1, 2).build()

        const data = mesh.data

        // Check UVs
        expect(data.uvs![0]).toBe(0)
        expect(data.uvs![1]).toBe(0)
        expect(data.uvs![4]).toBe(0.5)
        expect(data.uvs![5]).toBe(1)
    })

    it("should set colors correctly", () => {
        const b = builder()
        b.vertex(0, 0, 0)
        b.color(1, 0, 0)
        b.vertex(1, 0, 0)
        b.color(0, 1, 0)
        b.vertex(0, 1, 0)
        b.color(0, 0, 1)
        const mesh = b.triangle(0, 1, 2).build()

        const data = mesh.data

        // First vertex: red
        expect(data.colors![0]).toBe(1)
        expect(data.colors![1]).toBe(0)
        expect(data.colors![2]).toBe(0)

        // Second vertex: green
        expect(data.colors![4]).toBe(0)
        expect(data.colors![5]).toBe(1)
        expect(data.colors![6]).toBe(0)
    })

    it("should create quads as two triangles", () => {
        const b = builder()
        b.vertex(-1, -1, 0)
        b.vertex(1, -1, 0)
        b.vertex(1, 1, 0)
        b.vertex(-1, 1, 0)
        const mesh = b.quad(0, 1, 2, 3).build()

        expect(mesh.vertexCount).toBe(4)
        expect(mesh.triangleCount).toBe(2)
    })

    it("should return vertex index from vertex()", () => {
        const b = builder()
        const idx0 = b.vertex(0, 0, 0)
        const idx1 = b.vertex(1, 0, 0)
        const idx2 = b.vertex(0, 1, 0)

        expect(idx0).toBe(0)
        expect(idx1).toBe(1)
        expect(idx2).toBe(2)
    })

    it("should build a pyramid", () => {
        const b = builder()
        b.vertex(0, 1, 0)      // 0: apex
        b.vertex(-1, 0, -1)    // 1: base corner
        b.vertex(1, 0, -1)     // 2: base corner
        b.vertex(1, 0, 1)      // 3: base corner
        b.vertex(-1, 0, 1)     // 4: base corner
        b.triangle(0, 2, 1)    // front face
        b.triangle(0, 3, 2)    // right face
        b.triangle(0, 4, 3)    // back face
        b.triangle(0, 1, 4)    // left face
        const mesh = b.quad(1, 2, 3, 4).build() // base

        expect(mesh.vertexCount).toBe(5)
        expect(mesh.triangleCount).toBe(6) // 4 side + 2 base
    })
})

// =============================================================================
// Combine Tests
// =============================================================================

describe("combine", () => {
    it("should combine two meshes", () => {
        const b1 = builder()
        b1.vertex(-1, 0, 0)
        b1.vertex(0, 0, 0)
        b1.vertex(-0.5, 1, 0)
        const mesh1 = b1.triangle(0, 1, 2).build()

        const b2 = builder()
        b2.vertex(0, 0, 0)
        b2.vertex(1, 0, 0)
        b2.vertex(0.5, 1, 0)
        const mesh2 = b2.triangle(0, 1, 2).build()

        const combined = combine([mesh1, mesh2])

        expect(combined.vertexCount).toBe(6) // 3 + 3
        expect(combined.triangleCount).toBe(2) // 1 + 1
    })

    it("should throw on empty array", () => {
        expect(() => combine([])).toThrow()
    })

    it("should clone single mesh", () => {
        const b = builder()
        b.vertex(0, 0, 0)
        b.vertex(1, 0, 0)
        b.vertex(0, 1, 0)
        const original = b.triangle(0, 1, 2).build()

        const combined = combine([original])

        expect(combined.vertexCount).toBe(original.vertexCount)
        expect(combined.triangleCount).toBe(original.triangleCount)

        // Should be a clone, not the same object
        expect(combined).not.toBe(original)
    })

    it("should offset indices correctly", () => {
        const b1 = builder()
        b1.vertex(0, 0, 0)
        b1.vertex(1, 0, 0)
        b1.vertex(0, 1, 0)
        const mesh1 = b1.triangle(0, 1, 2).build()

        const b2 = builder()
        b2.vertex(2, 0, 0)
        b2.vertex(3, 0, 0)
        b2.vertex(2, 1, 0)
        const mesh2 = b2.triangle(0, 1, 2).build()

        const combined = combine([mesh1, mesh2])
        const data = combined.data

        // Second mesh's triangle should reference vertices 3, 4, 5
        expect(data.indices[3]).toBe(3)
        expect(data.indices[4]).toBe(4)
        expect(data.indices[5]).toBe(5)
    })
})
