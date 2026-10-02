/**
 * React hooks for input handling
 *
 * Two families. State hooks (useKeyboard, useMouse, useGamepad, useTouch,
 * useAction, useActionFloat, useActionVec2) hold a reading of input as React
 * state and re-render only when that reading changes, so an idle player costs
 * no render. They are for the parts of the screen that show input. Event hooks
 * (useKeyPress, useMouseClick, useGamepadButton, ...) and useInputReader are
 * for the parts that react to it, and never re-render on their own.
 */

import { useState, useEffect, useRef, useMemo } from "react"
import type { Gamepad, Touch, Vector2, InputAction, InputReader, InputReaderBuilder } from "./types"
import { input } from "./input"
import { createReader } from "./reader"
import { getInputBridge } from "./backend"
import { MODIFIER_SHIFT, MODIFIER_CTRL, MODIFIER_ALT, MODIFIER_META } from "./keyboard"
import { MOUSE_LEFT, MOUSE_RIGHT, MOUSE_MIDDLE } from "./mouse"
import {
    getGamepad,
    BUTTON_SOUTH, BUTTON_EAST, BUTTON_WEST, BUTTON_NORTH,
    BUTTON_DPAD_UP, BUTTON_DPAD_DOWN, BUTTON_DPAD_LEFT, BUTTON_DPAD_RIGHT,
} from "./gamepad"

// Type declarations for QuickJS environment
declare const requestAnimationFrame: (callback: () => void) => number
declare const cancelAnimationFrame: (id: number) => void

// ============ Internal Helpers ============

/**
 * Internal hook for animation frame loop
 */
function useAnimationFrame(callback: () => void): void {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useEffect(() => {
        let animId: number
        function tick() {
            callbackRef.current()
            animId = requestAnimationFrame(tick)
        }
        animId = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(animId)
    }, [])
}

/**
 * Holds a reading of input as React state, re-rendering only when it changes.
 *
 * `read` is given the previous reading and returns that same object when
 * nothing moved, so an idle frame costs neither a render nor an allocation.
 * The first reading is taken during the first render: a component never
 * shows a frame of defaults before the real values arrive.
 */
function useReading<T>(read: (prev: T) => T, empty: T): T {
    const readRef = useRef(read)
    readRef.current = read
    const [reading, setReading] = useState(() => read(empty))
    const last = useRef(reading)

    useAnimationFrame(() => {
        const next = readRef.current(last.current)
        if (next !== last.current) {
            last.current = next
            setReading(next)
        }
    })

    return reading
}

const sameVec = (v: Vector2, x: number, y: number) => v.x === x && v.y === y

// ============ Keyboard Hooks ============

export interface KeyboardState {
    /** Check if a key is currently held down. Reads live input when called */
    isKeyDown: (key: string) => boolean
    /** Check if a key was pressed this frame. Reads live input when called */
    wasKeyPressed: (key: string) => boolean
    /** Check if a key was released this frame. Reads live input when called */
    wasKeyReleased: (key: string) => boolean
    /** Shift key held */
    shift: boolean
    /** Ctrl key held */
    ctrl: boolean
    /** Alt key held */
    alt: boolean
    /** Meta/Command/Windows key held */
    meta: boolean
    /** Any key currently held */
    anyKeyDown: boolean
    /** WASD keys as Vector2 (W=+y, S=-y, A=-x, D=+x). Reads live input when called */
    wasd: () => Vector2
    /** Arrow keys as Vector2. Reads live input when called */
    arrows: () => Vector2
}

// Module constants, so they keep their identity across renders
const keyboardReads = {
    isKeyDown: (key: string) => input.keyboard.isKeyDown(key),
    wasKeyPressed: (key: string) => input.keyboard.wasKeyPressed(key),
    wasKeyReleased: (key: string) => input.keyboard.wasKeyReleased(key),
    wasd: () => input.keyboard.wasd(),
    arrows: () => input.keyboard.arrows(),
}

