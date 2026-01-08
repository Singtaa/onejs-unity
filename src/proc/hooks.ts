/**
 * React hooks for procedural generation.
 *
 * These hooks simplify common patterns when working with noise,
 * meshes, and procedural textures in React components.
 *
 * @module onejs-unity/proc
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react"
import { noise, perlin2D, simplex2D, value2D, worley2D } from "./noise"
import { gpuNoise } from "./noise/gpu"
import {
    mesh,
    cube,
    sphere,
    cylinder,
    cone,
    plane,
    torus,
    quad,
    material as createMaterial,
    cleanup
} from "./geometry"
import type {
    NoiseSource2D,
    NoiseSource3D,
    NoiseConfig,
    WorleyConfig,
    FBMConfig,
    NoiseType,
    GPUNoiseOptions,
    Mesh,
    MeshInstance,
    Material,
    MeshData,
    CubeOptions,
    SphereOptions,
    CylinderOptions,
    ConeOptions,
    PlaneOptions,
    TorusOptions,
    QuadOptions
} from "./types"

// =============================================================================
// Noise Hooks
// =============================================================================

/**
 * Options for useNoise hook.
 */
export interface UseNoiseOptions extends NoiseConfig {
    /**
     * Noise type to use.
     * @default "perlin"
     */
    type?: NoiseType

    /**
     * FBM configuration (optional).
     * If provided, applies FBM layering to the noise.
     */
    fbm?: FBMConfig

    /**
     * Apply turbulence instead of FBM.
     * @default false
     */
    turbulence?: boolean

    /**
     * Worley noise specific options (only used when type is "worley").
     */
    worley?: {
        distance?: "euclidean" | "manhattan" | "chebyshev"
        returnType?: "f1" | "f2" | "f2-f1"
    }
}

/**
 * Hook that creates and manages a 2D noise source.
 *
 * The noise source is memoized and only recreated when options change.
 *
 * @param options - Noise configuration options
 * @returns A 2D noise source ready for sampling
 *
 * @example Basic Perlin noise
 * ```tsx
 * function TerrainGenerator() {
 *     const noise = useNoise({ seed: 42, frequency: 0.1 })
 *
 *     const height = noise.sample(x, y)
 *     // ...
 * }
 * ```
 *
 * @example FBM layered noise
 * ```tsx
 * function CloudGenerator() {
 *     const noise = useNoise({
 *         type: "simplex",
 *         seed: 123,
 *         fbm: { octaves: 5, persistence: 0.6 }
 *     })
 *
 *     const density = noise.sample(x, y)
 * }
 * ```
 *
 * @example Turbulence for fire
 * ```tsx
 * function FireEffect() {
 *     const noise = useNoise({
 *         type: "perlin",
 *         turbulence: true,
 *         fbm: { octaves: 4 }
 *     })
 * }
 * ```
 */
export function useNoise(options: UseNoiseOptions = {}): NoiseSource2D {
    const {
        type = "perlin",
        seed,
        frequency,
        fbm,
        turbulence,
        worley: worleyConfig
    } = options

    return useMemo(() => {
        let source: NoiseSource2D

        const baseConfig: NoiseConfig = { seed, frequency }

        switch (type) {
            case "perlin":
                source = perlin2D(baseConfig)
                break
            case "simplex":
                source = simplex2D(baseConfig)
                break
            case "value":
                source = value2D(baseConfig)
                break
            case "worley":
                source = worley2D({
                    ...baseConfig,
                    ...worleyConfig
                })
                break
            default:
                source = perlin2D(baseConfig)
        }

        // Apply FBM or turbulence
        if (fbm) {
            if (turbulence) {
                source = source.turbulence(fbm)
            } else {
                source = source.fbm(fbm)
            }
        }

        return source
    }, [type, seed, frequency, fbm?.octaves, fbm?.lacunarity, fbm?.persistence, turbulence, worleyConfig?.distance, worleyConfig?.returnType])
}

/**
 * Hook that creates a 3D noise source.
 *
 * @param options - Noise configuration options
 * @returns A 3D noise source ready for sampling
 *
 * @example Animated noise
 * ```tsx
 * function AnimatedBackground() {
 *     const noise = useNoise3D({ type: "simplex", seed: 42 })
 *
 *     useAnimationFrame((dt) => {
 *         const value = noise.sample(x, y, time)
 *     })
 * }
 * ```
 */
