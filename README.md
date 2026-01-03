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

Access Unity compute shaders from JavaScript with optional zero-allocation dispatch for performance-critical rendering.

### Basic Usage

```typescript
import { compute, useComputeShader, useComputeTexture, useAnimationFrame } from "onejs-unity/gpu"

function BackgroundEffect({ shaderGlobal }) {
    const shader = useComputeShader(shaderGlobal, "MyEffect")
    const texture = useComputeTexture({ autoResize: true })

    useAnimationFrame(() => {
        if (!shader || !texture) return
        shader.kernel("CSMain")
            .float("_Time", performance.now() / 1000)
            .vec2("_Resolution", [texture.width, texture.height])
            .textureRW("_Result", texture)
            .dispatchAuto(texture)
    })

    return <View style={{ backgroundImage: texture }} />
}
```

### Zero-Allocation Dispatch

For performance-critical code, use `createDispatcher()` to eliminate per-frame allocations.

#### Basic Usage (lazy ID resolution)

```typescript
const dispatch = shader.createDispatcher("CSMain")

// Property IDs resolved on first use, then cached
dispatch
    .float("_Time", t)
    .vec2("_Resolution", w, h)
    .dispatchAuto(texture)
```

#### Declarative Usage (upfront ID resolution)

Pass a schema to pre-resolve all property IDs at creation time:

```typescript
import { useMemo } from "react"
import { useComputeShader, useComputeTexture, useAnimationFrame, KernelDispatcher } from "onejs-unity/gpu"

function ZeroAllocEffect({ shaderGlobal }) {
    const shader = useComputeShader(shaderGlobal)
    const texture = useComputeTexture({ autoResize: true })

    // Declarative: all IDs pre-resolved at creation
    const dispatch = useMemo<KernelDispatcher | null>(
        () => shader?.createDispatcher("CSMain", {
            _Time: "float",
            _Resolution: "vec2",
            _Result: "textureRW",
        }) ?? null,
        [shader]
    )

    useAnimationFrame(() => {
        if (!dispatch || !texture) return

        // Zero work on first frame - all IDs already cached!
        dispatch
            .float("_Time", performance.now() / 1000)
            .vec2("_Resolution", texture.width, texture.height)
            .textureRW("_Result", texture)
            .dispatchAuto(texture)
    })

    return <View style={{ backgroundImage: texture }} />
}
```

#### Schema Property Types

| Type | Method | Description |
|------|--------|-------------|
| `"float"` | `.float(name, value)` | Single float uniform |
| `"int"` | `.int(name, value)` | Single int uniform |
| `"bool"` | `.bool(name, value)` | Boolean (as int 0/1) |
| `"vec2"` | `.vec2(name, x, y)` | 2D vector |
| `"vec3"` | `.vec3(name, x, y, z)` | 3D vector |
| `"vec4"` | `.vec4(name, x, y, z, w)` | 4D vector |
| `"texture"` | `.texture(name, tex)` | Read-only texture |
| `"textureRW"` | `.textureRW(name, tex)` | Read-write texture |

### API Reference

| Method | Description |
|--------|-------------|
| `shader.kernel(name)` | Fluent builder (allocates) |
| `shader.createDispatcher(name, schema?)` | Zero-alloc dispatcher with optional schema |
| `compute.renderTexture(options)` | Create render texture |
| `compute.buffer(options)` | Create compute buffer |

## Zero-Allocation Interop

For custom C# method calls in performance-critical code, use the `za` module to create zero-allocation bindings.

### Static Methods

```typescript
import { za } from "onejs-unity/interop"

// Bind multiple methods on a class
const Physics = za.static("UnityEngine.Physics", {
    Raycast: 4,                              // shorthand: 4 args
    SphereCast: { args: 5, returns: "bool" }, // with metadata
    OverlapSphereNonAlloc: 4,
})

// Per-frame usage - zero allocations after first call!
function update() {
    if (Physics.Raycast(origin, direction, maxDistance, layerMask)) {
        // hit something
    }
}
```

### Single Method

```typescript
import { za } from "onejs-unity/interop"

const getTime = za.method("UnityEngine.Time", "get_time", 0)
const getDeltaTime = za.method("UnityEngine.Time", "get_deltaTime", 0)

function update() {
    const t = getTime()      // zero-alloc
    const dt = getDeltaTime() // zero-alloc
}
```

### Pre-registered Bindings

When C# pre-registers bindings and exposes their IDs:

```typescript
import { za } from "onejs-unity/interop"

// C# exposes binding IDs via globals
declare const MyBindingIds: { doSomething: number }

const doSomething = za.fromId(MyBindingIds.doSomething, 3)
doSomething(arg1, arg2, arg3) // zero-alloc
```

### Instance Methods

For instance methods, create static wrappers in C#:

```csharp
// C# side - create static wrapper that takes handle as first arg
public static class CharacterControllerExt {
    public static void MoveStatic(int handle, float x, float y, float z) {
        var cc = ObjectRegistry.Get<CharacterController>(handle);
        cc.Move(new Vector3(x, y, z));
    }
}
```

```typescript
// JS side
const CharacterController = za.static("CharacterControllerExt", {
    MoveStatic: 4,  // handle + x, y, z
})

CharacterController.MoveStatic(ccHandle, velocity.x, velocity.y, velocity.z)
```

### How It Works

| API | First Call | Subsequent Calls |
|-----|-----------|------------------|
| `CS.Type.Method()` | Reflection lookup | Reflection (allocates) |
| `za.static/method` | Registers binding | Direct invoke (zero-alloc) |
| `za.fromId` | None | Direct invoke (zero-alloc) |

The `za` module uses `__zaInvokeN` native functions that pass primitives directly to C# without boxing or array allocation.

## Peer Dependencies

When using the build plugins:

```bash
npm install -D esbuild postcss tailwindcss
```

## License

MIT
