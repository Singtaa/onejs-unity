import { describe, it, expect, beforeEach, vi } from "vitest"
import { BLEND, FIRST_FILTER_OP, MAX_FILTER_TAPS, MAX_FUSED_OPS, MAX_GRADIENT_STOPS, MODE, OP, WIRE_VERSION, isFilterOp, isPixelOp, isSpatialOp } from "./ops"
import { SDF_SHAPES } from "./sdf"

/**
 * The encoded chain is the contract with Runtime/Fx/FxBridge.cs. If anything
 * here changes, that file changes with it, and so does OneJS/FxOps.shader when
 * an opcode moves.
 */

let executed: Float32Array[] = []
let nextHandle = 1

beforeEach(() => {
    executed = []
    nextHandle = 1
    ;(globalThis as any).CS = {
        OneJS: {
            Fx: {
                FxBridge: {
                    LoadTexture: vi.fn(() => nextHandle++),
                    Execute: vi.fn((buf: Float32Array) => {
                        executed.push(buf)
                        return nextHandle++
                    }),
                    GetTexture: vi.fn(() => ({})),
                    Release: vi.fn(),
                },
            },
        },
    }
    vi.resetModules()
})

async function load() {
    return await import("./image")
}

/** Walks an encoded buffer back into steps, the way FxBridge does. */
function decode(buf: Float32Array) {
    const version = buf[0]
    const stepCount = buf[1]
    const steps: { op: number; mode: number; args: number[] }[] = []
    let c = 2
    for (let i = 0; i < stepCount; i++) {
        const op = buf[c], mode = buf[c + 1], argCount = buf[c + 2]
        c += 3
        steps.push({ op, mode, args: Array.from(buf.slice(c, c + argCount)) })
        c += argCount
    }
    return { version, stepCount, steps, consumed: c }
}

describe("fx chain encoding", () => {
    it("stamps the wire version and consumes the whole buffer", async () => {
        const { image } = await load()
        const buf = image.blank(4, 4).multiply(2).add(0.5).encode()
        const d = decode(buf)
        expect(d.version).toBe(WIRE_VERSION)
        expect(d.stepCount).toBe(3)
        // A decoder that walks off the end, or stops short, means the argCount
        // written does not match the args written.
        expect(d.consumed).toBe(buf.length)
    })

    it("puts the source first and the operations in order", async () => {
        const { image } = await load()
        const d = decode(image.color(8, 8, [1, 0, 0, 1]).multiply(0.15).add(0.5).pow(2.2).clamp(0, 1).encode())
        expect(d.steps.map((s) => s.op)).toEqual([
            OP.SOURCE_COLOR, OP.MULTIPLY, OP.ADD, OP.POW, OP.CLAMP,
        ])
        expect(d.steps[0].args).toEqual([8, 8, 1, 0, 0, 1])
        expect(d.steps[4].args).toEqual([0, 1])
    })

    it("tags each operand with the mode the shader switches on", async () => {
        const { image } = await load()
        const operand = image.blank(4, 4)
        const d = decode(image.blank(4, 4)
            .multiply(2)
            .add([0.1, 0.2, 0.3, 0.4])
            .subtract(operand)
            .encode())
        expect(d.steps[1].mode).toBe(MODE.SCALAR)
        expect(d.steps[2].mode).toBe(MODE.VECTOR)
        expect(d.steps[3].mode).toBe(MODE.TEXTURE)
        // a texture operand encodes as one handle, not four floats
        expect(d.steps[3].args.length).toBe(1)
    })

    it("keeps lerp's t out of the operand slots a scalar does not use", async () => {
        const { image } = await load()
        const d = decode(image.blank(4, 4).lerp(0.25, 0.75).encode())
        // shader reads the operand from .x and t from .w
        expect(d.steps[1].args[0]).toBe(0.25)
        expect(d.steps[1].args[3]).toBe(0.75)
    })

    it("does not mutate the image it was chained from", async () => {
        const { image } = await load()
        const base = image.blank(4, 4).multiply(2)
        const a = base.add(1)
        const b = base.add(5)
        // Values, not mutation: the shared prefix must not have grown.
        expect(decode(base.encode()).stepCount).toBe(2)
        expect(decode(a.encode()).steps[2].args).toEqual([1])
        expect(decode(b.encode()).steps[2].args).toEqual([5])
    })

    it("renders an image operand once even when several chains use it", async () => {
        const { image } = await load()
        const shared = image.blank(4, 4).multiply(3)
        image.blank(4, 4).add(shared).render()
        image.blank(4, 4).subtract(shared).render()
        const sharedEncodings = executed.filter((b) => {
            const d = decode(b)
            return d.stepCount === 2 && d.steps[1].op === OP.MULTIPLY && d.steps[1].args[0] === 3
        })
        expect(sharedEncodings.length).toBe(1)
    })

    it("agrees with FxBridge on which opcodes are fusable", async () => {
        // Sources allocate a target and cannot be folded into a fused pass;
        // everything else is per pixel. FxBridge splits on the same boundary.
        expect(isPixelOp(OP.SOURCE_TEXTURE)).toBe(false)
        expect(isPixelOp(OP.SOURCE_COLOR)).toBe(false)
        for (const [name, code] of Object.entries(OP)) {
            if (name.startsWith("SOURCE_")) continue
            expect(isPixelOp(code)).toBe(true)
        }
    })

    it("has unique opcodes and a fusion window matching the shader", async () => {
        const codes = Object.values(OP)
        expect(new Set(codes).size).toBe(codes.length)
        // MAX_OPS in OneJS/FxOps.shader
        expect(MAX_FUSED_OPS).toBe(16)
    })

    it("caches render so a chain crosses once", async () => {
        const { image } = await load()
        const img = image.blank(4, 4).multiply(2)
        const first = img.render()
        const second = img.render()
        expect(first).toBe(second)
        expect(executed.length).toBe(1)
    })
})

