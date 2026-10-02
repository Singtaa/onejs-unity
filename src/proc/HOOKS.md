# Procedural Generation Hooks

React hooks for noise generation, mesh creation, and procedural textures.

## Overview

| Hook | Purpose |
|------|---------|
| `useNoise` | Create 2D noise source |
| `useNoise3D` | Create 3D noise source |
| `useNoiseTexture` | GPU noise texture generation |
| `useMesh` | Create procedural mesh |
| `useMeshInstance` | Instantiate mesh in scene |
| `useMaterial` | Create material |
| `useMeshFactory` | Access mesh namespace |
| `useProcCleanup` | Dispose tracked resources on unmount |

## Noise Hooks

### useNoise

Create a memoized 2D noise source.

```tsx
import { useNoise } from "onejs-unity/proc"

function TerrainGenerator() {
    const noise = useNoise({
        type: "perlin",      // "perlin" | "simplex" | "value" | "worley"
        seed: 42,            // Reproducible results
        frequency: 0.1       // Scale factor
    })

    // Sample the noise
    const height = noise.sample(x, y)  // Returns [-1, 1] for gradient noise
}
```

**With FBM:**

```tsx
const terrain = useNoise({
    type: "perlin",
    seed: 12345,
    fbm: {
        octaves: 6,
        lacunarity: 2.0,
        persistence: 0.5
    }
})
```

**With Turbulence:**

```tsx
const smoke = useNoise({
    type: "perlin",
    turbulence: true,
    fbm: { octaves: 4 }
})
```

**Worley Noise:**

```tsx
const cells = useNoise({
    type: "worley",
    frequency: 5,
    worley: {
        distance: "euclidean",  // | "manhattan" | "chebyshev"
        returnType: "f1"                 // | "f2" | "f2-f1"
    }
})
```

### useNoise3D

Create a 3D noise source for animated effects.

```tsx
import { useNoise3D } from "onejs-unity/proc"
import { useFrame } from "onejs-react"

function AnimatedEffect() {
    const noise = useNoise3D({
        type: "simplex",
        seed: 42,
        fbm: { octaves: 4 }
    })

    const time = useRef(0)
    useFrame((dt) => {
        time.current += dt
        const value = noise.sample(x, y, time.current)  // z = time for animation
    })
}
```

### useNoiseTexture

GPU-accelerated noise texture generation.

```tsx
import { useNoiseTexture } from "onejs-unity/proc"
import { useComputeTexture } from "onejs-unity/gpu"

function NoiseBackground() {
    const texture = useComputeTexture({ autoResize: false, width: 512, height: 512 })
    const { available, ready, dispatch } = useNoiseTexture({
        type: "fbm",
        baseType: "simplex",
        frequency: 4,
        octaves: 6
    })

    useEffect(() => {
        if (ready && texture) {
            dispatch(texture)
        }
    }, [ready, texture])

    if (!available) {
        return <Label text="GPU compute not available" />
    }

    return <View style={{ width: 512, height: 512, backgroundImage: texture }} />
}
```

**Animated Noise Texture:**

```tsx
function AnimatedNoise() {
    const texture = useComputeTexture({ autoResize: false, width: 256, height: 256 })
    const { ready, dispatch } = useNoiseTexture({
        type: "perlin",
        animated: true,
        frequency: 2
    })

    // With animated: true, dispatch reads the hook's own clock unless you
    // pass { time }. The `time` field is a getter: destructured at render,
    // it would be the time of that render, not of this frame.
    useFrame(() => {
        if (ready && texture) {
            dispatch(texture)
        }
    })

    return <View style={{ width: 256, height: 256, backgroundImage: texture }} />
}
```

**Return Type:**

```typescript
interface UseNoiseTextureResult {
    available: boolean  // GPU compute available
    ready: boolean      // Shader loaded
    dispatch: (texture: unknown, options?: GPUNoiseOptions) => void
    readonly time: number  // Current animation time (a getter)
}
```

## Mesh Hooks

### useMesh

Create and manage a procedural mesh with automatic cleanup.

**Primitives:**

```tsx
import { useMesh } from "onejs-unity/proc"

function MySphere() {
    const mesh = useMesh({
        type: "sphere",
        radius: 1,
        longitudeSegments: 32,
        latitudeSegments: 16
    })

    useEffect(() => {
        if (!mesh) return
        const obj = mesh.instantiate("MySphere")
        return () => obj.dispose()
    }, [mesh])
}
```

**All Primitive Types:**

