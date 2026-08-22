import { describe, it, expect, beforeEach, vi } from "vitest"
import { toWire, createPhysicsWorld } from "./index"

const parse = (config: Parameters<typeof toWire>[0]) => JSON.parse(toWire(config))

describe("toWire", () => {
    it("crosses as one document, which is the whole point", () => {
        const doc = parse({ bodies: [{}, {}, {}] })
        expect(doc.v).toBe(1)
        expect(doc.bodies).toHaveLength(3)
    })

    it("defaults to gravity down the screen, since Y is down in the UI", () => {
        expect(parse({ bodies: [] })).toMatchObject({ gravityX: 0, gravityY: 980 })
    })

    it("maps names to the numbers the wire carries", () => {
        const doc = parse({ bodies: [
            { type: "dynamic", shape: "box" },
            { type: "kinematic", shape: "circle", radius: 8 },
            { type: "static", shape: "capsule" },
        ] })
        expect(doc.bodies.map((b: any) => [b.type, b.shape])).toEqual([[0, 0], [1, 1], [2, 2]])
    })

    it("carries a circle's radius in w, so the wire needs no third size field", () => {
        const [circle] = parse({ bodies: [{ shape: "circle", radius: 12 }] }).bodies
        expect(circle.w).toBe(12)
        expect(circle.h).toBe(12)
    })

    it("takes box and capsule size as a pair", () => {
        const [box] = parse({ bodies: [{ shape: "box", size: [40, 20] }] }).bodies
        expect([box.w, box.h]).toEqual([40, 20])
    })

    it("rejects an unknown shape or type by name, not by producing undefined", () => {
        expect(() => toWire({ bodies: [{ shape: "blob" as never }] })).toThrow(/unknown shape "blob"/)
        expect(() => toWire({ bodies: [{ type: "floaty" as never }] })).toThrow(/unknown type "floaty"/)
    })

    it("rejects a config that is not a config", () => {
        expect(() => toWire(null as never)).toThrow(/config/)
        expect(() => toWire({} as never)).toThrow(/bodies/)
    })

    it("leaves contact reporting off unless asked, since most bodies are scenery", () => {
        const [quiet, loud] = parse({ bodies: [{}, { reportCollisions: true }] }).bodies
        expect(quiet.reportCollisions).toBe(false)
        expect(loud.reportCollisions).toBe(true)
    })

    it("defaults pixelsPerUnit, because PhysX is tuned for small bodies", () => {
        expect(parse({ bodies: [] }).pixelsPerUnit).toBe(100)
        expect(parse({ bodies: [], pixelsPerUnit: 50 }).pixelsPerUnit).toBe(50)
    })
})

/** A stand-in for the C# world that records what crossed. */
function fakeWorld() {
    const calls: Array<[string, ...unknown[]]> = []
    let queued: number[] = []
    const world = {
        BodyCount: 2,
        Bind: vi.fn((i: number, e: unknown) => calls.push(["Bind", i, e])),
        DrainEvents: vi.fn(() => { const q = queued; queued = []; calls.push(["DrainEvents"]); return q.length ? JSON.stringify(q) : "" }),
        ApplyImpulse: vi.fn((...a: unknown[]) => calls.push(["ApplyImpulse", ...a])),
        SetVelocity: vi.fn(), SetPosition: vi.fn(), SetGravity: vi.fn(),
        SetBodyEnabled: vi.fn(), ReadTransforms: vi.fn(() => "[1,2,3]"),
        Dispose: vi.fn(() => calls.push(["Dispose"])),
    }
    ;(globalThis as any).CS = {
        OneJS: { Physics2DBridge: { Create: vi.fn(() => world) } },
    }
    return { world, calls, queue: (e: number[]) => { queued = e } }
}

let fake: ReturnType<typeof fakeWorld>
beforeEach(() => { fake = fakeWorld() })

describe("createPhysicsWorld", () => {
    it("binds each body's element, since elements cannot travel in JSON", () => {
        const a = { id: "a" }, b = { id: "b" }
        createPhysicsWorld({}, { bodies: [{ element: a }, {}, { element: b }] })
        expect(fake.world.Bind).toHaveBeenCalledTimes(2)
        expect(fake.world.Bind).toHaveBeenCalledWith(0, a)
        expect(fake.world.Bind).toHaveBeenCalledWith(2, b)
    })

    it("costs nothing per frame with no collision handler", () => {
        const w = createPhysicsWorld({}, { bodies: [{}] })
        fake.calls.length = 0
        for (let i = 0; i < 100; i++) w.pump()
        expect(fake.calls).toEqual([])
    })

    it("drains every contact in one crossing per frame", () => {
        const w = createPhysicsWorld({}, { bodies: [{}, {}] })
        const seen: unknown[] = []
        w.onCollision(c => seen.push(c))
        fake.queue([0, 1, 10, 20, 5, 6, 1, -1, 20, 0, 7, 8])
        fake.calls.length = 0
        w.pump()
        expect(fake.world.DrainEvents).toHaveBeenCalledTimes(1)
        expect(seen).toEqual([
            { a: 0, b: 1, tagA: 10, tagB: 20, x: 5, y: 6 },
            { a: 1, b: -1, tagA: 20, tagB: 0, x: 7, y: 8 },
        ])
    })

    it("ignores a trailing partial record rather than inventing a contact", () => {
        const w = createPhysicsWorld({}, { bodies: [{}] })
        const seen: unknown[] = []
        w.onCollision(c => seen.push(c))
        fake.queue([0, 1, 0, 0, 0, 0, 9, 9])
        w.pump()
        expect(seen).toHaveLength(1)
    })

    it("passes imperative calls straight through, one crossing each", () => {
        const w = createPhysicsWorld({}, { bodies: [{}] })
        w.impulse(0, 10, -400)
        expect(fake.world.ApplyImpulse).toHaveBeenCalledWith(0, 10, -400)
    })

    it("goes inert after dispose instead of using a dead world", () => {
        const w = createPhysicsWorld({}, { bodies: [{}] })
        w.dispose()
        fake.calls.length = 0
        w.pump(); w.impulse(0, 1, 1); w.setVelocity(0, 1, 1); w.bind(0, {})
        expect(fake.calls).toEqual([])
        expect(w.bodyCount).toBe(0)
        expect(w.readTransforms()).toEqual([])
    })

    it("disposes once however many times it is called", () => {
        const w = createPhysicsWorld({}, { bodies: [{}] })
        w.dispose(); w.dispose()
        expect(fake.world.Dispose).toHaveBeenCalledTimes(1)
    })

    it("says something useful when the bridge is missing", () => {
        ;(globalThis as any).CS = {}
        expect(() => createPhysicsWorld({}, { bodies: [] })).toThrow(/Physics2DBridge|link\.xml/)
    })
})
