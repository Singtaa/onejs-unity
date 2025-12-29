# onejs-unity

Unity integration utilities for OneJS. Provides asset loading, build plugins for USS transformation, and GPU compute APIs.

## Installation

```bash
npm install onejs-unity
```

## Features

- **Asset Loading** - Load images, fonts, and data from disk with Editor/Build path resolution
- **Build Plugins** - esbuild and PostCSS plugins for USS transformation
- **GPU Compute** - Access Unity compute shaders from JavaScript

## Asset Loading

Load assets from your project or npm packages with automatic path resolution between Editor and Build modes.

```typescript
import { loadImage, loadFont, loadJson } from "onejs-unity/assets"

// Load user assets (from App/assets/)
const logo = loadImage("images/logo.png")
const font = loadFont("fonts/Inter.ttf")

// Load package assets (prefixed with @package-name/)
const bg = loadImage("@my-ui-kit/backgrounds/hero.png")
const config = loadJson("@my-ui-kit/config.json")
```

### Path Resolution

| Context | `@my-pkg/bg.png` | `images/logo.png` |
|---------|------------------|-------------------|
| **Editor** | `App/node_modules/.../assets/@my-pkg/bg.png` | `App/assets/images/logo.png` |
| **Build** | `StreamingAssets/onejs/assets/@my-pkg/bg.png` | `StreamingAssets/onejs/assets/images/logo.png` |

### Asset Functions

- `loadImage(path)` - Load as Texture2D
- `loadFont(path)` - Load as Font
- `loadFontDefinition(path)` - Load as FontDefinition (for UI Toolkit)
- `loadText(path)` - Load as string
- `loadJson<T>(path)` - Load and parse JSON
- `loadBytes(path)` - Load as Uint8Array
- `assetExists(path)` - Check if asset exists
- `getAssetPath(path)` - Get resolved full path

### Creating Asset Packages

npm packages can distribute assets using a simple folder convention:

```
my-ui-kit/
├── package.json
├── assets/
│   └── @my-ui-kit/          ← namespace prefix (required)
│       ├── backgrounds/
│       │   └── hero.png
│       └── config.json
└── src/
    └── index.ts
```

The `@namespace/` folder inside `assets/` is automatically detected. No package.json configuration needed.

During Unity builds, these are copied flat to `StreamingAssets/onejs/assets/@my-ui-kit/...`

## Build Plugins

### esbuild Plugins

```javascript
import { ussModulesPlugin, tailwindPlugin, copyAssetsPlugin } from "onejs-unity/esbuild"

const config = {
    plugins: [
        // Tailwind CSS → USS transformation
        tailwindPlugin({ tailwindConfig: "./tailwind.config.js" }),

        // CSS Modules for .module.uss files
        ussModulesPlugin({ generateTypes: true }),

        // Copy assets to StreamingAssets
        copyAssetsPlugin({ verbose: true }),
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

Generates a manifest file for Editor path resolution. **Does not copy assets** during esbuild runs.

Asset copying to `StreamingAssets` is handled by Unity's `JSRunnerBuildProcessor` during actual Unity builds. This keeps `StreamingAssets` clean during development and avoids Unity's asset import overhead.

- `userAssets` - User assets folder (default: `"assets"`)
- `manifestPath` - Manifest file path (default: `".onejs/assets-manifest.json"`)
- `verbose` - Log details (default: `false`)

### PostCSS Plugins

```javascript
import { ussTransform, ussCleanup, ussUnwrapIs } from "onejs-unity/postcss"

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

## GPU Compute

```typescript
import { compute, Platform } from "onejs-unity"

if (Platform.supportsComputeShaders) {
    const shader = compute("MyComputeShader")
    const kernel = shader.kernel("CSMain")
        .buffer("inputBuffer", inputData)
        .buffer("outputBuffer", outputBuffer)
    kernel.dispatch(groupsX, groupsY, groupsZ)
}
```

## Peer Dependencies

When using the build plugins:

```bash
npm install -D esbuild postcss tailwindcss
```

## License

MIT