export function useNoise3D(options: UseNoiseOptions = {}): NoiseSource3D {
    const {
        type = "perlin",
        seed,
        frequency,
        fbm,
        turbulence,
        worley: worleyConfig
    } = options

    return useMemo(() => {
        let source: NoiseSource3D

        const baseConfig: NoiseConfig = { seed, frequency }

        switch (type) {
            case "perlin":
                source = noise.perlin3D(baseConfig)
                break
            case "simplex":
                source = noise.simplex3D(baseConfig)
                break
            case "value":
                source = noise.value3D(baseConfig)
                break
            case "worley":
                source = noise.worley3D({
                    ...baseConfig,
                    ...worleyConfig
                })
                break
            default:
                source = noise.perlin3D(baseConfig)
        }

        // Apply FBM or turbulence
        if (fbm) {
            if (turbulence) {
                source = source.turbulence(fbm)
            } else {
                source = source.fbm(fbm)
            }
        }

        return source
    }, [type, seed, frequency, fbm?.octaves, fbm?.lacunarity, fbm?.persistence, turbulence, worleyConfig?.distance, worleyConfig?.returnType])
}

/**
 * Options for useNoiseTexture hook.
 */
export interface UseNoiseTextureOptions extends GPUNoiseOptions {
    /**
     * Noise type to generate.
     * @default "perlin"
     */
    type?: NoiseType | "fbm" | "turbulence"

    /**
     * Base noise type for FBM/turbulence.
     * @default "perlin"
     */
    baseType?: "perlin" | "simplex"

    /**
     * Whether to animate the noise.
     * @default false
     */
    animated?: boolean
}

/**
 * Return type for useNoiseTexture hook.
 */
export interface UseNoiseTextureResult {
    /**
     * Whether the GPU noise system is available.
     */
    available: boolean

    /**
     * Whether the shader is loaded and ready.
     */
    ready: boolean

    /**
     * Dispatch noise generation to the texture.
     * Call this to update the texture with new parameters.
     */
    dispatch: (texture: unknown, options?: GPUNoiseOptions) => void

    /**
     * Current time value for animated noise.
     */
    time: number
}

/**
 * Hook for GPU-accelerated noise texture generation.
 *
 * Handles shader loading, dispatching, and animation timing.
 *
 * @param options - Noise texture options
 * @returns Control object for noise texture generation
 *
 * @example Static noise texture
 * ```tsx
 * function NoiseBackground() {
 *     const texture = useComputeTexture({ width: 512, height: 512 })
 *     const { ready, dispatch } = useNoiseTexture({
 *         type: "fbm",
 *         baseType: "simplex",
 *         octaves: 6
 *     })
 *
 *     useEffect(() => {
 *         if (ready && texture) {
 *             dispatch(texture, { frequency: 4 })
 *         }
 *     }, [ready, texture])
 *
 *     return <RawImage texture={texture} />
 * }
 * ```
 *
 * @example Animated noise
 * ```tsx
 * function AnimatedNoise() {
 *     const texture = useComputeTexture({ width: 256, height: 256 })
 *     const { ready, dispatch, time } = useNoiseTexture({
 *         type: "perlin",
 *         animated: true,
 *         frequency: 2
 *     })
 *
 *     useAnimationFrame(() => {
 *         if (ready && texture) {
 *             dispatch(texture, { time })
 *         }
 *     })
 *
 *     return <RawImage texture={texture} />
 * }
 * ```
 */
export function useNoiseTexture(options: UseNoiseTextureOptions = {}): UseNoiseTextureResult {
    const {
        type = "perlin",
        baseType = "perlin",
        animated = false,
        ...noiseOptions
    } = options

    const [ready, setReady] = useState(false)
    const timeRef = useRef(0)
    const lastFrameRef = useRef<number | null>(null)

    // Check availability
    const available = gpuNoise.available

    // Preload shader
    useEffect(() => {
        if (!available) return

        gpuNoise.preload().then(() => {
            setReady(true)
        }).catch(err => {
            console.error("Failed to preload noise shader:", err)
        })
    }, [available])

    // Animation time tracking
    useEffect(() => {
        if (!animated || !ready) return

        let rafId: number

        function tick(time: number) {
            if (lastFrameRef.current !== null) {
                const dt = (time - lastFrameRef.current) / 1000
                timeRef.current += dt
            }
            lastFrameRef.current = time
            rafId = requestAnimationFrame(tick)
        }

        rafId = requestAnimationFrame(tick)

        return () => {
            cancelAnimationFrame(rafId)
            lastFrameRef.current = null
        }
    }, [animated, ready])

    // Dispatch function
    const dispatch = useCallback((texture: unknown, overrides: GPUNoiseOptions = {}) => {
        if (!ready) return

        const finalOptions = {
            ...noiseOptions,
            ...overrides,
            time: overrides.time ?? timeRef.current
        }

        // Handle FBM type parameter
        if (type === "fbm" || type === "turbulence") {
            (finalOptions as { type?: string }).type = baseType
        }

        gpuNoise.dispatchSync(
            texture as Parameters<typeof gpuNoise.dispatchSync>[0],
            type,
            finalOptions
        )
    }, [ready, type, baseType, noiseOptions])

    return {
        available,
        ready,
        dispatch,
        get time() { return timeRef.current }
    }
}

