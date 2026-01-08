/**
 * Procedural mesh primitives.
 *
 * Provides one-liner APIs for creating common 3D primitives.
 *
 * @module onejs-unity/proc/geometry
 */

import type {
    MeshData,
    Mesh,
    MeshInstance,
    Material,
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

// =============================================================================
// C# Bridge Declaration
// =============================================================================

declare const CS: {
    OneJS: {
        Proc: {
            MeshBridge: {
                // Primitives
                CreateCube(sizeX: number, sizeY: number, sizeZ: number): number
                CreateSphere(radius: number, lon: number, lat: number): number
                CreateCylinder(radius: number, height: number, segments: number): number
                CreateCone(radius: number, height: number, segments: number): number
                CreatePlane(width: number, height: number, segX: number, segZ: number): number
                CreateTorus(radius: number, tubeRadius: number, radial: number, tubular: number): number
                CreateQuad(width: number, height: number): number

                // Custom mesh
                CreateEmpty(): number
                SetMeshData(handle: number, vertices: number[], normals: number[], uvs: number[], indices: number[]): void
                GetMeshData(handle: number): number[]

                // Operations
                CloneMesh(handle: number): number
                RecalculateNormals(handle: number): void
                RecalculateBounds(handle: number): void
                OptimizeMesh(handle: number): void
                GetVertexCount(handle: number): number
                GetTriangleCount(handle: number): number

                // Instantiation
                Instantiate(meshHandle: number, name: string): number
                SetPosition(handle: number, x: number, y: number, z: number): void
                SetRotation(handle: number, x: number, y: number, z: number): void
                SetScale(handle: number, x: number, y: number, z: number): void
                GetGameObject(handle: number): unknown

                // Materials
                CreateMaterial(shaderName: string): number
                SetMaterialColor(handle: number, r: number, g: number, b: number, a: number): void
                SetMaterialFloat(handle: number, name: string, value: number): void
                RegisterMaterial(material: unknown): number
                SetInstanceMaterial(instanceHandle: number, materialHandle: number): void

                // Cleanup
                DisposeMesh(handle: number): void
                DisposeInstance(handle: number): void
                DisposeMaterial(handle: number): void
                Cleanup(): void
            }
        }
    }
}

// Lazy accessor for bridge (may not exist until runtime)
function getBridge() {
    return CS?.OneJS?.Proc?.MeshBridge
}

// =============================================================================
// Material Implementation
// =============================================================================

class MaterialImpl implements Material {
    readonly __handle: number

    constructor(handle: number) {
        this.__handle = handle
    }

    setColor(color: Color | string): Material {
        const bridge = getBridge()
        if (!bridge) return this

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
        bridge.SetMaterialColor(this.__handle, r, g, b, a)
        return this
    }

    setFloat(name: string, value: number): Material {
        const bridge = getBridge()
        if (bridge) {
            bridge.SetMaterialFloat(this.__handle, name, value)
        }
        return this
    }

    setTexture(_name: string, _texture: unknown): Material {
        // TODO: Implement texture handle support
        return this
    }

    dispose(): void {
        const bridge = getBridge()
        if (bridge) {
            bridge.DisposeMaterial(this.__handle)
        }
    }
}

// =============================================================================
// MeshInstance Implementation
// =============================================================================

class MeshInstanceImpl implements MeshInstance {
    readonly __handle: number
    readonly mesh: Mesh

    private _position: Vector3 = { x: 0, y: 0, z: 0 }
    private _rotation: Vector3 = { x: 0, y: 0, z: 0 }
    private _scale: Vector3 = { x: 1, y: 1, z: 1 }

    constructor(handle: number, mesh: Mesh) {
        this.__handle = handle
        this.mesh = mesh
    }

    setPosition(x: number, y: number, z: number): MeshInstance {
        const bridge = getBridge()
        if (bridge) {
            bridge.SetPosition(this.__handle, x, y, z)
        }
        this._position = { x, y, z }
        return this
    }

    setRotation(x: number, y: number, z: number): MeshInstance {
        const bridge = getBridge()
        if (bridge) {
            bridge.SetRotation(this.__handle, x, y, z)
        }
        this._rotation = { x, y, z }
        return this
    }

    setScale(x: number, y: number, z: number): MeshInstance {
        const bridge = getBridge()
        if (bridge) {
            bridge.SetScale(this.__handle, x, y, z)
        }
        this._scale = { x, y, z }
        return this
    }

    get position(): Vector3 {
        return { ...this._position }
    }

    set position(v: Vector3) {
        this.setPosition(v.x, v.y, v.z)
    }

    get rotation(): Vector3 {
        return { ...this._rotation }
    }

    set rotation(v: Vector3) {
        this.setRotation(v.x, v.y, v.z)
    }

    get scale(): Vector3 {
        return { ...this._scale }
    }

    set scale(v: Vector3) {
        this.setScale(v.x, v.y, v.z)
    }

    setMaterial(material: Material): MeshInstance {
        const bridge = getBridge()
        if (bridge) {
            bridge.SetInstanceMaterial(this.__handle, material.__handle)
        }
        return this
    }

    getGameObject(): unknown {
        const bridge = getBridge()
        if (bridge) {
            return bridge.GetGameObject(this.__handle)
        }
        return null
    }

    dispose(): void {
        const bridge = getBridge()
        if (bridge) {
            bridge.DisposeInstance(this.__handle)
        }
    }
}

// =============================================================================
// Mesh Implementation
// =============================================================================

class MeshImpl implements Mesh {
    readonly __handle: number

    constructor(handle: number) {
        this.__handle = handle
    }

    get vertexCount(): number {
        const bridge = getBridge()
        return bridge ? bridge.GetVertexCount(this.__handle) : 0
    }

    get triangleCount(): number {
        const bridge = getBridge()
        return bridge ? bridge.GetTriangleCount(this.__handle) : 0
    }

    getData(): MeshData {
        const bridge = getBridge()
        if (!bridge) {
            return {
                vertices: new Float32Array(0),
                indices: new Uint32Array(0)
            }
        }

        const data = bridge.GetMeshData(this.__handle)
        if (!data || data.length === 0) {
            return {
                vertices: new Float32Array(0),
                indices: new Uint32Array(0)
            }
        }

        let idx = 0
        const vertexCount = data[idx++]

        const vertices = new Float32Array(vertexCount * 3)
        for (let i = 0; i < vertexCount * 3; i++) {
            vertices[i] = data[idx++]
        }

        const normals = new Float32Array(vertexCount * 3)
        for (let i = 0; i < vertexCount * 3; i++) {
            normals[i] = data[idx++]
        }

        const uvs = new Float32Array(vertexCount * 2)
        for (let i = 0; i < vertexCount * 2; i++) {
            uvs[i] = data[idx++]
        }

        const indexCount = data[idx++]
        const indices = new Uint32Array(indexCount)
        for (let i = 0; i < indexCount; i++) {
            indices[i] = data[idx++]
        }

        return { vertices, normals, uvs, indices }
    }

    setData(data: MeshData): void {
        const bridge = getBridge()
        if (!bridge) return

        const vertices = Array.from(data.vertices)
        const normals = data.normals ? Array.from(data.normals) : []
        const uvs = data.uvs ? Array.from(data.uvs) : []
        const indices = Array.from(data.indices)

        bridge.SetMeshData(this.__handle, vertices, normals, uvs, indices)
    }

    clone(): Mesh {
        const bridge = getBridge()
        if (!bridge) {
            throw new Error("MeshBridge not available")
        }
        const newHandle = bridge.CloneMesh(this.__handle)
        return new MeshImpl(newHandle)
    }

    recalculateNormals(): void {
        const bridge = getBridge()
        if (bridge) {
            bridge.RecalculateNormals(this.__handle)
        }
    }

    recalculateBounds(): void {
        const bridge = getBridge()
        if (bridge) {
            bridge.RecalculateBounds(this.__handle)
        }
    }

    optimize(): void {
        const bridge = getBridge()
        if (bridge) {
            bridge.OptimizeMesh(this.__handle)
        }
    }

    instantiate(name?: string): MeshInstance {
        const bridge = getBridge()
        if (!bridge) {
            throw new Error("MeshBridge not available")
        }
        const instanceHandle = bridge.Instantiate(this.__handle, name ?? "ProceduralMesh")
        return new MeshInstanceImpl(instanceHandle, this)
    }

    dispose(): void {
        const bridge = getBridge()
        if (bridge) {
            bridge.DisposeMesh(this.__handle)
        }
    }
}

// =============================================================================
// Primitive Factory Functions
// =============================================================================

/**
 * Create a cube mesh.
 *
 * @param options - Cube configuration
 * @returns A Mesh handle
 *
 * @example
 * ```typescript
 * const cube = mesh.cube({ size: 2 })
 * cube.instantiate("MyCube").setPosition(0, 1, 0)
 * ```
 */
export function cube(options: CubeOptions = {}): Mesh {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const size = options.size ?? 1
    const [sx, sy, sz] = Array.isArray(size) ? size : [size, size, size]

    const handle = bridge.CreateCube(sx, sy, sz)
    return new MeshImpl(handle)
}

/**
 * Create a sphere mesh.
 *
 * @param options - Sphere configuration
 * @returns A Mesh handle
 *
 * @example
 * ```typescript
 * const sphere = mesh.sphere({ radius: 1, longitudeSegments: 32 })
 * ```
 */
export function sphere(options: SphereOptions = {}): Mesh {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const {
        radius = 0.5,
        longitudeSegments = 24,
        latitudeSegments = 16
    } = options

    const handle = bridge.CreateSphere(radius, longitudeSegments, latitudeSegments)
    return new MeshImpl(handle)
}

/**
 * Create a cylinder mesh.
 *
 * @param options - Cylinder configuration
 * @returns A Mesh handle
 */
export function cylinder(options: CylinderOptions = {}): Mesh {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const { radius = 0.5, height = 1, segments = 24 } = options
    const handle = bridge.CreateCylinder(radius, height, segments)
    return new MeshImpl(handle)
}

/**
 * Create a cone mesh.
 *
 * @param options - Cone configuration
 * @returns A Mesh handle
 */
export function cone(options: ConeOptions = {}): Mesh {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const { radius = 0.5, height = 1, segments = 24 } = options
    const handle = bridge.CreateCone(radius, height, segments)
    return new MeshImpl(handle)
}

/**
 * Create a plane mesh.
 *
 * @param options - Plane configuration
 * @returns A Mesh handle
 *
 * @example
 * ```typescript
 * // High-resolution plane for terrain
 * const terrain = mesh.plane({ width: 10, height: 10, segmentsX: 64, segmentsZ: 64 })
 * ```
 */
export function plane(options: PlaneOptions = {}): Mesh {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const { width = 1, height = 1, segmentsX = 1, segmentsZ = 1 } = options
    const handle = bridge.CreatePlane(width, height, segmentsX, segmentsZ)
    return new MeshImpl(handle)
}

/**
 * Create a torus mesh.
 *
 * @param options - Torus configuration
 * @returns A Mesh handle
 */
export function torus(options: TorusOptions = {}): Mesh {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const {
        radius = 1,
        tubeRadius = 0.3,
        radialSegments = 16,
        tubularSegments = 32
    } = options

    const handle = bridge.CreateTorus(radius, tubeRadius, radialSegments, tubularSegments)
    return new MeshImpl(handle)
}

/**
 * Create a quad mesh.
 *
 * @param options - Quad configuration
 * @returns A Mesh handle
 */
export function quad(options: QuadOptions = {}): Mesh {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const { width = 1, height = 1 } = options
    const handle = bridge.CreateQuad(width, height)
    return new MeshImpl(handle)
}

/**
 * Create a mesh from raw data.
 *
 * @param data - Mesh data (vertices, normals, uvs, indices)
 * @returns A Mesh handle
 */
export function fromData(data: MeshData): Mesh {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const handle = bridge.CreateEmpty()
    const mesh = new MeshImpl(handle)
    mesh.setData(data)
    return mesh
}

/**
 * Create a material.
 *
 * @param shader - Shader name (default: "Standard")
 * @returns A Material handle
 *
 * @example
 * ```typescript
 * const mat = mesh.material("Standard").setColor("#ff5500")
 * sphere.instantiate().setMaterial(mat)
 * ```
 */
export function material(shader = "Standard"): Material {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const handle = bridge.CreateMaterial(shader)
    return new MaterialImpl(handle)
}

/**
 * Register an external Unity Material.
 *
 * @param materialObject - A Unity Material object
 * @returns A Material handle
 */
export function registerMaterial(materialObject: unknown): Material {
    const bridge = getBridge()
    if (!bridge) {
        throw new Error("MeshBridge not available")
    }

    const handle = bridge.RegisterMaterial(materialObject)
    return new MaterialImpl(handle)
}

/**
 * Clean up all mesh resources.
 */
export function cleanup(): void {
    const bridge = getBridge()
    if (bridge) {
        bridge.Cleanup()
    }
}
