/**
 * Procedural mesh primitives - Pure JS implementation.
 *
 * All mesh data is generated in JavaScript, then passed to Unity's Mesh API.
 * No custom C# bridge required.
 *
 * @module onejs-unity/proc/geometry
 */

import type {
    MeshData,
    CubeOptions,
    SphereOptions,
    CylinderOptions,
    ConeOptions,
    PlaneOptions,
    TorusOptions,
    QuadOptions,
    Vector3,
    Color
} from "../types"
import type { ProceduralTexture } from "../texture/generators"

// =============================================================================
// Pure JS Mesh Data Generators
// =============================================================================

/**
 * Generate cube mesh data.
 */
export function generateCube(options: CubeOptions = {}): MeshData {
    const size = options.size ?? 1
    const [sx, sy, sz] = Array.isArray(size) ? size : [size, size, size]
    const hx = sx / 2, hy = sy / 2, hz = sz / 2

    // 24 vertices (4 per face, for correct normals)
    const vertices = new Float32Array([
        // Front face
        -hx, -hy, hz,   hx, -hy, hz,   hx, hy, hz,   -hx, hy, hz,
        // Back face
        hx, -hy, -hz,   -hx, -hy, -hz,   -hx, hy, -hz,   hx, hy, -hz,
        // Top face
        -hx, hy, hz,   hx, hy, hz,   hx, hy, -hz,   -hx, hy, -hz,
        // Bottom face
        -hx, -hy, -hz,   hx, -hy, -hz,   hx, -hy, hz,   -hx, -hy, hz,
        // Right face
        hx, -hy, hz,   hx, -hy, -hz,   hx, hy, -hz,   hx, hy, hz,
        // Left face
        -hx, -hy, -hz,   -hx, -hy, hz,   -hx, hy, hz,   -hx, hy, -hz
    ])

    const normals = new Float32Array([
        // Front
        0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
        // Back
        0, 0, -1,   0, 0, -1,   0, 0, -1,   0, 0, -1,
        // Top
        0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
        // Bottom
        0, -1, 0,   0, -1, 0,   0, -1, 0,   0, -1, 0,
        // Right
        1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,
        // Left
        -1, 0, 0,   -1, 0, 0,   -1, 0, 0,   -1, 0, 0
    ])

    const uvs = new Float32Array([
        // Front
        0, 0,   1, 0,   1, 1,   0, 1,
        // Back
        0, 0,   1, 0,   1, 1,   0, 1,
        // Top
        0, 0,   1, 0,   1, 1,   0, 1,
        // Bottom
        0, 0,   1, 0,   1, 1,   0, 1,
        // Right
        0, 0,   1, 0,   1, 1,   0, 1,
        // Left
        0, 0,   1, 0,   1, 1,   0, 1
    ])

    const indices = new Uint32Array([
        0, 1, 2,   0, 2, 3,     // Front
        4, 5, 6,   4, 6, 7,     // Back
        8, 9, 10,  8, 10, 11,   // Top
        12, 13, 14,  12, 14, 15, // Bottom
        16, 17, 18,  16, 18, 19, // Right
        20, 21, 22,  20, 22, 23  // Left
    ])

    return { vertices, normals, uvs, indices }
}

/**
 * Generate sphere mesh data using UV sphere algorithm.
 */
