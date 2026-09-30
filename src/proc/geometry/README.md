# Geometry Module

Procedural mesh generation for OneJS with fluent APIs for creating and manipulating 3D geometry.

## Overview

The geometry module provides:

- **Primitive Meshes**: One-liner creation of cubes, spheres, cylinders, etc.
- **MeshBuilder**: Custom geometry, vertex by vertex
- **Mesh Objects**: A GameObject per instance, with transform, colour and material setters
- **Mesh Operations**: Clone, combine, modify vertex data
- **Plain Unity objects**: A `ProceduralMesh` holds its data in JS and builds a `UnityEngine.Mesh` on first use

## Quick Start

```typescript
import { mesh } from "onejs-unity/proc"

// Create and instantiate a sphere
const sphere = mesh.sphere({ radius: 1 })
sphere.instantiate("MySphere").setPosition(0, 2, 0)

// Create with a colour
const cube = mesh.cube({ size: 1 })
cube.instantiate("MyCube").setColor("#ff5500")
```

## Primitives

All primitives return a `ProceduralMesh` that can be instantiated in the scene.

### Cube

```typescript
const cube = mesh.cube({
    size: 1,                    // Single value or [x, y, z]
})

// Non-uniform scaling
const box = mesh.cube({ size: [2, 1, 0.5] })
```

### Sphere

```typescript
const sphere = mesh.sphere({
    radius: 0.5,               // Default: 0.5
    longitudeSegments: 24,     // Default: 24
    latitudeSegments: 16       // Default: 16
})

// High-detail sphere
const hd = mesh.sphere({ radius: 1, longitudeSegments: 64, latitudeSegments: 32 })
```

### Cylinder

```typescript
const cylinder = mesh.cylinder({
    radius: 0.5,     // Default: 0.5
    height: 1,       // Default: 1
    segments: 24     // Default: 24
})
```

### Cone

```typescript
const cone = mesh.cone({
    radius: 0.5,     // Default: 0.5
    height: 1,       // Default: 1
    segments: 24     // Default: 24
})
```

### Plane

```typescript
const plane = mesh.plane({
    width: 1,        // Default: 1
    height: 1,       // Default: 1
    segmentsX: 1,    // Default: 1
    segmentsZ: 1     // Default: 1
})

// High-resolution plane for terrain
const terrain = mesh.plane({
    width: 10,
    height: 10,
    segmentsX: 64,
    segmentsZ: 64
})
```

### Torus

```typescript
const torus = mesh.torus({
    radius: 1,            // Major radius. Default: 1
    tubeRadius: 0.3,      // Minor radius. Default: 0.3
    radialSegments: 16,   // Default: 16
    tubularSegments: 32   // Default: 32
})
```

### Quad

Simple single-polygon rectangle:

```typescript
const quad = mesh.quad({
    width: 1,    // Default: 1
    height: 1    // Default: 1
})
```

## Custom Geometry with MeshBuilder

`vertex()` adds a vertex and returns its index, so it cannot be chained into:
call `normal`, `uv` or `color` after it to set that vertex's attributes. The
other methods return the builder.

```typescript
const b = mesh.builder()
// Apex
b.vertex(0, 1, 0); b.uv(0.5, 1)
// Base corners
b.vertex(-1, 0, -1); b.uv(0, 0)
b.vertex(1, 0, -1); b.uv(1, 0)
b.vertex(1, 0, 1); b.uv(1, 1)
b.vertex(-1, 0, 1); b.uv(0, 1)
// Faces (counter-clockwise winding)
const pyramid = b
    .triangle(0, 2, 1)  // Front
    .triangle(0, 3, 2)  // Right
    .triangle(0, 4, 3)  // Back
    .triangle(0, 1, 4)  // Left
    .quad(1, 2, 3, 4)   // Base
    .build()

pyramid.instantiate("Pyramid")
pyramid.recalculateNormals()  // after instantiate: see below
```

A vertex's normal defaults to up (0, 1, 0), so a builder mesh needs either
`normal()` per vertex or `recalculateNormals()`.

### Builder Methods

| Method | Description |
|--------|-------------|
| `.vertex(x, y, z)` | Add vertex, returns its index (not the builder) |
| `.normal(x, y, z)` | Set normal for last vertex |
| `.uv(u, v)` | Set UV for last vertex |
| `.color(r, g, b, a?)` | Set color for last vertex (kept in `data.colors`; not applied to the Unity mesh) |
| `.triangle(a, b, c)` | Add triangle by indices |
| `.quad(a, b, c, d)` | Add quad (two triangles) |
| `.build()` | Create the Mesh |

### Winding Order

Triangles use **counter-clockwise** winding for front-facing surfaces.

