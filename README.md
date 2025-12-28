# onejs-unity

Unity integration utilities for OneJS. Provides TypeScript APIs for Unity-specific features and build tooling for USS (Unity Style Sheets).

## Installation

```bash
npm install onejs-unity
```

## Features

- **Build Plugins** - esbuild and PostCSS plugins for USS transformation
- **GPU Compute** - Access Unity compute shaders from JavaScript
- **Compute Buffers** - Create and manage GPU buffers with typed structs

## Build Plugins

### esbuild Plugins

```javascript
import { ussModulesPlugin, tailwindPlugin, copyAssetsPlugin } from "onejs-unity/esbuild"

// In your esbuild config
const config = {
    // ...
    plugins: [
        // Tailwind CSS → USS transformation
        tailwindPlugin({ tailwindConfig: "./tailwind.config.js" }),

        // CSS Modules for .module.uss files
        ussModulesPlugin({ generateTypes: true }),

        // Copy npm package assets to StreamingAssets
        copyAssetsPlugin({ dest: "Assets/StreamingAssets/onejs" }),
    ],
}
```

#### `tailwindPlugin(options)`

Compiles Tailwind CSS to USS-compatible output and embeds it in the JS bundle.

- `tailwindConfig` - Path to tailwind.config.js (default: `"./tailwind.config.js"`)

Transformations:
- Escapes special characters (`:` → `_c_`, `/` → `_s_`, etc.)
- Converts media queries to breakpoint class prefixes
- Converts `rem` to `px`
- Converts modern color syntax to `rgba()`

#### `ussModulesPlugin(options)`

Transforms `.module.uss` files into scoped CSS Modules.

- `generateTypes` - Generate `.d.ts` files for type-safe imports (default: `true`)

```tsx
import styles from "./Button.module.uss"

<View className={styles.container} />
```

#### `copyAssetsPlugin(options)`

Copies assets from npm packages with `onejs.assets` field to Unity's StreamingAssets.

- `dest` - Destination directory (default: `"Assets/StreamingAssets/onejs"`)
- `filter` - Package name filter (default: all packages)
- `verbose` - Log copied files (default: `false`)

Package authors can specify assets in their package.json:
```json
{
    "name": "my-onejs-package",
    "onejs": {
        "assets": ["assets/textures", "assets/fonts"]
    }
}
```

### PostCSS Plugins

```javascript
import { ussTransform, ussCleanup, ussUnwrapIs } from "onejs-unity/postcss"

// Use with PostCSS
const result = await postcss([
    ussTransform(),
    ussUnwrapIs(),
    ussCleanup({ removeEmpty: true }),
]).process(css)
```

#### `ussTransform(options)`

Core USS transformation:
- Character escaping in selectors
- Media query to breakpoint prefix conversion
- `rem` to `px` conversion
- Modern color syntax normalization

#### `ussCleanup(options)`

Removes CSS features unsupported by USS:
- CSS custom properties (`--var`)
- `var()` references
- Unsupported properties (filter, box-shadow, animation, grid, etc.)
- Unsupported at-rules (@keyframes, @font-face, @supports)

#### `ussUnwrapIs()`

Flattens `:is()` and `:where()` selectors (used by Tailwind v3):
```css
/* Input */
.button:is(.primary, .secondary) { color: blue; }

/* Output */
.button.primary { color: blue; }
.button.secondary { color: blue; }
```

## Runtime API

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

### `Platform`

Static class for checking GPU capabilities:
- `Platform.supportsComputeShaders` - Whether compute shaders are supported
- `Platform.maxComputeWorkGroupSize` - Maximum work group size

## Peer Dependencies

When using the build plugins, ensure you have these packages installed:

```bash
npm install -D esbuild postcss tailwindcss
```

## License

MIT
