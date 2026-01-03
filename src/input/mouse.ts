/**
 * Mouse input implementation
 */

import type { Mouse, Vector2 } from "./types"

// Get InputBridge lazily to avoid issues during module load
function getInputBridge() {
    return (CS as any).OneJS.Input.InputBridge
}

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
        return (getInputBridge().GetMouseButtons() & 1) !== 0
    }

    get rightButton(): boolean {
        return (getInputBridge().GetMouseButtons() & 2) !== 0
    }

    get middleButton(): boolean {
        return (getInputBridge().GetMouseButtons() & 4) !== 0
    }

    get forwardButton(): boolean {
        return (getInputBridge().GetMouseButtons() & 8) !== 0
    }

    get backButton(): boolean {
        return (getInputBridge().GetMouseButtons() & 16) !== 0
    }

    get wasLeftPressed(): boolean {
        return (getInputBridge().GetMouseButtonsPressed() & 1) !== 0
    }

    get wasRightPressed(): boolean {
        return (getInputBridge().GetMouseButtonsPressed() & 2) !== 0
    }

    get wasMiddlePressed(): boolean {
        return (getInputBridge().GetMouseButtonsPressed() & 4) !== 0
    }

    get wasLeftReleased(): boolean {
        return (getInputBridge().GetMouseButtonsReleased() & 1) !== 0
    }

    get wasRightReleased(): boolean {
        return (getInputBridge().GetMouseButtonsReleased() & 2) !== 0
    }

    get wasMiddleReleased(): boolean {
        return (getInputBridge().GetMouseButtonsReleased() & 4) !== 0
    }
}

// Singleton mouse instance
export const mouse: Mouse = new MouseImpl()
