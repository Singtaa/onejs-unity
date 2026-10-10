/**
 * Type definitions for the Input module
 */

// Vector types
export type Vector2 = { x: number; y: number }

// ============ Keyboard ============

/** Key binding - single key or array of keys (any match = true) */
export type KeyBinding = string | string[]

/** Configuration for axis2D helper */
export interface Axis2DConfig {
    /** Key(s) for positive Y */
    up: KeyBinding
    /** Key(s) for negative Y */
    down: KeyBinding
    /** Key(s) for negative X */
    left: KeyBinding
    /** Key(s) for positive X */
    right: KeyBinding
}

/** Configuration for 1D axis helper */
export interface AxisConfig {
    /** Key(s) for negative direction (-1) */
    negative: KeyBinding
    /** Key(s) for positive direction (+1) */
    positive: KeyBinding
}

export interface Keyboard {
    /** Check if a key is currently held down */
    isKeyDown(key: string): boolean

    /** Check if a key was pressed this frame */
    wasKeyPressed(key: string): boolean

    /** Check if a key was released this frame */
    wasKeyReleased(key: string): boolean

    /** Shift key is held */
    readonly shift: boolean

    /** Ctrl key is held */
    readonly ctrl: boolean

    /** Alt key is held */
    readonly alt: boolean

    /** Meta/Command/Windows key is held */
    readonly meta: boolean

    /** Any key is currently held */
    readonly anyKeyDown: boolean

    /** Any key was pressed this frame */
    readonly anyKeyPressed: boolean

    /**
     * The keys pressed this frame, in the order they went down, as the key
     * names wasKeyPressed takes ("C", "Enter", "Backspace"). Empty when none
     * were. A key pressed twice in one frame is listed twice. Read this rather
     * than asking wasKeyPressed key by key when order matters: typing faster
     * than the frame rate puts several letters in one frame.
     */
    readonly keysPressed: readonly string[]

    /**
     * Get 2D axis from 4 keys (e.g., WASD)
     * @returns Vector2 with x,y in range -1 to 1
     */
    axis2D(config: Axis2DConfig): Vector2

    /**
     * Get 1D axis from 2 keys
     * @returns -1, 0, or 1
     */
    axis(config: AxisConfig): number

    /**
     * Preset: WASD keys for movement (W=up, S=down, A=left, D=right)
     * @returns Vector2 with x,y in range -1 to 1
     */
    wasd(): Vector2

    /**
     * Preset: Arrow keys for movement
     * @returns Vector2 with x,y in range -1 to 1
     */
    arrows(): Vector2
}

// ============ Mouse ============

export interface Mouse {
    /** Current mouse position in screen coordinates */
    readonly position: Vector2

    /** Mouse movement since last frame */
    readonly delta: Vector2

    /** Scroll wheel delta */
    readonly scroll: Vector2

    /** Left mouse button is held */
    readonly leftButton: boolean

    /** Right mouse button is held */
    readonly rightButton: boolean

    /** Middle mouse button is held */
    readonly middleButton: boolean

    /** Forward mouse button is held */
    readonly forwardButton: boolean

    /** Back mouse button is held */
    readonly backButton: boolean

    /** Left mouse button was pressed this frame */
    readonly wasLeftPressed: boolean

    /** Right mouse button was pressed this frame */
    readonly wasRightPressed: boolean

    /** Middle mouse button was pressed this frame */
    readonly wasMiddlePressed: boolean

    /** Left mouse button was released this frame */
    readonly wasLeftReleased: boolean

    /** Right mouse button was released this frame */
    readonly wasRightReleased: boolean

    /** Middle mouse button was released this frame */
    readonly wasMiddleReleased: boolean
}

// ============ Gamepad ============

export interface DPad {
    readonly up: boolean
    readonly down: boolean
    readonly left: boolean
    readonly right: boolean
}

export interface Gamepad {
    /** Gamepad index (0-7) */
    readonly index: number

    /** Left analog stick (-1 to 1) */
    readonly leftStick: Vector2

    /** Right analog stick (-1 to 1) */
    readonly rightStick: Vector2

