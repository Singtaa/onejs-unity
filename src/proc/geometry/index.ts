/**
 * Procedural geometry generation module.
 *
 * Provides APIs for creating and manipulating 3D meshes.
 *
 * @module onejs-unity/proc/geometry
 *
 * @example One-liner primitives
 * ```typescript
 * import { mesh } from "onejs-unity/proc"
 *
 * // Create and instantiate a sphere
 * const sphere = mesh.sphere({ radius: 1, longitudeSegments: 32 })
 * sphere.instantiate("MySphere").setPosition(0, 2, 0)
 *
 * // Create with material
 * const cube = mesh.cube({ size: 1 })
 * const mat = mesh.material().setColor("#ff5500")
 * cube.instantiate("MyCube").setMaterial(mat)
 * ```
 *
 * @example Custom geometry with builder
 * ```typescript
 * import { mesh } from "onejs-unity/proc"
 *
 * const pyramid = mesh.builder()
 *     .vertex(0, 1, 0).uv(0.5, 1)      // Apex
 *     .vertex(-1, 0, -1).uv(0, 0)      // Base
 *     .vertex(1, 0, -1).uv(1, 0)
 *     .vertex(1, 0, 1).uv(1, 1)
 *     .vertex(-1, 0, 1).uv(0, 1)
 *     .triangle(0, 2, 1)               // Front face
 *     .triangle(0, 3, 2)               // Right face
 *     .triangle(0, 4, 3)               // Back face
 *     .triangle(0, 1, 4)               // Left face
 *     .quad(1, 2, 3, 4)                // Base
 *     .build()
 *
 * pyramid.recalculateNormals()
 * pyramid.instantiate("Pyramid")
 * ```
 *
 * @example Mesh data manipulation
 * ```typescript
 * import { mesh } from "onejs-unity/proc"
 *
 * // Create a high-res plane
 * const terrain = mesh.plane({ width: 10, height: 10, segmentsX: 64, segmentsZ: 64 })
 *
 * // Get mesh data for modification
 * const data = terrain.getData()
 *
 * // Apply height displacement
 * for (let i = 0; i < data.vertices.length; i += 3) {
 *     const x = data.vertices[i]
 *     const z = data.vertices[i + 2]
 *     data.vertices[i + 1] = Math.sin(x) * Math.cos(z) * 0.5
 * }
 *
 * // Push modified data back
 * terrain.setData(data)
 * terrain.recalculateNormals()
 * terrain.instantiate("Terrain")
 * ```
 */

import {
    cube,
    sphere,
    cylinder,
    cone,
    plane,
    torus,
    quad,
    fromData,
    material,
    registerMaterial,
    cleanup
} from "./primitives"
import { builder, combine } from "./builder"
import type {
    Mesh,
    MeshInstance,
    Material,
    MeshData,
    MeshBuilder,
    CubeOptions,
    SphereOptions,
    CylinderOptions,
    ConeOptions,
    PlaneOptions,
    TorusOptions,
    QuadOptions
} from "../types"

// Re-export types
export type {
    Mesh,
    MeshInstance,
    Material,
    MeshData,
    MeshBuilder,
    CubeOptions,
    SphereOptions,
    CylinderOptions,
    ConeOptions,
    PlaneOptions,
    TorusOptions,
    QuadOptions
}

// Re-export functions
export {
    cube,
    sphere,
    cylinder,
    cone,
    plane,
    torus,
    quad,
    fromData,
    material,
    registerMaterial,
    cleanup,
    builder,
    combine
}

/**
 * Unified mesh API.
 *
 * Provides access to all mesh operations through a single namespace.
 */
export const mesh = {
    // Primitives
    cube,
    sphere,
    cylinder,
    cone,
    plane,
    torus,
    quad,

    // Custom mesh
    fromData,
    builder,
    combine,

    // Materials
    material,
    registerMaterial,

    // Cleanup
    cleanup
}
