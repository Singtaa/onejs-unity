# Geometry Module

Procedural mesh generation for OneJS with fluent APIs for creating and manipulating 3D geometry.

## Overview

The geometry module provides:

- **Primitive Meshes** - One-liner creation of cubes, spheres, cylinders, etc.
- **MeshBuilder** - Fluent API for custom geometry construction
- **Materials** - Simple material creation and assignment
- **Mesh Operations** - Clone, combine, modify vertex data
- **Handle-Based** - C# objects managed via integer handles

## Quick Start

```typescript
import { mesh } from "onejs-unity/proc"

// Create and instantiate a sphere
const sphere = mesh.sphere({ radius: 1 })
sphere.instantiate("MySphere").setPosition(0, 2, 0)

// Create with material
const cube = mesh.cube({ size: 1 })
const mat = mesh.material().setColor("#ff5500")
cube.instantiate("MyCube").setMaterial(mat)
```

## Primitives

All primitives return a `Mesh` handle that can be instantiated in the scene.

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

The `MeshBuilder` provides a fluent API for constructing custom meshes:

```typescript
const pyramid = mesh.builder()
    // Apex
    .vertex(0, 1, 0).uv(0.5, 1)
    // Base corners
    .vertex(-1, 0, -1).uv(0, 0)
    .vertex(1, 0, -1).uv(1, 0)
    .vertex(1, 0, 1).uv(1, 1)
    .vertex(-1, 0, 1).uv(0, 1)
    // Faces (counter-clockwise winding)
    .triangle(0, 2, 1)  // Front
    .triangle(0, 3, 2)  // Right
    .triangle(0, 4, 3)  // Back
    .triangle(0, 1, 4)  // Left
    .quad(1, 2, 3, 4)   // Base
    .build()

pyramid.recalculateNormals()
pyramid.instantiate("Pyramid")
```

### Builder Methods

| Method | Description |
|--------|-------------|
| `.vertex(x, y, z)` | Add vertex, returns index |
| `.normal(x, y, z)` | Set normal for last vertex |
| `.uv(u, v)` | Set UV for last vertex |
| `.color(r, g, b, a?)` | Set color for last vertex |
| `.triangle(a, b, c)` | Add triangle by indices |
| `.quad(a, b, c, d)` | Add quad (two triangles) |
| `.build()` | Create the Mesh |

### Winding Order

Triangles use **counter-clockwise** winding for front-facing surfaces.

```typescript
// This triangle faces towards +Z
const tri = mesh.builder()
    .vertex(0, 1, 0)   // 0: top
    .vertex(-1, 0, 0)  // 1: bottom-left
    .vertex(1, 0, 0)   // 2: bottom-right
    .triangle(0, 1, 2) // CCW from front
    .build()
```

## Mesh Operations

### Getting Mesh Data

```typescript
const plane = mesh.plane({ segmentsX: 16, segmentsZ: 16 })
const data = plane.getData()

// data.vertices: Float32Array (xyz triplets)
// data.normals: Float32Array (xyz triplets)
// data.uvs: Float32Array (uv pairs)
// data.indices: Uint32Array (triangle indices)
```

### Modifying Mesh Data

```typescript
// Displace vertices for terrain
const terrain = mesh.plane({ width: 10, height: 10, segmentsX: 64, segmentsZ: 64 })
const data = terrain.getData()

// Apply heightmap
for (let i = 0; i < data.vertices.length; i += 3) {
    const x = data.vertices[i]
    const z = data.vertices[i + 2]
    data.vertices[i + 1] = Math.sin(x) * Math.cos(z) * 0.5
}

// Push changes back
terrain.setData(data)
terrain.recalculateNormals()
```

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
triangle.recalculateNormals()
```

## Materials

### Basic Material

```typescript
// Default Standard shader
const mat = mesh.material()
mat.setColor("#ff5500")  // Hex color

