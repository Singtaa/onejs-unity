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
    ProceduralMesh,
    MeshObject,
    // Pure generators (for advanced use)
    generateCube,
    generateSphere,
    generatePlane,
    generateCylinder,
    generateCone,
    generateTorus,
    generateQuad
} from "./primitives"
import { builder, combine, MeshBuilder } from "./builder"
import type {
    MeshData,
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
    MeshData,
    CubeOptions,
    SphereOptions,
    CylinderOptions,
    ConeOptions,
    PlaneOptions,
    TorusOptions,
    QuadOptions
}

// Re-export classes
export { ProceduralMesh, MeshObject }
export type { MeshBuilder }

// Re-export factory functions
export {
    cube,
    sphere,
    cylinder,
    cone,
    plane,
    torus,
    quad,
    fromData,
    builder,
    combine
}

// Re-export pure generators for advanced use (no Unity dependency)
export {
    generateCube,
    generateSphere,
    generatePlane,
    generateCylinder,
    generateCone,
    generateTorus,
    generateQuad
}

/**
 * Unified mesh API.
 *
 * Provides access to all mesh operations through a single namespace.
 *
 * @example Creating primitives
 * ```typescript
 * import { mesh } from "onejs-unity/proc"
 *
 * // Create and instantiate a sphere
 * mesh.sphere({ radius: 1 })
 *     .instantiate("MySphere")
 *     .setPosition(0, 2, 0)
 *     .setColor("#ff5500")
 *
 * // Create a high-poly plane for terrain
 * const terrain = mesh.plane({ width: 100, height: 100, segmentsX: 64, segmentsZ: 64 })
 * const data = terrain.data
 * // Modify vertices with noise...
 * terrain.setData(data).recalculateNormals()
 * terrain.instantiate("Terrain")
 * ```
 *
 * @example Custom geometry with builder
 * ```typescript
 * const pyramid = mesh.builder()
 *     .vertex(0, 1, 0).uv(0.5, 1)      // Apex
 *     .vertex(-1, 0, -1).uv(0, 0)      // Base corners
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

    // Pure generators (no Unity dependency - for data manipulation)
    generators: {
        cube: generateCube,
        sphere: generateSphere,
        plane: generatePlane,
        cylinder: generateCylinder,
        cone: generateCone,
        torus: generateTorus,
        quad: generateQuad
    }
}