const NO_KEYS: KeyboardState = {
    ...keyboardReads, shift: false, ctrl: false, alt: false, meta: false, anyKeyDown: false,
}

function readKeyboard(prev: KeyboardState): KeyboardState {
    const bridge = getInputBridge()
    const modifiers: number = bridge.GetModifiers()
    const anyKeyDown: boolean = bridge.GetAnyKeyDown()
    const shift = (modifiers & MODIFIER_SHIFT) !== 0
    const ctrl = (modifiers & MODIFIER_CTRL) !== 0
    const alt = (modifiers & MODIFIER_ALT) !== 0
    const meta = (modifiers & MODIFIER_META) !== 0
    if (shift === prev.shift && ctrl === prev.ctrl && alt === prev.alt && meta === prev.meta
        && anyKeyDown === prev.anyKeyDown) {
        return prev
    }
    return { ...keyboardReads, shift, ctrl, alt, meta, anyKeyDown }
}

/**
 * Hook that provides the keyboard's modifiers and whether any key is held,
 * re-rendering only when one of them changes.
 *
 * Its functions (isKeyDown, wasKeyPressed, wasd, ...) read live input when
 * called, which suits an event handler or a frame loop. To act on a key
 * press, use useKeyPress: a render does not happen every frame, so a press
 * checked during render is missed.
 *
 * @example
 * ```tsx
 * function Status() {
 *     const keyboard = useKeyboard()
 *     return <Label>Shift: {keyboard.shift ? "ON" : "off"}</Label>
 * }
 * ```
 */
export function useKeyboard(): KeyboardState {
    return useReading(readKeyboard, NO_KEYS)
}

/**
 * Hook that fires a callback when a specific key is pressed.
 *
 * @example
 * ```tsx
 * function Game() {
 *     useKeyPress("Space", () => {
 *         player.jump()
 *     })
 *
 *     useKeyPress("Escape", () => {
 *         menu.toggle()
 *     })
 * }
 * ```
 */
export function useKeyPress(key: string, callback: () => void): void {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useAnimationFrame(() => {
        if (input.keyboard.wasKeyPressed(key)) {
            callbackRef.current()
        }
    })
}

/**
 * Hook that fires a callback EVERY FRAME while a key is held down.
 * For a callback that fires once on the press, use useKeyPress.
 *
 * @example
 * ```tsx
 * function Game() {
 *     useKeyHeld("W", () => {
 *         player.moveForward()
 *     })
 * }
 * ```
 */
export function useKeyHeld(key: string, callback: () => void): void {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useAnimationFrame(() => {
        if (input.keyboard.isKeyDown(key)) {
            callbackRef.current()
        }
    })
}

let warnedUseKeyDown = false

/**
 * @deprecated Renamed useKeyHeld. This hook fires every frame while the key
 * is held, but "key down" reads as the edge event everywhere else (React's
 * onKeyDown, Unity's GetKeyDown), which made held-state code look
 * edge-triggered: a jump that fires every frame in code that reads correct.
 * The name is retired rather than repurposed, so this alias keeps the exact
 * old behavior. Use useKeyHeld (held) or useKeyPress (once per press).
 */
export function useKeyDown(key: string, callback: () => void): void {
    if (!warnedUseKeyDown) {
        warnedUseKeyDown = true
        console.warn("[onejs-unity] useKeyDown is deprecated: it fires every frame while "
            + "the key is held, not once on the press. Use useKeyHeld for held, "
            + "useKeyPress for once per press.")
    }
    useKeyHeld(key, callback)
}

/**
 * Hook that fires a callback when a key is released.
 */
export function useKeyRelease(key: string, callback: () => void): void {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useAnimationFrame(() => {
        if (input.keyboard.wasKeyReleased(key)) {
            callbackRef.current()
        }
    })
}

// ============ Mouse Hooks ============