export function generateSphere(options: SphereOptions = {}): MeshData {
    const {
        radius = 0.5,
        longitudeSegments = 24,
        latitudeSegments = 16
    } = options

    const lon = longitudeSegments
    const lat = latitudeSegments

    const vertexCount = (lon + 1) * (lat + 1)
    const vertices = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)

    let vi = 0, ni = 0, ui = 0

    for (let y = 0; y <= lat; y++) {
        const v = y / lat
        const theta = v * Math.PI

        for (let x = 0; x <= lon; x++) {
            const u = x / lon
            const phi = u * Math.PI * 2

            const nx = Math.sin(theta) * Math.cos(phi)
            const ny = Math.cos(theta)
            const nz = Math.sin(theta) * Math.sin(phi)

            vertices[vi++] = nx * radius
            vertices[vi++] = ny * radius
            vertices[vi++] = nz * radius

            normals[ni++] = nx
            normals[ni++] = ny
            normals[ni++] = nz

            uvs[ui++] = u
            uvs[ui++] = 1 - v
        }
    }

    // Generate indices
    const indexCount = lon * lat * 6
    const indices = new Uint32Array(indexCount)
    let ii = 0

    for (let y = 0; y < lat; y++) {
        for (let x = 0; x < lon; x++) {
            const a = y * (lon + 1) + x
            const b = a + lon + 1

            indices[ii++] = a
            indices[ii++] = b
            indices[ii++] = a + 1

            indices[ii++] = b
            indices[ii++] = b + 1
            indices[ii++] = a + 1
        }
    }

    return { vertices, normals, uvs, indices }
}

/**
 * Generate plane mesh data.
 */
export function generatePlane(options: PlaneOptions = {}): MeshData {
    const {
        width = 1,
        height = 1,
        segmentsX = 1,
        segmentsZ = 1
    } = options

    const hw = width / 2
    const hh = height / 2
    const segX = segmentsX + 1
    const segZ = segmentsZ + 1

    const vertexCount = segX * segZ
    const vertices = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)

    let vi = 0, ni = 0, ui = 0

    for (let z = 0; z < segZ; z++) {
        const tz = z / segmentsZ
        for (let x = 0; x < segX; x++) {
            const tx = x / segmentsX

            vertices[vi++] = tx * width - hw
            vertices[vi++] = 0
            vertices[vi++] = tz * height - hh

            normals[ni++] = 0
            normals[ni++] = 1
            normals[ni++] = 0

            uvs[ui++] = tx
            uvs[ui++] = tz
        }
    }

    const indexCount = segmentsX * segmentsZ * 6
    const indices = new Uint32Array(indexCount)
    let ii = 0

    for (let z = 0; z < segmentsZ; z++) {
        for (let x = 0; x < segmentsX; x++) {
            const a = z * segX + x
            const b = a + segX

            indices[ii++] = a
            indices[ii++] = b
            indices[ii++] = a + 1

            indices[ii++] = b
            indices[ii++] = b + 1
            indices[ii++] = a + 1
        }
    }

    return { vertices, normals, uvs, indices }
}

/**
 * Generate cylinder mesh data.
 */
