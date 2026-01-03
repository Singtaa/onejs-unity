/**
 * Zero-allocation input reader implementation.
 * Pre-allocates all state objects and reuses them each frame.
 * Uses __zaInvokeN for zero GC allocation on C# calls.
 */

import type {
    InputReader,
    InputReaderBuilder,
    MouseVec2Property,
    MouseFloatProperty,
    MouseButtonType,
    GamepadVec2Property,
    GamepadFloatProperty,
    Vector2,
} from "./types"

// Get InputBridge lazily to avoid issues during module load
function getInputBridge() {
    return (CS as any).OneJS.Input.InputBridge
}

// ============ Zero-Alloc Invoker System ============

// Native zero-alloc invoke functions (registered by quickjs_unity.c)
declare const __zaInvoke0: (bindingId: number) => unknown
declare const __zaInvoke1: (bindingId: number, a0: unknown) => unknown
declare const __zaInvoke2: (bindingId: number, a0: unknown, a1: unknown) => unknown

// Cached binding IDs - for resolving key/button names to IDs at build time
let _bindingIds: {
    getKeyId: number
    getGamepadButtonId: number
} | null = null

// Cached invokers - created once on first use
let _invokers: {
    // Keyboard - ID-based (zero-alloc hot path)
    getKeyDownById: (keyId: number) => boolean
    getKeyPressedById: (keyId: number) => boolean
    getKeyReleasedById: (keyId: number) => boolean
    // Mouse
    getMouseButtons: () => number
    getMousePositionX: () => number
    getMousePositionY: () => number
    getMouseDeltaX: () => number
    getMouseDeltaY: () => number
    getScrollX: () => number
    getScrollY: () => number
    // Gamepad - ID-based (zero-alloc hot path)
    getGamepadButtonDownById: (index: number, buttonId: number) => boolean
    getLeftStickX: (index: number) => number
    getLeftStickY: (index: number) => number
    getRightStickX: (index: number) => number
    getRightStickY: (index: number) => number
    getLeftTrigger: (index: number) => number
    getRightTrigger: (index: number) => number
} | null = null

/**
 * Initialize zero-alloc invokers. Called once on first InputReader creation.
 */
function initZeroAllocInvokers(): void {
    if (_invokers) return

    // Get binding IDs from C#
    const ids = getInputBridge().GetZeroAllocBindingIds()

    // Store binding IDs for resolving names to IDs at build time
    _bindingIds = {
        getKeyId: ids.getKeyId,
        getGamepadButtonId: ids.getGamepadButtonId,
    }

    // Create invokers using the native __zaInvokeN functions
    // All hot-path methods use integer IDs instead of strings
    _invokers = {
        // Keyboard - ID-based (1 arg: keyId)
        getKeyDownById: (keyId) => __zaInvoke1(ids.getKeyDownById, keyId) as boolean,
        getKeyPressedById: (keyId) => __zaInvoke1(ids.getKeyPressedById, keyId) as boolean,
        getKeyReleasedById: (keyId) => __zaInvoke1(ids.getKeyReleasedById, keyId) as boolean,

        // Mouse (0 args)
        getMouseButtons: () => __zaInvoke0(ids.getMouseButtons) as number,
        getMousePositionX: () => __zaInvoke0(ids.getMousePositionX) as number,
        getMousePositionY: () => __zaInvoke0(ids.getMousePositionY) as number,
        getMouseDeltaX: () => __zaInvoke0(ids.getMouseDeltaX) as number,
        getMouseDeltaY: () => __zaInvoke0(ids.getMouseDeltaY) as number,
        getScrollX: () => __zaInvoke0(ids.getScrollX) as number,
        getScrollY: () => __zaInvoke0(ids.getScrollY) as number,

        // Gamepad - ID-based (2 args: index, buttonId)
        getGamepadButtonDownById: (index, buttonId) => __zaInvoke2(ids.getGamepadButtonDownById, index, buttonId) as boolean,
        getLeftStickX: (index) => __zaInvoke1(ids.getLeftStickX, index) as number,
        getLeftStickY: (index) => __zaInvoke1(ids.getLeftStickY, index) as number,
        getRightStickX: (index) => __zaInvoke1(ids.getRightStickX, index) as number,
        getRightStickY: (index) => __zaInvoke1(ids.getRightStickY, index) as number,
        getLeftTrigger: (index) => __zaInvoke1(ids.getLeftTrigger, index) as number,
        getRightTrigger: (index) => __zaInvoke1(ids.getRightTrigger, index) as number,
    }
}

/**
 * Resolve a key name to its integer ID. Called once at build time.
 */
function resolveKeyId(keyName: string): number {
    if (!_bindingIds) {
        initZeroAllocInvokers()
    }
    return __zaInvoke1(_bindingIds!.getKeyId, keyName) as number
}

/**
 * Resolve a gamepad button name to its integer ID. Called once at build time.
 */
function resolveGamepadButtonId(buttonName: string): number {
    if (!_bindingIds) {
        initZeroAllocInvokers()
    }
    return __zaInvoke1(_bindingIds!.getGamepadButtonId, buttonName) as number
}