// =============================================================================
// Mesh Hooks
// =============================================================================

/**
 * Primitive mesh type names.
 */
export type PrimitiveType = "cube" | "sphere" | "cylinder" | "cone" | "plane" | "torus" | "quad"

/**
 * Options for useMesh hook.
 */
export type UseMeshOptions =
    | { type: "cube" } & CubeOptions
    | { type: "sphere" } & SphereOptions
    | { type: "cylinder" } & CylinderOptions
    | { type: "cone" } & ConeOptions
    | { type: "plane" } & PlaneOptions
    | { type: "torus" } & TorusOptions
    | { type: "quad" } & QuadOptions
    | { type: "custom"; data: MeshData }

/**
 * Hook that creates and manages a procedural mesh.
 *
 * Handles creation and cleanup automatically.
 *
 * @param options - Mesh configuration
 * @returns The managed Mesh, or null if not ready
 *
 * @example Primitive mesh
 * ```tsx
 * function MySphere() {
 *     const sphereMesh = useMesh({ type: "sphere", radius: 1 })
 *
 *     useEffect(() => {
 *         if (sphereMesh) {
 *             sphereMesh.instantiate("MySphere")
 *         }
 *     }, [sphereMesh])
 * }
 * ```
 *
 * @example Custom mesh data
 * ```tsx
 * function CustomMesh() {
 *     const meshData = useMemo(() => ({
 *         vertices: new Float32Array([0, 1, 0, -1, 0, 0, 1, 0, 0]),
 *         indices: new Uint32Array([0, 1, 2])
 *     }), [])
 *
 *     const mesh = useMesh({ type: "custom", data: meshData })
 * }
 * ```
 */
export function useMesh(options: UseMeshOptions): Mesh | null {
    const [meshHandle, setMeshHandle] = useState<Mesh | null>(null)

    // Serialize options for dependency comparison
    const optionsKey = JSON.stringify(options)

    useEffect(() => {
        let newMesh: Mesh

        try {
            switch (options.type) {
                case "cube":
                    newMesh = cube(options)
                    break
                case "sphere":
                    newMesh = sphere(options)
                    break
                case "cylinder":
                    newMesh = cylinder(options)
                    break
                case "cone":
                    newMesh = cone(options)
                    break
                case "plane":
                    newMesh = plane(options)
                    break
                case "torus":
                    newMesh = torus(options)
                    break
                case "quad":
                    newMesh = quad(options)
                    break
                case "custom":
                    newMesh = mesh.fromData(options.data)
                    break
                default:
                    return
            }

            setMeshHandle(newMesh)

            return () => {
                newMesh.dispose()
            }
        } catch (err) {
            console.error("Failed to create mesh:", err)
        }
    }, [optionsKey])

    return meshHandle
}

/**
 * Options for useMeshInstance hook.
 */
export interface UseMeshInstanceOptions {
    /**
     * Name for the GameObject.
     */
    name?: string

    /**
     * Initial position.
     */
    position?: { x: number; y: number; z: number }

    /**
     * Initial rotation (Euler angles).
     */
    rotation?: { x: number; y: number; z: number }

    /**
     * Initial scale.
     */
    scale?: { x: number; y: number; z: number }

    /**
     * Material to apply.
     */
    material?: Material
}

