/**
 * `action.on("performed", cb)` is the documented way to react to an Input
 * System action. Nothing ever called the callbacks: C# never subscribed to the
 * action's phases and nothing on the JS side read them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { setInputBackend } from "./backend"
import { input } from "./input"

let frames: Array<() => void> = []
let queued = ""
let watched: number[] = []

function frame() {
    const run = frames
    frames = []
    for (const cb of run) cb()
}

beforeEach(() => {
    frames = []
    queued = ""
    watched = []
    ;(globalThis as any).requestAnimationFrame = (cb: () => void) => { frames.push(cb); return frames.length }
    setInputBackend({
        RegisterActionAsset: () => 1,
        FindAction: (_asset: number, path: string) => (path === "Player/Jump" ? 7 : 8),
        WatchActionEvents: (h: number) => { watched.push(h) },
        UnwatchActionEvents: (h: number) => { watched = watched.filter((w) => w !== h) },
        DrainActionEvents: () => { const s = queued; queued = ""; return s },
        GetActionPhase: () => 3,
    })
})

afterEach(() => {
    setInputBackend(null)
    delete (globalThis as any).requestAnimationFrame
})

describe("InputAction.on", () => {
    it("says so when the OneJS package is too old to report action phases", () => {
        setInputBackend({
            RegisterActionAsset: () => 1,
            FindAction: () => 7,
            WatchActionEvents: () => { throw new Error("Method not found: WatchActionEvents") },
        })
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        input.loadActions({}).action("Player/Jump").on("performed", () => {})
        expect(warn.mock.calls[0][0]).toContain("needs a newer OneJS")
        expect(frames.length).toBe(0)
        warn.mockRestore()
    })

    it("calls a callback when its phase happens, and only for its own action", () => {
        const actions = input.loadActions({})
        const jump = actions.action("Player/Jump")
        const fire = actions.action("Player/Fire")
        const onJump = vi.fn()
        const onFireStart = vi.fn()
        jump.on("performed", onJump)
        fire.on("started", onFireStart)
        expect(watched).toEqual([7, 8])

        queued = "7,1;8,0;7,2"
        frame()
        expect(onJump).toHaveBeenCalledTimes(1)
        expect(onJump.mock.calls[0][0].phase).toBe("performed")
        expect(onFireStart).toHaveBeenCalledTimes(1)

        jump.off()
        fire.off()
        frame()
        expect(frames.length).toBe(0)
    })

    it("stops watching and stops polling once the last callback is removed", () => {
        const jump = input.loadActions({}).action("Player/Jump")
        const off = jump.on("performed", () => {})
        frame()
        expect(frames.length).toBe(1)
        off()
        expect(watched).toEqual([])
        frame()
        expect(frames.length).toBe(0)
    })
})