export interface MouseState {
    /** Screen position */
    position: Vector2
    /** Frame movement delta */
    delta: Vector2
    /** Scroll wheel delta */
    scroll: Vector2
    /** Left button held */
    leftButton: boolean
    /** Right button held */
    rightButton: boolean
    /** Middle button held */
    middleButton: boolean
    /** Left button pressed this frame */
    wasLeftPressed: boolean
    /** Right button pressed this frame */
    wasRightPressed: boolean
    /** Middle button pressed this frame */
    wasMiddlePressed: boolean
    /** Left button released this frame */
    wasLeftReleased: boolean
    /** Right button released this frame */
    wasRightReleased: boolean
    /** Middle button released this frame */
    wasMiddleReleased: boolean
}

const NO_MOUSE: MouseState = {
    position: { x: 0, y: 0 },
    delta: { x: 0, y: 0 },
    scroll: { x: 0, y: 0 },
    leftButton: false,
    rightButton: false,
    middleButton: false,
    wasLeftPressed: false,
    wasRightPressed: false,
    wasMiddlePressed: false,
    wasLeftReleased: false,
    wasRightReleased: false,
    wasMiddleReleased: false,
}

function readMouse(prev: MouseState): MouseState {
    const bridge = getInputBridge()
    const px: number = bridge.GetMousePositionX(), py: number = bridge.GetMousePositionY()
    const dx: number = bridge.GetMouseDeltaX(), dy: number = bridge.GetMouseDeltaY()
    const sx: number = bridge.GetScrollX(), sy: number = bridge.GetScrollY()
    // Only the three buttons MouseState reports, so forward and back change nothing
    const shown = MOUSE_LEFT | MOUSE_RIGHT | MOUSE_MIDDLE
    const held = (bridge.GetMouseButtons() as number) & shown
    const pressed = (bridge.GetMouseButtonsPressed() as number) & shown
    const released = (bridge.GetMouseButtonsReleased() as number) & shown

    // Compare before building, so a still mouse allocates nothing
    if (sameVec(prev.position, px, py) && sameVec(prev.delta, dx, dy) && sameVec(prev.scroll, sx, sy)
        && held === mouseMask(prev.leftButton, prev.rightButton, prev.middleButton)
        && pressed === mouseMask(prev.wasLeftPressed, prev.wasRightPressed, prev.wasMiddlePressed)
        && released === mouseMask(prev.wasLeftReleased, prev.wasRightReleased, prev.wasMiddleReleased)) {
        return prev
    }
    return {
        position: sameVec(prev.position, px, py) ? prev.position : { x: px, y: py },
        delta: sameVec(prev.delta, dx, dy) ? prev.delta : { x: dx, y: dy },
        scroll: sameVec(prev.scroll, sx, sy) ? prev.scroll : { x: sx, y: sy },
        leftButton: (held & MOUSE_LEFT) !== 0,
        rightButton: (held & MOUSE_RIGHT) !== 0,
        middleButton: (held & MOUSE_MIDDLE) !== 0,
        wasLeftPressed: (pressed & MOUSE_LEFT) !== 0,
        wasRightPressed: (pressed & MOUSE_RIGHT) !== 0,
        wasMiddlePressed: (pressed & MOUSE_MIDDLE) !== 0,
        wasLeftReleased: (released & MOUSE_LEFT) !== 0,
        wasRightReleased: (released & MOUSE_RIGHT) !== 0,
        wasMiddleReleased: (released & MOUSE_MIDDLE) !== 0,
    }
}

function mouseMask(left: boolean, right: boolean, middle: boolean): number {
    return (left ? MOUSE_LEFT : 0) | (right ? MOUSE_RIGHT : 0) | (middle ? MOUSE_MIDDLE : 0)
}

/**
 * Hook that provides mouse state, re-rendering only when it changes: while
 * the mouse is still and no button changes, it costs no render.
 *
 * @example
 * ```tsx
 * function Readout() {
 *     const mouse = useMouse()
 *
 *     return (
 *         <View>
 *             <Label>Position: ({mouse.position.x}, {mouse.position.y})</Label>
 *             <Label>Left: {mouse.leftButton ? "DOWN" : "up"}</Label>
 *         </View>
 *     )
 * }
 * ```
 */