export function generateCylinder(options: CylinderOptions = {}): MeshData {
    const { radius = 0.5, height = 1, segments = 24 } = options
    const hy = height / 2

    // Side vertices + top/bottom centers + top/bottom rings
    const sideVerts = (segments + 1) * 2
    const capVerts = (segments + 1) * 2 + 2 // +2 for centers
    const vertexCount = sideVerts + capVerts

    const vertices = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)

    let vi = 0, ni = 0, ui = 0

    // Side vertices
    for (let i = 0; i <= segments; i++) {
        const u = i / segments
        const theta = u * Math.PI * 2
        const nx = Math.cos(theta)
        const nz = Math.sin(theta)

        // Top ring
        vertices[vi++] = nx * radius
        vertices[vi++] = hy
        vertices[vi++] = nz * radius
        normals[ni++] = nx
        normals[ni++] = 0
        normals[ni++] = nz
        uvs[ui++] = u
        uvs[ui++] = 1

        // Bottom ring
        vertices[vi++] = nx * radius
        vertices[vi++] = -hy
        vertices[vi++] = nz * radius
        normals[ni++] = nx
        normals[ni++] = 0
        normals[ni++] = nz
        uvs[ui++] = u
        uvs[ui++] = 0
    }

    // Top cap center
    const topCenterIdx = vi / 3
    vertices[vi++] = 0
    vertices[vi++] = hy
    vertices[vi++] = 0
    normals[ni++] = 0
    normals[ni++] = 1
    normals[ni++] = 0
    uvs[ui++] = 0.5
    uvs[ui++] = 0.5

    // Top cap ring
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        const nx = Math.cos(theta)
        const nz = Math.sin(theta)
        vertices[vi++] = nx * radius
        vertices[vi++] = hy
        vertices[vi++] = nz * radius
        normals[ni++] = 0
        normals[ni++] = 1
        normals[ni++] = 0
        uvs[ui++] = nx * 0.5 + 0.5
        uvs[ui++] = nz * 0.5 + 0.5
    }

    // Bottom cap center
    const bottomCenterIdx = vi / 3
    vertices[vi++] = 0
    vertices[vi++] = -hy
    vertices[vi++] = 0
    normals[ni++] = 0
    normals[ni++] = -1
    normals[ni++] = 0
    uvs[ui++] = 0.5
    uvs[ui++] = 0.5

    // Bottom cap ring
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        const nx = Math.cos(theta)
        const nz = Math.sin(theta)
        vertices[vi++] = nx * radius
        vertices[vi++] = -hy
        vertices[vi++] = nz * radius
        normals[ni++] = 0
        normals[ni++] = -1
        normals[ni++] = 0
        uvs[ui++] = nx * 0.5 + 0.5
        uvs[ui++] = nz * 0.5 + 0.5
    }

    // Generate indices
    const sideIndices = segments * 6
    const capIndices = segments * 3 * 2
    const indices = new Uint32Array(sideIndices + capIndices)
    let ii = 0

    // Side faces
    for (let i = 0; i < segments; i++) {
        const a = i * 2
        const b = a + 1
        const c = a + 2
        const d = a + 3

        indices[ii++] = a
        indices[ii++] = c
        indices[ii++] = b
        indices[ii++] = b
        indices[ii++] = c
        indices[ii++] = d
    }

    // Top cap
    const topRingStart = topCenterIdx + 1
    for (let i = 0; i < segments; i++) {
        indices[ii++] = topCenterIdx
        indices[ii++] = topRingStart + i
        indices[ii++] = topRingStart + i + 1
    }

    // Bottom cap
    const bottomRingStart = bottomCenterIdx + 1
    for (let i = 0; i < segments; i++) {
        indices[ii++] = bottomCenterIdx
        indices[ii++] = bottomRingStart + i + 1
        indices[ii++] = bottomRingStart + i
    }

    return { vertices, normals, uvs, indices }
}

/**
 * Generate cone mesh data.
 */
export function generateCone(options: ConeOptions = {}): MeshData {
    const { radius = 0.5, height = 1, segments = 24 } = options
    const hy = height / 2

    // Apex + base ring (for sides) + center + base ring (for cap)
    const vertexCount = 1 + (segments + 1) + 1 + (segments + 1)
    const vertices = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)

    let vi = 0, ni = 0, ui = 0

    // Apex vertex (repeated for each segment for correct normals would be better,
    // but for simplicity we use a single apex)
    const apexIdx = 0
    vertices[vi++] = 0
    vertices[vi++] = hy
    vertices[vi++] = 0
    normals[ni++] = 0
    normals[ni++] = 1
    normals[ni++] = 0
    uvs[ui++] = 0.5
    uvs[ui++] = 1

    // Base ring for sides
    const sideRingStart = vi / 3
    const slope = radius / height
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        const nx = Math.cos(theta)
        const nz = Math.sin(theta)

        vertices[vi++] = nx * radius
        vertices[vi++] = -hy
        vertices[vi++] = nz * radius

        // Cone normal - points outward and up
        const len = Math.sqrt(1 + slope * slope)
        normals[ni++] = nx / len
        normals[ni++] = slope / len
        normals[ni++] = nz / len

        uvs[ui++] = i / segments
        uvs[ui++] = 0
    }

    // Base center
    const baseCenterIdx = vi / 3
    vertices[vi++] = 0
    vertices[vi++] = -hy
    vertices[vi++] = 0
    normals[ni++] = 0
    normals[ni++] = -1
    normals[ni++] = 0
    uvs[ui++] = 0.5
    uvs[ui++] = 0.5

    // Base ring for cap
    const baseRingStart = vi / 3
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2
        const nx = Math.cos(theta)
        const nz = Math.sin(theta)

        vertices[vi++] = nx * radius
        vertices[vi++] = -hy
        vertices[vi++] = nz * radius
        normals[ni++] = 0
        normals[ni++] = -1
        normals[ni++] = 0
        uvs[ui++] = nx * 0.5 + 0.5
        uvs[ui++] = nz * 0.5 + 0.5
    }

    // Generate indices
    const sideIndices = segments * 3
    const capIndices = segments * 3
    const indices = new Uint32Array(sideIndices + capIndices)
    let ii = 0

    // Side triangles
    for (let i = 0; i < segments; i++) {
        indices[ii++] = apexIdx
        indices[ii++] = sideRingStart + i + 1
        indices[ii++] = sideRingStart + i
    }

    // Base cap
    for (let i = 0; i < segments; i++) {
        indices[ii++] = baseCenterIdx
        indices[ii++] = baseRingStart + i + 1
        indices[ii++] = baseRingStart + i
    }

    return { vertices, normals, uvs, indices }
}

