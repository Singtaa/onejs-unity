# onejs-unity

Unity integration utilities for OneJS: build plugins, asset loading, input, audio, 2D physics, textures, the shader language, GPU compute and procedural generation.

## Installation

```bash
npm install onejs-unity
```

onejs-unity 0.6 and newer needs OneJS 3.7 or newer, and onejs-react 0.1.60 or
newer. A `.sl` import is a compiled program, which an older OneJS cannot draw;
onejs-react says so in the console rather than drawing nothing. On an older
OneJS, stay on onejs-unity 0.5.

onejs-react is an optional peer, so the line above does not install it. A OneJS
project already has it; elsewhere, `npm install onejs-react react`. The `.d.ts`
written beside each `.sl` file imports its type from onejs-react, and
onejs-react brings `unity-types`, which types `import ... from "UnityEngine"`
(without onejs-react, `npm install -D unity-types`).

## Modules

Each module is its own subpath, so a bundle carries only what it imports. The root entry, `onejs-unity`, re-exports `onejs-unity/gpu` and nothing else.

| Import | What it is | Docs |
|---|---|---|
| `onejs-unity/esbuild` | The OneJS build in one call (`oneJSConfig`), and its esbuild plugins: C# imports, Tailwind, USS modules, themes, `.sl` files, asset manifest | [below](#the-onejs-build) |
| `onejs-unity/globals` | Types for the runtime's globals, named in tsconfig's `types` | [below](#runtime-globals) |
| `onejs-unity/postcss` | PostCSS plugins for a Tailwind v3 pipeline | [below](#postcss-plugins) |
| `onejs-unity/assets` | Load images, fonts, text and JSON with Editor/Build path resolution | [below](#asset-loading) |
| `onejs-unity/input` | Keyboard, mouse, gamepad, touch, InputActions read with `float()` and `vec2()`, a zero allocation reader whose reads check their binding, React hooks that re-render only when input changes | [`src/input/README.md`](src/input/README.md), [guide](https://onejs.com/docs/guides/input) |
| `onejs-unity/audio` | `audio.load(path)`, then `play` and `loop`, on Unity's AudioSource | [guide](https://onejs.com/docs/guides/audio) |
| `onejs-unity/physics2d` | `createPhysicsWorld`: 2D physics whose bodies move VisualElements, simulated in C# | [guide](https://onejs.com/docs/guides/physics) |
| `onejs-unity/fx` | Textures as values: fused image operation chains, sources, `useTexture` and `useAnimation` hooks | [`src/fx/README.md`](src/fx/README.md), [guide](https://onejs.com/docs/guides/image-fx) |
| `onejs-unity/sl` | The shader language a game imports (re-exported from `onejs-sl`) | [`src/sl/README.md`](src/sl/README.md), [guide](https://onejs.com/docs/guides/shader-language) |
| `onejs-unity/sl/compiler` | The shader language at build time, parser included | [`src/sl/README.md`](src/sl/README.md) |
| `onejs-unity/gpu` | Compute shaders from JavaScript, with a zero allocation dispatcher | [below](#gpu-compute), [guide](https://onejs.com/docs/guides/gpu-compute) |
| `onejs-unity/interop` | Zero allocation bindings to C# static methods (`za`) | [below](#zero-allocation-interop), [guide](https://onejs.com/docs/guides/zero-alloc) |
| `onejs-unity/proc` | Noise, procedural meshes and procedural textures; also `proc/noise`, `proc/geometry`, `proc/texture` | [`src/proc/README.md`](src/proc/README.md), [guide](https://onejs.com/docs/guides/procedural) |
| `onejs-unity/fs-provider` | The filesystem the build plugins read through, replaceable by a host with no disk (a Cloudflare Worker) | `src/fs-provider.mjs` |

Each esbuild plugin is also importable on its own (`onejs-unity/esbuild/tailwind`, `/uss-modules`, `/themes`, `/sl`, `/copy-assets`, `/import-transform`), which is how a Worker uses them without pulling in `node:fs`.

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

If the app has its own `assets/@my-pkg/` folder, that folder is used in place of the package's, in the Editor and in a build alike.

### Asset Functions

- `loadImage(path)`: Load as Texture2D
- `loadImageAsync(path)`: Async `loadImage`, works on all platforms
- `loadFont(path)`: Load as FontAsset (SDF)
- `loadFontDefinition(path)`: Load as FontDefinition (for UI Toolkit styling)
- `loadText(path)`: Load as string
- `loadTextAsync(path)`: Async `loadText`, works on all platforms
- `loadJson<T>(path)`: Load and parse JSON
- `loadJsonAsync<T>(path)`: Async `loadJson`, works on all platforms
- `loadBytes(path)`: Load as Uint8Array
- `assetExists(path)`: Check if asset exists
- `getAssetPath(path)`: Get resolved full path

On Android and WebGL builds, StreamingAssets is a URL (`jar:file://...` inside the APK, `http(s)://...` on WebGL) that `System.IO.File` cannot read. The synchronous functions throw a descriptive error there; the `*Async` variants load through UnityWebRequest and work everywhere (resolving immediately where the sync path is available).

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

During Unity builds, `JSRunnerBuildProcessor` (OneJS 3.9.3 and newer) copies them flat to `StreamingAssets/onejs/assets/@my-ui-kit/...`. Only top level packages in the app's `node_modules` are scanned, scoped ones included.

## Build Plugins

### The OneJS build

A OneJS app's whole build is one call:

```javascript
// esbuild.config.mjs
import { oneJSConfig } from "onejs-unity/esbuild"

export default oneJSConfig({ entry: "index.tsx" })
```

```json
"scripts": {
    "build": "onejs-unity build",
    "watch": "onejs-unity watch"
}
```

`oneJSConfig` returns esbuild options: the bundle JSRunner reads (`../app.js.txt`, an IIFE whose exports land on `__exports`), React and `oj` pinned to the app's own copies, `.uss` files as text, the source map named `app.js.map.txt`, and every plugin below. `onejs-unity build` runs the config's default export with the app's own esbuild, and `onejs-unity watch` rebuilds on every save.

`process.env.NODE_ENV` picks React's build. It is `"development"` unless the build runs with `NODE_ENV=production`, which is how OneJS 3.9.5 and newer builds a player, so players get React's production build and the editor keeps its warnings.

Options:

- `entry`: the entry file. Default `"index.tsx"`.
- `outfile`: where the bundle goes. Default `"../app.js.txt"`.
- `plugins`: the project's own esbuild plugins, run after OneJS's.
- `tailwind`: options for `tailwindPlugin` (`content`, `safelist`, `preflight`).
- Any other esbuild option passes straight through. `alias`, `define` and `loader` are merged with OneJS's, so adding an alias keeps React deduplicated.

### Runtime globals

```json
"compilerOptions": {
    "types": ["unity-types", "react", "onejs-unity/globals"]
}
```

`onejs-unity/globals` types what a OneJS app runs with: `__root`, `__isPlaying`, timers (extra arguments included), `console`, `fetch`, `URL`, `localStorage`, `WebSocket`, the file and style sheet functions, and the `onejs:tailwind`, `onejs:themes` and `*.uss` imports, plus the `onejs` namespace that holds all of them under one name (`onejs.root`, `onejs.isPlaying`, `onejs.fs.readText`, `onejs.cs.typeExists`, needing OneJS 3.9.5). It updates with this package. Declarations of your own go in `types/global.d.ts`.

A project from before OneJS 3.9.5 has a copy of these in `types/global.d.ts`: delete the copy, keep your own additions, and add the line above.

### esbuild Plugins

The plugins `oneJSConfig` runs, one by one, for a config of your own:

```javascript
import { importTransformPlugin, ussModulesPlugin, tailwindPlugin, themesPlugin, slPlugin, copyAssetsPlugin } from "onejs-unity/esbuild"

const config = {
    plugins: [
        // Transform ES6 imports from C# namespaces
        importTransformPlugin(),

        // Tailwind utility classes → USS transformation
        tailwindPlugin({ content: ["./**/*.{tsx,ts,jsx,js}"] }),

        // Pack theme registration via import "onejs:themes"
        themesPlugin(),

        // CSS Modules for .module.uss files
        ussModulesPlugin({ generateTypes: true }),

        // Shader programs: import plasma from "./plasma.sl"
        slPlugin({ generateTypes: true }),

        // Copy assets to StreamingAssets
        copyAssetsPlugin({ verbose: true }),
    ],
}
```

#### `importTransformPlugin(options)`

Transforms ES6 imports from C# namespaces (modules starting with uppercase) into `CS.*` references at build time.

```typescript
// Input (your source code)
import { Texture2D, Material, Shader } from "UnityEngine"
import { Button } from "UnityEngine/UIElements"

// Output (after transform)
const { Texture2D, Material, Shader } = CS.UnityEngine
const { Button } = CS.UnityEngine.UIElements
```

TypeScript types these imports from `unity-types`, which declares the modules
`UnityEngine`, `UnityEngine/UIElements`, `UnityEngine/SceneManagement`,
`System` and `OneJS`. Any other namespace, such as
`System.Collections.Generic`, transforms the same way
(`CS.System.Collections.Generic`), but `tsc` reports `Cannot find module` for it.

This allows you to write idiomatic ES6 imports instead of manual destructuring:

```typescript
// Before (manual destructuring)
declare const CS: any
const { GameObject, Mesh, Vector3 } = CS.UnityEngine

// After (ES6 imports with transform)
import { GameObject, Mesh, Vector3 } from "UnityEngine"
```

**Options:**
- `filter`: Custom function `(moduleName: string) => boolean` to control which modules are transformed. Default: transforms modules starting with uppercase letter.

#### `themesPlugin(options)`

Registers every extracted pack theme through one stable import, replacing the per-theme relative imports (which lint autofixes love to strip and which have no autocomplete before extraction):

```tsx
// One import registers every theme extracted under @packs/ or @cartridges/
import "onejs:themes"

<ThemeProvider theme="kawaii">...</ThemeProvider>
```

At build time the plugin scans the working directory's `@packs/` and `@cartridges/` folders for files matching `*Theme.ts` / `*Theme.tsx` (the naming convention every OneJS premade theme follows), emits a side-effect import for each, and logs what it registered. A JSRunner made before cartridges became packs keeps extracting to `@cartridges/`, so both are scanned, and a theme found in both registers once, from `@packs/`. In watch mode a newly extracted pack triggers a rebuild automatically. With nothing extracted yet it emits an empty module and a console warning, not an error. Explicit relative imports keep working when you want a strict subset.

No package declares `onejs:themes` for TypeScript, and TypeScript 6 and newer check side-effect imports, so a project needs `declare module "onejs:themes"` in a `.d.ts`. A scaffold from after OneJS 3.9.2 has it in `types/global.d.ts`; an older one declares only `onejs:tailwind`, so add the line.

**Options:**
- `dirs`: pack folders relative to the working directory, the first winning a theme found in more than one (default: `["@packs", "@cartridges"]`)
- `dir`: a single folder, in place of `dirs`
- `pattern`: RegExp identifying a theme module by file name (default: `/Theme\.(ts|tsx)$/`)

#### `tailwindPlugin(options)`

Built-in Tailwind-like utility class generator for USS. **No external `tailwindcss` dependency required.**

```tsx
// In your code, just add this import to activate
import "onejs:tailwind"

// Then use Tailwind classes as usual
<View className="p-4 bg-gray-900 hover:bg-gray-800 sm:p-6" />
```

The OneJS scaffold's `types/global.d.ts` declares `onejs:tailwind` for TypeScript. Outside it, declare it once in a `.d.ts`, `declare module "onejs:tailwind"`, or TypeScript 6 and newer report the side-effect import.

**Options:**
- `content`: Array of glob patterns to scan for class names (default: `["./index.tsx", "./**/*.{tsx,ts,jsx,js}"]`). In watch mode an edit to any scanned file rebuilds, including one the bundle does not import.
- `safelist`: Class names to always include, for classes assembled at runtime (default: `[]`)

**Features:**
- JIT-style generation: only includes classes actually used in your source files. Every string literal in a scanned file is a candidate (variant maps and variables included, comment-safe), so only classes assembled at runtime (`"bg-" + color`) need `safelist`.
- Full Tailwind color palette (slate, gray, zinc, neutral, stone, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose)
- Spacing scale (p-4, m-2, mt-4, etc.)
- Flexbox utilities (flex, justify-center, items-center, flex-1, basis-1/2, etc.)
- Typography (text-xl, font-bold, text-center, tracking-wide, etc.)
- Borders (border, rounded-lg, border-gray-500, border-t-blue-500, etc.)
- Transforms (rotate-45, scale-105, translate-x-4, origin-center, etc.)
- Transitions (transition, duration-300, ease-in-out, delay-100, etc.)
- Responsive breakpoints (sm:, md:, lg:, xl:, 2xl:)
- Hover/focus/active/disabled variants
- Arbitrary values (w-[200], bg-[#ff5733], p-[15], etc.)

**USS Limitations:**
- No `gap` property: use margins on children instead
- No `z-index`: element order determined by hierarchy position
- No numeric `font-weight` (100-900): only `font-normal`/`font-bold` via `-unity-font-style`
- No `text-transform`: use rich text tags or C# string methods
- No `currentColor`: use explicit color values
- `letter-spacing` is written in px, but USS applies it as hundredths of an em, so `tracking-wide` (0.025em) is `2.5px` at any font size

**Transformations:**
- Escapes special characters (`:` → `_c_`, `/` → `_s_`, `[` → `_lb_`, etc.)
- Converts responsive prefixes to ancestor selectors (`.sm .sm_c_p-4`)
- Uses px values directly (no rem conversion needed)

#### `ussModulesPlugin(options)`

Transforms `.module.uss` files into scoped CSS Modules.

- `generateTypes`: Generate `.d.ts` files for type-safe imports (default: `true`)

```tsx
import styles from "./Button.module.uss"

<View className={styles.container} />
```

#### `slPlugin(options)`

Compiles `.sl` shader programs at build time, so `import plasma from "./plasma.sl"` resolves to the compiled program and the bundle carries neither the parser nor the source. A parse error is an esbuild error with the file, line and column. It writes `app.sl.json` beside the bundle, from which the editor generates the program's shaders.

- `generateTypes`: Write a `.d.ts` beside each `.sl` file, naming its uniforms (default: `true`)
- `manifest`: Where to write `app.sl.json` (default: beside the bundle)

#### `copyAssetsPlugin(options)`

Generates a manifest file for Editor path resolution. **Does not copy assets** during esbuild runs. Optional: without a manifest, the Editor finds a package's `assets/@namespace/` folder by scanning `node_modules` once.

Asset copying to `StreamingAssets` is handled by Unity's `JSRunnerBuildProcessor` during actual Unity builds. This keeps `StreamingAssets` clean during development and avoids Unity's asset import overhead.

- `userAssets`: User assets folder (default: `"assets"`)
- `manifestPath`: Manifest file path (default: `".onejs/assets-manifest.json"`)
- `verbose`: Log details (default: `false`)

### PostCSS Plugins

These need `postcss` (`npm install -D postcss`).

```javascript
import postcss from "postcss"
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

Removes CSS the plugin treats as unsupported by USS:
- CSS custom properties (`--var`) and any declaration using `var()`. USS itself supports both; this plugin strips them anyway
- Unsupported properties (filter, box-shadow, animation, grid, etc.)
- Unsupported at-rules (@keyframes, @font-face, @supports, @layer, @container)

Options: `removeEmpty` (drop rules left empty, default `true`), `warn` (log what was removed, default `false`).

#### `ussUnwrapIs()`

Flattens `:is()` and `:where()` selectors (used by Tailwind v3):
```css
/* Input */
.button:is(.primary) { color: blue; }
.card :where(.title) { color: red; }

/* Output */
.button.primary { color: blue; }
.card .title { color: red; }
```

A `:is()` or `:where()` with a comma inside it expands to one selector per member: `.button:is(.primary, .secondary)` becomes `.button.primary, .button.secondary`. Before 0.9.2 such a rule never returned and the build hung.

## GPU Compute

Access Unity compute shaders from JavaScript with optional zero-allocation dispatch for performance-critical rendering.

### Basic Usage

```typescript
import { View } from "onejs-react"
import { compute, useComputeShader, useComputeTexture } from "onejs-unity/gpu"
import { useFrame } from "onejs-react"

function BackgroundEffect({ shaderGlobal }: { shaderGlobal: unknown }) {
    const shader = useComputeShader(shaderGlobal, "MyEffect")
    const texture = useComputeTexture({ autoResize: true })

    useFrame(() => {
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

The GPU module provides two APIs for dispatching compute shaders:

| API | Allocations | Use Case |
|-----|-------------|----------|
| `shader.kernel()` | ~26KB/frame | Prototyping, one-off dispatches |
| `shader.createDispatcher()` | **0 bytes** | Per-frame rendering, games |

**Why does `kernel()` allocate?** It uses the standard C# interop which involves reflection, string marshaling, and object boxing on every call.

**Why is `createDispatcher()` zero-alloc?** It uses pre-registered native bindings (`__zaInvokeN`) that pass primitives directly to C# without any managed allocations. Property name→ID conversions are cached.

Use `createDispatcher()` for any code that runs every frame:

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
import { View, useFrame } from "onejs-react"
import { useComputeShader, useComputeTexture, type KernelDispatcher } from "onejs-unity/gpu"

function ZeroAllocEffect({ shaderGlobal }: { shaderGlobal: unknown }) {
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

    useFrame(() => {
        if (!dispatch || !texture) return

        // No lookups on the first frame: every ID is already cached
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

For custom C# method calls in performance-critical code, use the `za` module. Every `za` call goes through fixed-arity native functions (`__zaInvokeN`) with no argument array on the JS side. What happens in C# depends on how the binding was made:

- `za.static` and `za.method` look the method up by name once, at bind time. Each call then invokes it through reflection, which boxes the arguments into an `object[]`. Cheaper than `CS.Type.Method()`, since nothing is resolved per call, but not allocation free.
- `za.fromId` calls a delegate C# registered ahead of time with `QuickJSNative.Bind`. That path is typed end to end and allocates nothing.

### Static Methods

```typescript
import { za } from "onejs-unity/interop"

// Bind multiple methods on a class
const Physics = za.static("UnityEngine.Physics", {
    Raycast: 4,                              // shorthand: 4 args
    SphereCast: { args: 5, returns: "bool" }, // with metadata
    OverlapSphereNonAlloc: 4,
})

// Per-frame usage: the lookup happened once, above
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
    const t = getTime()
    const dt = getDeltaTime()
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

For instance methods, create static wrappers in C#. A C# object passed from JS arrives as the object itself, so the wrapper takes it as its first parameter:

```csharp
// C# side: a static wrapper that takes the instance first
public static class CharacterControllerExt {
    public static void MoveStatic(CharacterController cc, float x, float y, float z) {
        cc.Move(new Vector3(x, y, z));
    }
}
```

```typescript
// JS side
const CharacterController = za.static("CharacterControllerExt", {
    MoveStatic: 4,  // instance + x, y, z
})

CharacterController.MoveStatic(cc, velocity.x, velocity.y, velocity.z)
```

### How It Works

| API | First Call | Subsequent Calls |
|-----|-----------|------------------|
| `CS.Type.Method()` | Reflection lookup | Reflection lookup and invoke (allocates) |
| `za.static/method` | Registers binding (reflection lookup) | Reflection invoke, arguments boxed (allocates) |
| `za.fromId` | None | Typed delegate invoke (zero-alloc) |

Arguments cross as primitives, strings, `{ x, y, z }` / `{ x, y, z, w }` / `{ r, g, b, a }` values and C# objects, up to 8 per call.

## Peer Dependencies

When using the build plugins:

```bash
npm install -D esbuild
```

Note: `tailwindcss` is **not required**. OneJS includes a built-in Tailwind utility generator. `postcss` is needed only for the [PostCSS plugins](#postcss-plugins).

## License

MIT