/**
 * Hook that creates and manages a mesh instance in the scene.
 *
 * Instantiates a mesh as a GameObject and handles cleanup.
 *
 * @param meshHandle - The mesh to instantiate
 * @param options - Instance configuration
 * @returns The managed MeshInstance, or null if not ready
 *
 * @example Basic instance
 * ```tsx
 * function MyObject() {
 *     const sphereMesh = useMesh({ type: "sphere", radius: 1 })
 *     const instance = useMeshInstance(sphereMesh, {
 *         name: "MySphere",
 *         position: { x: 0, y: 2, z: 0 }
 *     })
 * }
 * ```
 *
 * @example With material
 * ```tsx
 * function ColoredCube() {
 *     const cubeMesh = useMesh({ type: "cube", size: 1 })
 *     const mat = useMaterial({ color: "#ff5500" })
 *     const instance = useMeshInstance(cubeMesh, {
 *         name: "RedCube",
 *         material: mat
 *     })
 * }
 * ```
 */
export function useMeshInstance(
    meshHandle: Mesh | null,
    options: UseMeshInstanceOptions = {}
): MeshInstance | null {
    const { name, position, rotation, scale, material } = options
    const [instance, setInstance] = useState<MeshInstance | null>(null)

    useEffect(() => {
        if (!meshHandle) return

        try {
            const newInstance = meshHandle.instantiate(name)

            if (position) {
                newInstance.setPosition(position.x, position.y, position.z)
            }
            if (rotation) {
                newInstance.setRotation(rotation.x, rotation.y, rotation.z)
            }
            if (scale) {
                newInstance.setScale(scale.x, scale.y, scale.z)
            }
            if (material) {
                newInstance.setMaterial(material)
            }

            setInstance(newInstance)

            return () => {
                newInstance.dispose()
            }
        } catch (err) {
            console.error("Failed to create mesh instance:", err)
        }
    }, [meshHandle, name, position?.x, position?.y, position?.z, rotation?.x, rotation?.y, rotation?.z, scale?.x, scale?.y, scale?.z, material])

    return instance
}

/**
 * Options for useMaterial hook.
 */
export interface UseMaterialOptions {
    /**
     * Shader name.
     * @default "Standard"
     */
    shader?: string

    /**
     * Material color (hex string or Color object).
     */
    color?: string | { r: number; g: number; b: number; a: number }

    /**
     * Float properties to set.
     */
    floats?: Record<string, number>
}

/**
 * Hook that creates and manages a material.
 *
 * @param options - Material configuration
 * @returns The managed Material, or null if not ready
 *
 * @example Simple colored material
 * ```tsx
 * function RedObject() {
 *     const mat = useMaterial({ color: "#ff0000" })
 *     const mesh = useMesh({ type: "cube" })
 *     const instance = useMeshInstance(mesh, { material: mat })
 * }
 * ```
 *
 * @example Material with properties
 * ```tsx
 * function ShinyMetal() {
 *     const mat = useMaterial({
 *         shader: "Standard",
 *         color: "#888888",
 *         floats: {
 *             _Metallic: 0.9,
 *             _Smoothness: 0.8
 *         }
 *     })
 * }
 * ```
 */
export function useMaterial(options: UseMaterialOptions = {}): Material | null {
    const { shader = "Standard", color, floats } = options
    const [mat, setMat] = useState<Material | null>(null)

    // Serialize for dependency comparison
    const floatsKey = floats ? JSON.stringify(floats) : ""

    useEffect(() => {
        try {
            const newMat = createMaterial(shader)

            if (color) {
                newMat.setColor(color)
            }

            if (floats) {
                for (const [name, value] of Object.entries(floats)) {
                    newMat.setFloat(name, value)
                }
            }

            setMat(newMat)

            return () => {
                newMat.dispose()
            }
        } catch (err) {
            console.error("Failed to create material:", err)
        }
    }, [shader, color, floatsKey])

    return mat
}

/**
 * Hook that provides access to mesh operations.
 *
 * Returns the mesh namespace with all creation functions.
 *
 * @example
 * ```tsx
 * function MeshCreator() {
 *     const m = useMeshFactory()
 *
 *     const handleCreate = () => {
 *         const sphere = m.sphere({ radius: 1 })
 *         sphere.instantiate("NewSphere")
 *     }
 * }
 * ```
 */
export function useMeshFactory() {
    return mesh
}

/**
 * Hook that cleans up all procedural mesh resources on unmount.
 *
 * Use this at the root of your proc-heavy components.
 *
 * @example
 * ```tsx
 * function ProceduralScene() {
 *     useProcCleanup()
 *
 *     // Create lots of procedural meshes...
 *     // All will be cleaned up when component unmounts
 * }
 * ```
 */
export function useProcCleanup(): void {
    useEffect(() => {
        return () => {
            cleanup()
        }
    }, [])
}
