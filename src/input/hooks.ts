/**
 * React hooks for input handling
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import type { Keyboard, Mouse, Gamepad, Touch, Vector2, InputAction, InputReader, InputReaderBuilder } from "./types"
import { input } from "./input"
import { createReader } from "./reader"

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
 * Internal hook for tracking previous value
 */
function usePrevious<T>(value: T): T | undefined {
    const ref = useRef<T | undefined>(undefined)
    useEffect(() => {
        ref.current = value
    })
    return ref.current
}

// ============ Keyboard Hooks ============

export interface KeyboardState {
    /** Check if a key is currently held down */
    isKeyDown: (key: string) => boolean
    /** Check if a key was pressed this frame */
    wasKeyPressed: (key: string) => boolean
    /** Check if a key was released this frame */
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
    /** WASD keys as Vector2 (W=+y, S=-y, A=-x, D=+x) */
    wasd: () => Vector2
    /** Arrow keys as Vector2 */
    arrows: () => Vector2
}

/**
 * Hook that provides keyboard state, updated every frame.
 *
 * @example
 * ```tsx
 * function Game() {
 *     const keyboard = useKeyboard()
 *
 *     useEffect(() => {
 *         if (keyboard.wasKeyPressed("Space")) {
 *             player.jump()
 *         }
 *     })
 *
 *     return <Label>Shift: {keyboard.shift ? "ON" : "off"}</Label>
 * }
 * ```
 */