```tsx
// Cube
useMesh({ type: "cube", size: 1 })
useMesh({ type: "cube", size: [2, 1, 0.5] })

// Sphere
useMesh({ type: "sphere", radius: 0.5, longitudeSegments: 24, latitudeSegments: 16 })

// Cylinder
useMesh({ type: "cylinder", radius: 0.5, height: 1, segments: 24 })

// Cone
useMesh({ type: "cone", radius: 0.5, height: 1, segments: 24 })

// Plane
useMesh({ type: "plane", width: 10, height: 10, segmentsX: 64, segmentsZ: 64 })

// Torus
useMesh({ type: "torus", radius: 1, tubeRadius: 0.3, radialSegments: 16, tubularSegments: 32 })

// Quad
useMesh({ type: "quad", width: 1, height: 1 })
```

**Custom Mesh Data:**

```tsx
function CustomMesh() {
    const meshData = useMemo(() => ({
        vertices: new Float32Array([
            0, 1, 0,   // apex
            -1, 0, 0,  // bottom-left
            1, 0, 0    // bottom-right
        ]),
        indices: new Uint32Array([0, 1, 2])
    }), [])

    const mesh = useMesh({ type: "custom", data: meshData })

    useEffect(() => {
        if (!mesh) return
        const obj = mesh.instantiate("Triangle")
        mesh.recalculateNormals()  // after instantiate, once the Unity mesh exists
        return () => obj.dispose()
    }, [mesh])
}
```

### useMeshInstance

Create a mesh instance (GameObject) in the scene.

```tsx
import { useMesh, useMeshInstance } from "onejs-unity/proc"

function PositionedSphere() {
    const mesh = useMesh({ type: "sphere", radius: 1 })
    const instance = useMeshInstance(mesh, {
        name: "MySphere",
        position: { x: 0, y: 2, z: 0 },
        rotation: { x: 0, y: 45, z: 0 },
        scale: { x: 1, y: 1, z: 1 }
    })

    // Instance is automatically created and cleaned up
}
```

**With Material:**

```tsx
function ColoredCube() {
    const mesh = useMesh({ type: "cube", size: 1 })
    const mat = useMaterial({ color: "#ff5500" })
    const instance = useMeshInstance(mesh, {
        name: "RedCube",
        material: mat
    })
}
```

### useMaterial

Create and manage a material.

```tsx
import { useMaterial } from "onejs-unity/proc"

// Simple color
const redMat = useMaterial({ color: "#ff0000" })

// Color object
const blueMat = useMaterial({
    color: { r: 0, g: 0, b: 1, a: 1 }
})

// Custom shader with properties (the default shader is "Standard")
const metalMat = useMaterial({
    shader: "Standard",
    color: "#888888",
    floats: {
        _Metallic: 0.9,
        _Glossiness: 0.8
    }
})
```

It returns the `UnityEngine.Material`, or null until it exists (and when the
shader is not found). The material is destroyed on unmount.

### useMeshFactory

Access the mesh namespace for imperative operations.

```tsx
import { useMeshFactory } from "onejs-unity/proc"

function MeshCreator() {
    const mesh = useMeshFactory()

    const handleCreate = () => {
        // Create mesh imperatively
        const sphere = mesh.sphere({ radius: 1 })
        const instance = sphere.instantiate("NewSphere")
        instance.setPosition(0, 2, 0)
    }

    return <Button text="Create Sphere" onClick={handleCreate} />
}
```

### useProcCleanup

Dispose resources you create imperatively when the component unmounts.
`useMesh`, `useMeshInstance` and `useMaterial` already clean up after
themselves; this is for everything else. It returns `{ track, untrack }`.

```tsx
import { useProcCleanup, useMeshFactory } from "onejs-unity/proc"

function ProceduralScene() {
    const { track } = useProcCleanup()
    const mesh = useMeshFactory()

    const spawn = () => {
        const sphere = mesh.sphere()
        track(sphere)
        track(sphere.instantiate("Sphere"))
    }

    return <Button text="Spawn" onClick={spawn} />
}
```

## Complete Examples

### Noise-Displaced Terrain

```tsx
import { useNoise, useMesh, useMeshInstance, useMaterial } from "onejs-unity/proc"
import { useEffect } from "react"

function NoiseTerrain() {
    const noise = useNoise({
        type: "perlin",
        seed: 12345,
        fbm: { octaves: 6, persistence: 0.45 }
    })

    const terrainMesh = useMesh({
        type: "plane",
        width: 20,
        height: 20,
        segmentsX: 64,
        segmentsZ: 64
    })

    const mat = useMaterial({ color: "#4a8c4a" })

    const terrain = useMeshInstance(terrainMesh, {
        name: "Terrain",
        material: mat
    })

    useEffect(() => {
        if (!terrainMesh || !terrain) return

        const data = terrainMesh.data

        // Apply noise displacement
        for (let i = 0; i < data.vertices.length; i += 3) {
            const x = data.vertices[i]
            const z = data.vertices[i + 2]
            data.vertices[i + 1] = noise.sample(x * 0.1, z * 0.1) * 3
        }

        // The instance exists, so the Unity mesh does too
        terrainMesh.setData(data)
        terrainMesh.recalculateNormals()
    }, [terrainMesh, terrain, noise])

    return null
}
```

