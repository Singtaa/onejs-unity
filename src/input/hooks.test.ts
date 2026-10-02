/**
 * Device and action hooks re-render only when their reading changes. Before,
 * each one called setState with a fresh object every frame, so a component
 * holding useKeyboard() re-rendered at frame rate while the player was idle.
 *
 * React is replaced with a one component harness that counts renders and can
 * replay StrictMode's simulated unmount and remount, which is all these hooks
 * need and all a reconciler would add here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

const harness = vi.hoisted(() => {
    type Slot = {
        value?: any
        deps?: readonly unknown[]
        create?: () => (() => void) | void
        cleanup?: (() => void) | void
        due?: boolean
    }
    let slots: Slot[] = []
    let cursor = 0
    let dirty = false
    let component: () => unknown = () => undefined
    const state = { renders: 0, result: undefined as unknown }

    const changed = (a?: readonly unknown[], b?: readonly unknown[]) =>
        !a || !b || a.length !== b.length || a.some((d, i) => !Object.is(d, b[i]))
    const next = (): Slot => (slots[cursor++] ??= {})

    const react = {
        useState(init: unknown) {
            const s = next()
            if (!("value" in s)) {
                s.value = typeof init === "function" ? (init as () => unknown)() : init
                s.deps = [(v: unknown) => {
                    const value = typeof v === "function" ? (v as (p: unknown) => unknown)(s.value) : v
                    if (!Object.is(value, s.value)) { s.value = value; dirty = true }
                }]
            }
            return [s.value, s.deps![0]]
        },
        useRef(init: unknown) {
            const s = next()
            if (!("value" in s)) s.value = { current: init }
            return s.value
        },
        useMemo(fn: () => unknown, deps: readonly unknown[]) {
            const s = next()
            if (!("value" in s) || changed(s.deps, deps)) { s.value = fn(); s.deps = deps }
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
        for (const s of slots) {
            if (!s.due) continue
            s.due = false
            if (typeof s.cleanup === "function") s.cleanup()
            s.cleanup = s.create!()
        }
    }

    return {
        react,
        state,
        mount(c: () => unknown) { slots = []; state.renders = 0; component = c; render() },
        rerender(c?: () => unknown) { if (c) component = c; render() },
        settle() { if (dirty) render() },
        /** StrictMode in development: every effect is destroyed and created again. */
        strictRemount() {
            for (const s of slots) if (s.create && typeof s.cleanup === "function") s.cleanup()
            for (const s of slots) if (s.create) s.cleanup = s.create()
        },
        unmount() { for (const s of slots) if (s.create && typeof s.cleanup === "function") s.cleanup() },
    }
})

vi.mock("react", () => ({ ...harness.react, default: harness.react }))

import { setInputBackend } from "./backend"
import { input } from "./input"
import {
    useKeyboard, useMouse, useGamepad, useTouch,
    useAction, useActionFloat, useActionVec2, useInputReader,
} from "./hooks"
import type { KeyboardState, MouseState, GamepadState, TouchState, ActionState } from "./hooks"
import type { InputReader, Vector2 } from "./types"
import { installFakeBridge, resetCalls, gamepad, action, fake } from "./fake-bridge.test-util"

let callbacks = new Map<number, () => void>()
let nextId = 1

function frame(times = 1) {
    for (let t = 0; t < times; t++) {
        const run = [...callbacks.values()]
        callbacks = new Map()
        for (const cb of run) cb()
        harness.settle()
    }
}

beforeEach(() => {
    installFakeBridge()
    callbacks = new Map()
    ;(globalThis as any).requestAnimationFrame = (cb: () => void) => { callbacks.set(nextId, cb); return nextId++ }
    ;(globalThis as any).cancelAnimationFrame = (id: number) => { callbacks.delete(id) }
})

afterEach(() => {
    harness.unmount()
    setInputBackend(null)
    delete (globalThis as any).requestAnimationFrame
    delete (globalThis as any).cancelAnimationFrame
})

const result = <T>() => harness.state.result as T

describe("useKeyboard", () => {
    it("does not re-render while the modifiers stay the same", () => {
        harness.mount(() => useKeyboard())
        const first = result<KeyboardState>()
        frame(5)
        expect(harness.state.renders).toBe(1)
        expect(result<KeyboardState>()).toBe(first)
    })

    it("reads the modifiers with one crossing a frame", () => {
        harness.mount(() => useKeyboard())
        resetCalls()
        frame(3)
        expect(fake.calls.GetModifiers).toBe(3)
    })

    it("re-renders once when a modifier changes, keeping its functions", () => {
        harness.mount(() => useKeyboard())
        const first = result<KeyboardState>()
        fake.modifiers = 1
        frame(3)
        expect(harness.state.renders).toBe(2)
        expect(result<KeyboardState>().shift).toBe(true)
        expect(result<KeyboardState>().isKeyDown).toBe(first.isKeyDown)
    })
})

