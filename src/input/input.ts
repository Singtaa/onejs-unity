/**
 * Main input module - provides unified access to all input devices
 */

import type {
    InputModule,
    Keyboard,
    Mouse,
    Gamepad,
    Touch,
    InputActions,
    ActionMapBuilder,
    ActionBuilder,
    CompositeBindingBuilder,
    InputAction,
    InputActionMap,
    ActionPhase,
    ActionCallback,
    ActionCallbackContext,
    Vector2,
} from "./types"

// Global declarations for QuickJS environment
declare const performance: { now(): number }
declare const console: { error(...args: unknown[]): void }

import { keyboard } from "./keyboard"
import { mouse } from "./mouse"
import { getGamepad, getGamepads, getGamepadCount, pauseHaptics, resumeHaptics } from "./gamepad"
import { getTouches, getTouchCount } from "./touch"

// Get InputBridge lazily to avoid issues during module load
function getInputBridge() {
    return (CS as any).OneJS.Input.InputBridge
}

// Phase mapping
const PHASE_MAP: ActionPhase[] = ["disabled", "waiting", "started", "performed", "canceled"]

// ============ InputAction Implementation ============

class InputActionImpl implements InputAction {
    readonly name: string
    private readonly _handle: number
    private readonly _callbacks: Map<string, Set<ActionCallback>> = new Map()

    // Cached vector for value reading
    private readonly _vec2Cache: Vector2 = { x: 0, y: 0 }

    constructor(name: string, handle: number) {
        this.name = name
        this._handle = handle
    }

    get triggered(): boolean {
        return getInputBridge().GetActionTriggered(this._handle)
    }

    get isPressed(): boolean {
        return getInputBridge().GetActionPressed(this._handle)
    }

    get phase(): ActionPhase {
        const phaseInt = getInputBridge().GetActionPhase(this._handle)
        return PHASE_MAP[phaseInt] ?? "disabled"
    }

    value<T extends number | Vector2>(): T {
        // Try to determine type from context (simplified - assume Vector2 for now if not number)
        // In practice, user knows the type based on the action definition
        const x = getInputBridge().GetActionValueVector2X(this._handle)
        const y = getInputBridge().GetActionValueVector2Y(this._handle)

        // If y is 0 and this looks like a 1D value, return as number
        if (y === 0) {
            const floatVal = getInputBridge().GetActionValueFloat(this._handle)
            if (Math.abs(floatVal - x) < 0.0001) {
                return floatVal as T
            }
        }

        this._vec2Cache.x = x
        this._vec2Cache.y = y
        return this._vec2Cache as T
    }

    on(event: "started" | "performed" | "canceled", callback: ActionCallback): () => void {
        if (!this._callbacks.has(event)) {
            this._callbacks.set(event, new Set())
        }
        this._callbacks.get(event)!.add(callback)

        // Return unsubscribe function
        return () => {
            this._callbacks.get(event)?.delete(callback)
        }
    }

    off(): void {
        this._callbacks.clear()
    }

    // Internal: trigger callbacks (called from polling loop if needed)
    _triggerCallbacks(event: "started" | "performed" | "canceled"): void {
        const callbacks = this._callbacks.get(event)
        if (!callbacks) return

        const self = this
        const context: ActionCallbackContext = {
            time: performance.now() / 1000,
            phase: this.phase,
            readValue<T>(): T {
                return self.value() as T
            },
        }

        for (const cb of callbacks) {
            try {
                cb(context)
            } catch (e) {
                console.error(`[Input] Error in ${event} callback:`, e)
            }
        }
    }
}

// ============ InputActionMap Implementation ============

class InputActionMapImpl implements InputActionMap {
    readonly name: string
    private readonly _assetHandle: number
    private readonly _actions: Map<string, InputActionImpl> = new Map()

    constructor(name: string, assetHandle: number) {
        this.name = name
        this._assetHandle = assetHandle
    }

    enable(): void {
        getInputBridge().EnableActionMap(this._assetHandle, this.name)
    }

    disable(): void {
        getInputBridge().DisableActionMap(this._assetHandle, this.name)
    }

    action(name: string): InputAction {
        let action = this._actions.get(name)
        if (!action) {
            const handle = getInputBridge().FindAction(this._assetHandle, `${this.name}/${name}`)
            if (handle < 0) {
                throw new Error(`Action "${name}" not found in map "${this.name}"`)
            }
            action = new InputActionImpl(name, handle)
            this._actions.set(name, action)
        }
        return action
    }
}

// ============ InputActions Implementation ============

class InputActionsImpl implements InputActions {
    private readonly _handle: number
    private readonly _actions: Map<string, InputActionImpl> = new Map()
    private readonly _maps: Map<string, InputActionMapImpl> = new Map()

    constructor(handle: number) {
        this._handle = handle
    }

    action(path: string): InputAction {
        let action = this._actions.get(path)
        if (!action) {
            const handle = getInputBridge().FindAction(this._handle, path)
            if (handle < 0) {
                throw new Error(`Action "${path}" not found`)
            }
            action = new InputActionImpl(path, handle)
            this._actions.set(path, action)
        }
        return action
    }

    map(name: string): InputActionMap {
        let map = this._maps.get(name)
        if (!map) {
            map = new InputActionMapImpl(name, this._handle)
            this._maps.set(name, map)
        }
        return map
    }

    enable(): void {
        // Enable all maps - iterate known maps
        for (const map of this._maps.values()) {
            map.enable()
        }
    }

    disable(): void {
        for (const map of this._maps.values()) {
            map.disable()
        }
    }

