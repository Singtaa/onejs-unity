# fx: textures as values

`onejs-unity/fx` makes a texture something you can hold, chain operations on,
and hand to an element. Phases 2a to 2c of `Specs/GPU_2D.md`.

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

Four things end a pass, all in `FxBridge.Execute`:

1. The window fills.
2. A second **texture** operand appears. The shader has one spare sampler, so
   one texture operand fits per pass.
3. A second **ramp** appears. Same reason: one set of ramp uniforms.
4. A **spatial or filter** op appears, which cannot fuse at all (see below).

None of it is visible from JS. A chain of any length works; it just costs more
passes.

## Three kinds of op

How an op reads its input decides where it can run, and the opcode ranges encode
exactly that:

| Range | Family | Reads | Where |
|---|---|---|---|
| 16..111 | maths, colour, composite | one pixel | fuses into `FxOps` |
| 112..127 | spatial | one pixel at a **moved uv** | own pass, `FxSpatial` |
| 128+ | filters | **many** pixels | own pass(es), `FxFilter` |

Every op in `FxOps` works on a colour that has already been sampled, so
anything that has to move the uv first, or read neighbours, has nothing to fuse
into. `crop` is the only op that changes the target size, and the filters are
the only ops where **one op can be several passes**: the separable ones
(`blur`, `dilate`, `erode`) run horizontally then vertically.

Watch the range predicates: `isSpatialOp` has to be a range and not just
`op >= FIRST_SPATIAL_OP`, or every filter reads as spatial too. `FxBridge`
gets away with a floor because it tests the filter range first; a predicate has
no order to lean on.

## Sources

A chain starts from one of these.

| Source | Notes |
|---|---|
| `image.load(path)` | Through `Resources.Load`, so the path is Resources relative with no extension |
| `image.fromHandle(h)` | A texture you already hold |
| `image.color(w, h, rgba)` | A flat colour |
| `image.blank(w, h)` | Transparent |
| `image.noise(w, h, opts)` | fBm value or simplex noise, greyscale; `scroll` pans it on the animated build's clock |
| `image.gradient(w, h, stops, angle)` | Up to 8 stops, sorted for you; colours as hex or rgba, or a bare colour list spread evenly |
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
`Resources/OneJS/{FxOps,FxSources,FxSpatial}.shader`. **The opcode numbers appear
on both sides**;
change them together. `WIRE_VERSION` guards the pairing: a newer package against
an older runtime fails loudly rather than silently dropping operations, which is
the failure mode the particle wire was built to avoid.

## What is not here yet

Phases 2a, 2b, 2c and 3 are in. Phase 3 is `hooks.ts`: `useTexture` for a
chain that ends in a texture, `useImage` for one kept as an operand (built
synchronously, never null), and `useAnimatedTexture` for one rebuilt per frame
into a stable target, calling the latest render's build function and setting
the clock `scroll` reads. Still to come:

- **2d**: the compute backend for jump flood SDF generation and histograms.

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

## Operations

| Group | Methods |
|---|---|
| Maths | `add` `subtract` `multiply` `divide` `pow` `sqrt` `clamp` `frac` `min` `max` `oneMinus` `remap` `saturate` `abs` `exp` `log` `modulo` `negate` `posterize` `reciprocal` `lerp` `smoothstep` `inverseLerp` |
| Colour | `grayscale` `brightness` `contrast` `saturation` `hueShift` `levels` `swizzle` `ramp` |
| Composite | `blend(operand, mode, opacity)`, 27 Photoshop modes |
| Spatial | `transform` `tile` `flip` `crop` |
| Filters | `blur` `sharpen` `edge` `dilate` `erode` `outline` |

Colour operations adjust rgb and leave alpha alone: an adjustment that silently
changed opacity would surprise everywhere it is used.

`ramp` is Spark2D's `dye`. It colours by luminance, which is what turns a
greyscale field (a `noise` or `sdf` source, say) into an image. Its stops are
written like `gradient`'s: hex strings or rgba tuples, positioned or spread
evenly, readonly or not. The hex parser is `src/color.ts`, shared with `sl`.

The blend modes are the PDF blend spec's, not an approximation. `softLight` uses
the spec's `D(b)` rather than the cheap two branch version, which has a visible
kink at 0.5 on smooth gradients, and `hue`, `saturation`, `color` and
`luminosity` use `SetLum` / `SetSat` rather than an HSV round trip, which is what
makes them agree with Photoshop.

**Blur has no radius limit.** `MAX_FILTER_TAPS` bounds what one pass can sample,
not how wide a blur can be: past that the runtime repeats the pass rather than
spreading the taps, which would alias. Blurring twice at sigma widens by
sqrt(2), because variances add, so N passes at sigma/sqrt(N) reproduce the sigma
asked for. A big radius costs passes, not quality.

**`outline` needs to be told which channel holds the shape.** A loaded sprite
keeps its shape in alpha; the `sdf` and `noise` sources put theirs in rgb and
leave alpha at 1. The alpha default gives an empty ring for those rather than an
error, so pass `"luminance"`.

**Do not use UnityCG's `Luminance` in these shaders.** It reads
`unity_ColorSpaceLuminance`, whose linear space weights sum to about 0.502
rather than 1, so white comes back as half and everything downstream is
mysteriously dim. `FxFilter` defines `fxLuma` with Rec. 709 weights, matching
`onejsLuma` in `FxColor.cginc`.