export function useMouse(): MouseState {
    return useReading(readMouse, NO_MOUSE)
}

/**
 * Hook that fires a callback when a mouse button is clicked.
 *
 * @example
 * ```tsx
 * function Game() {
 *     useMouseClick("left", (pos) => {
 *         shoot(pos.x, pos.y)
 *     })
 * }
 * ```
 */
export function useMouseClick(
    button: "left" | "right" | "middle",
    callback: (position: Vector2) => void
): void {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useAnimationFrame(() => {
        let pressed = false
        switch (button) {
            case "left": pressed = input.mouse.wasLeftPressed; break
            case "right": pressed = input.mouse.wasRightPressed; break
            case "middle": pressed = input.mouse.wasMiddlePressed; break
        }
        if (pressed) {
            const pos = input.mouse.position
            callbackRef.current({ x: pos.x, y: pos.y })
        }
    })
}

// ============ Gamepad Hooks ============

export interface GamepadState {
    /** Whether a gamepad is connected */
    connected: boolean
    /** The gamepad instance (null if not connected) */
    gamepad: Gamepad | null
    /** Left stick position (-1 to 1) */
    leftStick: Vector2
    /** Right stick position (-1 to 1) */
    rightStick: Vector2
    /** Left trigger (0 to 1) */
    leftTrigger: number
    /** Right trigger (0 to 1) */
    rightTrigger: number
    /** Face buttons currently held */
    buttons: {
        south: boolean
        east: boolean
        west: boolean
        north: boolean
    }
    /** D-Pad state */
    dpad: {
        up: boolean
        down: boolean
        left: boolean
        right: boolean
    }
}

const NO_GAMEPAD: GamepadState = {
    connected: false,
    gamepad: null,
    leftStick: { x: 0, y: 0 },
    rightStick: { x: 0, y: 0 },
    leftTrigger: 0,
    rightTrigger: 0,
    buttons: { south: false, east: false, west: false, north: false },
    dpad: { up: false, down: false, left: false, right: false },
}

function readGamepad(index: number, prev: GamepadState): GamepadState {
    const gamepad = getGamepad(index)
    if (gamepad === null) return prev.connected ? NO_GAMEPAD : prev

    const bridge = getInputBridge()
    const lx: number = bridge.GetLeftStickX(index), ly: number = bridge.GetLeftStickY(index)
    const rx: number = bridge.GetRightStickX(index), ry: number = bridge.GetRightStickY(index)
    const leftTrigger: number = bridge.GetLeftTrigger(index)
    const rightTrigger: number = bridge.GetRightTrigger(index)
    // Every button and the dpad from one mask, kept to the ones GamepadState reports
    const held = (bridge.GetGamepadButtons(index) as number) & GAMEPAD_SHOWN

    // Compare before building, so a resting pad allocates nothing
    if (prev.gamepad === gamepad && sameVec(prev.leftStick, lx, ly) && sameVec(prev.rightStick, rx, ry)
        && prev.leftTrigger === leftTrigger && prev.rightTrigger === rightTrigger
        && held === gamepadMask(prev)) {
        return prev
    }
    return {
        connected: true,
        gamepad,
        leftStick: sameVec(prev.leftStick, lx, ly) ? prev.leftStick : { x: lx, y: ly },
        rightStick: sameVec(prev.rightStick, rx, ry) ? prev.rightStick : { x: rx, y: ry },
        leftTrigger,
        rightTrigger,
        buttons: {
            south: (held & BUTTON_SOUTH) !== 0,
            east: (held & BUTTON_EAST) !== 0,
            west: (held & BUTTON_WEST) !== 0,
            north: (held & BUTTON_NORTH) !== 0,
        },
        dpad: {
            up: (held & BUTTON_DPAD_UP) !== 0,
            down: (held & BUTTON_DPAD_DOWN) !== 0,
            left: (held & BUTTON_DPAD_LEFT) !== 0,
            right: (held & BUTTON_DPAD_RIGHT) !== 0,
        },
    }
}

