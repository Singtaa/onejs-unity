import { describe, it, expect, afterEach } from "vitest"
import {
    setInputBackend,
    getInputBackend,
    getInputBridge,
    createInputBackend,
    resolveKeyName,
    keyNameFromDomCode,
} from "./backend"
import { input } from "./input"

afterEach(() => setInputBackend(null))

describe("backend installation", () => {
    it("starts with no backend installed", () => {
        expect(getInputBackend()).toBeNull()
    })

    it("returns the installed backend from getInputBridge", () => {
        const backend = { GetKeyDown: () => true }
        setInputBackend(backend)
        expect(getInputBridge()).toBe(backend)
    })

    it("falls back to the CS bridge when cleared", () => {
        const bridge = { GetKeyDown: () => false }
        ;(globalThis as any).CS = { OneJS: { Input: { InputBridge: bridge } } }
        setInputBackend(null)
        expect(getInputBridge()).toBe(bridge)
        delete (globalThis as any).CS
    })
})

describe("createInputBackend", () => {
    it("passes through what the backend implements", () => {
        const b = createInputBackend({ GetKeyDown: (k) => k === "Space" })
        expect((b as any).GetKeyDown("Space")).toBe(true)
        expect((b as any).GetKeyDown("Enter")).toBe(false)
    })

    // Better than "undefined is not a function" thrown from inside a device module.
    it("throws a message naming the method and the backend for anything missing", () => {
        const b = createInputBackend({}, "OneJS Play container")
        expect(() => (b as any).SetRumble(0, 1, 1, 1)).toThrow(
            /SetRumble is not available in the OneJS Play container/,
        )
    })

    it("uses a default label when none is given", () => {
        expect(() => (createInputBackend({}) as any).GetTouchCount()).toThrow(/custom input backend/)
    })
})

// The point of the seam: one API, one implementation, a swappable source.
describe("the public input API reads through the backend", () => {
    it("routes keyboard queries to the installed backend", () => {
        const held = new Set(["Space"])
        setInputBackend(createInputBackend({
            GetKeyDown: (k) => held.has(k),
            GetKeyPressed: () => false,
            GetKeyReleased: () => false,
        }))
        expect(input.keyboard.isKeyDown("Space")).toBe(true)
        expect(input.keyboard.isKeyDown("Enter")).toBe(false)
    })

    it("routes mouse queries to the installed backend", () => {
        setInputBackend(createInputBackend({
            GetMousePositionX: () => 12,
            GetMousePositionY: () => 34,
        }))
        expect(input.mouse.position.x).toBe(12)
        expect(input.mouse.position.y).toBe(34)
    })

    it("reports an unimplemented device clearly rather than silently", () => {
        setInputBackend(createInputBackend({}, "test backend"))
        expect(() => input.keyboard.isKeyDown("Space")).toThrow(/GetKeyDown is not available in the test backend/)
    })
})

describe("resolveKeyName", () => {
    it("passes canonical Key enum names through", () => {
        expect(resolveKeyName("Space")).toBe("Space")
        expect(resolveKeyName("LeftArrow")).toBe("LeftArrow")
        expect(resolveKeyName("NumpadPlus")).toBe("NumpadPlus")
    })

    it("is case insensitive, matching InputBridge's OrdinalIgnoreCase map", () => {
        expect(resolveKeyName("space")).toBe("Space")
        expect(resolveKeyName("SPACE")).toBe("Space")
    })

    it("accepts the documented aliases", () => {
        expect(resolveKeyName("Return")).toBe("Enter")
        expect(resolveKeyName("Esc")).toBe("Escape")
        expect(resolveKeyName("Up")).toBe("UpArrow")
        expect(resolveKeyName("Ctrl")).toBe("LeftCtrl")
        expect(resolveKeyName("Command")).toBe("LeftMeta")
        expect(resolveKeyName("Shift")).toBe("LeftShift")
    })

    it("resolves bare letters and digits", () => {
        expect(resolveKeyName("A")).toBe("A")
        expect(resolveKeyName("w")).toBe("W")
        expect(resolveKeyName("3")).toBe("Digit3")
        expect(resolveKeyName("Digit3")).toBe("Digit3")
        expect(resolveKeyName("F7")).toBe("F7")
    })

    it("returns null for something unrecognised instead of guessing", () => {
        expect(resolveKeyName("Sparkle")).toBeNull()
        expect(resolveKeyName("")).toBeNull()
    })
})

describe("keyNameFromDomCode", () => {
    it("maps letter and digit codes", () => {
        expect(keyNameFromDomCode("KeyA")).toBe("A")
        expect(keyNameFromDomCode("KeyW")).toBe("W")
        expect(keyNameFromDomCode("Digit3")).toBe("Digit3")
    })

    it("maps arrows and modifiers onto Unity's spelling", () => {
        expect(keyNameFromDomCode("ArrowLeft")).toBe("LeftArrow")
        expect(keyNameFromDomCode("ArrowUp")).toBe("UpArrow")
        expect(keyNameFromDomCode("ShiftLeft")).toBe("LeftShift")
        expect(keyNameFromDomCode("ControlRight")).toBe("RightCtrl")
        expect(keyNameFromDomCode("MetaLeft")).toBe("LeftMeta")
    })

    it("maps codes whose DOM and Unity names differ", () => {
        expect(keyNameFromDomCode("Equal")).toBe("Equals")
        expect(keyNameFromDomCode("NumpadAdd")).toBe("NumpadPlus")
        expect(keyNameFromDomCode("NumpadDecimal")).toBe("NumpadPeriod")
    })

    it("passes through codes that already match", () => {
        for (const code of ["Space", "Enter", "Tab", "Escape", "F7", "Numpad4", "Comma", "Slash"]) {
            expect(keyNameFromDomCode(code)).toBe(code)
        }
    })

    // Layout independence is the reason to key off code rather than key: WASD
    // stays the same physical three-key row on AZERTY.
    it("is layout independent by construction", () => {
        expect(keyNameFromDomCode("KeyQ")).toBe("Q")
        expect(keyNameFromDomCode("KeyZ")).toBe("Z")
    })

    it("returns null for an unmapped code", () => {
        expect(keyNameFromDomCode("Sparkle")).toBeNull()
    })
})
