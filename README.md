# onejs-unity

Unity integration utilities for OneJS. Provides TypeScript APIs for Unity-specific features.

## Features

- **GPU Compute** - Access Unity compute shaders from JavaScript
- **Compute Buffers** - Create and manage GPU buffers with typed structs
- **Platform Detection** - Check GPU capabilities and platform support

## Installation

```bash
npm install onejs-unity
```

## Usage

```typescript
import { compute, Platform } from "onejs-unity"

// Check platform support
if (Platform.supportsComputeShaders) {
    // Load a compute shader
    const shader = compute("MyComputeShader")

    // Get a kernel and configure it
    const kernel = shader.kernel("CSMain")
        .buffer("inputBuffer", inputData)
        .buffer("outputBuffer", outputBuffer)

    // Dispatch the compute shader
    kernel.dispatch(groupsX, groupsY, groupsZ)
}
```

## API

### `compute(shaderName: string)`

Load a compute shader by name. Returns a `ComputeShader` instance.

### `Platform`

Static class for checking GPU capabilities:
- `Platform.supportsComputeShaders` - Whether compute shaders are supported
- `Platform.maxComputeWorkGroupSize` - Maximum work group size

### Types

- `ComputeShader` - Represents a loaded compute shader
- `KernelBuilder` - Fluent API for configuring kernel dispatch
- `ComputeBuffer` - GPU buffer wrapper
- `StructSchema` - Define structured buffer layouts

## License

MIT
