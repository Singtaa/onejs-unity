# Noise Module

Procedural noise generation for OneJS with both pure JavaScript and GPU-accelerated implementations.

## Overview

The noise module provides classic noise algorithms used in procedural generation:

| Algorithm | Characteristics | Best For |
|-----------|----------------|----------|
| **Perlin** | Smooth gradient noise, values [-1, 1] | Terrain, clouds, organic textures |
| **Simplex** | Faster than Perlin, fewer artifacts | Real-time effects, large-scale terrain |
| **Value** | Interpolated random values [0, 1] | Simple random patterns, pixelated effects |
| **Worley** | Cell/distance-based patterns [0, 1] | Stone, cells, caustics, voronoi |

All noise types support:
- **FBM (Fractal Brownian Motion)** - Layer multiple octaves for detail
- **Turbulence** - Absolute value FBM for fire/smoke effects
- **Seeding** - Reproducible results with seed values
- **Frequency scaling** - Control noise scale

## Quick Start

```typescript
import { noise } from "onejs-unity/proc"

// Simple 2D noise
const perlin = noise.perlin2D({ seed: 42 })
const value = perlin.sample(x, y)  // Returns [-1, 1]

// FBM for terrain heightmaps
const terrain = noise.perlin2D().fbm({ octaves: 6 })
const height = terrain.sample(x, y)

// Turbulence for fire/smoke
const fire = noise.simplex3D().turbulence({ octaves: 4 })
const distortion = fire.sample(x, y, time)
```

## Pure JavaScript Noise

### Perlin Noise

Classic gradient noise by Ken Perlin. Produces smooth, natural-looking patterns.

```typescript
// 2D Perlin
const perlin2d = noise.perlin2D({
    seed: 42,       // Optional: reproducible results
    frequency: 1.0  // Optional: scale factor
})
const n = perlin2d.sample(x, y)  // [-1, 1]

// 3D Perlin (use z for animation)
const perlin3d = noise.perlin3D({ seed: 42 })
const animated = perlin3d.sample(x, y, time * 0.5)
```

### Simplex Noise

Improved gradient noise - faster computation with fewer directional artifacts.

```typescript
const simplex = noise.simplex2D({ frequency: 0.05 })
const clouds = simplex.fbm({ octaves: 5, persistence: 0.6 })
```

### Value Noise

Interpolates random values at grid points. Faster but shows more grid artifacts.

```typescript
const value = noise.value2D({ frequency: 0.1 })
const n = value.sample(x, y)  // [0, 1]
```

### Worley (Cellular) Noise

Distance-based noise that creates cell patterns. Great for organic textures.

```typescript
// Basic cellular pattern
const cells = noise.worley2D({ frequency: 5 })

// Stone texture (f2 - f1 creates cell borders)
const stone = noise.worley2D({
    frequency: 3,
    returnType: "f2-f1"  // "f1" | "f2" | "f2-f1"
})

// Distance function options
const manhattan = noise.worley2D({
    distanceFunction: "manhattan"  // "euclidean" | "manhattan" | "chebyshev"
})
```

## Composable Patterns

### FBM (Fractal Brownian Motion)

Layer multiple octaves of noise for natural detail:

```typescript
const mountains = noise.perlin2D().fbm({
    octaves: 6,        // Number of layers (default: 4)
    lacunarity: 2.0,   // Frequency multiplier per octave (default: 2)
    persistence: 0.5   // Amplitude multiplier per octave (default: 0.5)
})
```

### Turbulence

Absolute value FBM - creates more chaotic, billowy patterns:

```typescript
const smoke = noise.perlin2D().turbulence({
    octaves: 4,
    lacunarity: 2.0,
    persistence: 0.5
})
```

## Batch Generation

Fill arrays efficiently for heightmaps and textures:

```typescript
const data = new Float32Array(256 * 256)
const source = noise.perlin2D().fbm({ octaves: 4 })

noise.fill2D(data, 256, 256, source, {
    scaleX: 0.01,
    scaleY: 0.01,
    offsetX: 0,
    offsetY: 0
})

// 3D noise at specific z (for animation)
noise.fill3D(data, 256, 256, noise.simplex3D(), time, {
    scaleX: 0.02,
    scaleY: 0.02
})
```

## Utility Functions

```typescript
// Remap [-1, 1] to [0, 1]
const normalized = noise.normalize(value)

// Sharp mountain ridges
const ridge = noise.ridge(value)  // 1 - abs(value)

// Cloud-like billows
const billow = noise.billow(value)  // abs(value)
```

## GPU-Accelerated Noise

For high-performance texture generation, use the GPU path:

```typescript
import { noise } from "onejs-unity/proc"
import { useComputeTexture } from "onejs-unity/gpu"

// Check if GPU compute is available
if (noise.gpu.available) {
    const texture = useComputeTexture({ width: 512, height: 512 })

    // Async generation (loads shader on first call)
    await noise.gpu.perlin(texture, { frequency: 4 })
    await noise.gpu.simplex(texture, { frequency: 2 })
    await noise.gpu.fbm(texture, {
        type: "perlin",
        octaves: 6,
        persistence: 0.5
    })

    // Preload for sync per-frame updates
    await noise.gpu.preload()

    // In animation loop (zero allocation)
    noise.gpu.dispatchSync(texture, "simplex", {
        frequency: 2,
        time: t
    })
}
```

### GPU Noise Options

```typescript
interface GPUNoiseOptions {
    frequency?: number     // Scale factor (default: 1)
    seed?: number         // Random seed (default: 0)
    time?: number         // Animation time (default: 0)
    octaves?: number      // FBM octaves (default: 4)
    lacunarity?: number   // Frequency multiplier (default: 2)
    persistence?: number  // Amplitude multiplier (default: 0.5)
}
```

### Available GPU Kernels

| Method | Description |
|--------|-------------|
| `noise.gpu.perlin()` | 2D Perlin noise |
| `noise.gpu.simplex()` | 2D Simplex noise |
| `noise.gpu.value()` | 2D Value noise |
| `noise.gpu.worley()` | 2D Worley/Cellular noise |
| `noise.gpu.fbm()` | FBM with Perlin or Simplex base |
| `noise.gpu.turbulence()` | Turbulence pattern |
| `noise.gpu.dispatch()` | Generic dispatch by type name |
| `noise.gpu.dispatchSync()` | Sync dispatch (after preload) |

## Compute Shader Details

The GPU implementation uses Unity compute shaders located at:
```
Assets/Singtaa/OneJS/Unity/Shaders/Noise/
├── NoiseCommon.cginc      # Shared HLSL noise functions
└── ProceduralNoise.compute # Compute kernels
```

### Thread Group Size

All kernels use `[numthreads(8, 8, 1)]` - the dispatcher automatically calculates dispatch dimensions.

### Output Modes

The shader supports three output modes:
- **0**: Raw grayscale (values as-is)
- **1**: Normalized [0, 1] grayscale (default)
- **2**: Color ramp (lerp between low/high colors)

## Performance Considerations

### CPU vs GPU

| Scenario | Recommendation |
|----------|----------------|
| One-time generation | Either (GPU faster for large textures) |
| Per-frame updates | GPU with `dispatchSync()` |
| Small samples (< 64x64) | CPU (no shader dispatch overhead) |
| Large textures (512+) | GPU |
| WebGL platform | CPU (more consistent) |

### Zero-Allocation Pattern

For animation loops, preload the shader and use sync dispatch:

```typescript
// At startup
await noise.gpu.preload()

// In animation loop - no allocations
noise.gpu.dispatchSync(texture, "perlin", {
    frequency: freq,
    time: time,
    seed: seed
})
```

## API Reference

### Noise Types

```typescript
type NoiseType = "perlin" | "simplex" | "value" | "worley"

interface NoiseConfig {
    seed?: number
    frequency?: number
}

interface WorleyConfig extends NoiseConfig {
    distanceFunction?: "euclidean" | "manhattan" | "chebyshev"
    returnType?: "f1" | "f2" | "f2-f1"
}

interface FBMConfig {
    octaves?: number      // Default: 4
    lacunarity?: number   // Default: 2
    persistence?: number  // Default: 0.5
}
```

### NoiseSource Interface

All noise functions return a composable source:

```typescript
interface NoiseSource2D {
    sample(x: number, y: number): number
    fbm(config?: FBMConfig): NoiseSource2D
    turbulence(config?: FBMConfig): NoiseSource2D
}

interface NoiseSource3D {
    sample(x: number, y: number, z: number): number
    fbm(config?: FBMConfig): NoiseSource3D
    turbulence(config?: FBMConfig): NoiseSource3D
}
```

## Examples

### Terrain Heightmap

```typescript
const heightmap = new Float32Array(512 * 512)
const terrain = noise.perlin2D({ seed: 12345 }).fbm({
    octaves: 8,
    persistence: 0.45
})

noise.fill2D(heightmap, 512, 512, terrain, {
    scaleX: 0.005,
    scaleY: 0.005
})
```

### Animated Clouds

```typescript
const clouds = noise.simplex3D().fbm({
    octaves: 5,
    persistence: 0.6
})

function animate(time: number) {
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const density = clouds.sample(
                x * 0.01,
                y * 0.01,
                time * 0.1
            )
            // Use density value...
        }
    }
}
```

### GPU Noise Texture

```typescript
import { noise } from "onejs-unity/proc"
import { useComputeTexture } from "onejs-unity/gpu"

function NoiseTexture() {
    const texture = useComputeTexture({
        width: 512,
        height: 512,
        format: "RFloat"
    })

    useEffect(() => {
        if (noise.gpu.available) {
            noise.gpu.fbm(texture.current, {
                type: "simplex",
                frequency: 3,
                octaves: 6
            })
        }
    }, [])

    return <RawImage texture={texture.current} />
}
```