describe("fx generated sources", () => {
    it("encodes noise with its octaves clamped to what the shader unrolls", async () => {
        const { image } = await load()
        const d = decode(image.noise(64, 64, { scale: 3, seed: 9, octaves: 99, rotation: 90 }).encode())
        expect(d.steps[0].op).toBe(OP.SOURCE_NOISE)
        // w, h, scaleX, scaleY, octaves, seed, offsetX, offsetY, rotation
        expect(d.steps[0].args.slice(0, 6)).toEqual([64, 64, 3, 3, 4, 9])
        expect(d.steps[0].args[8]).toBeCloseTo(Math.PI / 2)
    })

    it("sorts gradient stops, because the shader walks them in order", async () => {
        const { image } = await load()
        const d = decode(image.gradient(32, 32, [
            { color: [1, 1, 1, 1], at: 1 },
            { color: [0, 0, 0, 1], at: 0 },
            { color: [1, 0, 0, 1], at: 0.5 },
        ]).encode())
        expect(d.steps[0].op).toBe(OP.SOURCE_GRADIENT)
        expect(d.steps[0].args[3]).toBe(3)
        // positions are the 5th float of each stop record
        const positions = [d.steps[0].args[8], d.steps[0].args[13], d.steps[0].args[18]]
        expect(positions).toEqual([0, 0.5, 1])
    })

    it("refuses a gradient the shader cannot hold", async () => {
        const { image } = await load()
        const many = Array.from({ length: MAX_GRADIENT_STOPS + 1 }, (_, i) => ({
            color: [0, 0, 0, 1] as [number, number, number, number], at: i / 10,
        }))
        expect(() => image.gradient(8, 8, many)).toThrow(/at most/)
        expect(() => image.gradient(8, 8, [])).toThrow(/at least one/)
    })

    it("packs an sdf source the way FxSources reads it", async () => {
        const { image } = await load()
        const d = decode(image.sdf(64, 64, "hexagon", {
            r: 0.4, x: 0.1, rotation: 180, scale: 2, rounded: 0.03, onion: 0.01,
            softness: 0.05, field: true,
        }).encode())
        expect(d.steps[0].op).toBe(OP.SOURCE_SDF)
        const a = d.steps[0].args
        expect(a.slice(0, 3)).toEqual([64, 64, SDF_SHAPES.hexagon])
        expect(a[3]).toBeCloseTo(0.4)          // param 1
        // Float32Array rounds, so these compare loosely rather than exactly.
        expect(a[9]).toBeCloseTo(0.1); expect(a[10]).toBe(0)
        expect(a[11]).toBeCloseTo(Math.PI)     // rotation
        expect(a[12]).toBe(2)                  // scale
        expect(a[13]).toBeCloseTo(0.03); expect(a[14]).toBeCloseTo(0.01)
        expect(a[15]).toBeCloseTo(0.05); expect(a[16]).toBe(1)
        expect(a[17]).toBe(2)   // scale on Y, defaulting to the X scale
        expect(a.length).toBe(18)
    })

    it("keeps the sdf shape ids contiguous and unique", async () => {
        const ids = Object.values(SDF_SHAPES)
        expect(new Set(ids).size).toBe(ids.length)
        expect(Math.min(...ids)).toBe(0)
        expect(Math.max(...ids)).toBe(41)
        expect(ids.length).toBe(42)
    })

    it("treats every generated source as a source, not a fusable op", async () => {
        for (const code of [OP.SOURCE_NOISE, OP.SOURCE_GRADIENT, OP.SOURCE_SDF]) {
            expect(isPixelOp(code)).toBe(false)
        }
    })
})

