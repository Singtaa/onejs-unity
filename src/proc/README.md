# Procedural Generation Module

`onejs-unity/proc` - Procedural noise, geometry, and textures for OneJS.

## Overview

The proc module provides procedural generation capabilities with both pure JavaScript (portable) and GPU-accelerated implementations:

| Module | Description | CPU | GPU |
|--------|-------------|-----|-----|
| **noise** | Perlin, Simplex, Value, Worley noise with FBM | Yes | Yes |
| **geometry** | Primitives, mesh builder, materials | Yes | - |
| **texture** | Voronoi, marble, wood, gradients | Yes | Yes |

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

// Custom geometry
const pyramid = mesh.builder()
    .vertex(0, 1, 0).uv(0.5, 1)
    .vertex(-1, 0, -1).uv(0, 0)
    .vertex(1, 0, -1).uv(1, 0)
    .triangle(0, 1, 2)
    .build()

// Materials
const mat = mesh.material().setColor("#ff5500")
sphere.instantiate("RedSphere").setMaterial(mat)
```

### Procedural Textures

```typescript
import { texture } from "onejs-unity/proc"

// CPU texture
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
| `mesh.builder()` | Custom geometry builder |
| `mesh.combine()` | Combine multiple meshes |
| `mesh.material()` | Create material |
| `mesh.cleanup()` | Dispose all resources |

### Texture

| Function | Description |
|----------|-------------|
| `texture.noise()` | Noise-based texture (CPU) |
| `texture.voronoi()` | Voronoi cells (CPU) |
| `texture.marble()` | Marble veins (CPU) |
| `texture.wood()` | Wood grain (CPU) |
| `texture.checkerboard()` | Alternating cells (CPU) |
| `texture.gradient()` | Linear/radial gradients (CPU) |
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
| `useProcCleanup()` | Cleanup on unmount |

## Submodule Documentation

- [Noise Module](./noise/README.md) - Detailed noise documentation
- [Geometry Module](./geometry/README.md) - Mesh creation and manipulation
- [Texture Module](./texture/README.md) - Procedural patterns
- [Hooks Reference](./HOOKS.md) - React hooks documentation

## Unity Integration

### C# Bridge

The geometry module uses `MeshBridge.cs` located at:
```
Assets/Singtaa/OneJS/Unity/Proc/MeshBridge.cs
```

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
| WebGL builds | CPU (more consistent) |
| One-time generation | Either |

### Zero-Allocation Pattern

For animation loops, preload shaders and use sync dispatch:

```typescript
// At startup
await noise.gpu.preload()
await texture.gpu.preload()

// In animation loop - no allocations
noise.gpu.dispatchSync(noiseTexture, "perlin", { time: t })
texture.gpu.dispatchSync(patternTexture, "marble", { time: t })
```

### Mesh Resource Management

Always clean up procedural meshes when done:

```typescript
// Manual cleanup
mesh.dispose()
instance.dispose()
material.dispose()

// Or global cleanup
mesh.cleanup()

// Or use hook (automatic on unmount)
useProcCleanup()
```

## Examples

### Noise-Displaced Terrain

```typescript
import { noise, mesh } from "onejs-unity/proc"

// Create plane
const terrain = mesh.plane({ width: 20, height: 20, segmentsX: 64, segmentsZ: 64 })
const data = terrain.getData()

// Create noise source
const heightNoise = noise.perlin2D({ seed: 12345 }).fbm({ octaves: 6 })

// Displace vertices
for (let i = 0; i < data.vertices.length; i += 3) {
    const x = data.vertices[i]
    const z = data.vertices[i + 2]
    data.vertices[i + 1] = heightNoise.sample(x * 0.1, z * 0.1) * 5
}

// Apply changes
terrain.setData(data)
terrain.recalculateNormals()
terrain.instantiate("Terrain")
```

### Animated GPU Background

```typescript
import { noise } from "onejs-unity/proc"
import { useComputeTexture, useAnimationFrame } from "onejs-unity/gpu"

function AnimatedBackground() {
    const texture = useComputeTexture({ width: 512, height: 512 })
    const [ready, setReady] = useState(false)
    const timeRef = useRef(0)

    useEffect(() => {
        noise.gpu.preload().then(() => setReady(true))
    }, [])

    useAnimationFrame((dt) => {
        if (!ready || !texture) return
        timeRef.current += dt

        noise.gpu.dispatchSync(texture, "fbm", {
            type: "simplex",
            frequency: 3,
            octaves: 5,
            time: timeRef.current
        })
    })

    return <RawImage texture={texture} style={{ width: "100%", height: "100%" }} />
}
```

### Procedural Object Grid

```typescript
import { useMesh, useMaterial, useProcCleanup } from "onejs-unity/proc"
import { useEffect } from "react"

function ObjectGrid({ count = 5 }) {
    useProcCleanup()

    const cubeMesh = useMesh({ type: "cube", size: 0.8 })
    const mat = useMaterial({ color: "#4488ff" })

    useEffect(() => {
        if (!cubeMesh || !mat) return

        for (let x = 0; x < count; x++) {
            for (let z = 0; z < count; z++) {
                cubeMesh.instantiate(`Cube_${x}_${z}`)
                    .setPosition(x * 2 - count, 0, z * 2 - count)
                    .setMaterial(mat)
            }
        }
    }, [cubeMesh, mat, count])

    return null
}
```