    dispose(): void {
        getInputBridge().DisposeActionAsset(this._handle)
        this._actions.clear()
        this._maps.clear()
    }
}

// ============ Dynamic Action Builder ============

class CompositeBindingBuilderImpl implements CompositeBindingBuilder {
    private readonly _actionBuilder: ActionBuilderImpl
    private readonly _type: string
    private readonly _parts: Map<string, string> = new Map()

    constructor(actionBuilder: ActionBuilderImpl, type: string) {
        this._actionBuilder = actionBuilder
        this._type = type
    }

    up(path: string): CompositeBindingBuilder {
        this._parts.set("up", path)
        return this
    }

    down(path: string): CompositeBindingBuilder {
        this._parts.set("down", path)
        return this
    }

    left(path: string): CompositeBindingBuilder {
        this._parts.set("left", path)
        return this
    }

    right(path: string): CompositeBindingBuilder {
        this._parts.set("right", path)
        return this
    }

    positive(path: string): CompositeBindingBuilder {
        this._parts.set("positive", path)
        return this
    }

    negative(path: string): CompositeBindingBuilder {
        this._parts.set("negative", path)
        return this
    }

    done(): ActionBuilder {
        // Apply all bindings
        for (const [part, path] of this._parts) {
            // For now, add as individual bindings
            // Full composite support would require C# side changes
            getInputBridge().AddBinding(this._actionBuilder._getHandle(), path)
        }
        return this._actionBuilder
    }
}

class ActionBuilderImpl implements ActionBuilder {
    private readonly _mapBuilder: ActionMapBuilderImpl
    private readonly _name: string
    private _handle: number = -1

    constructor(mapBuilder: ActionMapBuilderImpl, name: string, isButton: boolean) {
        this._mapBuilder = mapBuilder
        this._name = name

        const mapHandle = mapBuilder._getHandle()
        if (isButton) {
            this._handle = getInputBridge().AddButtonAction(mapHandle, name)
        } else {
            this._handle = getInputBridge().AddValueAction(mapHandle, name)
        }
    }

    _getHandle(): number {
        return this._handle
    }

    bind(path: string): ActionBuilder {
        getInputBridge().AddBinding(this._handle, path)
        return this
    }

    bindComposite(type: "dpad" | "1daxis" | "2daxis"): CompositeBindingBuilder {
        return new CompositeBindingBuilderImpl(this, type)
    }

    done(): ActionMapBuilder {
        return this._mapBuilder
    }
}

class ActionMapBuilderImpl implements ActionMapBuilder {
    private readonly _name: string
    private _handle: number = -1
    private readonly _actions: Map<string, number> = new Map()

    constructor(name: string) {
        this._name = name
        this._handle = getInputBridge().CreateActionMap(name)
    }

    _getHandle(): number {
        return this._handle
    }

    button(name: string): ActionBuilder {
        return new ActionBuilderImpl(this, name, true)
    }

    axis(name: string): ActionBuilder {
        return new ActionBuilderImpl(this, name, false)
    }

    axis2D(name: string): ActionBuilder {
        return new ActionBuilderImpl(this, name, false)
    }

    build(): InputActions {
        // Enable the map
        getInputBridge().EnableDynamicMap(this._handle)

        // Create a wrapper that uses the dynamic map
        // For now, use the map handle as the "asset" handle since it's similar
        return new DynamicInputActionsImpl(this._handle, this._name)
    }
}

class DynamicInputActionsImpl implements InputActions {
    private readonly _mapHandle: number
    private readonly _mapName: string
    private readonly _actions: Map<string, InputActionImpl> = new Map()

    constructor(mapHandle: number, mapName: string) {
        this._mapHandle = mapHandle
        this._mapName = mapName
    }

    action(path: string): InputAction {
        // For dynamic actions, path is just the action name
        let action = this._actions.get(path)
        if (!action) {
            // Find action in the dynamic map
            // This requires looking up the action handle we stored during creation
            // For now, throw an error - need to track action handles properly
            throw new Error(`Dynamic action lookup not fully implemented: ${path}`)
        }
        return action
    }

    map(_name: string): InputActionMap {
        // Dynamic actions only have one map
        throw new Error("Dynamic actions only support a single map")
    }

    enable(): void {
        getInputBridge().EnableDynamicMap(this._mapHandle)
    }

    disable(): void {
        getInputBridge().DisableDynamicMap(this._mapHandle)
    }

    dispose(): void {
        getInputBridge().DisposeDynamicMap(this._mapHandle)
        this._actions.clear()
    }
}

// ============ Main Input Module ============

class InputModuleImpl implements InputModule {
    get keyboard(): Keyboard {
        return keyboard
    }

    get mouse(): Mouse {
        return mouse
    }

    get gamepad(): Gamepad | null {
        return getGamepad(0)
    }

    get gamepads(): readonly Gamepad[] {
        return getGamepads()
    }

    get gamepadCount(): number {
        return getGamepadCount()
    }

    get touches(): readonly Touch[] {
        return getTouches()
    }

    get touchCount(): number {
        return getTouchCount()
    }

    loadActions(asset: unknown): InputActions {
        const handle = getInputBridge().RegisterActionAsset(asset)
        if (handle < 0) {
            throw new Error("Failed to register InputActionAsset. Make sure it's a valid asset.")
        }
        return new InputActionsImpl(handle)
    }

    createActions(mapName: string): ActionMapBuilder {
        return new ActionMapBuilderImpl(mapName)
    }

    pauseHaptics(): void {
        pauseHaptics()
    }

    resumeHaptics(): void {
        resumeHaptics()
    }
}

// Singleton input module
export const input: InputModule = new InputModuleImpl()