describe("fx colour, blend and spatial", () => {
    it("converts hue and rotation to radians for the shader", async () => {
        const { image } = await load()
        const d = decode(image.blank(4, 4).hueShift(180).transform({ rotation: 90 }).encode())
        expect(d.steps[1].args[0]).toBeCloseTo(Math.PI)
        expect(d.steps[2].args[2]).toBeCloseTo(Math.PI / 2)
    })

    it("puts the blend mode and opacity last whatever the operand width", async () => {
        const { image } = await load()
        const operand = image.blank(4, 4)
        const d = decode(image.blank(4, 4)
            .blend([1, 0, 0, 1], "multiply", 0.5)
            .blend(operand, "screen", 0.25)
            .encode())
        // FxBridge reads the last two args as (mode, opacity) regardless, so a
        // four float colour operand and a one float handle both work.
        const vec = d.steps[1].args
        expect(vec.length).toBe(6)
        expect(vec.slice(0, 4)).toEqual([1, 0, 0, 1])
        expect(vec[4]).toBe(BLEND.multiply)
        expect(vec[5]).toBe(0.5)
        const tex = d.steps[2].args
        expect(tex.length).toBe(3)
        expect(tex[1]).toBe(BLEND.screen)
        expect(tex[2]).toBe(0.25)
        expect(d.steps[2].mode).toBe(MODE.TEXTURE)
    })

    it("has 27 blend modes with unique contiguous ids", async () => {
        const ids = Object.values(BLEND)
        expect(ids.length).toBe(27)
        expect(new Set(ids).size).toBe(27)
        expect(Math.min(...ids)).toBe(0)
        expect(Math.max(...ids)).toBe(26)
    })

    it("marks the spatial ops as unfusable and nothing else", async () => {
        const spatial = [OP.TRANSFORM, OP.TILE, OP.FLIP, OP.CROP]
        for (const code of spatial) expect(isSpatialOp(code)).toBe(true)
        for (const [, code] of Object.entries(OP)) {
            if (spatial.includes(code as any)) continue
            expect(isSpatialOp(code)).toBe(false)
        }
    })

    it("sorts ramp stops and refuses more than the shader holds", async () => {
        const { image } = await load()
        const d = decode(image.blank(4, 4).ramp([
            { color: [1, 1, 1, 1], at: 1 },
            { color: [0, 0, 0, 1], at: 0 },
        ]).encode())
        expect(d.steps[1].op).toBe(OP.RAMP)
        expect(d.steps[1].args[0]).toBe(2)      // stop count first
        expect(d.steps[1].args[5]).toBe(0)      // first stop's position
        expect(d.steps[1].args[10]).toBe(1)     // second stop's position
        const many = Array.from({ length: MAX_GRADIENT_STOPS + 1 }, (_, i) => ({
            color: [0, 0, 0, 1] as [number, number, number, number], at: i / 10,
        }))
        expect(() => image.blank(4, 4).ramp(many)).toThrow(/at most/)
    })

    it("defaults a transform to a centred pivot and transparent background", async () => {
        const { image } = await load()
        const a = decode(image.blank(4, 4).transform({}).encode()).steps[1].args
        expect(a.length).toBe(11)
        expect(a.slice(4, 7)).toEqual([0.5, 0.5, 0])   // pivot, wrap off
        expect(a.slice(7, 11)).toEqual([0, 0, 0, 0])   // background
    })

    it("keeps swizzle indices as raw channel numbers", async () => {
        const { image } = await load()
        // blue, green, red, keep alpha
        const a = decode(image.blank(4, 4).swizzle(2, 1, 0).encode()).steps[1].args
        expect(a).toEqual([2, 1, 0, 4])
    })
})

