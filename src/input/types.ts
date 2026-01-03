/**
 * Type definitions for the Input module
 */

// Vector types
export type Vector2 = { x: number; y: number }

// ============ Keyboard ============

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
}