    /** Left trigger (0 to 1) */
    readonly leftTrigger: number

    /** Right trigger (0 to 1) */
    readonly rightTrigger: number

    /** D-Pad state */
    readonly dpad: DPad

    // Face buttons (held state)
    /** A/Cross button */
    readonly buttonSouth: boolean
    /** B/Circle button */
    readonly buttonEast: boolean
    /** X/Square button */
    readonly buttonWest: boolean
    /** Y/Triangle button */
    readonly buttonNorth: boolean

    // Shoulder buttons
    readonly leftShoulder: boolean
    readonly rightShoulder: boolean

    // Stick buttons
    readonly leftStickButton: boolean
    readonly rightStickButton: boolean

    // Menu buttons
    readonly startButton: boolean
    readonly selectButton: boolean

    /** Check if a button was pressed this frame */
    wasButtonPressed(button: string): boolean

    /** Check if a button was released this frame */
    wasButtonReleased(button: string): boolean

    /** Check if a button is currently held */
    isButtonDown(button: string): boolean

    // Haptics
    /**
     * Set gamepad rumble
     * @param lowFreq Low frequency motor intensity (0-1)
     * @param highFreq High frequency motor intensity (0-1)
     * @param duration Duration in seconds (0 = indefinite)
     */
    rumble(lowFreq: number, highFreq: number, duration?: number): void

    /**
     * Simple rumble pulse
     * @param intensity Overall intensity (0-1)
     * @param duration Duration in seconds
     */
    rumblePulse(intensity: number, duration: number): void

    /** Stop all rumble */
    stopRumble(): void
}

// ============ Touch ============

export type TouchPhase = "began" | "moved" | "stationary" | "ended" | "canceled"

export interface Touch {
    /** Unique finger ID for this touch */
    readonly fingerId: number

    /** Current position in screen coordinates */
    readonly position: Vector2

    /** Movement since last frame */
    readonly delta: Vector2

    /** Current touch phase */
    readonly phase: TouchPhase
}

// ============ InputActions ============

export type ActionPhase = "disabled" | "waiting" | "started" | "performed" | "canceled"

export type ActionCallback = (context: ActionCallbackContext) => void

export interface ActionCallbackContext {
    /** Time the action was triggered */
    readonly time: number
    /** Current phase */
    readonly phase: ActionPhase
    /** The action's value as a number, for a button or 1D axis. See InputAction.float */
    float(): number
    /** The action's value as a Vector2, for a 2D axis. See InputAction.vec2 */
    vec2(): Vector2
    /**
     * @deprecated Use float() or vec2(), whichever matches the action's
     * control. readValue<T>() cannot see T at runtime, so it guesses.
     */
    readValue<T>(): T
}

export interface InputAction {
    /** Action name */
    readonly name: string

    /** Was this action triggered this frame */
    readonly triggered: boolean

    /** Is this action currently pressed/active */
    readonly isPressed: boolean

    /** Current action phase */
    readonly phase: ActionPhase

    /**
     * The value of a button or 1D axis action: 0 to 1 for a button, -1 to 1
     * for an axis. Unity throws if the action's control produces a Vector2:
     * read that with vec2().
     */
    float(): number

    /**
     * The value of a 2D action (a stick, a WASD composite). Returns the same
     * object every call, updated in place: copy it to keep a value.
     */
    vec2(): Vector2

    /**
     * @deprecated Use float() or vec2(), whichever matches the action's
     * control. value<T>() cannot see T at runtime, so it guesses by reading
     * both, and at rest a 2D action reads as the number 0.
     */
    value<T extends number | Vector2>(): T

    /** Subscribe to action events */
    on(event: "started" | "performed" | "canceled", callback: ActionCallback): () => void

    /** Remove all callbacks */
    off(): void
}

export interface InputActionMap {
    /** Map name */
    readonly name: string

    /** Enable this action map */
    enable(): void

    /** Disable this action map */
    disable(): void

    /** Get an action by name */
    action(name: string): InputAction
}

export interface InputActions {
    /** Get an action by path (e.g., "Player/Jump") */
    action(path: string): InputAction

    /** Get an action map by name */
    map(name: string): InputActionMap