// ============ Binding Types ============

type BoolBindingType = "keyDown" | "keyPressed" | "keyReleased" | "mouseButton" | "gamepadButton"
type FloatBindingType = "keyAxis" | "mouseFloat" | "gamepadFloat"
type Vec2BindingType = "mouseVec2" | "gamepadVec2"

interface BoolBinding {
    type: BoolBindingType
    value: boolean
    // Key bindings - use integer ID for zero-alloc
    keyId?: number
    // Mouse button
    button?: MouseButtonType
    // Gamepad - use integer ID for zero-alloc
    gamepadButtonId?: number
    gamepadIndex?: number
}

interface FloatBinding {
    type: FloatBindingType
    value: number
    // Key axis - use integer IDs for zero-alloc
    negativeKeyId?: number
    positiveKeyId?: number
    // Mouse float
    mouseProperty?: MouseFloatProperty
    // Gamepad float
    gamepadProperty?: GamepadFloatProperty
    gamepadIndex?: number
}

interface Vec2Binding {
    type: Vec2BindingType
    value: Vector2  // Pre-allocated, updated in place
    // Mouse vec2
    mouseProperty?: MouseVec2Property
    // Gamepad vec2
    gamepadProperty?: GamepadVec2Property
    gamepadIndex?: number
}

// ============ InputReader Implementation ============

class InputReaderImpl implements InputReader {
    private readonly _boolBindings: Map<string, BoolBinding> = new Map()
    private readonly _floatBindings: Map<string, FloatBinding> = new Map()
    private readonly _vec2Bindings: Map<string, Vec2Binding> = new Map()

    constructor(
        boolBindings: Map<string, BoolBinding>,
        floatBindings: Map<string, FloatBinding>,
        vec2Bindings: Map<string, Vec2Binding>
    ) {
        // Initialize zero-alloc invokers on first reader creation
        initZeroAllocInvokers()

        this._boolBindings = boolBindings
        this._floatBindings = floatBindings
        this._vec2Bindings = vec2Bindings
    }

    tick(): void {
        // Use zero-alloc invokers with integer IDs (no string marshaling!)
        const inv = _invokers!

        // Update bool bindings
        for (const binding of this._boolBindings.values()) {
            switch (binding.type) {
                case "keyDown":
                    binding.value = inv.getKeyDownById(binding.keyId!)
                    break
                case "keyPressed":
                    binding.value = inv.getKeyPressedById(binding.keyId!)
                    break
                case "keyReleased":
                    binding.value = inv.getKeyReleasedById(binding.keyId!)
                    break
                case "mouseButton": {
                    const buttons = inv.getMouseButtons()
                    switch (binding.button) {
                        case "left": binding.value = (buttons & 1) !== 0; break
                        case "right": binding.value = (buttons & 2) !== 0; break
                        case "middle": binding.value = (buttons & 4) !== 0; break
                        case "forward": binding.value = (buttons & 8) !== 0; break
                        case "back": binding.value = (buttons & 16) !== 0; break
                    }
                    break
                }
                case "gamepadButton":
                    binding.value = inv.getGamepadButtonDownById(
                        binding.gamepadIndex ?? 0,
                        binding.gamepadButtonId!
                    )
                    break
            }
        }

        // Update float bindings
        for (const binding of this._floatBindings.values()) {
            switch (binding.type) {
                case "keyAxis": {
                    let value = 0
                    if (inv.getKeyDownById(binding.positiveKeyId!)) value += 1
                    if (inv.getKeyDownById(binding.negativeKeyId!)) value -= 1
                    binding.value = value
                    break
                }
                case "mouseFloat": {
                    switch (binding.mouseProperty) {
                        case "scrollX": binding.value = inv.getScrollX(); break
                        case "scrollY": binding.value = inv.getScrollY(); break
                        case "positionX": binding.value = inv.getMousePositionX(); break
                        case "positionY": binding.value = inv.getMousePositionY(); break
                        case "deltaX": binding.value = inv.getMouseDeltaX(); break
                        case "deltaY": binding.value = inv.getMouseDeltaY(); break
                    }
                    break
                }
                case "gamepadFloat": {
                    const idx = binding.gamepadIndex ?? 0
                    switch (binding.gamepadProperty) {
                        case "leftTrigger": binding.value = inv.getLeftTrigger(idx); break
                        case "rightTrigger": binding.value = inv.getRightTrigger(idx); break
                        case "leftStickX": binding.value = inv.getLeftStickX(idx); break
                        case "leftStickY": binding.value = inv.getLeftStickY(idx); break
                        case "rightStickX": binding.value = inv.getRightStickX(idx); break
                        case "rightStickY": binding.value = inv.getRightStickY(idx); break
                    }
                    break
                }
            }
        }

        // Update vec2 bindings (update in place - no allocation!)
        for (const binding of this._vec2Bindings.values()) {
            switch (binding.type) {
                case "mouseVec2": {
                    switch (binding.mouseProperty) {
                        case "position":
                            binding.value.x = inv.getMousePositionX()
                            binding.value.y = inv.getMousePositionY()
                            break
                        case "delta":
                            binding.value.x = inv.getMouseDeltaX()
                            binding.value.y = inv.getMouseDeltaY()
                            break
                        case "scroll":
                            binding.value.x = inv.getScrollX()
                            binding.value.y = inv.getScrollY()
                            break
                    }
                    break
                }
                case "gamepadVec2": {
                    const idx = binding.gamepadIndex ?? 0
                    switch (binding.gamepadProperty) {
                        case "leftStick":
                            binding.value.x = inv.getLeftStickX(idx)
                            binding.value.y = inv.getLeftStickY(idx)
                            break
                        case "rightStick":
                            binding.value.x = inv.getRightStickX(idx)
                            binding.value.y = inv.getRightStickY(idx)
                            break
                    }
                    break
                }
            }
        }
    }

