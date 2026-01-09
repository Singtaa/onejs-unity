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
    ProceduralMesh,
    MeshObject
} from "./geometry"
import type {
    NoiseSource2D,
    NoiseSource3D,
    NoiseConfig,
    WorleyConfig,
    FBMConfig,
    NoiseType,
    GPUNoiseOptions,
    MeshData,
    CubeOptions,
    SphereOptions,
    CylinderOptions,
    ConeOptions,
    PlaneOptions,
    TorusOptions,
    QuadOptions,
    Color
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
 * @returns The managed ProceduralMesh, or null if not ready
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
export function useMesh(options: UseMeshOptions): ProceduralMesh | null {
    const [meshHandle, setMeshHandle] = useState<ProceduralMesh | null>(null)

    // Serialize options for dependency comparison
    const optionsKey = JSON.stringify(options)

    useEffect(() => {
        let newMesh: ProceduralMesh

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
     * Color to apply (hex string or Color object).
     */
    color?: string | Color

    /**
     * Unity Material to apply.
     */
    material?: unknown

    /**
     * Shader to use.
     */
    shader?: string
}

/**
 * Hook that creates and manages a mesh instance in the scene.
 *
 * Instantiates a mesh as a GameObject and handles cleanup.
 *
 * @param meshHandle - The mesh to instantiate
 * @param options - Instance configuration
 * @returns The managed MeshObject, or null if not ready
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
 * @example With color
 * ```tsx
 * function ColoredCube() {
 *     const cubeMesh = useMesh({ type: "cube", size: 1 })
 *     const instance = useMeshInstance(cubeMesh, {
 *         name: "RedCube",
 *         color: "#ff5500"
 *     })
 * }
 * ```
 */
export function useMeshInstance(
    meshHandle: ProceduralMesh | null,
    options: UseMeshInstanceOptions = {}
): MeshObject | null {
    const { name, position, rotation, scale, color, material, shader } = options
    const [instance, setInstance] = useState<MeshObject | null>(null)

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
            if (shader) {
                newInstance.useShader(shader)
            }
            if (material) {
                newInstance.setMaterial(material)
            }
            if (color) {
                newInstance.setColor(color)
            }

            setInstance(newInstance)

            return () => {
                newInstance.dispose()
            }
        } catch (err) {
            console.error("Failed to create mesh instance:", err)
        }
    }, [meshHandle, name, position?.x, position?.y, position?.z, rotation?.x, rotation?.y, rotation?.z, scale?.x, scale?.y, scale?.z, color, material, shader])

    return instance
}

/**
 * Options for useMaterial hook.
 *
 * @deprecated Use MeshObject's setColor/useShader/setMaterial methods directly
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
    color?: string | Color

    /**
     * Float properties to set.
     */
    floats?: Record<string, number>
}

declare const CS: any

/**
 * Hook that creates and manages a Unity Material.
 *
 * @param options - Material configuration
 * @returns The Unity Material, or null if not ready
 *
 * @example Simple colored material
 * ```tsx
 * function RedObject() {
 *     const mat = useMaterial({ shader: "Standard", color: "#ff0000" })
 *     const mesh = useMesh({ type: "cube" })
 *     const instance = useMeshInstance(mesh, { material: mat })
 * }
 * ```
 *
 * @example Using MeshObject directly (preferred)
 * ```tsx
 * function ColoredCube() {
 *     const mesh = useMesh({ type: "cube" })
 *     // Color is applied directly without needing useMaterial
 *     const instance = useMeshInstance(mesh, { color: "#ff0000" })
 * }
 * ```
 */
export function useMaterial(options: UseMaterialOptions = {}): unknown | null {
    const { shader = "Standard", color, floats } = options
    const [mat, setMat] = useState<unknown | null>(null)

    // Serialize for dependency comparison
    const floatsKey = floats ? JSON.stringify(floats) : ""

    useEffect(() => {
        try {
            const shaderObj = CS.UnityEngine.Shader.Find(shader)
            if (!shaderObj) {
                console.warn(`Shader not found: ${shader}`)
                return
            }

            const newMat = CS.UnityEngine.Material.ctor(shaderObj)

            if (color) {
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
                newMat.color = CS.UnityEngine.Color.ctor(r, g, b, a)
            }

            if (floats) {
                for (const [name, value] of Object.entries(floats)) {
                    newMat.SetFloat(name, value)
                }
            }

            setMat(newMat)

            return () => {
                CS.UnityEngine.Object.Destroy(newMat)
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
 * Hook that tracks created meshes and cleans them up on unmount.
 *
 * Use this at the root of your proc-heavy components to track
 * meshes that should be cleaned up together.
 *
 * @returns Object with track/untrack functions for manual resource management
 *
 * @example
 * ```tsx
 * function ProceduralScene() {
 *     const { track } = useProcCleanup()
 *
 *     useEffect(() => {
 *         const sphere = mesh.sphere({ radius: 1 })
 *         const obj = sphere.instantiate("MySphere")
 *         track(sphere) // Will be disposed when component unmounts
 *         track(obj)
 *     }, [])
 * }
 * ```
 */
export function useProcCleanup(): {
    track: (resource: { dispose: () => void }) => void
    untrack: (resource: { dispose: () => void }) => void
} {
    const resourcesRef = useRef<Set<{ dispose: () => void }>>(new Set())

    useEffect(() => {
        return () => {
            for (const resource of resourcesRef.current) {
                try {
                    resource.dispose()
                } catch (err) {
                    console.error("Failed to dispose resource:", err)
                }
            }
            resourcesRef.current.clear()
        }
    }, [])

    return {
        track: (resource: { dispose: () => void }) => {
            resourcesRef.current.add(resource)
        },
        untrack: (resource: { dispose: () => void }) => {
            resourcesRef.current.delete(resource)
        }
    }
}
