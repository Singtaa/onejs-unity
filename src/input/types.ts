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
    /** Read value as type T */
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

    /** Read action value as specified type */
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

/** Configuration for keyAxis2D - 4 directional keys to vec2 */
export interface KeyAxis2DConfig {
    up: ReaderKeyBinding
    down: ReaderKeyBinding
    left: ReaderKeyBinding
    right: ReaderKeyBinding
}

/**
 * Fluent builder for creating an InputReader.
 * Chain binding methods and call build() to create the reader.
 */
export interface InputReaderBuilder {
    /** Bind a keyboard key (isKeyDown state) */
    key(name: string, key: string): InputReaderBuilder

    /** Bind a keyboard key (wasKeyPressed this frame) */
    keyPressed(name: string, key: string): InputReaderBuilder

    /** Bind a keyboard key (wasKeyReleased this frame) */
    keyReleased(name: string, key: string): InputReaderBuilder

    /** Bind a keyboard axis from two keys (-1, 0, or 1) */
    keyAxis(name: string, config: { negative: string; positive: string }): InputReaderBuilder

    /** Bind a 2D keyboard axis from 4 directional keys (returns vec2) */
    keyAxis2D(name: string, config: KeyAxis2DConfig): InputReaderBuilder

    /** Bind a mouse button */
    mouseButton(name: string, button: MouseButtonType): InputReaderBuilder

    /** Bind a mouse Vector2 property (position, delta, scroll) */
    mouseVec2(name: string, property: MouseVec2Property): InputReaderBuilder

    /** Bind a mouse float property */
    mouseFloat(name: string, property: MouseFloatProperty): InputReaderBuilder

    /** Bind a gamepad button */
    gamepadButton(name: string, button: string, index?: number): InputReaderBuilder

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
 */
export interface InputReader {
    /** Update all bindings. Call once per frame. */
    tick(): void

    /** Get boolean binding value (current down state) */
    down(name: string): boolean

    /** Get boolean binding value (pressed this frame) */
    pressed(name: string): boolean

    /** Get boolean binding value (released this frame) */
    released(name: string): boolean

    /** Get float binding value */
    float(name: string): number

    /** Get Vector2 binding value (returns same cached object each frame) */
    vec2(name: string): Vector2

    /** Dispose the reader and release resources */
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
