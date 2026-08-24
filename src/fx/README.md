# fx: textures as values

`onejs-unity/fx` makes a texture something you can hold, chain operations on,
and hand to an element. Phase 2a of `Specs/GPU_2D.md`.

```ts
import { image } from "onejs-unity/fx"

const out = image.load("portrait")
    .multiply(0.15)
    .add(0.5)
    .pow(2.2)
    .clamp(0, 1)

<View style={{ backgroundImage: out.texture() }} />
```

## The one idea

**Nothing runs until `render()`.** A chain is a description, not a sequence of
dispatches. That single decision is what buys everything else:

- **Fusion.** A run of per pixel operations becomes one blit instead of one per
  operation. The chain above is one pass, not four.
- **One crossing.** The whole chain marshals as a single float buffer, the same
  `__csArray` path `PainterBridge` uses. Spark2D dispatched per operation, so
  that chain cost roughly twelve reflection crossings; on QuickJS that cost
  dominated everything else.
- **Pooling.** Intermediates are borrowed from a render target pool and returned,
  so a chain costs about one allocation rather than one per step.
- **Value semantics.** Every operation returns a new node and nothing writes into
  its own input. `const base = img.multiply(2)` can be branched twice without the
  two branches contaminating each other. Spark2D's API was documented `[Mutable]`
  and that is where its sharpest bugs lived.

## Why blit and not compute

WebGL2 has no compute shaders and play.onejs.com is WebGL. Of Spark2D's thirteen
compute kernels, eleven are pure per pixel and gain nothing from compute: a
fragment blit does identical work and runs everywhere. Compute earns its place
only for scatter and prefix scans (jump flood, histograms), which arrive in
Phase 2d behind a `supportsComputeShaders` check, so those operations are absent
on WebGL rather than the whole library being absent.

## The fusion window

`OneJS/FxOps.shader` evaluates the fused run with a bounded loop over uniform
arrays, capped at `MAX_FUSED_OPS` (16). The cap is not tuning: **player builds
cannot compile shaders at runtime**, so a JS chain can never become generated
shader code. It has to be data for a fixed loop. `TextureFX` is capped at six
layers for exactly the same reason.

Two things end a pass, and both are in `FxBridge.Execute`:

1. The window fills.
2. A second **texture** operand appears. The shader has one spare sampler, so
   one texture operand fits per pass.

Neither is visible from JS. A chain of any length works; it just costs more
passes.

## Sources

A chain starts from one of these.

| Source | Notes |
|---|---|
| `image.load(path)` | Through `Resources.Load`, so the path is Resources relative with no extension |
| `image.fromHandle(h)` | A texture you already hold |
| `image.color(w, h, rgba)` | A flat colour |
| `image.blank(w, h)` | Transparent |
| `image.noise(w, h, opts)` | Scrolling fBm value noise, greyscale |
| `image.gradient(w, h, stops, angle)` | Up to 8 stops, sorted for you |
| `image.sdf(w, h, kind, opts)` | Any of the 42 signed distance shapes, as a mask |

`noise`, `gradient` and `sdf` run through `OneJS/FxSources`, a separate shader
from the fused op pass because they read only uv and take no input texture.
Folding both into one shader would make every fused pass carry generator code it
never runs.

`sdf` takes the same shape names, defaults and centred aspect corrected space as
`fx.sdf` in `onejs-react`'s `TextureFX`, because both feed the same
`SDF2D.cginc`. The table is restated in `sdf.ts` rather than imported:
`onejs-unity` does not depend on `onejs-react`, and inverting that to share one
table would make the whole Unity utility package depend on the React renderer.
**A shape id therefore changes in four places**: `sdf.ts`, `texturefx.ts`, and
the `sdfDistance` switch in each of the two shaders.

## Files

| File | Purpose |
|---|---|
| `ops.ts` | The wire contract: opcodes, operand modes, the window size |
| `image.ts` | The `Image` node and the `image` source factory |
| `sdf.ts` | Shape ids and parameter packing for the sdf source |
| `fx.test.ts` | Encoding tests |

The other half is `Assets/Singtaa/OneJS/Runtime/Fx/FxBridge.cs` and
`Resources/OneJS/FxOps.shader`. **The opcode numbers appear in all three**;
change them together. `WIRE_VERSION` guards the pairing: a newer package against
an older runtime fails loudly rather than silently dropping operations, which is
the failure mode the particle wire was built to avoid.

## What is not here yet

Phase 2a covers sources and the maths operations. Still to come:

- **2b**: colour operations, the 27 blend modes, spatial operations.
- **2c**: multi pass filters (blur, sharpen, edge, dilate, erode, outline).
- **2d**: the compute backend for jump flood SDF generation and histograms.
- **3**: the React surface, `useTexture` and friends.

## Gotchas

**`load` reads from `Resources`, not from a project path.** It goes through
`Resources.Load`, so the texture has to live under a `Resources` folder and the
path carries no extension. Asset paths that work with `<Image src>` do not work
here.

**Targets are `ARGBFloat` and values are not clamped.** `multiply(2)` on a white
pixel really does give you 2.0, which is what makes the maths ops composable.
Call `saturate()` before handing the result to something that expects 0..1.

**`dispose()` returns the target to the pool; it does not free it.** That is the
point. The pool is emptied on context teardown by `FxBridge.DisposeAll`, which
is wired into `QuickJSUIBridge.Dispose` alongside the particle and shader effect
safety nets.

**An `Image` used as an operand renders when the chain that uses it is built,**
not when that chain renders. The result is cached on the node, so sharing one
operand across several chains renders it once.