### Animated GPU Noise Shader

```tsx
import { useNoiseTexture } from "onejs-unity/proc"
import { useComputeTexture } from "onejs-unity/gpu"
import { useFrame } from "onejs-react"

function AnimatedNoiseBackground() {
    const texture = useComputeTexture({
        autoResize: false,
        width: 512,
        height: 512,
        enableRandomWrite: true
    })

    const { ready, dispatch } = useNoiseTexture({
        type: "fbm",
        baseType: "simplex",
        animated: true,
        frequency: 3,
        octaves: 5
    })

    useFrame(() => {
        if (ready && texture) {
            dispatch(texture)
        }
    })

    return <View style={{ width: "100%", height: "100%", backgroundImage: texture }} />
}
```

### Procedural Object Spawner

```tsx
import { useMeshFactory, useMaterial } from "onejs-unity/proc"
import { useState, useCallback } from "react"

function ObjectSpawner() {
    const mesh = useMeshFactory()
    const mat = useMaterial({ color: "#ff5500" })
    const [objects, setObjects] = useState<string[]>([])

    const spawn = useCallback(() => {
        const types = ["cube", "sphere", "cylinder", "cone"] as const
        const type = types[Math.floor(Math.random() * types.length)]

        let m
        switch (type) {
            case "cube": m = mesh.cube({ size: 1 }); break
            case "sphere": m = mesh.sphere({ radius: 0.5 }); break
            case "cylinder": m = mesh.cylinder({ radius: 0.3, height: 1 }); break
            case "cone": m = mesh.cone({ radius: 0.4, height: 1 }); break
        }

        const name = `Object_${Date.now()}`
        const instance = m.instantiate(name)
        instance.setPosition(
            Math.random() * 10 - 5,
            Math.random() * 5,
            Math.random() * 10 - 5
        )
        if (mat) instance.setMaterial(mat)

        setObjects(prev => [...prev, name])
    }, [mesh, mat])

    return (
        <View>
            <Button text="Spawn Random Object" onClick={spawn} />
            <Label text={`Objects: ${objects.length}`} />
        </View>
    )
}
```

## API Reference

### UseNoiseOptions

```typescript
interface UseNoiseOptions {
    type?: "perlin" | "simplex" | "value" | "worley"
    seed?: number
    frequency?: number
    fbm?: {
        octaves?: number
        lacunarity?: number
        persistence?: number
    }
    turbulence?: boolean
    worley?: {
        distance?: "euclidean" | "manhattan" | "chebyshev"
        returnType?: "f1" | "f2" | "f2-f1"
    }
}
```

### UseNoiseTextureOptions

```typescript
interface UseNoiseTextureOptions extends GPUNoiseOptions {
    type?: "perlin" | "simplex" | "value" | "worley" | "fbm" | "turbulence"
    baseType?: "perlin" | "simplex"
    animated?: boolean
}

// GPUNoiseOptions: frequency, seed, time, octaves, lacunarity, persistence
```

### UseMeshOptions

```typescript
type UseMeshOptions =
    | { type: "cube" } & CubeOptions
    | { type: "sphere" } & SphereOptions
    | { type: "cylinder" } & CylinderOptions
    | { type: "cone" } & ConeOptions
    | { type: "plane" } & PlaneOptions
    | { type: "torus" } & TorusOptions
    | { type: "quad" } & QuadOptions
    | { type: "custom"; data: MeshData }
```

### UseMeshInstanceOptions

```typescript
interface UseMeshInstanceOptions {
    name?: string
    position?: { x: number; y: number; z: number }
    rotation?: { x: number; y: number; z: number }
    scale?: { x: number; y: number; z: number }
    color?: string | Color
    material?: unknown   // a UnityEngine.Material, e.g. from useMaterial
    shader?: string      // applied before material and color
}
```

### UseMaterialOptions

```typescript
interface UseMaterialOptions {
    shader?: string
    color?: string | { r: number; g: number; b: number; a?: number }
    floats?: Record<string, number>
}
```