    /** Enable all action maps */
    enable(): void

    /** Disable all action maps */
    disable(): void

    /** Dispose and cleanup */
    dispose(): void
}

// ============ Action Builder ============

export interface ActionBuilder {
    /** Add a keyboard/mouse/gamepad binding */
    bind(path: string): ActionBuilder

    /** Add a composite binding (like WASD) */
    bindComposite(type: "dpad" | "1daxis" | "2daxis"): CompositeBindingBuilder

    /** Finish this action and return to map builder */
    done(): ActionMapBuilder
}

export interface CompositeBindingBuilder {
    up(path: string): CompositeBindingBuilder
    down(path: string): CompositeBindingBuilder
    left(path: string): CompositeBindingBuilder
    right(path: string): CompositeBindingBuilder
    positive(path: string): CompositeBindingBuilder
    negative(path: string): CompositeBindingBuilder
    done(): ActionBuilder
}

export interface ActionMapBuilder {
    /** Add a button action */
    button(name: string): ActionBuilder

    /** Add a 1D axis action */
    axis(name: string): ActionBuilder

    /** Add a 2D vector action */
    axis2D(name: string): ActionBuilder

    /** Build and return the InputActions */
    build(): InputActions
}

// ============ Zero-Alloc Input Reader ============

/** Mouse property for vec2 bindings */
export type MouseVec2Property = "position" | "delta" | "scroll"

/** Mouse property for float bindings */
export type MouseFloatProperty = "scrollX" | "scrollY" | "positionX" | "positionY" | "deltaX" | "deltaY"

/** Mouse button for button bindings */
export type MouseButtonType = "left" | "right" | "middle" | "forward" | "back"

/** Gamepad property for vec2 bindings */
export type GamepadVec2Property = "leftStick" | "rightStick"

/** Gamepad property for float bindings */
export type GamepadFloatProperty = "leftTrigger" | "rightTrigger" | "leftStickX" | "leftStickY" | "rightStickX" | "rightStickY"

/** Key binding - single key or array of keys (any match = true) */
export type ReaderKeyBinding = string | string[]

/** Configuration for keyAxis2D: 4 directional keys to vec2 */
export interface KeyAxis2DConfig {
    up: ReaderKeyBinding
    down: ReaderKeyBinding
    left: ReaderKeyBinding
    right: ReaderKeyBinding
}

/**
 * Fluent builder for creating an InputReader.
 * Chain binding methods and call build() to create the reader.
 *
 * Each binding is read by one method, and the builder names say which:
 * `key`, `mouseButton` and `gamepadButton` are held, read with `down()`; the
 * `...Pressed` and `...Released` forms are one frame edges, read with
 * `pressed()` and `released()`; the rest read with `float()` or `vec2()`.
 * Every name is bound once.
 */
export interface InputReaderBuilder {
    /** Bind a keyboard key, held. Read with down() */
    key(name: string, key: string): InputReaderBuilder

    /** Bind a keyboard key, true the frame it is pressed. Read with pressed() */
    keyPressed(name: string, key: string): InputReaderBuilder

    /** Bind a keyboard key, true the frame it is released. Read with released() */
    keyReleased(name: string, key: string): InputReaderBuilder

    /** Bind a keyboard axis from two keys (-1, 0, or 1) */
    keyAxis(name: string, config: { negative: string; positive: string }): InputReaderBuilder

    /** Bind a 2D keyboard axis from 4 directional keys (returns vec2) */
    keyAxis2D(name: string, config: KeyAxis2DConfig): InputReaderBuilder

    /** Bind a mouse button, held. Read with down() */
    mouseButton(name: string, button: MouseButtonType): InputReaderBuilder

    /** Bind a mouse button, true the frame it is pressed. Read with pressed() */
    mouseButtonPressed(name: string, button: MouseButtonType): InputReaderBuilder

    /** Bind a mouse button, true the frame it is released. Read with released() */
    mouseButtonReleased(name: string, button: MouseButtonType): InputReaderBuilder

    /** Bind a mouse Vector2 property (position, delta, scroll) */
    mouseVec2(name: string, property: MouseVec2Property): InputReaderBuilder