const GAMEPAD_SHOWN = BUTTON_SOUTH | BUTTON_EAST | BUTTON_WEST | BUTTON_NORTH
    | BUTTON_DPAD_UP | BUTTON_DPAD_DOWN | BUTTON_DPAD_LEFT | BUTTON_DPAD_RIGHT

function gamepadMask(state: GamepadState): number {
    const { buttons: b, dpad: d } = state
    return (b.south ? BUTTON_SOUTH : 0) | (b.east ? BUTTON_EAST : 0) | (b.west ? BUTTON_WEST : 0)
        | (b.north ? BUTTON_NORTH : 0) | (d.up ? BUTTON_DPAD_UP : 0) | (d.down ? BUTTON_DPAD_DOWN : 0)
        | (d.left ? BUTTON_DPAD_LEFT : 0) | (d.right ? BUTTON_DPAD_RIGHT : 0)
}

/**
 * Hook that provides gamepad state, re-rendering only when it changes.
 *
 * @param index: Gamepad index (default: 0)
 *
 * @example
 * ```tsx
 * function PadStatus() {
 *     const { connected, leftStick } = useGamepad()
 *
 *     if (!connected) {
 *         return <Label>Connect a gamepad</Label>
 *     }
 *     return <Label>Stick: {leftStick.x.toFixed(2)}, {leftStick.y.toFixed(2)}</Label>
 * }
 * ```
 *
 * To act on a button press, use useGamepadButton: a press checked during
 * render is missed, since a render does not happen every frame.
 */
export function useGamepad(index: number = 0): GamepadState {
    return useReading((prev: GamepadState) => readGamepad(index, prev), NO_GAMEPAD)
}

/**
 * Hook that fires a callback when a gamepad button is pressed.
 *
 * @example
 * ```tsx
 * function Game() {
 *     useGamepadButton("South", (gp) => {
 *         player.jump()
 *         gp.rumblePulse(0.3, 0.1)
 *     })
 * }
 * ```
 */
export function useGamepadButton(
    button: string,
    callback: (gamepad: Gamepad) => void,
    index: number = 0
): void {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useAnimationFrame(() => {
        const gp = getGamepad(index)
        if (gp?.wasButtonPressed(button)) {
            callbackRef.current(gp)
        }
    })
}

// ============ Touch Hooks ============

export interface TouchState {
    /** Number of active touches */
    count: number
    /** All active touches */
    touches: readonly Touch[]
    /** First touch (convenience) */
    primary: Touch | null
}

const NO_TOUCH: TouchState = { count: 0, touches: [], primary: null }

function sameTouch(a: Touch, b: Touch | undefined): boolean {
    return b !== undefined && a.fingerId === b.fingerId && a.phase === b.phase
        && sameVec(b.position, a.position.x, a.position.y) && sameVec(b.delta, a.delta.x, a.delta.y)
}

function readTouch(prev: TouchState): TouchState {
    const count: number = getInputBridge().GetTouchCount()
    if (count === 0) return prev.count === 0 ? prev : NO_TOUCH

    const touches = input.touches
    let same = touches.length === prev.count
    for (let i = 0; same && i < touches.length; i++) same = sameTouch(touches[i], prev.touches[i])
    if (same) return prev
    return { count: touches.length, touches, primary: touches[0] ?? null }
}

/**
 * Hook that provides touch state, re-rendering only when a touch begins,
 * moves, changes phase or ends.
 *
 * @example
 * ```tsx
 * function TouchReadout() {
 *     const touch = useTouch()
 *     return <Label>Touches: {touch.count}</Label>
 * }
 * ```
 */
export function useTouch(): TouchState {
    return useReading(readTouch, NO_TOUCH)
}

// ============ Combined Hook ============

export interface InputState {
    keyboard: KeyboardState
    mouse: MouseState
    gamepad: GamepadState
    touch: TouchState
}

