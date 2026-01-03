/**
 * Touch input implementation
 */

import type { Touch, TouchPhase, Vector2 } from "./types"

// Get InputBridge lazily to avoid issues during module load
function getInputBridge() {
    return (CS as any).OneJS.Input.InputBridge
}

// Phase mapping
const PHASE_MAP: TouchPhase[] = ["began", "moved", "stationary", "ended", "canceled"]

/**
 * Touch implementation
 */
class TouchImpl implements Touch {
    private readonly _index: number

    // Cached values
    private _fingerId: number = -1
    private readonly _position: Vector2 = { x: 0, y: 0 }
    private readonly _delta: Vector2 = { x: 0, y: 0 }
    private _phase: TouchPhase = "began"

    constructor(index: number) {
        this._index = index
        this._update()
    }

    private _update(): void {
        this._fingerId = getInputBridge().GetTouchFingerId(this._index)
        this._position.x = getInputBridge().GetTouchPositionX(this._index)
        this._position.y = getInputBridge().GetTouchPositionY(this._index)
        this._delta.x = getInputBridge().GetTouchDeltaX(this._index)
        this._delta.y = getInputBridge().GetTouchDeltaY(this._index)
        const phaseInt = getInputBridge().GetTouchPhase(this._index)
        this._phase = PHASE_MAP[phaseInt] ?? "began"
    }

    get fingerId(): number {
        return this._fingerId
    }

    get position(): Vector2 {
        return this._position
    }

    get delta(): Vector2 {
        return this._delta
    }

    get phase(): TouchPhase {
        return this._phase
    }
}

// Touch cache to reduce allocations
const _touchCache: TouchImpl[] = []

/**
 * Get all active touches
 */
export function getTouches(): readonly Touch[] {
    const count = getInputBridge().GetTouchCount()

    // Ensure cache has enough TouchImpl instances
    while (_touchCache.length < count) {
        _touchCache.push(new TouchImpl(_touchCache.length))
    }

    // Update existing instances
    for (let i = 0; i < count; i++) {
        // Force update by recreating (simpler than adding update method)
        _touchCache[i] = new TouchImpl(i)
    }

    return _touchCache.slice(0, count)
}

/**
 * Get number of active touches
 */
export function getTouchCount(): number {
    return getInputBridge().GetTouchCount()
}
