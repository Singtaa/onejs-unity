/**
 * Gamepad input implementation with haptics support
 */

import type { Gamepad, DPad, Vector2 } from "./types"

// Get InputBridge lazily to avoid issues during module load
function getInputBridge() {
    return (CS as any).OneJS.Input.InputBridge
}

// Button bit flags (matching InputBridge.cs)
const BUTTON_SOUTH = 1
const BUTTON_EAST = 2
const BUTTON_WEST = 4
const BUTTON_NORTH = 8
const BUTTON_LEFT_SHOULDER = 16
const BUTTON_RIGHT_SHOULDER = 32
const BUTTON_LEFT_STICK = 64
const BUTTON_RIGHT_STICK = 128
const BUTTON_START = 256
const BUTTON_SELECT = 512
const BUTTON_DPAD_UP = 1024
const BUTTON_DPAD_DOWN = 2048
const BUTTON_DPAD_LEFT = 4096
const BUTTON_DPAD_RIGHT = 8192

// Button name to bit flag mapping
const BUTTON_MAP: Record<string, number> = {
    south: BUTTON_SOUTH,
    buttonsouth: BUTTON_SOUTH,
    a: BUTTON_SOUTH,
    cross: BUTTON_SOUTH,

    east: BUTTON_EAST,
    buttoneast: BUTTON_EAST,
    b: BUTTON_EAST,
    circle: BUTTON_EAST,

    west: BUTTON_WEST,
    buttonwest: BUTTON_WEST,
    x: BUTTON_WEST,
    square: BUTTON_WEST,

    north: BUTTON_NORTH,
    buttonnorth: BUTTON_NORTH,
    y: BUTTON_NORTH,
    triangle: BUTTON_NORTH,

    leftshoulder: BUTTON_LEFT_SHOULDER,
    lb: BUTTON_LEFT_SHOULDER,
    l1: BUTTON_LEFT_SHOULDER,

    rightshoulder: BUTTON_RIGHT_SHOULDER,
    rb: BUTTON_RIGHT_SHOULDER,
    r1: BUTTON_RIGHT_SHOULDER,

    leftstick: BUTTON_LEFT_STICK,
    l3: BUTTON_LEFT_STICK,

    rightstick: BUTTON_RIGHT_STICK,
    r3: BUTTON_RIGHT_STICK,

    start: BUTTON_START,
    menu: BUTTON_START,

    select: BUTTON_SELECT,
    back: BUTTON_SELECT,
    view: BUTTON_SELECT,

    dpadup: BUTTON_DPAD_UP,
    up: BUTTON_DPAD_UP,

    dpaddown: BUTTON_DPAD_DOWN,
    down: BUTTON_DPAD_DOWN,

    dpadleft: BUTTON_DPAD_LEFT,
    left: BUTTON_DPAD_LEFT,

    dpadright: BUTTON_DPAD_RIGHT,
    right: BUTTON_DPAD_RIGHT,
}

function getButtonBit(button: string): number {
    return BUTTON_MAP[button.toLowerCase()] ?? 0
}

/**
 * DPad implementation
 */
class DPadImpl implements DPad {
    constructor(private readonly _gamepadIndex: number) {}

    get up(): boolean {
        return (getInputBridge().GetGamepadButtons(this._gamepadIndex) & BUTTON_DPAD_UP) !== 0
    }

    get down(): boolean {
        return (getInputBridge().GetGamepadButtons(this._gamepadIndex) & BUTTON_DPAD_DOWN) !== 0
    }

    get left(): boolean {
        return (getInputBridge().GetGamepadButtons(this._gamepadIndex) & BUTTON_DPAD_LEFT) !== 0
    }

    get right(): boolean {
        return (getInputBridge().GetGamepadButtons(this._gamepadIndex) & BUTTON_DPAD_RIGHT) !== 0
    }
}

/**
 * Gamepad implementation that wraps the C# InputBridge
 */
class GamepadImpl implements Gamepad {
    readonly index: number
    readonly dpad: DPad

    // Cached vector objects to reduce allocations
    private readonly _leftStick: Vector2 = { x: 0, y: 0 }
    private readonly _rightStick: Vector2 = { x: 0, y: 0 }

    // Rumble timeout handle
    private _rumbleTimeout: ReturnType<typeof setTimeout> | null = null

    constructor(index: number) {
        this.index = index
        this.dpad = new DPadImpl(index)
    }