/**
 * Combined hook for all input devices, re-rendering when any one of them
 * changes. Use the single device hooks when a component shows only one.
 *
 * @example
 * ```tsx
 * function InputPanel() {
 *     const { keyboard, mouse, gamepad } = useInput()
 *
 *     return (
 *         <View>
 *             <Label>Mouse: {mouse.position.x}, {mouse.position.y}</Label>
 *             <Label>Shift: {keyboard.shift ? "held" : "up"}</Label>
 *             <Label>Gamepad: {gamepad.connected ? "connected" : "none"}</Label>
 *         </View>
 *     )
 * }
 * ```
 */
export function useInput(): InputState {
    const keyboard = useKeyboard()
    const mouse = useMouse()
    const gamepad = useGamepad()
    const touch = useTouch()

    return useMemo(() => ({ keyboard, mouse, gamepad, touch }), [keyboard, mouse, gamepad, touch])
}

// ============ Zero-Alloc InputReader Hook ============

/**
 * Hook that creates a zero-allocation InputReader and auto-ticks it each frame.
 *
 * Use this for performance-critical game loops where you want to avoid
 * allocations from polling input state. The reader is built once, on the
 * first render, using the provided builder callback, and tick() is called
 * automatically each frame while the component is mounted.
 *
 * @param build: Callback that configures the reader using the fluent builder API
 * @returns The InputReader instance (call down(), pressed(), float(), vec2() to read values)
 *
 * @example
 * ```tsx
 * import { useFrame } from "onejs-react"
 *
 * function Game() {
 *     const reader = useInputReader(b => b
 *         .keyAxis2D("move", {
 *             up: ["W", "UpArrow"],
 *             down: ["S", "DownArrow"],
 *             left: ["A", "LeftArrow"],
 *             right: ["D", "RightArrow"],
 *         })
 *         .mouseButtonPressed("fire", "left")
 *         .mouseVec2("look", "delta")
 *         .gamepadVec2("gamepadMove", "leftStick")
 *     )
 *
 *     useFrame(() => {
 *         const move = reader.vec2("move")      // Same cached object each frame
 *         const look = reader.vec2("look")
 *         player.move(move.x, move.y)
 *         player.rotate(look.x, look.y)
 *         if (reader.pressed("fire")) player.shoot()
 *     })
 * }
 * ```
 */
export function useInputReader(
    build: (builder: InputReaderBuilder) => InputReaderBuilder
): InputReader {
    // The reader holds no C# resources (its keys are resolved to plain
    // numbers), so unmounting only stops the tick and nothing is disposed.
    // Disposing on cleanup is what broke StrictMode: its simulated remount
    // keeps the same state, so it kept reading a reader with no bindings.
    const [reader] = useState(() => build(createReader()).build())

    useAnimationFrame(() => {
        reader.tick()
    })

    return reader
}

// ============ InputAction Hooks ============

/** Anything that finds an action by path: InputActions or an InputActionMap */
export interface ActionSource {
    action: (path: string) => InputAction
}

export interface ActionState {
    /** Action triggered this frame */
    triggered: boolean
    /** Action currently pressed */
    isPressed: boolean
    /** Current phase */
    phase: string
    /**
     * @deprecated Use useActionFloat or useActionVec2 to show an action's
     * value, or action.float() / action.vec2() in a frame loop. value<T>()
     * cannot see T at runtime, so it guesses.
     */
    value: <T extends number | Vector2>() => T
}

function useActionAt(actionPath: string, actions: ActionSource): InputAction {
    return useMemo(() => actions.action(actionPath), [actions, actionPath])
}

// One deprecated value() function per action, so ActionState keeps its
// identity while the action is idle
const valueReaders = new WeakMap<InputAction, ActionState["value"]>()

function valueReader(action: InputAction): ActionState["value"] {
    let read = valueReaders.get(action)
    if (read === undefined) {
        read = <T extends number | Vector2>() => action.value<T>()
        valueReaders.set(action, read)
    }
    return read
}

