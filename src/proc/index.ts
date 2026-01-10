/**
 * Procedural generation module for OneJS.
 *
 * Provides noise algorithms, procedural geometry, and procedural textures
 * with both pure JavaScript and GPU-accelerated implementations.
 *
 * @module onejs-unity/proc
 *
 * @example Noise generation
 * ```typescript
 * import { noise } from "onejs-unity/proc"
 *
 * // Simple Perlin noise
 * const perlin = noise.perlin2D({ seed: 42 })
 * const value = perlin.sample(x, y)
 *
 * // FBM for terrain heightmaps
 * const terrain = noise.perlin2D().fbm({ octaves: 6 })
 * const height = terrain.sample(x, y)
 *
 * // Turbulence for smoke/fire
 * const smoke = noise.simplex3D().turbulence({ octaves: 4 })
 * const distortion = smoke.sample(x, y, time)
 * ```
 *
 * @example Batch noise generation
 * ```typescript
 * import { noise } from "onejs-unity/proc"
 *
 * // Generate heightmap data
 * const heightmap = new Float32Array(256 * 256)
 * const source = noise.perlin2D().fbm({ octaves: 5 })
 *
 * noise.fill2D(heightmap, 256, 256, source, {
 *     scaleX: 0.02,
 *     scaleY: 0.02
 * })
 * ```
 *
 * @example Procedural geometry
 * ```typescript
 * import { mesh } from "onejs-unity/proc"
 *
 * // Create and instantiate primitives
 * mesh.sphere({ radius: 1 })
 *     .instantiate("MySphere")
 *     .setPosition(0, 2, 0)
 *     .setColor("#ff5500")
 *
 * // Custom geometry with builder
 * const pyramid = mesh.builder()
 *     .vertex(0, 1, 0).uv(0.5, 1)
 *     .vertex(-1, 0, -1).uv(0, 0)
 *     .vertex(1, 0, -1).uv(1, 0)
 *     .triangle(0, 1, 2)
 *     .build()
 *
 * pyramid.instantiate("Pyramid")
 *     .setColor("#ff5500")
 *     .useShader("Standard")
 * ```
 */

// =============================================================================
// Noise Module
// =============================================================================

export { noise } from "./noise"
export {
    perlin2D,
    perlin3D,
    simplex2D,
    simplex3D,
    value2D,
    value3D,
    worley2D,
    worley3D,
    gpuNoise,
    registerNoiseShader
} from "./noise"

// =============================================================================
// Geometry Module
// =============================================================================

export { mesh, ProceduralMesh, MeshObject } from "./geometry"
export {
    cube,
    sphere,
    cylinder,
    cone,
    plane,
    torus,
    quad,
    fromData as meshFromData,  // Renamed to avoid conflict with texture.fromData
    builder,
    combine,
    // Pure generators (for advanced use - no Unity dependency)
    generateCube,
    generateSphere,
    generatePlane,
    generateCylinder,
    generateCone,
    generateTorus,
    generateQuad
} from "./geometry"

export type { MaterialOptions } from "./geometry"

// =============================================================================
// React Hooks
// =============================================================================

export {
    // Noise hooks
    useNoise,
    useNoise3D,
    useNoiseTexture,
    // Mesh hooks
    useMesh,
    useMeshInstance,
    useMaterial,
    useMeshFactory,
    useProcCleanup
} from "./hooks"

export type {
    UseNoiseOptions,
    UseNoiseTextureOptions,
    UseNoiseTextureResult,
    UseMeshOptions,
    UseMeshInstanceOptions,
    UseMaterialOptions,
    PrimitiveType
} from "./hooks"

// =============================================================================
// Texture Module
// =============================================================================

export { texture, ProceduralTexture } from "./texture"
export {
    generateNoise,
    generateVoronoi,
    generateMarble,
    generateWood,
    generateCheckerboard,
    generateGradient,
    colorMaps,
    gpuTexture,
    registerPatternShader,
    // Fluent texture factories
    checker,
    gradient,
    solid,
    fromData as textureFromData  // Renamed to avoid confusion with mesh fromData
} from "./texture"

export type {
    NoiseTextureOptions,
    VoronoiTextureOptions,
    MarbleTextureOptions,
    WoodTextureOptions,
    CheckerboardTextureOptions,
    GradientTextureOptions,
    ColorMap,
    RGBA,
    GPUPatternOptions,
    // New types
    FilterMode,
    WrapMode,
    CheckerOptions,
    SimpleGradientOptions,
    SolidOptions,
    FromDataOptions
} from "./texture"

// =============================================================================
// Type Exports
// =============================================================================

export type {
    // Common types
    Vector2,
    Vector3,
    Vector4,
    Color,

    // Noise types
    Noise2D,
    Noise3D,
    NoiseConfig,
    FBMConfig,
    WorleyConfig,
    NoiseSource2D,
    NoiseSource3D,
    GPUNoiseOptions,
    NoiseType,

    // Geometry types
    MeshData,
    CubeOptions,
    SphereOptions,
    CylinderOptions,
    ConeOptions,
    PlaneOptions,
    TorusOptions,
    QuadOptions,

    // Texture types
    TexturePatternType,
    TextureOptions,
    GPUTextureOptions
} from "./types"

// Re-export MeshBuilder interface from builder
export type { MeshBuilder } from "./geometry"
