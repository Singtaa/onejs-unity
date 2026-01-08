/**
 * Type definitions for the procedural generation module.
 *
 * @module onejs-unity/proc
 */

// =============================================================================
// Common Types
// =============================================================================

export interface Vector2 {
    x: number
    y: number
}

export interface Vector3 {
    x: number
    y: number
    z: number
}

export interface Vector4 {
    x: number
    y: number
    z: number
    w: number
}

export interface Color {
    r: number
    g: number
    b: number
    a: number
}

// =============================================================================
// Noise Types
// =============================================================================

/**
 * 2D noise function signature.
 */
export type Noise2D = (x: number, y: number) => number

/**
 * 3D noise function signature.
 */
export type Noise3D = (x: number, y: number, z: number) => number

/**
 * Base configuration for noise functions.
 */
export interface NoiseConfig {
    /** Random seed for reproducible noise (default: 0) */
    seed?: number
    /** Base frequency multiplier (default: 1.0) */
    frequency?: number
}

/**
 * FBM (Fractal Brownian Motion) configuration.
 */
export interface FBMConfig {
    /** Number of octaves to layer (default: 4) */
    octaves?: number
    /** Frequency multiplier per octave (default: 2.0) */
    lacunarity?: number
    /** Amplitude multiplier per octave (default: 0.5) */
    persistence?: number
}

/**
 * Worley/Voronoi noise specific configuration.
 */
export interface WorleyConfig extends NoiseConfig {
    /** Distance function to use */
    distance?: "euclidean" | "manhattan" | "chebyshev"
    /** Which distance to return: closest (f1), second closest (f2), or cellular (f2-f1) */
    returnType?: "f1" | "f2" | "f2-f1"
}

/**
 * A composable 2D noise source that supports FBM and turbulence layering.
 */
export interface NoiseSource2D {
    /**
     * Sample noise value at the given 2D coordinates.
     * @returns Value typically in range [-1, 1] for gradient noise, [0, 1] for value/cellular
     */
    sample(x: number, y: number): number

    /**
     * Create FBM (Fractal Brownian Motion) from this noise source.
     * Layers multiple octaves with decreasing amplitude for natural-looking results.
     */
    fbm(config?: FBMConfig): NoiseSource2D

    /**
     * Create turbulence from this noise source.
     * Like FBM but uses absolute value of each octave for billowy/cloudy effects.
     */
    turbulence(config?: FBMConfig): NoiseSource2D
}

/**
 * A composable 3D noise source that supports FBM and turbulence layering.
 */
export interface NoiseSource3D {
    /**
     * Sample noise value at the given 3D coordinates.
     * @returns Value typically in range [-1, 1] for gradient noise, [0, 1] for value/cellular
     */
    sample(x: number, y: number, z: number): number

    /**
     * Create FBM (Fractal Brownian Motion) from this noise source.
     */
    fbm(config?: FBMConfig): NoiseSource3D

    /**
     * Create turbulence from this noise source.
     */
    turbulence(config?: FBMConfig): NoiseSource3D
}

/**
 * GPU noise texture generation options.
 */
export interface GPUNoiseOptions extends FBMConfig {
    /** Base frequency/scale (default: 1.0) */
    frequency?: number
    /** Random seed (default: 0) */
    seed?: number
    /** Time offset for animation */
    time?: number
    /** Z slice for 3D noise (default: 0) */
    z?: number
}

/**
 * Noise type identifier.
 */
export type NoiseType = "perlin" | "simplex" | "worley" | "value"

// =============================================================================
// Geometry Types
// =============================================================================

/**
 * Raw mesh data for JS-side manipulation.
 */
export interface MeshData {
    /** Vertex positions: xyz xyz xyz... (3 floats per vertex) */
    vertices: Float32Array
    /** Vertex normals: xyz xyz xyz... (3 floats per vertex) */
    normals?: Float32Array
    /** Primary UV coordinates: uv uv uv... (2 floats per vertex) */
    uvs?: Float32Array
    /** Secondary UV coordinates */
    uv2s?: Float32Array
    /** Vertex colors: rgba rgba rgba... (4 floats per vertex) */
    colors?: Float32Array
    /** Triangle indices (3 indices per triangle) */
    indices: Uint32Array
}

/**
 * Cube primitive options.
 */
export interface CubeOptions {
    /** Size as uniform or per-axis [x, y, z] (default: 1) */
    size?: number | [number, number, number]
}

/**
 * Sphere primitive options.
 */
export interface SphereOptions {
    /** Sphere radius (default: 0.5) */
    radius?: number
    /** Longitude segments (default: 24) */
    longitudeSegments?: number
    /** Latitude segments (default: 16) */
    latitudeSegments?: number
}

/**
 * Cylinder primitive options.
 */
export interface CylinderOptions {
    /** Cylinder radius (default: 0.5) */
    radius?: number
    /** Cylinder height (default: 1) */
    height?: number
    /** Radial segments (default: 24) */
    segments?: number
}