describe("useMouse", () => {
    it("does not re-render while the mouse is still", () => {
        fake.mouse.x = 10
        harness.mount(() => useMouse())
        expect(result<MouseState>().position).toEqual({ x: 10, y: 0 })
        frame(5)
        expect(harness.state.renders).toBe(1)
    })

    it("re-renders when it moves, with a new position object", () => {
        harness.mount(() => useMouse())
        const first = result<MouseState>().position
        fake.mouse.x = 4
        frame()
        expect(harness.state.renders).toBe(2)
        expect(result<MouseState>().position).toEqual({ x: 4, y: 0 })
        expect(first).toEqual({ x: 0, y: 0 })
    })

    it("reports a press edge for one frame", () => {
        harness.mount(() => useMouse())
        fake.mouse.held = 1
        fake.mouse.pressed = 1
        frame()
        expect(result<MouseState>().wasLeftPressed).toBe(true)
        fake.mouse.pressed = 0
        frame()
        expect(result<MouseState>().wasLeftPressed).toBe(false)
        expect(result<MouseState>().leftButton).toBe(true)
        frame(3)
        expect(harness.state.renders).toBe(3)
    })
})

describe("useGamepad", () => {
    it("asks for its own index instead of building the list of gamepads", () => {
        fake.gamepads.push(gamepad())
        harness.mount(() => useGamepad())
        frame(3)
        expect(fake.calls.GetGamepadCount).toBeUndefined()
        expect(result<GamepadState>().connected).toBe(true)
    })

    it("does not re-render while the sticks rest, and does when one moves", () => {
        fake.gamepads.push(gamepad())
        harness.mount(() => useGamepad())
        frame(5)
        expect(harness.state.renders).toBe(1)
        fake.gamepads[0].lx = 0.5
        frame()
        expect(harness.state.renders).toBe(2)
        expect(result<GamepadState>().leftStick).toEqual({ x: 0.5, y: 0 })
    })

    it("reads every button and the dpad from one mask", () => {
        fake.gamepads.push(gamepad({ held: 1 | 1024 }))
        harness.mount(() => useGamepad())
        resetCalls()
        frame()
        expect(fake.calls.GetGamepadButtons).toBe(1)
        expect(result<GamepadState>().buttons.south).toBe(true)
        expect(result<GamepadState>().dpad.up).toBe(true)
    })

    it("does not re-render while nothing is connected", () => {
        harness.mount(() => useGamepad())
        frame(5)
        expect(harness.state.renders).toBe(1)
        expect(result<GamepadState>().connected).toBe(false)
    })
})

describe("useTouch", () => {
    it("does not re-render while nothing touches the screen", () => {
        harness.mount(() => useTouch())
        frame(5)
        expect(harness.state.renders).toBe(1)
    })

    it("re-renders when a touch begins and while it moves, not while it rests", () => {
        harness.mount(() => useTouch())
        fake.touches.push({ fingerId: 3, x: 1, y: 2, dx: 0, dy: 0, phase: 0 })
        frame()
        expect(harness.state.renders).toBe(2)
        expect(result<TouchState>().primary?.fingerId).toBe(3)
        fake.touches[0].phase = 2
        frame()
        frame(3)
        expect(harness.state.renders).toBe(3)
    })
})

describe("action hooks", () => {
    beforeEach(() => {
        fake.actions.set("Player/Jump", action("float"))
        fake.actions.set("Player/Fire", action("float"))
        fake.actions.set("Player/Move", action("vec2"))
    })

    it("useAction does not re-render while the action is idle", () => {
        const actions = input.loadActions({})
        harness.mount(() => useAction("Player/Jump", actions))
        frame(5)
        expect(harness.state.renders).toBe(1)
        fake.actions.get("Player/Jump")!.triggered = true
        frame()
        expect(result<ActionState>().triggered).toBe(true)
        expect(harness.state.renders).toBe(2)
    })

    it("useAction follows a changed action path", () => {
        const actions = input.loadActions({})
        fake.actions.get("Player/Fire")!.pressed = true
        let path = "Player/Jump"
        harness.mount(() => useAction(path, actions))
        expect(result<ActionState>().isPressed).toBe(false)
        path = "Player/Fire"
        harness.rerender()
        frame()
        expect(result<ActionState>().isPressed).toBe(true)
    })

    it("useActionVec2 re-renders with a new object when the value changes", () => {
        const actions = input.loadActions({})
        harness.mount(() => useActionVec2("Player/Move", actions))
        const first = result<Vector2>()
        frame(3)
        expect(harness.state.renders).toBe(1)
        Object.assign(fake.actions.get("Player/Move")!, { x: 1, y: 0 })
        frame()
        expect(result<Vector2>()).toEqual({ x: 1, y: 0 })
        expect(first).toEqual({ x: 0, y: 0 })
        expect(fake.calls.GetActionValueFloat).toBeUndefined()
    })

    it("useActionFloat reads a pressed button", () => {
        const actions = input.loadActions({})
        harness.mount(() => useActionFloat("Player/Jump", actions))
        fake.actions.get("Player/Jump")!.float = 1
        frame()
        expect(result<number>()).toBe(1)
    })
})

describe("useInputReader", () => {
    it("keeps reading after StrictMode's simulated unmount and remount", () => {
        harness.mount(() => useInputReader((b) => b.key("jump", "Space")))
        harness.strictRemount()
        fake.held.add("Space")
        frame()
        expect(result<InputReader>().down("jump")).toBe(true)
    })

    it("stops ticking when unmounted", () => {
        harness.mount(() => useInputReader((b) => b.key("jump", "Space")))
        harness.unmount()
        resetCalls()
        frame()
        expect(fake.calls["za.getKeyDownById"]).toBeUndefined()
    })
})
