# Procedural Generation Module

`onejs-unity/proc`: Procedural noise, geometry, and textures for OneJS.

## Overview

The proc module provides procedural generation capabilities with both pure JavaScript (portable) and GPU-accelerated implementations:

| Module | Description | CPU | GPU |
|--------|-------------|-----|-----|
| **noise** | Perlin, Simplex, Value, Worley noise with FBM | Yes | Yes |
| **geometry** | Primitives, mesh builder, mesh objects with materials | Yes | No |
| **texture** | Voronoi, marble, wood, gradients, textures for materials | Yes | Yes |

## Installation

The proc module is part of `onejs-unity`:

```typescript
// Full module
import { noise, mesh, texture } from "onejs-unity/proc"

// Submodules (smaller bundle)
import { noise } from "onejs-unity/proc/noise"
import { mesh } from "onejs-unity/proc/geometry"
import { texture } from "onejs-unity/proc/texture"
```

## Quick Start

### Noise Generation

```typescript
import { noise } from "onejs-unity/proc"

// Simple 2D Perlin noise
const perlin = noise.perlin2D({ seed: 42 })
const value = perlin.sample(x, y)  // [-1, 1]

// FBM for terrain
const terrain = noise.perlin2D().fbm({ octaves: 6 })
const height = terrain.sample(x, y)

// GPU noise texture
if (noise.gpu.available) {
    await noise.gpu.perlin(renderTexture, { frequency: 4 })
}
```

### Procedural Geometry

```typescript
import { mesh } from "onejs-unity/proc"

// One-liner primitives
const sphere = mesh.sphere({ radius: 1 })
sphere.instantiate("MySphere").setPosition(0, 2, 0)

// Custom geometry. vertex() returns the new vertex's index, so it ends a chain
const b = mesh.builder()
b.vertex(0, 1, 0); b.uv(0.5, 1)
b.vertex(-1, 0, -1); b.uv(0, 0)
b.vertex(1, 0, -1); b.uv(1, 0)
const tri = b.triangle(0, 1, 2).build()

// Colour and material are set on the instance
sphere.instantiate("RedSphere").setColor("#ff5500")
```

### Procedural Textures

```typescript
import { texture } from "onejs-unity/proc"

// CPU texture: RGBA pixel data
const marble = texture.marble({
    width: 512,
    height: 512,
    frequency: 5,
    turbulence: 3
})

// GPU texture
if (texture.gpu.available) {
    await texture.gpu.voronoi(renderTexture, { cellCount: 16 })
}
```

### React Hooks

```typescript
import {
    useNoise,
    useMesh,
    useMeshInstance,
    useMaterial
} from "onejs-unity/proc"

function ProceduralObject() {
    const noise = useNoise({ type: "perlin", fbm: { octaves: 4 } })
    const sphereMesh = useMesh({ type: "sphere", radius: 1 })
    const mat = useMaterial({ color: "#ff5500" })
    const instance = useMeshInstance(sphereMesh, {
        name: "MySphere",
        position: { x: 0, y: 2, z: 0 },
        material: mat
    })

    return null  // Mesh is in 3D scene, not UI
}
```

## Module Structure

```
proc/
├── index.ts              # Main exports
├── types.ts              # Type definitions
├── hooks.ts              # React hooks
├── README.md             # This file
├── HOOKS.md              # Hooks documentation
├── noise/
│   ├── index.ts          # Noise API
│   ├── perlin.ts         # Perlin 2D/3D
│   ├── simplex.ts        # Simplex 2D/3D
│   ├── value.ts          # Value 2D/3D
│   ├── worley.ts         # Worley/Cellular 2D/3D
│   ├── gpu.ts            # GPU noise dispatch
│   └── README.md         # Noise docs
├── geometry/
│   ├── index.ts          # Geometry API
│   ├── primitives.ts     # Cube, sphere, etc.
│   ├── builder.ts        # MeshBuilder
│   └── README.md         # Geometry docs
└── texture/
    ├── index.ts          # Texture API
    ├── generators.ts     # CPU patterns
    ├── gpu.ts            # GPU patterns
    └── README.md         # Texture docs
```

## API Summary

### Noise

| Function | Description |
|----------|-------------|
| `noise.perlin2D/3D()` | Perlin gradient noise |
| `noise.simplex2D/3D()` | Simplex gradient noise |
| `noise.value2D/3D()` | Value noise |
| `noise.worley2D/3D()` | Worley/Cellular noise |
| `noise.fill2D/3D()` | Batch fill arrays |
| `noise.gpu.*` | GPU noise generation |

### Geometry

| Function | Description |
|----------|-------------|
| `mesh.cube()` | Create cube primitive |
| `mesh.sphere()` | Create sphere primitive |
| `mesh.cylinder()` | Create cylinder |
| `mesh.cone()` | Create cone |
| `mesh.plane()` | Create plane |
| `mesh.torus()` | Create torus |
| `mesh.quad()` | Create quad |
| `mesh.fromData()` | Mesh from raw `MeshData` |
| `mesh.builder()` | Custom geometry builder |
| `mesh.combine()` | Combine multiple meshes |
| `mesh.generators.*` | The same primitives as plain `MeshData`, no Unity needed |

### Texture

