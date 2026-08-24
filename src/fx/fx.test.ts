import { describe, it, expect, beforeEach, vi } from "vitest"
import { MAX_FUSED_OPS, MODE, OP, WIRE_VERSION, isPixelOp } from "./ops"

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