/**
 * Generate torus mesh data.
 */
export function generateTorus(options: TorusOptions = {}): MeshData {
    const {
        radius = 1,
        tubeRadius = 0.3,
        radialSegments = 16,
        tubularSegments = 32
    } = options

    const vertexCount = (radialSegments + 1) * (tubularSegments + 1)
    const vertices = new Float32Array(vertexCount * 3)
    const normals = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)

    let vi = 0, ni = 0, ui = 0

    for (let j = 0; j <= radialSegments; j++) {
        for (let i = 0; i <= tubularSegments; i++) {
            const u = i / tubularSegments * Math.PI * 2
            const v = j / radialSegments * Math.PI * 2

            const x = (radius + tubeRadius * Math.cos(v)) * Math.cos(u)
            const y = tubeRadius * Math.sin(v)
            const z = (radius + tubeRadius * Math.cos(v)) * Math.sin(u)

            vertices[vi++] = x
            vertices[vi++] = y
            vertices[vi++] = z

            // Normal
            const cx = radius * Math.cos(u)
            const cz = radius * Math.sin(u)
            const nx = x - cx
            const ny = y
            const nz = z - cz
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz)

            normals[ni++] = nx / len
            normals[ni++] = ny / len
            normals[ni++] = nz / len

            uvs[ui++] = i / tubularSegments
            uvs[ui++] = j / radialSegments
        }
    }

    const indexCount = radialSegments * tubularSegments * 6
    const indices = new Uint32Array(indexCount)
    let ii = 0

    for (let j = 0; j < radialSegments; j++) {
        for (let i = 0; i < tubularSegments; i++) {
            const a = j * (tubularSegments + 1) + i
            const b = a + tubularSegments + 1

            indices[ii++] = a
            indices[ii++] = b
            indices[ii++] = a + 1

            indices[ii++] = b
            indices[ii++] = b + 1
            indices[ii++] = a + 1
        }
    }

    return { vertices, normals, uvs, indices }
}

/**
 * Generate quad mesh data.
 */
export function generateQuad(options: QuadOptions = {}): MeshData {
    const { width = 1, height = 1 } = options
    const hw = width / 2
    const hh = height / 2

    const vertices = new Float32Array([
        -hw, -hh, 0,
        hw, -hh, 0,
        hw, hh, 0,
        -hw, hh, 0
    ])

    const normals = new Float32Array([
        0, 0, 1,
        0, 0, 1,
        0, 0, 1,
        0, 0, 1
    ])

    const uvs = new Float32Array([
        0, 0,
        1, 0,
        1, 1,
        0, 1
    ])

    const indices = new Uint32Array([0, 1, 2, 0, 2, 3])

    return { vertices, normals, uvs, indices }
}

// =============================================================================
// Unity Integration - ProceduralMesh class
// =============================================================================

declare const CS: any

// =============================================================================
// Material Options
// =============================================================================

