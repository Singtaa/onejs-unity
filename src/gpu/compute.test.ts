import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

/**
 * A stand-in for GPUBridge holding each buffer as the 32-bit words a
 * ComputeBuffer would, so a write and a readback can be compared bit for bit.
 * `bits: false` is a runtime from before SetBufferBits: the static is missing,
 * which the CS proxy reads as a truthy proxy object rather than undefined.
 */
function fakeBridge({ bits }: { bits: boolean }) {
    const words = new Map<number, Int32Array>()
    const readbacks = new Map<number, number>()
    let next = 1
    const asFloats = (w: Int32Array) => Array.from(new Float32Array(w.buffer))
    const api = {
        HasBufferBits: bits ? true : {},
        CreateBuffer: vi.fn((count: number) => { const h = next++; words.set(h, new Int32Array(count)); return h }),
        SetBufferBits: vi.fn((h: number, text: string) => {
            words.set(h, new Int32Array(text === "" ? [] : text.split(",").map(Number)))
        }),
        SetBufferData: vi.fn((h: number, json: string) => {
            words.set(h, new Int32Array(new Float32Array(JSON.parse(json) as number[]).buffer))
        }),
        RequestReadback: vi.fn((h: number) => { const id = next++; readbacks.set(id, h); return id }),
        IsReadbackComplete: vi.fn(() => true),
        GetReadbackBits: vi.fn((id: number) => Array.from(words.get(readbacks.get(id)!)!).join(",")),
        GetReadbackData: vi.fn((id: number) => JSON.stringify(asFloats(words.get(readbacks.get(id)!)!))),
        stored: (h: number) => words.get(h)!,
    }
    ;(globalThis as any).CS = { OneJS: { GPU: { GPUBridge: api } } }
    return api
}

/** compute.ts probes the runtime once per module instance, so each test loads a fresh one. */
async function load() {
    vi.resetModules()
    return (await import("./compute")).compute
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

async function readBack<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(20)
    return promise
}

describe("buffer transport", () => {
    it("writes a Float32Array as its bit patterns and reads it back exactly", async () => {
        const api = fakeBridge({ bits: true })
        const compute = await load()
        const data = new Float32Array([1, -1, 0.1, -0, Number.MIN_VALUE, 3.4e38, NaN])
        const buffer = compute.buffer({ data })
        expect(api.SetBufferBits).toHaveBeenCalledOnce()
        expect(api.SetBufferData).not.toHaveBeenCalled()
        expect(api.stored(buffer.__handle)).toEqual(new Int32Array(data.buffer))

        const back = await readBack(buffer.read())
        expect(back).toBeInstanceOf(Float32Array)
        expect(new Int32Array(back.buffer)).toEqual(new Int32Array(data.buffer))
    })

    it("lands an Int32Array and a Uint32Array as integers, not as float bits", async () => {
        const api = fakeBridge({ bits: true })
        const compute = await load()
        const ints = compute.buffer({ data: new Int32Array([5, -7, 2147483647, -2147483648]) })
        expect(Array.from(api.stored(ints.__handle))).toEqual([5, -7, 2147483647, -2147483648])
        const uints = compute.buffer({ data: new Uint32Array([5, 4294967295]) })
        expect(Array.from(new Uint32Array(api.stored(uints.__handle).buffer))).toEqual([5, 4294967295])

        expect(Array.from(await readBack(ints.read()))).toEqual([5, -7, 2147483647, -2147483648])
        const u = await readBack(uints.read())
        expect(u).toBeInstanceOf(Uint32Array)
        expect(Array.from(u)).toEqual([5, 4294967295])
    })

    it("writes only the view of a subarray, not its whole backing store", async () => {
        const api = fakeBridge({ bits: true })
        const compute = await load()
        const whole = new Float32Array([9, 1, 2, 9])
        const buffer = compute.buffer({ count: 2 })
        buffer.write(whole.subarray(1, 3))
        expect(Array.from(new Float32Array(api.stored(buffer.__handle).buffer))).toEqual([1, 2])
    })

    it("keeps JSON for array types that are not 32-bit", async () => {
        const api = fakeBridge({ bits: true })
        const compute = await load()
        const buffer = compute.buffer({ count: 2 })
        buffer.write(new Float64Array([1.5, 2.5]) as never)
        expect(api.SetBufferData).toHaveBeenCalledWith(buffer.__handle, "[1.5,2.5]")
        expect(api.SetBufferBits).not.toHaveBeenCalled()
    })

    it("uses the JSON pair against a runtime without SetBufferBits", async () => {
        const api = fakeBridge({ bits: false })
        const compute = await load()
        const buffer = compute.buffer({ data: new Float32Array([1, 2]) })
        expect(api.SetBufferData).toHaveBeenCalledWith(buffer.__handle, "[1,2]")
        expect(api.SetBufferBits).not.toHaveBeenCalled()
        expect(Array.from(await readBack(buffer.read()))).toEqual([1, 2])
        expect(api.GetReadbackBits).not.toHaveBeenCalled()
    })
})