```typescript
// This triangle faces towards +Z
const b = mesh.builder()
b.vertex(0, 1, 0)   // 0: top
b.vertex(-1, 0, 0)  // 1: bottom-left
b.vertex(1, 0, 0)   // 2: bottom-right
const tri = b.triangle(0, 1, 2).build()  // CCW from front
```

## Mesh Operations

### Getting Mesh Data

```typescript
const plane = mesh.plane({ segmentsX: 16, segmentsZ: 16 })
const data = plane.data  // the mesh's own arrays, not a copy

// data.vertices: Float32Array (xyz triplets)
// data.normals: Float32Array (xyz triplets)
// data.uvs: Float32Array (uv pairs)
// data.indices: Uint32Array (triangle indices)
```

### Modifying Mesh Data

```typescript
// Displace vertices for terrain
const terrain = mesh.plane({ width: 10, height: 10, segmentsX: 64, segmentsZ: 64 })
const data = terrain.data

// Apply heightmap
for (let i = 0; i < data.vertices.length; i += 3) {
    const x = data.vertices[i]
    const z = data.vertices[i + 2]
    data.vertices[i + 1] = Math.sin(x) * Math.cos(z) * 0.5
}

// Push changes back
terrain.setData(data)
terrain.instantiate("Terrain")
terrain.recalculateNormals()
```

`setData()` rebuilds the Unity mesh when one exists. `recalculateNormals()`
works on the Unity mesh, which is created by `instantiate()` (or
`getUnityMesh()`); called before that it does nothing.

### Combining Meshes

```typescript
const combined = mesh.combine([
    mesh.cube({ size: 1 }),
    mesh.sphere({ radius: 0.5 })
])
combined.instantiate("Combined")
```

### Creating from Raw Data

```typescript
const data = {
    vertices: new Float32Array([
        0, 1, 0,   // vertex 0
        -1, 0, 0,  // vertex 1
        1, 0, 0    // vertex 2
    ]),
    indices: new Uint32Array([0, 1, 2])
}

const triangle = mesh.fromData(data)
triangle.instantiate("Triangle")
triangle.recalculateNormals()
```

## Materials

Materials are set on an instance. `instantiate()` gives each object a new
material on the `Standard` shader.

### Colour

```typescript
const obj = mesh.sphere().instantiate("Ball")
obj.setColor("#ff5500")                     // Hex (#rrggbb or #rrggbbaa)
obj.setColor({ r: 1, g: 0.3, b: 0, a: 1 })  // Or a Color object
```

### Texture and PBR settings

`material(options)` replaces the object's material:

```typescript
import { mesh, texture } from "onejs-unity/proc"

mesh.plane({ width: 100, height: 100 })
    .instantiate("Ground")
    .material({
        texture: texture.checker({ colors: ["#e5e5e5", "#333333"] }),
        tiling: 10,
        smoothness: 0.3,
    })
```

| Option | Meaning |
|---|---|
| `shader` | `"Lit"` (URP Lit, the default), `"Standard"`, `"Unlit"` (`Unlit/Texture`), or any shader name; falls back to `Standard` when not found |
| `texture` | A `ProceduralTexture` from `onejs-unity/proc`'s `texture` |
| `tiling` | A number, or `[x, y]` |
| `offset` | `[x, y]` |
| `color` | Hex string |
| `metallic` | Sets `_Metallic` |
| `smoothness` | Sets `_Glossiness` |

### Custom shader or an existing Material

```typescript
obj.useShader("Unlit/Color")      // new material on that shader
obj.setMaterial(unityMaterial)     // any UnityEngine.Material you hold
```

## Mesh Instance

`instantiate()` creates a GameObject in the scene with the mesh:

```typescript
const sphere = mesh.sphere({ radius: 1 })
const instance = sphere.instantiate("MySphere")

// Transform methods (chainable)
instance
    .setPosition(0, 2, 0)
    .setRotation(45, 0, 0)
    .setScale(1, 1, 1)

// Colour
instance.setColor("#ff0000")

// The underlying Unity objects
const go = instance.gameObject
const t = instance.transform
```

## Resource Management

### Disposing Individual Resources

```typescript
// Dispose mesh (destroys the Unity Mesh)
sphere.dispose()

// Dispose instance (destroys the GameObject)
instance.dispose()
```

There is no global cleanup. In React, `useMesh` and `useMeshInstance` dispose
what they create on unmount, and `useProcCleanup().track(resource)` disposes
anything else you hand it.

## API Reference

### ProceduralMesh

```typescript
class ProceduralMesh {
    readonly data: MeshData
    readonly vertexCount: number
    readonly triangleCount: number

    getUnityMesh(): UnityEngine.Mesh          // created on first call
    setData(data: MeshData): this
    recalculateNormals(): this                // no-op until the Unity mesh exists
    clone(): ProceduralMesh
    instantiate(name?: string): MeshObject    // default name "ProceduralMesh"
    dispose(): void
}
```