// Or with Color object
mat.setColor({ r: 1, g: 0.3, b: 0, a: 1 })
```

### Shader Properties

```typescript
const mat = mesh.material("Standard")
    .setColor("#ffffff")
    .setFloat("_Metallic", 0.8)
    .setFloat("_Smoothness", 0.9)
```

### Custom Shader

```typescript
const mat = mesh.material("Unlit/Color")
    .setColor("#00ff00")
```

### Registering External Materials

```typescript
// Register a Unity Material object from C#
const mat = mesh.registerMaterial(unityMaterialReference)
instance.setMaterial(mat)
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

// Access transform properties
console.log(instance.position)  // { x: 0, y: 2, z: 0 }

// Apply material
const mat = mesh.material().setColor("#ff0000")
instance.setMaterial(mat)

// Get underlying Unity GameObject
const go = instance.getGameObject()
```

## Resource Management

### Disposing Individual Resources

```typescript
// Dispose mesh (removes from memory)
sphere.dispose()

// Dispose instance (removes GameObject from scene)
instance.dispose()

// Dispose material
mat.dispose()
```

### Global Cleanup

```typescript
// Clean up all proc module resources
mesh.cleanup()
```

## API Reference

### Mesh Interface

```typescript
interface Mesh {
    readonly __handle: number
    readonly vertexCount: number
    readonly triangleCount: number

    getData(): MeshData
    setData(data: MeshData): void
    clone(): Mesh
    recalculateNormals(): void
    recalculateBounds(): void
    optimize(): void
    instantiate(name?: string): MeshInstance
    dispose(): void
}
```

### MeshInstance Interface

```typescript
interface MeshInstance {
    readonly __handle: number
    readonly mesh: Mesh
    position: Vector3
    rotation: Vector3
    scale: Vector3

    setPosition(x: number, y: number, z: number): MeshInstance
    setRotation(x: number, y: number, z: number): MeshInstance
    setScale(x: number, y: number, z: number): MeshInstance
    setMaterial(material: Material): MeshInstance
    getGameObject(): unknown
    dispose(): void
}
```

### Material Interface

```typescript
interface Material {
    readonly __handle: number

    setColor(color: Color | string): Material
    setFloat(name: string, value: number): Material
    setTexture(name: string, texture: unknown): Material
    dispose(): void
}
```

### MeshData Interface

```typescript
interface MeshData {
    vertices: Float32Array    // xyz triplets
    normals?: Float32Array    // xyz triplets
    uvs?: Float32Array        // uv pairs
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
const data = terrain.getData()

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

// Update mesh
terrain.setData(data)
terrain.recalculateNormals()

// Instantiate with material
const mat = mesh.material().setColor("#4a8c4a")
terrain.instantiate("Terrain").setMaterial(mat)
```

### Animated Mesh

```typescript
import { mesh } from "onejs-unity/proc"

const sphere = mesh.sphere({ radius: 1, longitudeSegments: 32, latitudeSegments: 16 })
const originalData = sphere.getData()
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
const trunkMat = mesh.material().setColor("#8B4513")
trunk.instantiate("Trunk").setMaterial(trunkMat)

// Foliage (stacked cones)
const foliageMat = mesh.material().setColor("#228B22")

for (let i = 0; i < 3; i++) {
    const cone = mesh.cone({
        radius: 0.8 - i * 0.2,
        height: 1,
        segments: 8
    })
    cone.instantiate(`Foliage${i}`)
        .setPosition(0, 1 + i * 0.6, 0)
        .setMaterial(foliageMat)
}
```

## C# Bridge

The geometry module uses `MeshBridge.cs` located at:
```
Assets/Singtaa/OneJS/Unity/Proc/MeshBridge.cs
```

The bridge manages:
- **Mesh handles** - `_meshes` dictionary
- **Instance handles** - `_instances` dictionary (GameObjects)
- **Material handles** - `_materials` dictionary

All operations go through static methods on `MeshBridge` that manage the handle tables.
