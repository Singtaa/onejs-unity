import { describe, it, expect, afterEach } from "vitest"
import { setInputBackend, isOptionalMethod } from "./backend"
import { input } from "./input"

/**
 * `input.pointerType`: what a host that sees the presses says (OJPlay's
 * container, from the page's pointer events), Unity's InputBridge on a OneJS
 * that has GetPointerType, and a guess from the platform on one before it.
 */

afterEach(() => {
    setInputBackend(null)
    delete (globalThis as any).CS
})

/** An InputBridge that answers GetPointerType, or an older one whose missing statics read as proxies. */
function fakeUnity(bridgeType: string | null, mobile = false) {
    const asked: string[] = []
    const missing = new Proxy(() => {}, { get: () => missing })
    const bridge = new Proxy({}, {
        get: (_t, p) => {
            asked.push(String(p))
            if (bridgeType === null) return missing
            if (p === "PointerTypes") return true
            if (p === "GetPointerType") return () => bridgeType
            return missing
        },
    })
    ;(globalThis as any).CS = { UnityEngine: { Application: { isMobilePlatform: mobile } }, OneJS: { Input: { InputBridge: bridge } } }
    return asked
}

describe("input.pointerType", () => {
    it("is what a host that sees the presses says", () => {
        let type = "touch"
        setInputBackend({ GetPointerType: () => type })
        expect(input.pointerType).toBe("touch")
        type = "pen"
        expect(input.pointerType).toBe("pen")
        type = "mouse"
        expect(input.pointerType).toBe("mouse")
    })

    it("reads anything else a host says as the mouse", () => {
        setInputBackend({ GetPointerType: () => "trackball" })
        expect(input.pointerType).toBe("mouse")
    })

    it("asks Unity's InputBridge on a OneJS that has it", () => {
        fakeUnity("pen")
        expect(input.pointerType).toBe("pen")
    })

    it("guesses from the platform on a OneJS before it, without calling a method it lacks", () => {
        const asked = fakeUnity(null, true)
        expect(input.pointerType).toBe("touch")
        expect(asked).not.toContain("GetPointerType")
        fakeUnity(null, false)
        expect(input.pointerType).toBe("mouse")
    })

    it("is the mouse where CS reaches nothing, and a backend may leave it out", () => {
        expect(input.pointerType).toBe("mouse")
        expect(isOptionalMethod("GetPointerType")).toBe(true)
    })
})
