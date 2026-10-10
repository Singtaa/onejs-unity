/**
 * Keyboard input implementation
 */

import type { Keyboard, Axis2DConfig, AxisConfig, KeyBinding, Vector2 } from "./types"
import { getInputBridge } from "./backend"

/** GetModifiers() bit flags (matching InputBridge.cs) */
export const MODIFIER_SHIFT = 1
export const MODIFIER_CTRL = 2
export const MODIFIER_ALT = 4
export const MODIFIER_META = 8

/**
 * Keyboard implementation that wraps the C# InputBridge
 */
class KeyboardImpl implements Keyboard {
    isKeyDown(key: string): boolean {
        return getInputBridge().GetKeyDown(key)
    }

    wasKeyPressed(key: string): boolean {
        return getInputBridge().GetKeyPressed(key)
    }

    wasKeyReleased(key: string): boolean {
        return getInputBridge().GetKeyReleased(key)
    }

    get shift(): boolean {
        return (getInputBridge().GetModifiers() & MODIFIER_SHIFT) !== 0
    }

    get ctrl(): boolean {
        return (getInputBridge().GetModifiers() & MODIFIER_CTRL) !== 0
    }

    get alt(): boolean {
        return (getInputBridge().GetModifiers() & MODIFIER_ALT) !== 0
    }

    get meta(): boolean {
        return (getInputBridge().GetModifiers() & MODIFIER_META) !== 0
    }

    get anyKeyDown(): boolean {
        return getInputBridge().GetAnyKeyDown()
    }

    get anyKeyPressed(): boolean {
        return getInputBridge().GetAnyKeyPressed()
    }

    get keysPressed(): readonly string[] {
        // One string across the bridge rather than an array: a string crosses
        // from C# as a value, an array as a handle to walk
        const joined: string = getInputBridge().GetKeysPressed()
        return joined === "" ? [] : joined.split(",")
    }

    /**
     * Check if any key in a binding is down
     */
    private _isBindingDown(binding: KeyBinding): boolean {
        if (typeof binding === "string") {
            return this.isKeyDown(binding)
        }
        for (const key of binding) {
            if (this.isKeyDown(key)) return true
        }
        return false
    }

    axis2D(config: Axis2DConfig): Vector2 {
        let x = 0
        let y = 0

        if (this._isBindingDown(config.right)) x += 1
        if (this._isBindingDown(config.left)) x -= 1
        if (this._isBindingDown(config.up)) y += 1
        if (this._isBindingDown(config.down)) y -= 1

        return { x, y }
    }

    axis(config: AxisConfig): number {
        let value = 0
        if (this._isBindingDown(config.positive)) value += 1
        if (this._isBindingDown(config.negative)) value -= 1
        return value
    }

    wasd(): Vector2 {
        return this.axis2D({
            up: "W",
            down: "S",
            left: "A",
            right: "D"
        })
    }

    arrows(): Vector2 {
        return this.axis2D({
            up: "Up",
            down: "Down",
            left: "Left",
            right: "Right"
        })
    }
}

// Singleton keyboard instance
export const keyboard: Keyboard = new KeyboardImpl()