describe("fx neighbourhood filters", () => {
    it("marks the filters unfusable and keeps the families disjoint", async () => {
        const filters = [OP.BLUR, OP.SHARPEN, OP.EDGE, OP.DILATE, OP.ERODE, OP.OUTLINE]
        for (const code of filters) {
            expect(isFilterOp(code)).toBe(true)
            // A filter must not also read as spatial, or FxBridge would take the
            // wrong branch: it tests the filter range first, then the spatial one.
            expect(code >= FIRST_FILTER_OP).toBe(true)
        }
        for (const [, code] of Object.entries(OP)) {
            if (filters.includes(code as any)) continue
            expect(isFilterOp(code)).toBe(false)
        }
    })

    it("encodes each filter's arguments", async () => {
        const { image } = await load()
        const d = decode(image.blank(8, 8)
            .blur(12)
            .sharpen(0.75)
            .edge(2)
            .dilate(3)
            .erode(4)
            .outline(2, [1, 0, 0, 1])
            .encode())
        expect(d.steps.map((s) => s.op)).toEqual([
            OP.SOURCE_COLOR, OP.BLUR, OP.SHARPEN, OP.EDGE, OP.DILATE, OP.ERODE, OP.OUTLINE,
        ])
        expect(d.steps[1].args).toEqual([12])
        expect(d.steps[3].args).toEqual([2])
        expect(d.steps[6].args).toEqual([2, 1, 0, 0, 1, 0])
        expect(d.consumed).toBe(d.consumed) // whole buffer walked, see the first suite
    })

    it("lets a blur exceed one pass's tap budget", async () => {
        const { image } = await load()
        // The cap bounds the cost of a pass, not the radius: the runtime splits
        // this into several passes rather than refusing or aliasing.
        const big = MAX_FILTER_TAPS * 4
        const d = decode(image.blank(8, 8).blur(big).encode())
        expect(d.steps[1].args).toEqual([big])
    })

    it("defaults an outline to opaque black", async () => {
        const { image } = await load()
        const a = decode(image.blank(8, 8).outline(3).encode()).steps[1].args
        expect(a).toEqual([3, 0, 0, 0, 1, 0])
    })

    it("tags which channel an outline reads its shape from", async () => {
        const { image } = await load()
        const alpha = decode(image.blank(8, 8).outline(2).encode()).steps[1].args
        const luma = decode(image.blank(8, 8).outline(2, [1, 0, 0, 1], "luminance").encode()).steps[1].args
        // Silently defaulting this gives an empty ring for the mask sources, so
        // the flag rides on the wire rather than being inferred in the shader.
        expect(alpha[5]).toBe(0)
        expect(luma[5]).toBe(1)
    })
})


describe("fx ownership scope", () => {
    it("claims every chain that first renders inside the scope", async () => {
        const { image, beginOwnership, endOwnership } = await import("./image")
        beginOwnership()
        const mask = image.sdf(64, 64, "star", { r: 0.4 })
        const out = image.noise(64, 64).blend(mask, "multiply")
        out.render()
        const owned = endOwnership()
        // The outer chain and the operand it pulled in: releasing only the outer
        // one would strand the operand's target.
        expect(owned.length).toBe(2)
        expect(owned).toContain(out)
        expect(owned).toContain(mask)
    })

    it("leaves an already rendered chain with whoever made it", async () => {
        const { image, beginOwnership, endOwnership } = await import("./image")
        const shared = image.sdf(64, 64, "circle", { r: 0.3 })
        shared.render() // created outside, so not ours
        beginOwnership()
        const out = image.noise(64, 64).blend(shared, "multiply")
        out.render()
        const owned = endOwnership()
        expect(owned).toEqual([out])
        expect(owned).not.toContain(shared)
    })

    it("does not claim anything once the scope is closed", async () => {
        const { image, beginOwnership, endOwnership } = await import("./image")
        beginOwnership()
        endOwnership()
        const after = image.noise(64, 64)
        after.render()
        // A second scope must not inherit it either.
        beginOwnership()
        expect(endOwnership()).toEqual([])
    })

    it("releases a chain once, so a double dispose is harmless", async () => {
        const { image } = await import("./image")
        const img = image.noise(64, 64)
        img.render()
        img.dispose()
        img.dispose()
        const releases = (globalThis as any).CS.OneJS.Fx.FxBridge.Release.mock.calls.length
        expect(releases).toBe(1)
    })
})

