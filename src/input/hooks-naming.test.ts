// Pins the useKeyDown deprecation: the old name still exists, still has the
// old held-state behavior (it delegates to useKeyHeld), and warns once with
// a message that names both replacements. Calling a hook outside a React
// render throws at useRef, which is exactly enough: the deprecation warning
// fires before the delegate, so the warn path is observable without a
// reconciler.

import { describe, it, expect, vi, afterEach } from "vitest"
import { useKeyHeld, useKeyDown, useKeyPress } from "./hooks"

afterEach(() => {
    vi.restoreAllMocks()
})

describe("useKeyDown deprecation", () => {
    it("still exists alongside useKeyHeld and useKeyPress", () => {
        expect(typeof useKeyHeld).toBe("function")
        expect(typeof useKeyDown).toBe("function")
        expect(typeof useKeyPress).toBe("function")
        expect(useKeyDown).not.toBe(useKeyHeld)
    })

    it("warns once, naming both replacements", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

        // Outside a React render the delegate throws at useRef; the warning
        // has already fired by then.
        // eslint-disable-next-line no-restricted-syntax
        expect(() => useKeyDown("W", () => {})).toThrow()
        expect(warn).toHaveBeenCalledTimes(1)
        const message = warn.mock.calls[0][0] as string
        expect(message).toContain("useKeyHeld")
        expect(message).toContain("useKeyPress")

        // eslint-disable-next-line no-restricted-syntax
        expect(() => useKeyDown("W", () => {})).toThrow()
        expect(warn).toHaveBeenCalledTimes(1)
    })
})