    down(name: string): boolean {
        return this._boolBindings.get(name)?.value ?? false
    }

    pressed(name: string): boolean {
        return this._boolBindings.get(name)?.value ?? false
    }

    released(name: string): boolean {
        return this._boolBindings.get(name)?.value ?? false
    }

    float(name: string): number {
        return this._floatBindings.get(name)?.value ?? 0
    }

    vec2(name: string): Vector2 {
        const binding = this._vec2Bindings.get(name)
        if (!binding) {
            // Return a dummy object - shouldn't happen if used correctly
            return { x: 0, y: 0 }
        }
        return binding.value  // Returns the SAME object each time!
    }

    dispose(): void {
        this._boolBindings.clear()
        this._floatBindings.clear()
        this._vec2Bindings.clear()
    }
}

// ============ InputReaderBuilder Implementation ============

class InputReaderBuilderImpl implements InputReaderBuilder {
    private readonly _boolBindings: Map<string, BoolBinding> = new Map()
    private readonly _floatBindings: Map<string, FloatBinding> = new Map()
    private readonly _vec2Bindings: Map<string, Vec2Binding> = new Map()

    key(name: string, key: string): InputReaderBuilder {
        // Resolve key name to ID at build time (allocates once, not per-frame)
        this._boolBindings.set(name, {
            type: "keyDown",
            value: false,
            keyId: resolveKeyId(key),
        })
        return this
    }

    keyPressed(name: string, key: string): InputReaderBuilder {
        this._boolBindings.set(name, {
            type: "keyPressed",
            value: false,
            keyId: resolveKeyId(key),
        })
        return this
    }

    keyReleased(name: string, key: string): InputReaderBuilder {
        this._boolBindings.set(name, {
            type: "keyReleased",
            value: false,
            keyId: resolveKeyId(key),
        })
        return this
    }

    keyAxis(name: string, config: { negative: string; positive: string }): InputReaderBuilder {
        this._floatBindings.set(name, {
            type: "keyAxis",
            value: 0,
            negativeKeyId: resolveKeyId(config.negative),
            positiveKeyId: resolveKeyId(config.positive),
        })
        return this
    }

    mouseButton(name: string, button: MouseButtonType): InputReaderBuilder {
        this._boolBindings.set(name, {
            type: "mouseButton",
            value: false,
            button,
        })
        return this
    }

    mouseVec2(name: string, property: MouseVec2Property): InputReaderBuilder {
        this._vec2Bindings.set(name, {
            type: "mouseVec2",
            value: { x: 0, y: 0 },  // Pre-allocated!
            mouseProperty: property,
        })
        return this
    }

    mouseFloat(name: string, property: MouseFloatProperty): InputReaderBuilder {
        this._floatBindings.set(name, {
            type: "mouseFloat",
            value: 0,
            mouseProperty: property,
        })
        return this
    }

    gamepadButton(name: string, button: string, index: number = 0): InputReaderBuilder {
        // Resolve button name to ID at build time (allocates once, not per-frame)
        this._boolBindings.set(name, {
            type: "gamepadButton",
            value: false,
            gamepadButtonId: resolveGamepadButtonId(button),
            gamepadIndex: index,
        })
        return this
    }

    gamepadVec2(name: string, property: GamepadVec2Property, index: number = 0): InputReaderBuilder {
        this._vec2Bindings.set(name, {
            type: "gamepadVec2",
            value: { x: 0, y: 0 },  // Pre-allocated!
            gamepadProperty: property,
            gamepadIndex: index,
        })
        return this
    }

    gamepadFloat(name: string, property: GamepadFloatProperty, index: number = 0): InputReaderBuilder {
        this._floatBindings.set(name, {
            type: "gamepadFloat",
            value: 0,
            gamepadProperty: property,
            gamepadIndex: index,
        })
        return this
    }

    build(): InputReader {
        return new InputReaderImpl(
            this._boolBindings,
            this._floatBindings,
            this._vec2Bindings
        )
    }
}

// ============ Factory Function ============

export function createReader(): InputReaderBuilder {
    return new InputReaderBuilderImpl()
}
