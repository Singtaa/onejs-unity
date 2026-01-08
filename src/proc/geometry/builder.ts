/**
 * Fluent mesh builder for custom geometry.
 *
 * Provides an ergonomic API for constructing custom meshes vertex by vertex.
 *
 * @module onejs-unity/proc/geometry
 */

import type { Mesh, MeshData, MeshBuilder } from "../types"
import { fromData } from "./primitives"

/**
 * MeshBuilder implementation.
 *
 * Allows constructing custom meshes with a fluent API.
 *
 * @example
 * ```typescript
 * const pyramid = mesh.builder()
 *     // Apex
 *     .vertex(0, 1, 0).normal(0, 1, 0).uv(0.5, 1)
 *     // Base corners
 *     .vertex(-1, 0, -1).normal(0, -1, 0).uv(0, 0)
 *     .vertex(1, 0, -1).normal(0, -1, 0).uv(1, 0)
 *     .vertex(1, 0, 1).normal(0, -1, 0).uv(1, 1)
 *     .vertex(-1, 0, 1).normal(0, -1, 0).uv(0, 1)
 *     // Faces
 *     .triangle(0, 2, 1)  // Front
 *     .triangle(0, 3, 2)  // Right
 *     .triangle(0, 4, 3)  // Back
 *     .triangle(0, 1, 4)  // Left
 *     .quad(1, 2, 3, 4)   // Base
 *     .build()
 *
 * pyramid.recalculateNormals()
 * pyramid.instantiate("Pyramid")
 * ```
 */
class MeshBuilderImpl implements MeshBuilder {
    private _vertices: number[] = []
    private _normals: number[] = []
    private _uvs: number[] = []
    private _colors: number[] = []
    private _indices: number[] = []
    private _vertexCount = 0

    /**
     * Add a vertex at the given position.
     * Returns the vertex index for use in triangle/quad definitions.
     */
    vertex(x: number, y: number, z: number): number {
        this._vertices.push(x, y, z)
        // Default normal pointing up
        this._normals.push(0, 1, 0)
        // Default UV at origin
        this._uvs.push(0, 0)
        // Default color white
        this._colors.push(1, 1, 1, 1)

        return this._vertexCount++
    }

    /**
     * Set the normal for the most recently added vertex.
     */
    normal(x: number, y: number, z: number): MeshBuilder {
        if (this._vertexCount === 0) return this

        const idx = (this._vertexCount - 1) * 3
        this._normals[idx] = x
        this._normals[idx + 1] = y
        this._normals[idx + 2] = z
        return this
    }

    /**
     * Set the UV coordinates for the most recently added vertex.
     */
    uv(u: number, v: number): MeshBuilder {
        if (this._vertexCount === 0) return this

        const idx = (this._vertexCount - 1) * 2
        this._uvs[idx] = u
        this._uvs[idx + 1] = v
        return this
    }

    /**
     * Set the color for the most recently added vertex.
     */
    color(r: number, g: number, b: number, a = 1): MeshBuilder {
        if (this._vertexCount === 0) return this

        const idx = (this._vertexCount - 1) * 4
        this._colors[idx] = r
        this._colors[idx + 1] = g
        this._colors[idx + 2] = b
        this._colors[idx + 3] = a
        return this
    }

    /**
     * Add a triangle using vertex indices.
     * Winding order is counter-clockwise for front-facing.
     */
    triangle(a: number, b: number, c: number): MeshBuilder {
        this._indices.push(a, b, c)
        return this
    }

    /**
     * Add a quad using vertex indices.
     * Creates two triangles: (a, b, c) and (a, c, d).
     * Winding order is counter-clockwise.
     */
    quad(a: number, b: number, c: number, d: number): MeshBuilder {
        // First triangle: a -> b -> c
        this._indices.push(a, b, c)
        // Second triangle: a -> c -> d
        this._indices.push(a, c, d)
        return this
    }

    /**
     * Build the mesh and return a Mesh handle.
     */
    build(): Mesh {
        const data: MeshData = {
            vertices: new Float32Array(this._vertices),
            normals: new Float32Array(this._normals),
            uvs: new Float32Array(this._uvs),
            colors: new Float32Array(this._colors),
            indices: new Uint32Array(this._indices)
        }

        return fromData(data)
    }
}

/**
 * Create a new mesh builder.
 *
 * @returns A MeshBuilder instance for constructing custom geometry
 *
 * @example Simple triangle
 * ```typescript
 * const triangle = mesh.builder()
 *     .vertex(0, 1, 0).uv(0.5, 1)
 *     .vertex(-1, 0, 0).uv(0, 0)
 *     .vertex(1, 0, 0).uv(1, 0)
 *     .triangle(0, 1, 2)
 *     .build()
 * ```
 *
 * @example Colored cube face
 * ```typescript
 * const face = mesh.builder()
 *     .vertex(-1, -1, 0).color(1, 0, 0)  // Red
 *     .vertex(1, -1, 0).color(0, 1, 0)   // Green
 *     .vertex(1, 1, 0).color(0, 0, 1)    // Blue
 *     .vertex(-1, 1, 0).color(1, 1, 0)   // Yellow
 *     .quad(0, 1, 2, 3)
 *     .build()
 * ```
 */
export function builder(): MeshBuilder {
    return new MeshBuilderImpl()
}

/**
 * Combine multiple meshes into one.
 *
 * @param meshes - Array of meshes to combine
 * @returns A new combined mesh
 *
 * @example
 * ```typescript
 * const combined = mesh.combine([
 *     mesh.cube({ size: 1 }),
 *     mesh.sphere({ radius: 0.5 })
 * ])
 * ```
 */
export function combine(meshes: Mesh[]): Mesh {
    if (meshes.length === 0) {
        throw new Error("Cannot combine empty mesh array")
    }

    if (meshes.length === 1) {
        return meshes[0].clone()
    }

    // Get all mesh data
    const allData = meshes.map(m => m.getData())

    // Calculate total sizes
    let totalVertices = 0
    let totalIndices = 0
    for (const data of allData) {
        totalVertices += data.vertices.length / 3
        totalIndices += data.indices.length
    }

    // Allocate combined arrays
    const vertices = new Float32Array(totalVertices * 3)
    const normals = new Float32Array(totalVertices * 3)
    const uvs = new Float32Array(totalVertices * 2)
    const indices = new Uint32Array(totalIndices)

    let vertexOffset = 0
    let indexOffset = 0
    let baseVertex = 0

    for (const data of allData) {
        const vertCount = data.vertices.length / 3

        // Copy vertices
        vertices.set(data.vertices, vertexOffset * 3)

        // Copy normals (or use defaults)
        if (data.normals && data.normals.length > 0) {
            normals.set(data.normals, vertexOffset * 3)
        }

        // Copy UVs (or use defaults)
        if (data.uvs && data.uvs.length > 0) {
            uvs.set(data.uvs, vertexOffset * 2)
        }

        // Copy indices with offset
        for (let i = 0; i < data.indices.length; i++) {
            indices[indexOffset + i] = data.indices[i] + baseVertex
        }

        vertexOffset += vertCount
        indexOffset += data.indices.length
        baseVertex += vertCount
    }

    return fromData({ vertices, normals, uvs, indices })
}