### MeshObject

```typescript
class MeshObject {
    readonly mesh: ProceduralMesh
    readonly gameObject: UnityEngine.GameObject
    readonly transform: UnityEngine.Transform

    setPosition(x: number, y: number, z: number): this
    setRotation(x: number, y: number, z: number): this  // euler degrees
    setScale(x: number, y: number, z: number): this
    setUniformScale(s: number): this
    setColor(color: string | Color): this
    setMaterial(material: UnityEngine.Material): this
    useShader(shaderName: string): this
    material(options: MaterialOptions): this
    dispose(): void
}
```

### MeshData Interface

```typescript
interface MeshData {
    vertices: Float32Array    // xyz triplets
    normals?: Float32Array    // xyz triplets
    uvs?: Float32Array        // uv pairs
    uv2s?: Float32Array       // secondary uv pairs
    colors?: Float32Array     // rgba quads
    indices: Uint32Array      // triangle indices
}
```

### Primitive Options

```typescript
interface CubeOptions {
    size?: number | [number, number, number]
}

interface SphereOptions {
    radius?: number
    longitudeSegments?: number
    latitudeSegments?: number
}

interface CylinderOptions {
    radius?: number
    height?: number
    segments?: number
}

interface ConeOptions {
    radius?: number
    height?: number
    segments?: number
}

interface PlaneOptions {
    width?: number
    height?: number
    segmentsX?: number
    segmentsZ?: number
}

interface TorusOptions {
    radius?: number
    tubeRadius?: number
    radialSegments?: number
    tubularSegments?: number
}

interface QuadOptions {
    width?: number
    height?: number
}
```

## Examples

### Procedural Terrain

```typescript
import { mesh, noise } from "onejs-unity/proc"

// Create high-res plane
const terrain = mesh.plane({
    width: 100,
    height: 100,
    segmentsX: 128,
    segmentsZ: 128
})

// Get vertex data
const data = terrain.data

// Create noise source
const heightNoise = noise.perlin2D({ seed: 12345 }).fbm({
    octaves: 6,
    persistence: 0.45
})

// Apply noise displacement
for (let i = 0; i < data.vertices.length; i += 3) {
    const x = data.vertices[i]
    const z = data.vertices[i + 2]
    const height = heightNoise.sample(x * 0.02, z * 0.02)
    data.vertices[i + 1] = height * 10  // Scale height
}

// Update mesh, instantiate, then recalculate normals on the Unity mesh
terrain.setData(data)
terrain.instantiate("Terrain").setColor("#4a8c4a")
terrain.recalculateNormals()
```

### Animated Mesh

```typescript
import { mesh } from "onejs-unity/proc"

const sphere = mesh.sphere({ radius: 1, longitudeSegments: 32, latitudeSegments: 16 })
sphere.instantiate("Blob")
const originalData = sphere.data
const data = { ...originalData, vertices: new Float32Array(originalData.vertices) }

function animate(time: number) {
    for (let i = 0; i < data.vertices.length; i += 3) {
        const ox = originalData.vertices[i]
        const oy = originalData.vertices[i + 1]
        const oz = originalData.vertices[i + 2]

        // Radial displacement based on direction
        const len = Math.sqrt(ox * ox + oy * oy + oz * oz)
        const displacement = Math.sin(time + oy * 3) * 0.1

        data.vertices[i] = ox + (ox / len) * displacement
        data.vertices[i + 1] = oy + (oy / len) * displacement
        data.vertices[i + 2] = oz + (oz / len) * displacement
    }

    sphere.setData(data)
    sphere.recalculateNormals()
}
```

### Low-Poly Tree

```typescript
import { mesh } from "onejs-unity/proc"

// Trunk
const trunk = mesh.cylinder({ radius: 0.2, height: 1.5, segments: 8 })
trunk.instantiate("Trunk").setColor("#8B4513")

// Foliage (stacked cones)

for (let i = 0; i < 3; i++) {
    const cone = mesh.cone({
        radius: 0.8 - i * 0.2,
        height: 1,
        segments: 8
    })
    cone.instantiate(`Foliage${i}`)
        .setPosition(0, 1 + i * 0.6, 0)
        .setColor("#228B22")
}
```

## Unity side

There is no C# bridge. `ProceduralMesh` sets `vertices`, `normals`, `uv` and
`triangles` on a `new UnityEngine.Mesh()` through the `CS` proxy, and
`MeshObject` works on the GameObject, Transform and MeshRenderer directly. Of
`MeshData`, `uv2s` and `colors` are carried in JS but not written to the Unity
mesh. OneJS's `CS.OneJS.Proc.MeshGenerator` is a separate, C#-side way to build
the same primitives (`Runtime/Proc/README.md` in the OneJS package).