    /** Bind a mouse float property */
    mouseFloat(name: string, property: MouseFloatProperty): InputReaderBuilder

    /** Bind a gamepad button, held. Read with down() */
    gamepadButton(name: string, button: string, index?: number): InputReaderBuilder

    /** Bind a gamepad button, true the frame it is pressed. Read with pressed() */
    gamepadButtonPressed(name: string, button: string, index?: number): InputReaderBuilder

    /** Bind a gamepad button, true the frame it is released. Read with released() */
    gamepadButtonReleased(name: string, button: string, index?: number): InputReaderBuilder

    /** Bind a gamepad Vector2 property (leftStick, rightStick) */
    gamepadVec2(name: string, property: GamepadVec2Property, index?: number): InputReaderBuilder

    /** Bind a gamepad float property (triggers, stick axes) */
    gamepadFloat(name: string, property: GamepadFloatProperty, index?: number): InputReaderBuilder

    /** Build the InputReader */
    build(): InputReader
}

/**
 * Zero-allocation input reader.
 * All Vector2 objects are pre-allocated and reused.
 * Call tick() once per frame to update all bindings.
 *
 * A read must match its binding: `pressed("fire")` on a binding made with
 * `mouseButton()` throws and names the binding to use, as does a name that
 * was never bound. A wrong read never quietly returns a plausible value.
 */
export interface InputReader {
    /** Update all bindings. Call once per frame. */
    tick(): void

    /** Held state of a key(), mouseButton() or gamepadButton() binding */
    down(name: string): boolean

    /** True the frame a keyPressed(), mouseButtonPressed() or gamepadButtonPressed() binding is pressed */
    pressed(name: string): boolean

    /** True the frame a keyReleased(), mouseButtonReleased() or gamepadButtonReleased() binding is released */
    released(name: string): boolean

    /** Value of a keyAxis(), mouseFloat() or gamepadFloat() binding */
    float(name: string): number

    /** Value of a keyAxis2D(), mouseVec2() or gamepadVec2() binding (the same object every frame) */
    vec2(name: string): Vector2

    /** Drop the bindings. Reads after this throw. */
    dispose(): void
}

// ============ Main Input Module ============

export interface InputModule {
    /** Keyboard device access */
    readonly keyboard: Keyboard

    /** Mouse device access */
    readonly mouse: Mouse

    /** First connected gamepad (null if none) */
    readonly gamepad: Gamepad | null

    /** All connected gamepads */
    readonly gamepads: readonly Gamepad[]

    /** Number of connected gamepads */
    readonly gamepadCount: number

    /** Active touches */
    readonly touches: readonly Touch[]

    /** Number of active touches */
    readonly touchCount: number

    /**
     * Load InputActions from a Unity InputActionAsset
     * @param asset The InputActionAsset object (from JSRunner globals)
     */
    loadActions(asset: unknown): InputActions

    /**
     * Create InputActions with a fluent builder
     * @param mapName Name for the action map
     */
    createActions(mapName: string): ActionMapBuilder

    /** Pause all gamepad haptics */
    pauseHaptics(): void

    /** Resume all gamepad haptics */
    resumeHaptics(): void

    /**
     * Create a zero-allocation input reader with a fluent builder.
     * Use this for performance-critical game loops.
     */
    createReader(): InputReaderBuilder

    /**
     * Enable or disable PointerMoveEvent dispatching to JavaScript.
     * When disabled, React's onPointerMove handlers won't fire, but onPointerEnter/Leave still work.
     *
     * Use this when polling mouse input via InputReader instead of React events.
     * This eliminates ~0.6KB/frame GC allocation from pointer move event dispatching.
     *
     * @param enabled Whether to dispatch pointermove events (default: true)
     *
     * @example
     * // Disable pointer events for zero-alloc game loop
     * input.setPointerMoveEventsEnabled(false)
     *
     * // Use InputReader for mouse delta instead
     * const reader = input.createReader()
     *     .mouseVec2("look", "delta")
     *     .build()
     */
    setPointerMoveEventsEnabled(enabled: boolean): void
}