/**
 * Options for configuring a material on a mesh.
 *
 * @example
 * ```typescript
 * meshObject.material({
 *     texture: texture.checker({ colors: ["#e5e5e5", "#333"] }),
 *     tiling: 10,
 *     smoothness: 0.3
 * })
 * ```
 */
export interface MaterialOptions {
    /** Procedural texture to apply */
    texture?: ProceduralTexture
    /** Texture tiling - number for uniform, [x, y] for separate */
    tiling?: number | [number, number]
    /** Texture offset */
    offset?: [number, number]
    /** Base color (hex string) */
    color?: string
    /** Metallic value 0-1 (default: 0) */
    metallic?: number
    /** Smoothness value 0-1 (default: 0.5) */
    smoothness?: number
    /** Shader name: "Lit", "Standard", "Unlit", or custom path */
    shader?: string
}

/**
 * A procedural mesh that wraps Unity's Mesh object.
 * Mesh data is generated in JS and passed to Unity.
 */
export class ProceduralMesh {
    private _data: MeshData
    private _mesh: any = null
    private _gameObject: any = null

    constructor(data: MeshData) {
        this._data = data
    }

    /** Get the raw mesh data */
    get data(): MeshData {
        return this._data
    }

    /** Number of vertices */
    get vertexCount(): number {
        return this._data.vertices.length / 3
    }

    /** Number of triangles */
    get triangleCount(): number {
        return this._data.indices.length / 3
    }

    /** Get the underlying Unity Mesh (creates if needed) */
    getUnityMesh(): any {
        if (!this._mesh) {
            this._mesh = this._createUnityMesh()
        }
        return this._mesh
    }

    private _createUnityMesh(): any {
        const mesh = new CS.UnityEngine.Mesh()
        this._applyDataToMesh(mesh)
        return mesh
    }

    private _applyDataToMesh(mesh: any): void {
        const { vertices, normals, uvs, indices } = this._data

        // Convert to JS arrays with object literals (new array marshaling)
        const vertCount = vertices.length / 3
        const unityVerts: any[] = []
        const unityNormals: any[] = []
        const unityUVs: any[] = []

        for (let i = 0; i < vertCount; i++) {
            const vi = i * 3
            unityVerts.push({ x: vertices[vi], y: vertices[vi + 1], z: vertices[vi + 2] })

            if (normals) {
                unityNormals.push({ x: normals[vi], y: normals[vi + 1], z: normals[vi + 2] })
            }

            if (uvs) {
                const ui = i * 2
                unityUVs.push({ x: uvs[ui], y: uvs[ui + 1] })
            }
        }

        // Convert indices to Int32Array for triangles
        const unityIndices = new Int32Array(indices)

        // Apply to mesh using new array marshaling (JS arrays auto-convert to C# arrays)
        ;(mesh as any).vertices = unityVerts
        if (normals) (mesh as any).normals = unityNormals
        if (uvs) (mesh as any).uv = unityUVs
        ;(mesh as any).triangles = unityIndices

        mesh.RecalculateBounds()
    }

    /** Update mesh data and refresh Unity mesh */
    setData(data: MeshData): this {
        this._data = data
        if (this._mesh) {
            this._mesh.Clear()
            this._applyDataToMesh(this._mesh)
        }
        return this
    }

    /** Recalculate normals from geometry */
    recalculateNormals(): this {
        if (this._mesh) {
            this._mesh.RecalculateNormals()
        }
        return this
    }

    /** Clone this mesh */
    clone(): ProceduralMesh {
        const newData: MeshData = {
            vertices: new Float32Array(this._data.vertices),
            normals: this._data.normals ? new Float32Array(this._data.normals) : undefined,
            uvs: this._data.uvs ? new Float32Array(this._data.uvs) : undefined,
            indices: new Uint32Array(this._data.indices)
        }
        return new ProceduralMesh(newData)
    }

