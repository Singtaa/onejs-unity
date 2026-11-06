import { describe, it, expect, afterEach } from "vitest"
import { setInputBackend, createInputBackend } from "./backend"
import { input } from "./input"

/**
 * `input.mouse.overUI` and `touch.overUI`: what a host that can ask the UI
 * says, and false where it cannot, without asking Unity's InputBridge for a
 * method it does not have.
 */

afterEach(() => {
    setInputBackend(null)
    delete (globalThis as any).CS
})

const touches = (n: number) => ({
    GetTouchCount: () => n,
    GetTouchFingerId: (i: number) => i + 10,
    GetTouchPhase: () => 0,
    GetTouchPositionX: () => 0,
    GetTouchPositionY: () => 0,
    GetTouchDeltaX: () => 0,
    GetTouchDeltaY: () => 0,
})

describe("over UI", () => {
    it("reads what the backend says, per touch", () => {
        setInputBackend({ ...touches(2), IsMouseOverUI: () => true, GetTouchOverUI: (i: number) => i === 1 })
        expect(input.mouse.overUI).toBe(true)
        expect(input.touches.map((t) => t.overUI)).toEqual([false, true])
    })

    it("is false on Unity's own bridge, which is never asked", () => {
        const asked: string[] = []
        ;(globalThis as any).CS = { OneJS: { Input: { InputBridge: new Proxy({}, { get: (_t, p) => { asked.push(String(p)); return () => 0 } }) } } }
        expect(input.mouse.overUI).toBe(false)
        expect(asked).toEqual([])
    })

    it("is false from a partial backend, which throws for anything else it lacks", () => {
        setInputBackend(createInputBackend(touches(1), "test backend"))
        expect(input.mouse.overUI).toBe(false)
        expect(input.touches[0].overUI).toBe(false)
        expect(() => input.mouse.leftButton).toThrow(/not available in the test backend/)
    })
})