/**
 * Cone primitive options.
 */
export interface ConeOptions {
    /** Base radius (default: 0.5) */
    radius?: number
    /** Cone height (default: 1) */
    height?: number
    /** Radial segments (default: 24) */
    segments?: number
}

/**
 * Plane primitive options.
 */
export interface PlaneOptions {
    /** Plane width (default: 1) */
    width?: number
    /** Plane height/depth (default: 1) */
    height?: number
    /** X-axis subdivisions (default: 1) */
    segmentsX?: number
    /** Z-axis subdivisions (default: 1) */
    segmentsZ?: number
}

/**
 * Torus primitive options.
 */
export interface TorusOptions {
    /** Distance from center to tube center (default: 1) */
    radius?: number
    /** Tube radius (default: 0.3) */
    tubeRadius?: number
    /** Radial segments around the ring (default: 16) */
    radialSegments?: number
    /** Tubular segments around the tube (default: 32) */
    tubularSegments?: number
}

/**
 * Quad primitive options.
 */
export interface QuadOptions {
    /** Quad width (default: 1) */
    width?: number
    /** Quad height (default: 1) */
    height?: number
}

/**
 * Handle to a procedural mesh.
 */
export interface Mesh {
    /** Internal handle ID */
    readonly __handle: number
    /** Number of vertices */
    readonly vertexCount: number
    /** Number of triangles */
    readonly triangleCount: number

    /** Get mesh data for JS manipulation */
    getData(): MeshData
    /** Update mesh with modified data */
    setData(data: MeshData): void

    /** Create a copy of this mesh */
    clone(): Mesh
    /** Recalculate normals from geometry */
    recalculateNormals(): void
    /** Recalculate bounding box */
    recalculateBounds(): void
    /** Optimize mesh for rendering */
    optimize(): void

    /** Create a GameObject with this mesh */
    instantiate(name?: string): MeshInstance
    /** Release mesh resources */
    dispose(): void
}

/**
 * Instantiated mesh (GameObject with MeshFilter/MeshRenderer).
 */
export interface MeshInstance {
    /** Internal handle ID */
    readonly __handle: number
    /** The source mesh */
    readonly mesh: Mesh

    /** Set world position */
    setPosition(x: number, y: number, z: number): MeshInstance
    /** Set euler rotation */
    setRotation(x: number, y: number, z: number): MeshInstance
    /** Set scale */
    setScale(x: number, y: number, z: number): MeshInstance

    /** Current position */
    position: Vector3
    /** Current rotation */
    rotation: Vector3
    /** Current scale */
    scale: Vector3

    /** Assign a material */
    setMaterial(material: Material): MeshInstance
    /** Get the Unity GameObject */
    getGameObject(): unknown

    /** Destroy the GameObject */
    dispose(): void
}

/**
 * Handle to a material.
 */
export interface Material {
    /** Internal handle ID */
    readonly __handle: number

    /** Set base color */
    setColor(color: Color | string): Material
    /** Set shader float property */
    setFloat(name: string, value: number): Material
    /** Set shader texture property */
    setTexture(name: string, texture: unknown): Material

    /** Release material resources */
    dispose(): void
}

/**
 * Fluent mesh builder for custom geometry.
 */
export interface MeshBuilder {
    /**
     * Add a vertex. Returns the vertex index for triangle references.
     */
    vertex(x: number, y: number, z: number): number

    /** Set normal for the last added vertex */
    normal(x: number, y: number, z: number): MeshBuilder
    /** Set UV for the last added vertex */
    uv(u: number, v: number): MeshBuilder
    /** Set color for the last added vertex */
    color(r: number, g: number, b: number, a?: number): MeshBuilder

    /** Add a triangle by vertex indices */
    triangle(a: number, b: number, c: number): MeshBuilder
    /** Add a quad (two triangles) by vertex indices */
    quad(a: number, b: number, c: number, d: number): MeshBuilder

    /** Finalize and create the mesh */
    build(): Mesh
}

// =============================================================================
// Texture Types
// =============================================================================

/**
 * Procedural texture pattern type.
 */
export type TexturePatternType =
    | "noise"
    | "voronoi"
    | "marble"
    | "wood"
    | "checkerboard"
    | "gradient"

/**
 * CPU texture generation options.
 */
export interface TextureOptions {
    /** Texture width */
    width: number
    /** Texture height */
    height: number
    /** Optional color mapping function */
    colorMap?: (value: number) => [number, number, number, number]
}

/**
 * GPU texture pattern options.
 */
export interface GPUTextureOptions {
    /** Base frequency/scale */
    frequency?: number
    /** Time for animation */
    time?: number
    /** Turbulence amount (for marble) */
    turbulence?: number
    /** Cell count (for voronoi) */
    cellCount?: number
    /** Ring count (for wood) */
    rings?: number
}