    /**
     * Create a GameObject with this mesh.
     * Returns a MeshObject for further manipulation.
     */
    instantiate(name = "ProceduralMesh"): MeshObject {
        const go = new CS.UnityEngine.GameObject(name)

        // Add MeshFilter
        const meshFilter = go.AddComponent(CS.UnityEngine.MeshFilter)
        meshFilter.mesh = this.getUnityMesh()

        // Add MeshRenderer with default material
        const meshRenderer = go.AddComponent(CS.UnityEngine.MeshRenderer)
        meshRenderer.material = new CS.UnityEngine.Material(
            CS.UnityEngine.Shader.Find("Standard")
        )

        this._gameObject = go
        return new MeshObject(go, this)
    }

    /** Dispose Unity resources */
    dispose(): void {
        if (this._mesh) {
            CS.UnityEngine.Object.Destroy(this._mesh)
            this._mesh = null
        }
    }
}

/**
 * An instantiated mesh object with transform and material controls.
 */
export class MeshObject {
    private _gameObject: any
    private _mesh: ProceduralMesh
    private _transform: any
    private _renderer: any

    constructor(gameObject: any, mesh: ProceduralMesh) {
        this._gameObject = gameObject
        this._mesh = mesh
        this._transform = gameObject.transform
        this._renderer = gameObject.GetComponent(CS.UnityEngine.MeshRenderer)
    }

    /** The underlying ProceduralMesh */
    get mesh(): ProceduralMesh {
        return this._mesh
    }

    /** The Unity GameObject */
    get gameObject(): any {
        return this._gameObject
    }

    /** The Unity Transform */
    get transform(): any {
        return this._transform
    }

    /** Set world position */
    setPosition(x: number, y: number, z: number): this {
        this._transform.position = new CS.UnityEngine.Vector3(x, y, z)
        return this
    }

    /** Set euler rotation in degrees */
    setRotation(x: number, y: number, z: number): this {
        this._transform.eulerAngles = new CS.UnityEngine.Vector3(x, y, z)
        return this
    }

    /** Set scale */
    setScale(x: number, y: number, z: number): this {
        this._transform.localScale = new CS.UnityEngine.Vector3(x, y, z)
        return this
    }

    /** Set uniform scale */
    setUniformScale(s: number): this {
        return this.setScale(s, s, s)
    }

    /** Set material color */
    setColor(color: string | Color): this {
        let r: number, g: number, b: number, a: number
        if (typeof color === "string") {
            const hex = color.replace("#", "")
            r = parseInt(hex.slice(0, 2), 16) / 255
            g = parseInt(hex.slice(2, 4), 16) / 255
            b = parseInt(hex.slice(4, 6), 16) / 255
            a = hex.length > 6 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
        } else {
            r = color.r
            g = color.g
            b = color.b
            a = color.a ?? 1
        }
        this._renderer.material.color = new CS.UnityEngine.Color(r, g, b, a)
        return this
    }

    /** Set a Unity Material */
    setMaterial(material: any): this {
        this._renderer.material = material
        return this
    }

    /** Set a shader by name and return fluent material builder */
    useShader(shaderName: string): this {
        const shader = CS.UnityEngine.Shader.Find(shaderName)
        if (shader) {
            this._renderer.material = new CS.UnityEngine.Material(shader)
        }
        return this
    }