const NO_ACTION: ActionState = {
    triggered: false,
    isPressed: false,
    phase: "disabled",
    value: <T extends number | Vector2>() => 0 as T,
}

function readAction(action: InputAction, prev: ActionState): ActionState {
    const triggered = action.triggered
    const isPressed = action.isPressed
    const phase = action.phase
    const value = valueReader(action)
    if (triggered === prev.triggered && isPressed === prev.isPressed && phase === prev.phase && value === prev.value) {
        return prev
    }
    return { triggered, isPressed, phase, value }
}

/**
 * Hook for InputAction state, re-rendering only when it changes.
 *
 * @param actionPath: Path to the action (e.g., "Player/Jump")
 * @param actions: InputActions instance from input.loadActions()
 *
 * @example
 * ```tsx
 * const actions = input.loadActions(playerActionsAsset)
 *
 * function JumpIndicator() {
 *     const jump = useAction("Player/Jump", actions)
 *     return <Label>{jump.isPressed ? "Jumping" : "Grounded"}</Label>
 * }
 * ```
 *
 * To act when the action fires, use useActionCallback.
 */
export function useAction(actionPath: string, actions: ActionSource): ActionState {
    const action = useActionAt(actionPath, actions)
    return useReading((prev: ActionState) => readAction(action, prev), NO_ACTION)
}

/**
 * Hook that returns the value of a button or 1D axis action, re-rendering
 * only when it changes.
 *
 * @example
 * ```tsx
 * function Throttle() {
 *     const throttle = useActionFloat("Vehicle/Throttle", actions)
 *     return <Label>Throttle: {Math.round(throttle * 100)}%</Label>
 * }
 * ```
 */
export function useActionFloat(actionPath: string, actions: ActionSource): number {
    const action = useActionAt(actionPath, actions)
    return useReading(() => action.float(), 0)
}

const ZERO: Vector2 = Object.freeze({ x: 0, y: 0 })

/**
 * Hook that returns the value of a 2D action (a stick, a WASD composite),
 * re-rendering only when it changes. Each change is a new object, so it is
 * safe to keep.
 *
 * @example
 * ```tsx
 * function MoveReadout() {
 *     const move = useActionVec2("Player/Move", actions)
 *     return <Label>Move: {move.x.toFixed(2)}, {move.y.toFixed(2)}</Label>
 * }
 * ```
 */
export function useActionVec2(actionPath: string, actions: ActionSource): Vector2 {
    const action = useActionAt(actionPath, actions)
    return useReading((prev: Vector2) => {
        const v = action.vec2()
        return sameVec(prev, v.x, v.y) ? prev : { x: v.x, y: v.y }
    }, ZERO)
}

/**
 * @deprecated Use useActionFloat for a button or 1D axis, useActionVec2 for
 * a 2D action. useActionValue<T> cannot see T at runtime, so it guesses the
 * type by reading both, and at rest a 2D action reads as the number 0.
 */
export function useActionValue<T extends number | Vector2>(
    actionPath: string,
    actions: ActionSource
): T {
    const action = useActionAt(actionPath, actions)
    return useReading((prev: T) => {
        const v = action.value<T>()
        if (typeof v === "number") return v
        const { x, y } = v as Vector2
        return typeof prev === "object" && sameVec(prev as Vector2, x, y) ? prev : { x, y } as T
    }, 0 as T)
}

/**
 * Hook that fires a callback on action events.
 *
 * @example
 * ```tsx
 * function Game() {
 *     useActionCallback("Player/Jump", "performed", () => {
 *         player.jump()
 *     }, actions)
 *
 *     useActionCallback("Player/Jump", "started", () => {
 *         player.startCharging()
 *     }, actions)
 * }
 * ```
 */
export function useActionCallback(
    actionPath: string,
    event: "started" | "performed" | "canceled",
    callback: () => void,
    actions: ActionSource
): void {
    const action = useActionAt(actionPath, actions)
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useEffect(() => {
        return action.on(event, () => {
            callbackRef.current()
        })
    }, [action, event])
}
