/**
 * Mouse input implementation
 */

import type { Mouse, Vector2 } from "./types"
import { getInputBridge } from "./backend"

/** GetMouseButtons() bit flags (matching InputBridge.cs) */
export const MOUSE_LEFT = 1
export const MOUSE_RIGHT = 2
export const MOUSE_MIDDLE = 4
export const MOUSE_FORWARD = 8
export const MOUSE_BACK = 16

// Cached vector objects to reduce allocations
const _position: Vector2 = { x: 0, y: 0 }
const _delta: Vector2 = { x: 0, y: 0 }
const _scroll: Vector2 = { x: 0, y: 0 }

/**
 * Mouse implementation that wraps the C# InputBridge
 */
class MouseImpl implements Mouse {
    get position(): Vector2 {
        _position.x = getInputBridge().GetMousePositionX()
        _position.y = getInputBridge().GetMousePositionY()
        return _position
    }

    get delta(): Vector2 {
        _delta.x = getInputBridge().GetMouseDeltaX()
        _delta.y = getInputBridge().GetMouseDeltaY()
        return _delta
    }

    get scroll(): Vector2 {
        _scroll.x = getInputBridge().GetScrollX()
        _scroll.y = getInputBridge().GetScrollY()
        return _scroll
    }

    get leftButton(): boolean {
        return (getInputBridge().GetMouseButtons() & MOUSE_LEFT) !== 0
    }

    get rightButton(): boolean {
        return (getInputBridge().GetMouseButtons() & MOUSE_RIGHT) !== 0
    }

    get middleButton(): boolean {
        return (getInputBridge().GetMouseButtons() & MOUSE_MIDDLE) !== 0
    }

    get forwardButton(): boolean {
        return (getInputBridge().GetMouseButtons() & MOUSE_FORWARD) !== 0
    }

    get backButton(): boolean {
        return (getInputBridge().GetMouseButtons() & MOUSE_BACK) !== 0
    }

    get wasLeftPressed(): boolean {
        return (getInputBridge().GetMouseButtonsPressed() & MOUSE_LEFT) !== 0
    }

    get wasRightPressed(): boolean {
        return (getInputBridge().GetMouseButtonsPressed() & MOUSE_RIGHT) !== 0
    }

    get wasMiddlePressed(): boolean {
        return (getInputBridge().GetMouseButtonsPressed() & MOUSE_MIDDLE) !== 0
    }

    get wasLeftReleased(): boolean {
        return (getInputBridge().GetMouseButtonsReleased() & MOUSE_LEFT) !== 0
    }

    get wasRightReleased(): boolean {
        return (getInputBridge().GetMouseButtonsReleased() & MOUSE_RIGHT) !== 0
    }

    get wasMiddleReleased(): boolean {
        return (getInputBridge().GetMouseButtonsReleased() & MOUSE_MIDDLE) !== 0
    }
}

// Singleton mouse instance
export const mouse: Mouse = new MouseImpl()