    /**
     * Configure material with texture, tiling, and PBR properties.
     *
     * @example
     * ```typescript
     * import { mesh, texture } from "onejs-unity/proc"
     *
     * mesh.plane({ width: 100, height: 100 })
     *     .instantiate("Ground")
     *     .material({
     *         texture: texture.checker({ colors: ["#e5e5e5", "#333"] }),
     *         tiling: 10,
     *         smoothness: 0.3
     *     })
     * ```
     */
    material(options: MaterialOptions): this {
        const {
            texture,
            tiling,
            offset,
            color,
            metallic,
            smoothness,
            shader
        } = options

        // Determine shader - prefer URP Lit, fallback to Standard
        // Note: Using Standard shader properties (mainTexture, mainTextureScale) for compatibility
        const shaderName = shader === "Lit" ? "Universal Render Pipeline/Lit"
            : shader === "Standard" ? "Standard"
            : shader === "Unlit" ? "Unlit/Texture"
            : shader || "Universal Render Pipeline/Lit"

        let shaderObj = CS.UnityEngine.Shader.Find(shaderName)
        if (!shaderObj) {
            shaderObj = CS.UnityEngine.Shader.Find("Standard")
        }

        const mat = new CS.UnityEngine.Material(shaderObj)

        // Apply texture using mainTexture (maps to _MainTex, works with Standard shader)
        if (texture) {
            mat.mainTexture = texture.getUnityTexture()
        }

        // Apply tiling
        if (tiling !== undefined) {
            const [tx, ty] = typeof tiling === "number" ? [tiling, tiling] : tiling
            mat.mainTextureScale = new CS.UnityEngine.Vector2(tx, ty)
        }

        // Apply offset
        if (offset) {
            mat.mainTextureOffset = new CS.UnityEngine.Vector2(offset[0], offset[1])
        }

        // Apply color
        if (color) {
            const hex = color.replace("#", "")
            const r = parseInt(hex.slice(0, 2), 16) / 255
            const g = parseInt(hex.slice(2, 4), 16) / 255
            const b = parseInt(hex.slice(4, 6), 16) / 255
            const a = hex.length > 6 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
            mat.color = new CS.UnityEngine.Color(r, g, b, a)
        }

        // Apply metallic
        if (metallic !== undefined) {
            mat.SetFloat("_Metallic", metallic)
        }

        // Apply smoothness (Standard shader uses _Glossiness)
        if (smoothness !== undefined) {
            mat.SetFloat("_Glossiness", smoothness)
        }

        this._renderer.material = mat
        return this
    }

    /** Destroy the GameObject */
    dispose(): void {
        if (this._gameObject) {
            CS.UnityEngine.Object.Destroy(this._gameObject)
            this._gameObject = null
        }
    }
}

// =============================================================================
// Public API - Factory Functions
// =============================================================================

/**
 * Create a cube mesh.
 *
 * @example
 * ```typescript
 * const cube = mesh.cube({ size: 2 })
 * cube.instantiate("MyCube").setPosition(0, 1, 0).setColor("#ff0000")
 * ```
 */
export function cube(options: CubeOptions = {}): ProceduralMesh {
    return new ProceduralMesh(generateCube(options))
}

/**
 * Create a sphere mesh.
 *
 * @example
 * ```typescript
 * const sphere = mesh.sphere({ radius: 1, longitudeSegments: 32 })
 * sphere.instantiate().setColor("#00ff00")
 * ```
 */
export function sphere(options: SphereOptions = {}): ProceduralMesh {
    return new ProceduralMesh(generateSphere(options))
}

/**
 * Create a cylinder mesh.
 */
export function cylinder(options: CylinderOptions = {}): ProceduralMesh {
    return new ProceduralMesh(generateCylinder(options))
}

/**
 * Create a cone mesh.
 */
export function cone(options: ConeOptions = {}): ProceduralMesh {
    return new ProceduralMesh(generateCone(options))
}

/**
 * Create a plane mesh.
 *
 * @example
 * ```typescript
 * // High-resolution terrain
 * const terrain = mesh.plane({ width: 100, height: 100, segmentsX: 128, segmentsZ: 128 })
 * // Displace with noise...
 * ```
 */
export function plane(options: PlaneOptions = {}): ProceduralMesh {
    return new ProceduralMesh(generatePlane(options))
}

/**
 * Create a torus mesh.
 */
export function torus(options: TorusOptions = {}): ProceduralMesh {
    return new ProceduralMesh(generateTorus(options))
}

/**
 * Create a quad (single face).
 */
export function quad(options: QuadOptions = {}): ProceduralMesh {
    return new ProceduralMesh(generateQuad(options))
}

/**
 * Create a mesh from raw data.
 */
export function fromData(data: MeshData): ProceduralMesh {
    return new ProceduralMesh(data)
}