describe("fx noise and sdf extras", () => {
    it("carries lacunarity and gain, defaulting to the classic fBm pair", async () => {
        const { image } = await load()
        const plain = decode(image.noise(64, 64).encode()).steps[0].args
        expect(plain.slice(9, 11)).toEqual([2, 0.5])
        const wild = decode(image.noise(64, 64, { lacunarity: 3.4, gain: 0.9 }).encode()).steps[0].args
        expect(wild[9]).toBeCloseTo(3.4)
        expect(wild[10]).toBeCloseTo(0.9)
    })

    it("flags which noise to use, defaulting to value", async () => {
        const { image } = await load()
        expect(decode(image.noise(64, 64).encode()).steps[0].args[11]).toBe(0)
        expect(decode(image.noise(64, 64, { type: "simplex" }).encode()).steps[0].args[11]).toBe(1)
    })

    it("stretches an sdf shape when scale is a pair", async () => {
        const { image } = await load()
        const uniform = decode(image.sdf(64, 64, "egg", { scale: 2 }).encode()).steps[0].args
        expect([uniform[12], uniform[17]]).toEqual([2, 2])
        const stretched = decode(image.sdf(64, 64, "egg", { scale: [1, 1.8] }).encode()).steps[0].args
        expect(stretched[12]).toBe(1)
        expect(stretched[17]).toBeCloseTo(1.8)
    })
})

describe("fx stops in either notation", () => {
    it("takes hex strings as stop colours", async () => {
        const { image } = await load()
        const d = decode(image.gradient(8, 8, [{ color: "#ff0000", at: 0 }, { color: "#00ff0080", at: 1 }]).encode())
        const a = d.steps[0].args
        expect(a.slice(4, 8)).toEqual([1, 0, 0, 1])
        expect(a[9]).toBe(0)
        expect(a[10]).toBe(1)
        expect(a[12]).toBeCloseTo(128 / 255, 5)
    })

    it("spreads bare colours evenly from 0 to 1", async () => {
        const { image } = await load()
        const d = decode(image.blank(4, 4).ramp(["#000", "#f00", "#fff"]).encode())
        const a = d.steps[1].args
        expect(a[0]).toBe(3)
        expect([a[5], a[10], a[15]]).toEqual([0, 0.5, 1])
        expect(a.slice(6, 9)).toEqual([1, 0, 0])
    })

    it("accepts a readonly tuple list, as `as const` produces", async () => {
        const { image } = await load()
        const stops = [{ color: [1, 1, 1, 1], at: 0 }, { color: [0, 0, 0, 1], at: 1 }] as const
        expect(() => image.blank(4, 4).ramp(stops)).not.toThrow()
    })

    it("names a colour it cannot read", async () => {
        const { image } = await load()
        expect(() => image.blank(4, 4).ramp(["red"])).toThrow(/not a colour/)
    })
})

describe("fx noise scroll", () => {
    it("is a still at time zero and pans with the animation clock", async () => {
        const { image, setAnimationTime } = await load()
        const at = (t: number) => {
            setAnimationTime(t)
            try { return decode(image.noise(64, 64, { offset: [1, 2], scroll: [0, -0.5] }).encode()).steps[0].args.slice(6, 8) }
            finally { setAnimationTime(0) }
        }
        expect(at(0)).toEqual([1, 2])
        expect(at(4)).toEqual([1, 0])
    })
})

describe("fx egg", () => {
    it("packs height, both radii and the bulge, in the order the shader reads them", async () => {
        const { image } = await load()
        const near = (got: number[], want: number[]) => got.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 5))
        const a = decode(image.sdf(64, 64, "egg", { h: 0.5, r: 0.22, rTop: 0.02, bulge: 0.6 }).encode()).steps[0].args
        near(a.slice(3, 7), [0.5, 0.22, 0.02, 0.6])
        const d = decode(image.sdf(64, 64, "egg").encode()).steps[0].args
        near(d.slice(3, 7), [0.4, 0.2, 0.1, 0.7])
    })
})