    get leftStick(): Vector2 {
        this._leftStick.x = getInputBridge().GetLeftStickX(this.index)
        this._leftStick.y = getInputBridge().GetLeftStickY(this.index)
        return this._leftStick
    }

    get rightStick(): Vector2 {
        this._rightStick.x = getInputBridge().GetRightStickX(this.index)
        this._rightStick.y = getInputBridge().GetRightStickY(this.index)
        return this._rightStick
    }

    get leftTrigger(): number {
        return getInputBridge().GetLeftTrigger(this.index)
    }

    get rightTrigger(): number {
        return getInputBridge().GetRightTrigger(this.index)
    }

    // Face buttons
    get buttonSouth(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_SOUTH) !== 0
    }

    get buttonEast(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_EAST) !== 0
    }

    get buttonWest(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_WEST) !== 0
    }

    get buttonNorth(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_NORTH) !== 0
    }

    // Shoulder buttons
    get leftShoulder(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_LEFT_SHOULDER) !== 0
    }

    get rightShoulder(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_RIGHT_SHOULDER) !== 0
    }

    // Stick buttons
    get leftStickButton(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_LEFT_STICK) !== 0
    }

    get rightStickButton(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_RIGHT_STICK) !== 0
    }

    // Menu buttons
    get startButton(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_START) !== 0
    }

    get selectButton(): boolean {
        return (getInputBridge().GetGamepadButtons(this.index) & BUTTON_SELECT) !== 0
    }

    wasButtonPressed(button: string): boolean {
        const bit = getButtonBit(button)
        return (getInputBridge().GetGamepadButtonsPressed(this.index) & bit) !== 0
    }

    wasButtonReleased(button: string): boolean {
        const bit = getButtonBit(button)
        return (getInputBridge().GetGamepadButtonsReleased(this.index) & bit) !== 0
    }

    isButtonDown(button: string): boolean {
        const bit = getButtonBit(button)
        return (getInputBridge().GetGamepadButtons(this.index) & bit) !== 0
    }

    // Haptics
    rumble(lowFreq: number, highFreq: number, duration = 0): void {
        // Clear any existing timeout
        if (this._rumbleTimeout !== null) {
            clearTimeout(this._rumbleTimeout)
            this._rumbleTimeout = null
        }

        // Clamp values
        lowFreq = Math.max(0, Math.min(1, lowFreq))
        highFreq = Math.max(0, Math.min(1, highFreq))

        getInputBridge().SetRumble(this.index, lowFreq, highFreq, duration)

        // If duration specified, schedule stop
        if (duration > 0) {
            this._rumbleTimeout = setTimeout(() => {
                this.stopRumble()
                this._rumbleTimeout = null
            }, duration * 1000)
        }
    }

    rumblePulse(intensity: number, duration: number): void {
        // Simple pulse uses equal low/high frequency
        this.rumble(intensity, intensity, duration)
    }

    stopRumble(): void {
        if (this._rumbleTimeout !== null) {
            clearTimeout(this._rumbleTimeout)
            this._rumbleTimeout = null
        }
        getInputBridge().StopRumble(this.index)
    }
}

// Gamepad instance cache
const _gamepadCache: Map<number, GamepadImpl> = new Map()

/**
 * Get or create a Gamepad instance for the given index
 */
export function getGamepad(index: number): Gamepad | null {
    if (!getInputBridge().IsGamepadConnected(index)) {
        return null
    }

    let gp = _gamepadCache.get(index)
    if (!gp) {
        gp = new GamepadImpl(index)
        _gamepadCache.set(index, gp)
    }
    return gp
}

/**
 * Get all connected gamepads
 */
export function getGamepads(): readonly Gamepad[] {
    const count = getInputBridge().GetGamepadCount()
    const result: Gamepad[] = []

    for (let i = 0; i < count; i++) {
        const gp = getGamepad(i)
        if (gp) result.push(gp)
    }

    return result
}

/**
 * Get number of connected gamepads
 */
export function getGamepadCount(): number {
    return getInputBridge().GetGamepadCount()
}

/**
 * Pause all gamepad haptics
 */
export function pauseHaptics(): void {
    getInputBridge().PauseHaptics()
}

/**
 * Resume all gamepad haptics
 */
export function resumeHaptics(): void {
    getInputBridge().ResumeHaptics()
}