export function useKeyboard(): KeyboardState {
    const [state, setState] = useState<KeyboardState>(() => ({
        isKeyDown: (key: string) => input.keyboard.isKeyDown(key),
        wasKeyPressed: (key: string) => input.keyboard.wasKeyPressed(key),
        wasKeyReleased: (key: string) => input.keyboard.wasKeyReleased(key),
        shift: false,
        ctrl: false,
        alt: false,
        meta: false,
        anyKeyDown: false,
        wasd: () => input.keyboard.wasd(),
        arrows: () => input.keyboard.arrows(),
    }))

    useAnimationFrame(() => {
        setState({
            isKeyDown: (key: string) => input.keyboard.isKeyDown(key),
            wasKeyPressed: (key: string) => input.keyboard.wasKeyPressed(key),
            wasKeyReleased: (key: string) => input.keyboard.wasKeyReleased(key),
            shift: input.keyboard.shift,
            ctrl: input.keyboard.ctrl,
            alt: input.keyboard.alt,
            meta: input.keyboard.meta,
            anyKeyDown: input.keyboard.anyKeyDown,
            wasd: () => input.keyboard.wasd(),
            arrows: () => input.keyboard.arrows(),
        })
    })

    return state
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
 * Hook that fires a callback while a key is held down.
 *
 * @example
 * ```tsx
 * function Game() {
 *     useKeyDown("W", () => {
 *         player.moveForward()
 *     })
 * }
 * ```
 */
export function useKeyDown(key: string, callback: () => void): void {
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useAnimationFrame(() => {
        if (input.keyboard.isKeyDown(key)) {
            callbackRef.current()
        }
    })
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
    /** Left button released this frame */
    wasLeftReleased: boolean
}

/**
 * Hook that provides mouse state, updated every frame.
 *
 * @example
 * ```tsx
 * function Game() {
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
    const [state, setState] = useState<MouseState>(() => ({
        position: { x: 0, y: 0 },
        delta: { x: 0, y: 0 },
        scroll: { x: 0, y: 0 },
        leftButton: false,
        rightButton: false,
        middleButton: false,
        wasLeftPressed: false,
        wasRightPressed: false,
        wasLeftReleased: false,
    }))

    useAnimationFrame(() => {
        const pos = input.mouse.position
        const delta = input.mouse.delta
        const scroll = input.mouse.scroll

        setState({
            position: { x: pos.x, y: pos.y },
            delta: { x: delta.x, y: delta.y },
            scroll: { x: scroll.x, y: scroll.y },
            leftButton: input.mouse.leftButton,
            rightButton: input.mouse.rightButton,
            middleButton: input.mouse.middleButton,
            wasLeftPressed: input.mouse.wasLeftPressed,
            wasRightPressed: input.mouse.wasRightPressed,
            wasLeftReleased: input.mouse.wasLeftReleased,
        })
    })

    return state
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

/**
 * Hook that provides gamepad state, updated every frame.
 *
 * @param index - Gamepad index (default: 0)
 *
 * @example
 * ```tsx
 * function Game() {
 *     const { connected, leftStick, gamepad } = useGamepad()
 *
 *     if (!connected) {
 *         return <Label>Connect a gamepad</Label>
 *     }
 *
 *     // Use leftStick for movement
 *     player.move(leftStick.x, leftStick.y)
 *
 *     // Rumble on button press
 *     if (gamepad?.wasButtonPressed("South")) {
 *         gamepad.rumblePulse(0.5, 0.1)
 *     }
 * }
 * ```
 */
export function useGamepad(index: number = 0): GamepadState {
    const [state, setState] = useState<GamepadState>(() => ({
        connected: false,
        gamepad: null,
        leftStick: { x: 0, y: 0 },
        rightStick: { x: 0, y: 0 },
        leftTrigger: 0,
        rightTrigger: 0,
        buttons: { south: false, east: false, west: false, north: false },
        dpad: { up: false, down: false, left: false, right: false },
    }))

    useAnimationFrame(() => {
        const gp = input.gamepads[index] ?? null

        if (!gp) {
            setState(prev => prev.connected ? {
                connected: false,
                gamepad: null,
                leftStick: { x: 0, y: 0 },
                rightStick: { x: 0, y: 0 },
                leftTrigger: 0,
                rightTrigger: 0,
                buttons: { south: false, east: false, west: false, north: false },
                dpad: { up: false, down: false, left: false, right: false },
            } : prev)
            return
        }

        const ls = gp.leftStick
        const rs = gp.rightStick

        setState({
            connected: true,
            gamepad: gp,
            leftStick: { x: ls.x, y: ls.y },
            rightStick: { x: rs.x, y: rs.y },
            leftTrigger: gp.leftTrigger,
            rightTrigger: gp.rightTrigger,
            buttons: {
                south: gp.buttonSouth,
                east: gp.buttonEast,
                west: gp.buttonWest,
                north: gp.buttonNorth,
            },
            dpad: {
                up: gp.dpad.up,
                down: gp.dpad.down,
                left: gp.dpad.left,
                right: gp.dpad.right,
            },
        })
    })

    return state
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
        const gp = input.gamepads[index]
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

/**
 * Hook that provides touch state, updated every frame.
 *
 * @example
 * ```tsx
 * function Game() {
 *     const touch = useTouch()
 *
 *     if (touch.primary) {
 *         cursor.moveTo(touch.primary.position)
 *     }
 * }
 * ```
 */
export function useTouch(): TouchState {
    const [state, setState] = useState<TouchState>(() => ({
        count: 0,
        touches: [],
        primary: null,
    }))

    useAnimationFrame(() => {
        const touches = input.touches
        setState({
            count: touches.length,
            touches,
            primary: touches[0] ?? null,
        })
    })

    return state
}

// ============ Combined Hook ============

export interface InputState {
    keyboard: KeyboardState
    mouse: MouseState
    gamepad: GamepadState
    touch: TouchState
}

/**
 * Combined hook for all input devices.
 * Use this when you need access to multiple input types.
 *
 * @example
 * ```tsx
 * function Game() {
 *     const { keyboard, mouse, gamepad } = useInput()
 *
 *     // Movement from keyboard or gamepad
 *     let moveX = 0
 *     if (keyboard.isKeyDown("A")) moveX -= 1
 *     if (keyboard.isKeyDown("D")) moveX += 1
 *     if (gamepad.connected) moveX += gamepad.leftStick.x
 *
 *     // Aim with mouse
 *     player.aimAt(mouse.position)
 * }
 * ```
 */
export function useInput(): InputState {
    const keyboard = useKeyboard()
    const mouse = useMouse()
    const gamepad = useGamepad()
    const touch = useTouch()

    return { keyboard, mouse, gamepad, touch }
}

// ============ Zero-Alloc InputReader Hook ============

/**
 * Hook that creates a zero-allocation InputReader and auto-ticks it each frame.
 *
 * Use this for performance-critical game loops where you want to avoid
 * allocations from polling input state. The reader is built once using the
 * provided builder callback, and tick() is called automatically each frame.
 *
 * @param build - Callback that configures the reader using the fluent builder API
 * @returns The InputReader instance (call down(), pressed(), float(), vec2() to read values)
 *
 * @example
 * ```tsx
 * function Game() {
 *     const reader = useInputReader(b => b
 *         .keyAxis2D("move", {
 *             up: ["W", "UpArrow"],
 *             down: ["S", "DownArrow"],
 *             left: ["A", "LeftArrow"],
 *             right: ["D", "RightArrow"],
 *         })
 *         .mouseButton("fire", "left")
 *         .mouseVec2("look", "delta")
 *         .gamepadVec2("gamepadMove", "leftStick")
 *     )
 *
 *     useAnimationFrame(() => {
 *         const move = reader.vec2("move")      // Same cached object each frame
 *         const look = reader.vec2("look")
 *         player.move(move.x, move.y)
 *         player.rotate(look.x, look.y)
 *         if (reader.down("fire")) player.shoot()
 *     })
 * }
 * ```
 */
export function useInputReader(
    build: (builder: InputReaderBuilder) => InputReaderBuilder
): InputReader {
    // Build reader once on mount
    const reader = useMemo(() => {
        return build(createReader()).build()
    }, [])

    // Auto-tick each frame
    useAnimationFrame(() => {
        reader.tick()
    })

    // Cleanup on unmount
    useEffect(() => {
        return () => reader.dispose()
    }, [reader])

    return reader
}

// ============ InputAction Hooks ============

export interface ActionState {
    /** Action triggered this frame */
    triggered: boolean
    /** Action currently pressed */
    isPressed: boolean
    /** Current phase */
    phase: string
    /** Read action value */
    value: <T extends number | Vector2>() => T
}

/**
 * Hook for InputAction state.
 *
 * @param actionPath - Path to the action (e.g., "Player/Jump")
 * @param actions - InputActions instance from input.loadActions()
 *
 * @example
 * ```tsx
 * const actions = input.loadActions(playerActionsAsset)
 *
 * function Game() {
 *     const jump = useAction("Player/Jump", actions)
 *     const move = useAction("Player/Move", actions)
 *
 *     if (jump.triggered) {
 *         player.jump()
 *     }
 *
 *     const dir = move.value<Vector2>()
 *     player.move(dir.x, dir.y)
 * }
 * ```
 */
export function useAction(
    actionPath: string,
    actions: { action: (path: string) => InputAction }
): ActionState {
    const actionRef = useRef<InputAction | null>(null)

    // Get action reference once
    if (!actionRef.current) {
        actionRef.current = actions.action(actionPath)
    }

    const [state, setState] = useState<ActionState>(() => ({
        triggered: false,
        isPressed: false,
        phase: "disabled",
        value: <T extends number | Vector2>() => actionRef.current!.value<T>(),
    }))

    useAnimationFrame(() => {
        const action = actionRef.current!
        setState({
            triggered: action.triggered,
            isPressed: action.isPressed,
            phase: action.phase,
            value: <T extends number | Vector2>() => action.value<T>(),
        })
    })

    return state
}

/**
 * Hook that returns just the action value, updated every frame.
 *
 * @example
 * ```tsx
 * function Game() {
 *     const moveDir = useActionValue<Vector2>("Player/Move", actions)
 *     player.move(moveDir.x, moveDir.y)
 * }
 * ```
 */
export function useActionValue<T extends number | Vector2>(
    actionPath: string,
    actions: { action: (path: string) => InputAction }
): T {
    const actionRef = useRef<InputAction | null>(null)

    if (!actionRef.current) {
        actionRef.current = actions.action(actionPath)
    }

    const [value, setValue] = useState<T>(() => actionRef.current!.value<T>())

    useAnimationFrame(() => {
        setValue(actionRef.current!.value<T>())
    })

    return value
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
    actions: { action: (path: string) => InputAction }
): void {
    const actionRef = useRef<InputAction | null>(null)
    const callbackRef = useRef(callback)
    callbackRef.current = callback

    useEffect(() => {
        if (!actionRef.current) {
            actionRef.current = actions.action(actionPath)
        }

        const unsubscribe = actionRef.current.on(event, () => {
            callbackRef.current()
        })

        return unsubscribe
    }, [actionPath, event, actions])
}
