# Texture Module

Procedural texture pattern generation for OneJS with both CPU and GPU implementations.

## Overview

The texture module provides pattern generators for common procedural textures:

| Pattern | CPU | GPU | Description |
|---------|-----|-----|-------------|
| **Noise** | Yes | Via noise module | Various noise algorithms |
| **Voronoi** | Yes | Yes | Cellular/distance patterns |
| **Marble** | Yes | Yes | Veined marble patterns |
| **Wood** | Yes | Yes | Wood grain rings |
| **Checkerboard** | Yes | Yes | Alternating cells |
| **Gradient** | Yes | Yes | Linear and radial gradients |

## Quick Start

```typescript
import { texture } from "onejs-unity/proc"

// CPU texture generation
const marbleData = texture.marble({
    width: 512,
    height: 512,
    frequency: 5,
    turbulence: 3
})

// GPU texture generation
import { useComputeTexture } from "onejs-unity/gpu"

if (texture.gpu.available) {
    const rt = useComputeTexture({ width: 512, height: 512 })
    await texture.gpu.voronoi(rt, { cellCount: 16 })
}
```

## CPU Generators

All CPU generators return `Uint8ClampedArray` with RGBA pixel data.

### Noise Texture

```typescript
import { texture, colorMaps } from "onejs-unity/proc"

const data = texture.noise({
    width: 256,
    height: 256,
    type: "simplex",      // "perlin" | "simplex" | "value" | "worley"
    seed: 42,
    frequency: 4,
    fbm: {
        octaves: 5,
        lacunarity: 2,
        persistence: 0.5
    },
    colorMap: colorMaps.terrain  // Optional color mapping
})
```

### Voronoi Texture

```typescript
const voronoi = texture.voronoi({
    width: 256,
    height: 256,
    seed: 42,
    frequency: 8,
    returnType: "f1",         // "f1" | "f2" | "f2-f1"
    distanceFunction: "euclidean"  // | "manhattan" | "chebyshev"
})
```

### Marble Texture

```typescript
const marble = texture.marble({
    width: 512,
    height: 512,
    seed: 42,
    frequency: 5,      // Base frequency
    turbulence: 5,     // Vein distortion
    sharpness: 2,      // Vein sharpness
    octaves: 4         // FBM detail
})
```

### Wood Texture

```typescript
const wood = texture.wood({
    width: 512,
    height: 512,
    seed: 42,
    frequency: 1,
    turbulence: 0.1,
    rings: 12,
    octaves: 3
})
```

### Checkerboard Texture

```typescript
const checker = texture.checkerboard({
    width: 256,
    height: 256,
    cellsX: 8,
    cellsY: 8,
    color1: [1, 1, 1, 1],  // White
    color2: [0, 0, 0, 1]   // Black
})
```

### Gradient Texture

```typescript
const gradient = texture.gradient({
    width: 256,
    height: 256,
    direction: "horizontal",  // | "vertical" | "diagonal" | "radial"
    startColor: [0, 0, 0, 1],
    endColor: [1, 1, 1, 1]
})
```

## Color Maps

Built-in color mapping functions for noise-to-color conversion:

```typescript
import { colorMaps } from "onejs-unity/proc"

// Available color maps
colorMaps.grayscale  // Black to white
colorMaps.heat       // Blue -> cyan -> green -> yellow -> red
colorMaps.terrain    // Water -> sand -> grass -> mountain -> snow
colorMaps.marble     // White with dark veins
colorMaps.wood       // Brown wood rings

// Custom color map
const customMap = (value: number): [number, number, number, number] => {
    return [value, value * 0.5, 0, 1]  // Orange gradient
}

const data = texture.noise({
    width: 256,
    height: 256,
    colorMap: customMap
})
```

## GPU Patterns

For real-time and high-resolution texture generation:

```typescript
import { texture } from "onejs-unity/proc"
import { useComputeTexture } from "onejs-unity/gpu"

function TexturedBackground() {
    const rt = useComputeTexture({ width: 1024, height: 1024 })

    useEffect(() => {
        if (!texture.gpu.available || !rt) return

        texture.gpu.marble(rt, {
            frequency: 5,
            turbulence: 3,
            octaves: 5,
            colorLow: [0.9, 0.85, 0.8, 1],
            colorHigh: [0.2, 0.15, 0.1, 1]
        })
    }, [rt])

    return <RawImage texture={rt} />
}
```

### GPU Pattern Options

```typescript
interface GPUPatternOptions {
    frequency?: number      // Base scale (default: 1)
    time?: number          // Animation time (default: 0)
    scale?: number         // Additional scale factor
    octaves?: number       // FBM octaves (default: 4)
    persistence?: number   // FBM persistence (default: 0.5)
    turbulence?: number    // Distortion amount
    cellCount?: number     // Voronoi/checker cells (default: 8)
    rings?: number         // Wood rings (default: 12)
    colorLow?: [r, g, b, a]   // Low value color
    colorHigh?: [r, g, b, a]  // High value color
}
```

