/**
 * An action's value is read as the type its control produces: `float()` for
 * a button or 1D axis, `vec2()` for a 2D one. The old `value<T>()` could not
 * see T at runtime, so it guessed by reading both, and Unity's ReadValue<T>
 * throws on the wrong type once the control is actuated.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { setInputBackend, getInputBackend } from "./backend"
import { input } from "./input"
import { installFakeBridge, resetCalls, action, fake } from "./fake-bridge.test-util"

let frames: Array<() => void> = []

beforeEach(() => {
    installFakeBridge()
    fake.actions.set("Player/Jump", action("float"))
    fake.actions.set("Player/Move", action("vec2"))
})
afterEach(() => setInputBackend(null))

describe("action.float() and action.vec2()", () => {
    it("float() reads a pressed button with one crossing and no Vector2 read", () => {
        const jump = input.loadActions({}).action("Player/Jump")
        fake.actions.get("Player/Jump")!.float = 1
        resetCalls()
        expect(jump.float()).toBe(1)
        expect(fake.calls).toEqual({ GetActionValueFloat: 1 })
    })

    it("vec2() reads a 2D action with only one axis held", () => {
        const move = input.loadActions({}).action("Player/Move")
        Object.assign(fake.actions.get("Player/Move")!, { x: 1, y: 0 })
        expect(move.vec2()).toEqual({ x: 1, y: 0 })
        expect(fake.calls.GetActionValueFloat).toBeUndefined()
    })

    it("vec2() returns the same object each call, updated in place", () => {
        const move = input.loadActions({}).action("Player/Move")
        const first = move.vec2()
        Object.assign(fake.actions.get("Player/Move")!, { x: 0, y: -1 })
        expect(move.vec2()).toBe(first)
        expect(first.y).toBe(-1)
    })
})

describe("the deprecated value<T>()", () => {
    it("no longer throws on a pressed button", () => {
        const jump = input.loadActions({}).action("Player/Jump")
        fake.actions.get("Player/Jump")!.float = 1
        expect(jump.value<number>()).toBe(1)
    })

    it("no longer throws on a 2D action with only one axis held", () => {
        const move = input.loadActions({}).action("Player/Move")
        Object.assign(fake.actions.get("Player/Move")!, { x: 1, y: 0 })
        expect(move.value()).toEqual({ x: 1, y: 0 })
    })
})

describe("callback context", () => {
    beforeEach(() => {
        frames = []
        ;(globalThis as any).requestAnimationFrame = (cb: () => void) => { frames.push(cb); return frames.length }
    })
    afterEach(() => { delete (globalThis as any).requestAnimationFrame })

    it("reads the value with float() and vec2() like the action", () => {
        // The fake bridge does not report phases; add the three methods the
        // event pump calls, queueing one "performed" for the Move action.
        const backend = getInputBackend() as Record<string, unknown>
        let queued = ""
        backend.WatchActionEvents = () => {}
        backend.UnwatchActionEvents = () => {}
        backend.DrainActionEvents = () => { const s = queued; queued = ""; return s }

        const move = input.loadActions({}).action("Player/Move")
        Object.assign(fake.actions.get("Player/Move")!, { x: 0.5, y: 0.25 })
        let seen: { x: number, y: number } | null = null
        const off = move.on("performed", (ctx) => { seen = { ...ctx.vec2() } })
        queued = `${(backend.FindAction as (a: number, p: string) => number)(1, "Player/Move")},1`
        const run = frames
        frames = []
        for (const cb of run) cb()
        expect(seen).toEqual({ x: 0.5, y: 0.25 })
        off()
    })
})
