import { describe, it, expect, afterEach } from "vitest"
import { setInputBackend, createInputBackend, isOptionalMethod } from "./backend"
import { input } from "./input"

/**
 * `input.mouse.lock()`, `unlock()` and `locked`: what a host that locks the
 * pointer itself says (OJPlay's container, through the page), and Unity's own
 * Cursor everywhere else, without asking InputBridge for a method it lacks.
 */

afterEach(() => {
    setInputBackend(null)
    delete (globalThis as any).CS
})

/** Unity's Cursor and its enum, as CS reaches them. */
function fakeUnity() {
    // Enum members cross as their numbers, and so does a read of lockState.
    const mode = { None: 0, Locked: 1, Confined: 2 }
    const cursor = { lockState: mode.None }
    const asked: string[] = []
    const bridge = new Proxy({}, { get: (_t, p) => { asked.push(String(p)); return () => 0 } })
    ;(globalThis as any).CS = { UnityEngine: { Cursor: cursor, CursorLockMode: mode }, OneJS: { Input: { InputBridge: bridge } } }
    return { cursor, mode, asked }
}

describe("pointer lock", () => {
    it("asks a backend that locks the pointer itself", () => {
        const calls: string[] = []
        let locked = false
        setInputBackend({
            LockMouse: () => { calls.push("lock"); locked = true },
            UnlockMouse: () => { calls.push("unlock"); locked = false },
            IsMouseLocked: () => locked,
        })
        expect(input.mouse.locked).toBe(false)
        input.mouse.lock()
        expect(input.mouse.locked).toBe(true)
        input.mouse.unlock()
        expect(input.mouse.locked).toBe(false)
        expect(calls).toEqual(["lock", "unlock"])
    })

    it("locks Unity's Cursor with no backend, and never asks InputBridge", () => {
        const unity = fakeUnity()
        input.mouse.lock()
        expect(unity.cursor.lockState).toBe(unity.mode.Locked)
        expect(input.mouse.locked).toBe(true)
        // Confined is not locked: the pointer still moves.
        unity.cursor.lockState = unity.mode.Confined
        expect(input.mouse.locked).toBe(false)
        input.mouse.unlock()
        expect(unity.cursor.lockState).toBe(unity.mode.None)
        expect(unity.asked).toEqual([])
    })

    it("locks Unity's Cursor from a partial backend that leaves the lock out", () => {
        const unity = fakeUnity()
        setInputBackend(createInputBackend({}, "test backend"))
        input.mouse.lock()
        expect(unity.cursor.lockState).toBe(unity.mode.Locked)
        expect(input.mouse.locked).toBe(true)
    })

    it("does nothing and reads unlocked where CS reaches no Unity", () => {
        expect(() => input.mouse.lock()).not.toThrow()
        expect(input.mouse.locked).toBe(false)
        expect(() => input.mouse.unlock()).not.toThrow()
    })

    it("names the methods a backend may leave out", () => {
        for (const name of ["LockMouse", "UnlockMouse", "IsMouseLocked", "IsMouseOverUI", "GetTouchOverUI"]) {
            expect(isOptionalMethod(name), name).toBe(true)
        }
        for (const name of ["GetMouseButtons", "toString", "constructor"]) {
            expect(isOptionalMethod(name), name).toBe(false)
        }
    })
})