### Available GPU Patterns

| Method | Description |
|--------|-------------|
| `texture.gpu.voronoi()` | Cellular distance pattern |
| `texture.gpu.marble()` | Veined marble |
| `texture.gpu.wood()` | Wood grain rings |
| `texture.gpu.checkerboard()` | Alternating cells |
| `texture.gpu.gradient()` | Horizontal gradient |
| `texture.gpu.radialGradient()` | Circular gradient |
| `texture.gpu.dispatch()` | Generic by type name |
| `texture.gpu.dispatchSync()` | Sync (after preload) |

### Animated Patterns

```typescript
import { texture } from "onejs-unity/proc"
import { useComputeTexture, useAnimationFrame } from "onejs-unity/gpu"

function AnimatedMarble() {
    const rt = useComputeTexture({ width: 512, height: 512 })
    const [ready, setReady] = useState(false)

    useEffect(() => {
        if (texture.gpu.available) {
            texture.gpu.preload().then(() => setReady(true))
        }
    }, [])

    useAnimationFrame((dt, time) => {
        if (ready && rt) {
            texture.gpu.dispatchSync(rt, "marble", {
                frequency: 5,
                time: time,
                turbulence: 3 + Math.sin(time) * 2
            })
        }
    })

    return <RawImage texture={rt} />
}
```

## Compute Shader Details

GPU patterns use the compute shader at:
```
Assets/Singtaa/OneJS/Unity/Shaders/Noise/ProceduralPatterns.compute
```

### Thread Groups

All kernels use `[numthreads(8, 8, 1)]` - dispatch dimensions are calculated automatically.

### Color Output

All patterns output to a RenderTexture with colors interpolated between `_ColorLow` and `_ColorHigh` based on the pattern value.

## API Reference

### CPU Generator Types

```typescript
interface NoiseTextureOptions {
    width: number
    height: number
    seed?: number
    type?: "perlin" | "simplex" | "value" | "worley"
    frequency?: number
    fbm?: FBMConfig
    colorMap?: ColorMap
}

interface VoronoiTextureOptions {
    width: number
    height: number
    seed?: number
    frequency?: number
    returnType?: "f1" | "f2" | "f2-f1"
    distanceFunction?: "euclidean" | "manhattan" | "chebyshev"
    colorMap?: ColorMap
}

interface MarbleTextureOptions {
    width: number
    height: number
    seed?: number
    frequency?: number
    turbulence?: number
    sharpness?: number
    octaves?: number
    colorMap?: ColorMap
}

interface WoodTextureOptions {
    width: number
    height: number
    seed?: number
    frequency?: number
    turbulence?: number
    rings?: number
    octaves?: number
    colorMap?: ColorMap
}

interface CheckerboardTextureOptions {
    width: number
    height: number
    cellsX?: number
    cellsY?: number
    color1?: RGBA
    color2?: RGBA
}

interface GradientTextureOptions {
    width: number
    height: number
    direction?: "horizontal" | "vertical" | "diagonal" | "radial"
    startColor?: RGBA
    endColor?: RGBA
}

type RGBA = [number, number, number, number]
type ColorMap = (value: number) => RGBA
```

## Examples

### Terrain Texture

```typescript
import { texture, colorMaps } from "onejs-unity/proc"

const terrainData = texture.noise({
    width: 1024,
    height: 1024,
    type: "perlin",
    seed: 12345,
    fbm: { octaves: 8, persistence: 0.45 },
    colorMap: colorMaps.terrain
})
```

### Procedural Stone

```typescript
const stone = texture.voronoi({
    width: 512,
    height: 512,
    frequency: 12,
    returnType: "f2-f1",  // Creates cell borders
    colorMap: (v) => {
        const base = 0.4 + v * 0.4
        return [base, base * 0.95, base * 0.9, 1]
    }
})
```

### GPU Animated Background

```typescript
import { texture } from "onejs-unity/proc"
import { useComputeTexture, useAnimationFrame } from "onejs-unity/gpu"

function AnimatedBackground() {
    const rt = useComputeTexture({ width: 512, height: 512 })
    const timeRef = useRef(0)

    useEffect(() => {
        texture.gpu.preload()
    }, [])

    useAnimationFrame((dt) => {
        if (!texture.gpu.available || !rt) return
        timeRef.current += dt

        texture.gpu.dispatchSync(rt, "voronoi", {
            cellCount: 16,
            time: timeRef.current,
            colorLow: [0.1, 0.1, 0.2, 1],
            colorHigh: [0.8, 0.6, 0.9, 1]
        })
    })

    return (
        <View style={{ width: "100%", height: "100%" }}>
            <RawImage texture={rt} style={{ flex: 1 }} />
        </View>
    )
}
```
