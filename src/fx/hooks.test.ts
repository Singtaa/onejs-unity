/**
 * useTexture's two forms run one hook path: with a canvas it renders at the
 * canvas's size, and without one (the older form) at the chain's own size.
 * Either way the texture appears after the first effect and everything the
 * build made is released on unmount.
 *
 * React is replaced with a one component harness, which is all these hooks
 * need and all a reconciler would add here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const harness = vi.hoisted(() => {
    type Slot = { value?: any; deps?: readonly unknown[]; create?: () => (() => void) | void; cleanup?: (() => void) | void; due?: boolean }
    let slots: Slot[] = []
    let cursor = 0
    let dirty = false
    let component: () => unknown = () => undefined
    const state = { renders: 0, hooks: 0, result: undefined as unknown }
    const changed = (a?: readonly unknown[], b?: readonly unknown[]) =>
        !a || !b || a.length !== b.length || a.some((d, i) => !Object.is(d, b[i]))
    const next = (): Slot => (slots[cursor++] ??= {})

    const react = {
        useState(init: unknown) {
            const s = next()
            if (!("value" in s)) {
                s.value = typeof init === "function" ? (init as () => unknown)() : init
                s.deps = [(v: unknown) => { if (!Object.is(v, s.value)) { s.value = v; dirty = true } }]
            }
            return [s.value, s.deps![0]]
        },
        useRef(init: unknown) {
            const s = next()
            if (!("value" in s)) s.value = { current: init }
            return s.value
        },
        useEffect(create: () => (() => void) | void, deps?: readonly unknown[]) {
            const s = next()
            if (!s.create || deps === undefined || changed(s.deps, deps)) {
                s.create = create
                s.deps = deps
                s.due = true
            }
        },
    }

    function render() {
        cursor = 0
        dirty = false
        state.renders++
        state.result = component()
        state.hooks = cursor
        for (const s of slots) {
            if (!s.due) continue
            s.due = false
            if (typeof s.cleanup === "function") s.cleanup()
            s.cleanup = s.create!()
        }
        if (dirty) render()
    }

    return {
        react,
        state,
        mount(c: () => unknown) { slots = []; state.renders = 0; component = c; render() },
        rerender() { render() },
        unmount() { for (const s of slots) if (s.create && typeof s.cleanup === "function") s.cleanup(); slots = [] },
    }
})

vi.mock("react", () => ({ ...harness.react, default: harness.react }))

import { canvas, image } from "./image"
import { useTexture } from "./hooks"

let nextHandle = 1
const bridge = () => (globalThis as any).CS.OneJS.Fx.FxBridge

beforeEach(() => {
    nextHandle = 1
    ;(globalThis as any).CS = {
        OneJS: {
            Fx: {
                FxBridge: {
                    LoadTexture: vi.fn(() => nextHandle++),
                    WrapTexture: vi.fn(() => nextHandle++),
                    CreateTarget: vi.fn(() => nextHandle++),
                    ExecuteInto: vi.fn(),
                    Execute: vi.fn(() => nextHandle++),
                    GetTexture: vi.fn((h: number) => ({ handle: h })),
                    Release: vi.fn(),
                },
            },
        },
    }
})

afterEach(() => harness.unmount())

describe("useTexture", () => {
    it("renders a canvas's chain at the canvas's size and releases it on unmount", () => {
        const c = canvas(32, 16)
        harness.mount(() => useTexture(c, () => c.noise(), []))
        expect(bridge().CreateTarget).toHaveBeenCalledWith(32, 16)
        expect(harness.state.result).not.toBeNull()
        harness.unmount()
        expect(bridge().Release).toHaveBeenCalled()
    })

    it("renders a bare build at the chain's own size and releases what it made", () => {
        harness.mount(() => useTexture(() => image.noise(8, 8).blur(1), []))
        expect(bridge().CreateTarget).not.toHaveBeenCalled()
        expect(bridge().Execute).toHaveBeenCalledTimes(1)
        expect(harness.state.result).not.toBeNull()
        harness.unmount()
        expect(bridge().Release).toHaveBeenCalledTimes(1)
    })

    it("calls the same hooks for both forms", () => {
        const c = canvas(8)
        harness.mount(() => useTexture(c, () => c.noise()))
        const withCanvas = harness.state.hooks
        harness.unmount()
        harness.mount(() => useTexture(() => image.noise(8, 8)))
        expect(harness.state.hooks).toBe(withCanvas)
    })

    it("builds again when its deps change, releasing the previous texture first", () => {
        let n = 1
        harness.mount(() => useTexture(() => image.noise(8, 8, { scale: n }), [n]))
        n = 2
        harness.rerender()
        expect(bridge().Execute).toHaveBeenCalledTimes(2)
        expect(bridge().Release).toHaveBeenCalledTimes(1)
    })
})