| Function | Description |
|----------|-------------|
| `texture.checker()` | Checkerboard as a `ProceduralTexture` |
| `texture.gradient()` | Two colour gradient as a `ProceduralTexture` |
| `texture.solid()` | Solid colour as a `ProceduralTexture` |
| `texture.fromData()` | `ProceduralTexture` from RGBA pixel data |
| `texture.noise()` | Noise-based pixels (CPU) |
| `texture.voronoi()` | Voronoi cells (CPU) |
| `texture.marble()` | Marble veins (CPU) |
| `texture.wood()` | Wood grain (CPU) |
| `texture.checkerboard()` | Alternating cells (CPU) |
| `texture.rawGradient()` | Linear/radial gradient pixels (CPU) |
| `texture.colorMaps` | Built-in color mappings |
| `texture.gpu.*` | GPU pattern generation |

### React Hooks

| Hook | Description |
|------|-------------|
| `useNoise()` | Create 2D noise source |
| `useNoise3D()` | Create 3D noise source |
| `useNoiseTexture()` | GPU noise texture |
| `useMesh()` | Create procedural mesh |
| `useMeshInstance()` | Instantiate mesh in scene |
| `useMaterial()` | Create material |
| `useMeshFactory()` | Access mesh namespace |
| `useProcCleanup()` | Dispose tracked resources on unmount |

## Submodule Documentation

- [Noise Module](./noise/README.md): Detailed noise documentation
- [Geometry Module](./geometry/README.md): Mesh creation and manipulation
- [Texture Module](./texture/README.md): Procedural patterns
- [Hooks Reference](./HOOKS.md): React hooks documentation

## Unity Integration

### Meshes

The geometry module has no C# bridge of its own: `ProceduralMesh` builds a `UnityEngine.Mesh` through the `CS` proxy when first instantiated, and `instantiate()` adds a `MeshFilter` and a `MeshRenderer` to a new GameObject.

### Compute Shaders

GPU noise and patterns use compute shaders at:
```
Assets/Singtaa/OneJS/Unity/Shaders/Noise/
├── NoiseCommon.cginc         # Shared HLSL functions
├── ProceduralNoise.compute   # Noise kernels
└── ProceduralPatterns.compute # Pattern kernels
```

## Performance Tips

### CPU vs GPU

| Scenario | Recommendation |
|----------|----------------|
| Small samples (< 64x64) | CPU (no dispatch overhead) |
| Large textures (512+) | GPU |
| Per-frame updates | GPU with `dispatchSync()` |
| WebGL builds | CPU: compute shaders are unavailable there, so guard on `.gpu.available` |
| One-time generation | Either |

### Zero-Allocation Pattern

For animation loops, preload shaders and use sync dispatch:

```typescript
// At startup
await noise.gpu.preload()
await texture.gpu.preload()

// In the animation loop: no allocations
noise.gpu.dispatchSync(noiseTexture, "perlin", { time: t })
texture.gpu.dispatchSync(patternTexture, "marble", { time: t })
```

### Mesh Resource Management

Always clean up procedural meshes when done:

```typescript
// Manual cleanup
sphere.dispose()    // the Unity Mesh
instance.dispose()  // the GameObject

// In React, useMesh and useMeshInstance dispose their own on unmount.
// useProcCleanup disposes anything else you hand it:
const { track } = useProcCleanup()
track(sphere)
```

## Examples

### Noise-Displaced Terrain

```typescript
import { noise, mesh } from "onejs-unity/proc"

// Create plane
const terrain = mesh.plane({ width: 20, height: 20, segmentsX: 64, segmentsZ: 64 })
const data = terrain.data

// Create noise source
const heightNoise = noise.perlin2D({ seed: 12345 }).fbm({ octaves: 6 })

// Displace vertices
for (let i = 0; i < data.vertices.length; i += 3) {
    const x = data.vertices[i]
    const z = data.vertices[i + 2]
    data.vertices[i + 1] = heightNoise.sample(x * 0.1, z * 0.1) * 5
}

// Apply changes. recalculateNormals() acts on the Unity mesh, which exists
// once the mesh is instantiated
terrain.setData(data)
terrain.instantiate("Terrain")
terrain.recalculateNormals()
```

### Animated GPU Background

```typescript
import { noise } from "onejs-unity/proc"
import { useComputeTexture } from "onejs-unity/gpu"
import { useFrame } from "onejs-react"

function AnimatedBackground() {
    const texture = useComputeTexture({ autoResize: false, width: 512, height: 512 })
    const [ready, setReady] = useState(false)
    const timeRef = useRef(0)

    useEffect(() => {
        noise.gpu.preload().then(() => setReady(true))
    }, [])

    useFrame((dt) => {
        if (!ready || !texture) return
        timeRef.current += dt

        noise.gpu.dispatchSync(texture, "fbm", {
            type: "simplex",
            frequency: 3,
            octaves: 5,
            time: timeRef.current
        })
    })

    // A texture reaches an element through the backgroundImage style. There is
    // no component for it: the reconciler special-cases the property so the
    // texture is attached on the C# side rather than marshalled every frame.
    return <View style={{ width: "100%", height: "100%", backgroundImage: texture }} />
}
```

### Procedural Object Grid

```typescript
import { useMesh } from "onejs-unity/proc"
import { useEffect } from "react"

function ObjectGrid({ count = 5 }) {
    const cubeMesh = useMesh({ type: "cube", size: 0.8 })

    useEffect(() => {
        if (!cubeMesh) return

        const cubes = []
        for (let x = 0; x < count; x++) {
            for (let z = 0; z < count; z++) {
                cubes.push(cubeMesh.instantiate(`Cube_${x}_${z}`)
                    .setPosition(x * 2 - count, 0, z * 2 - count)
                    .setColor("#4488ff"))
            }
        }
        return () => cubes.forEach(c => c.dispose())
    }, [cubeMesh, count])

    return null
}
```
