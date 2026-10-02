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
    KeyAxis2DConfig,
    ReaderKeyBinding,
} from "./types"
import { getInputBridge } from "./backend"
import { MOUSE_LEFT, MOUSE_RIGHT, MOUSE_MIDDLE, MOUSE_FORWARD, MOUSE_BACK } from "./mouse"
import { getButtonBit } from "./gamepad"


// ============ Zero-Alloc Invoker System ============

// Native zero-alloc invoke functions (registered by quickjs_unity.c)
declare const __zaInvoke0: (bindingId: number) => unknown
declare const __zaInvoke1: (bindingId: number, a0: unknown) => unknown
declare const __zaInvoke2: (bindingId: number, a0: unknown, a1: unknown) => unknown

// Cached binding IDs: for resolving key/button names to IDs at build time
let _bindingIds: {
    getKeyId: number
    getGamepadButtonId: number
} | null = null

// Cached invokers: created once on first use
let _invokers: {
    // Keyboard: ID-based (zero-alloc hot path)
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
    // Gamepad: ID-based (zero-alloc hot path)
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
        // Keyboard: ID-based (1 arg: keyId)
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

        // Gamepad: ID-based (2 args: index, buttonId)
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

/**
 * Resolve a key binding (single key or array) to an array of key IDs.
 */
function resolveKeyBinding(binding: ReaderKeyBinding): number[] {
    if (typeof binding === "string") {
        return [resolveKeyId(binding)]
    }
    return binding.map(resolveKeyId)
}

/**
 * Check if any key in an array of key IDs is down.
 */
function isAnyKeyDown(keyIds: number[], inv: typeof _invokers): boolean {
    // An index loop: for...of would create an iterator every frame
    for (let i = 0; i < keyIds.length; i++) {
        if (inv!.getKeyDownById(keyIds[i])) return true
    }
    return false
}

// ============ Bindings ============

/**
 * The read a binding answers to. Reading it any other way throws, because a
 * mismatched read used to return a plausible value: `pressed()` on a held
 * mouse button was true every frame it was held.
 */
type Read = "down" | "pressed" | "released" | "float" | "vec2"

type Source =
    | "key" | "keyAxis" | "keyAxis2D"
    | "mouseButton" | "mouseFloat" | "mouseVec2"
    | "gamepadButton" | "gamepadFloat" | "gamepadVec2"

interface Binding {
    readonly name: string
    readonly read: Read
    /** The builder method that made it, for error messages */
    readonly builder: string
    readonly source: Source
    bool: boolean
    num: number
    /** Allocated once for a vec2 binding and updated in place */
    readonly vec?: Vector2

    // What it reads, resolved at build time so tick() passes only numbers
    keyId?: number
    negativeKeyId?: number
    positiveKeyId?: number
    upKeyIds?: number[]
    downKeyIds?: number[]
    leftKeyIds?: number[]
    rightKeyIds?: number[]
    mouseBit?: number
    mouseProperty?: MouseFloatProperty | MouseVec2Property
    gamepadIndex?: number
    gamepadButtonId?: number
    gamepadBit?: number
    gamepadProperty?: GamepadFloatProperty | GamepadVec2Property
}

const MOUSE_BITS: Record<MouseButtonType, number> = {
    left: MOUSE_LEFT,
    right: MOUSE_RIGHT,
    middle: MOUSE_MIDDLE,
    forward: MOUSE_FORWARD,
    back: MOUSE_BACK,
}

const EDGE_BUILDERS: Partial<Record<Source, string>> = {
    key: "key",
    mouseButton: "mouseButton",
    gamepadButton: "gamepadButton",
}

const PREFIX = "[onejs-unity/input]"

// ============ InputReader Implementation ============

class InputReaderImpl implements InputReader {
    // An array for tick(), which walks it every frame without an iterator,
    // and a map for the reads, which look one name up
    private _bindings: Binding[]
    private readonly _byName: Map<string, Binding>
    private _disposed = false

    // Which shared masks tick() needs, so it reads each at most once a frame
    private readonly _mouseHeld: boolean
    private readonly _mousePressed: boolean
    private readonly _mouseReleased: boolean
    private readonly _gamepadEdges: boolean

    constructor(bindings: Binding[]) {
        // Initialize zero-alloc invokers on first reader creation
        initZeroAllocInvokers()

        this._bindings = bindings
        this._byName = new Map(bindings.map(b => [b.name, b]))
        const mouse = (read: Read) => bindings.some(b => b.source === "mouseButton" && b.read === read)
        this._mouseHeld = mouse("down")
        this._mousePressed = mouse("pressed")
        this._mouseReleased = mouse("released")
        this._gamepadEdges = bindings.some(b => b.source === "gamepadButton" && b.read !== "down")
    }

    tick(): void {
        // Use zero-alloc invokers with integer IDs (no string marshaling!)
        const inv = _invokers!

        // Mouse button edges and gamepad button edges have no zero alloc
        // invoker yet, so they cross through the bridge: once a frame for
        // the mouse, once per edge binding for a gamepad
        const bridge = this._mousePressed || this._mouseReleased || this._gamepadEdges ? getInputBridge() : null
        const mouseHeld = this._mouseHeld ? inv.getMouseButtons() : 0
        const mousePressed = this._mousePressed ? bridge.GetMouseButtonsPressed() as number : 0
        const mouseReleased = this._mouseReleased ? bridge.GetMouseButtonsReleased() as number : 0

        const bindings = this._bindings
        for (let i = 0; i < bindings.length; i++) {
            const b = bindings[i]
            switch (b.source) {
                case "key":
                    b.bool = b.read === "down" ? inv.getKeyDownById(b.keyId!)
                        : b.read === "pressed" ? inv.getKeyPressedById(b.keyId!)
                        : inv.getKeyReleasedById(b.keyId!)
                    break
                case "keyAxis": {
                    let value = 0
                    if (inv.getKeyDownById(b.positiveKeyId!)) value += 1
                    if (inv.getKeyDownById(b.negativeKeyId!)) value -= 1
                    b.num = value
                    break
                }
                case "keyAxis2D": {
                    let x = 0, y = 0
                    if (isAnyKeyDown(b.rightKeyIds!, inv)) x += 1
                    if (isAnyKeyDown(b.leftKeyIds!, inv)) x -= 1
                    if (isAnyKeyDown(b.upKeyIds!, inv)) y += 1
                    if (isAnyKeyDown(b.downKeyIds!, inv)) y -= 1
                    b.vec!.x = x
                    b.vec!.y = y
                    break
                }
                case "mouseButton": {
                    const mask = b.read === "down" ? mouseHeld : b.read === "pressed" ? mousePressed : mouseReleased
                    b.bool = (mask & b.mouseBit!) !== 0
                    break
                }
                case "mouseFloat":
                    switch (b.mouseProperty) {
                        case "scrollX": b.num = inv.getScrollX(); break
                        case "scrollY": b.num = inv.getScrollY(); break
                        case "positionX": b.num = inv.getMousePositionX(); break
                        case "positionY": b.num = inv.getMousePositionY(); break
                        case "deltaX": b.num = inv.getMouseDeltaX(); break
                        case "deltaY": b.num = inv.getMouseDeltaY(); break
                    }
                    break
                case "mouseVec2":
                    switch (b.mouseProperty) {
                        case "position":
                            b.vec!.x = inv.getMousePositionX()
                            b.vec!.y = inv.getMousePositionY()
                            break
                        case "delta":
                            b.vec!.x = inv.getMouseDeltaX()
                            b.vec!.y = inv.getMouseDeltaY()
                            break
                        case "scroll":
                            b.vec!.x = inv.getScrollX()
                            b.vec!.y = inv.getScrollY()
                            break
                    }
                    break
                case "gamepadButton": {
                    const idx = b.gamepadIndex!
                    if (b.read === "down") {
                        b.bool = inv.getGamepadButtonDownById(idx, b.gamepadButtonId!)
                    } else {
                        const mask: number = b.read === "pressed"
                            ? bridge.GetGamepadButtonsPressed(idx)
                            : bridge.GetGamepadButtonsReleased(idx)
                        b.bool = (mask & b.gamepadBit!) !== 0
                    }
                    break
                }
                case "gamepadFloat": {
                    const idx = b.gamepadIndex!
                    switch (b.gamepadProperty) {
                        case "leftTrigger": b.num = inv.getLeftTrigger(idx); break
                        case "rightTrigger": b.num = inv.getRightTrigger(idx); break
                        case "leftStickX": b.num = inv.getLeftStickX(idx); break
                        case "leftStickY": b.num = inv.getLeftStickY(idx); break
                        case "rightStickX": b.num = inv.getRightStickX(idx); break
                        case "rightStickY": b.num = inv.getRightStickY(idx); break
                    }
                    break
                }
                case "gamepadVec2": {
                    const idx = b.gamepadIndex!
                    switch (b.gamepadProperty) {
                        case "leftStick":
                            b.vec!.x = inv.getLeftStickX(idx)
                            b.vec!.y = inv.getLeftStickY(idx)
                            break
                        case "rightStick":
                            b.vec!.x = inv.getRightStickX(idx)
                            b.vec!.y = inv.getRightStickY(idx)
                            break
                    }
                    break
                }
            }
        }
    }

    down(name: string): boolean {
        return this._binding(name, "down").bool
    }

    pressed(name: string): boolean {
        return this._binding(name, "pressed").bool
    }

    released(name: string): boolean {
        return this._binding(name, "released").bool
    }

    float(name: string): number {
        return this._binding(name, "float").num
    }

    vec2(name: string): Vector2 {
        return this._binding(name, "vec2").vec!  // the SAME object every frame
    }

    dispose(): void {
        this._disposed = true
        this._bindings = []
        this._byName.clear()
    }

    private _binding(name: string, read: Read): Binding {
        const b = this._byName.get(name)
        if (b !== undefined && b.read === read) return b
        throw new Error(this._misread(name, read, b))
    }

    private _misread(name: string, read: Read, b: Binding | undefined): string {
        const call = `reader.${read}("${name}")`
        if (this._disposed) return `${PREFIX} ${call}: this reader was disposed.`
        if (b === undefined) {
            const bound = [...this._byName.keys()]
            return bound.length > 0
                ? `${PREFIX} ${call}: no binding named "${name}". Bound: ${bound.join(", ")}.`
                : `${PREFIX} ${call}: this reader has no bindings.`
        }
        let message = `${PREFIX} ${call} does not fit "${name}", which is bound with ${b.builder}(): `
            + `read it with reader.${b.read}("${name}")`
        const base = EDGE_BUILDERS[b.source]
        if (base !== undefined && b.read === "down" && (read === "pressed" || read === "released")) {
            const edge = read === "pressed" ? "Pressed" : "Released"
            message += `, or bind it with ${base}${edge}() for the frame it is ${read}`
        }
        return message + "."
    }
}

// ============ InputReaderBuilder Implementation ============

class InputReaderBuilderImpl implements InputReaderBuilder {
    private readonly _bindings: Binding[] = []

    private _add(binding: Omit<Binding, "bool" | "num">): InputReaderBuilder {
        const existing = this._bindings.find(b => b.name === binding.name)
        if (existing !== undefined) {
            throw new Error(`${PREFIX} ${binding.builder}("${binding.name}", ...): "${binding.name}" is already bound `
                + `with ${existing.builder}(). Each name is bound once: give this binding its own name.`)
        }
        this._bindings.push({ ...binding, bool: false, num: 0 })
        return this
    }

    // Resolving names to IDs here allocates once, at build time, not per frame
    key(name: string, key: string): InputReaderBuilder {
        return this._add({ name, read: "down", builder: "key", source: "key", keyId: resolveKeyId(key) })
    }

    keyPressed(name: string, key: string): InputReaderBuilder {
        return this._add({ name, read: "pressed", builder: "keyPressed", source: "key", keyId: resolveKeyId(key) })
    }

    keyReleased(name: string, key: string): InputReaderBuilder {
        return this._add({ name, read: "released", builder: "keyReleased", source: "key", keyId: resolveKeyId(key) })
    }

    keyAxis(name: string, config: { negative: string; positive: string }): InputReaderBuilder {
        return this._add({
            name, read: "float", builder: "keyAxis", source: "keyAxis",
            negativeKeyId: resolveKeyId(config.negative),
            positiveKeyId: resolveKeyId(config.positive),
        })
    }

    keyAxis2D(name: string, config: KeyAxis2DConfig): InputReaderBuilder {
        return this._add({
            name, read: "vec2", builder: "keyAxis2D", source: "keyAxis2D", vec: { x: 0, y: 0 },
            upKeyIds: resolveKeyBinding(config.up),
            downKeyIds: resolveKeyBinding(config.down),
            leftKeyIds: resolveKeyBinding(config.left),
            rightKeyIds: resolveKeyBinding(config.right),
        })
    }

    mouseButton(name: string, button: MouseButtonType): InputReaderBuilder {
        return this._mouseButton(name, button, "down", "mouseButton")
    }

    mouseButtonPressed(name: string, button: MouseButtonType): InputReaderBuilder {
        return this._mouseButton(name, button, "pressed", "mouseButtonPressed")
    }

    mouseButtonReleased(name: string, button: MouseButtonType): InputReaderBuilder {
        return this._mouseButton(name, button, "released", "mouseButtonReleased")
    }

    private _mouseButton(name: string, button: MouseButtonType, read: Read, builder: string): InputReaderBuilder {
        const mouseBit = MOUSE_BITS[button]
        if (mouseBit === undefined) {
            throw new Error(`${PREFIX} ${builder}("${name}", "${button}"): unknown mouse button "${button}". `
                + `Use ${Object.keys(MOUSE_BITS).join(", ")}.`)
        }
        return this._add({ name, read, builder, source: "mouseButton", mouseBit })
    }

    mouseVec2(name: string, property: MouseVec2Property): InputReaderBuilder {
        return this._add({ name, read: "vec2", builder: "mouseVec2", source: "mouseVec2", vec: { x: 0, y: 0 }, mouseProperty: property })
    }

    mouseFloat(name: string, property: MouseFloatProperty): InputReaderBuilder {
        return this._add({ name, read: "float", builder: "mouseFloat", source: "mouseFloat", mouseProperty: property })
    }

    gamepadButton(name: string, button: string, index: number = 0): InputReaderBuilder {
        return this._add({
            name, read: "down", builder: "gamepadButton", source: "gamepadButton",
            gamepadIndex: index, gamepadButtonId: resolveGamepadButtonId(button),
        })
    }

    gamepadButtonPressed(name: string, button: string, index: number = 0): InputReaderBuilder {
        return this._gamepadEdge(name, button, index, "pressed", "gamepadButtonPressed")
    }

    gamepadButtonReleased(name: string, button: string, index: number = 0): InputReaderBuilder {
        return this._gamepadEdge(name, button, index, "released", "gamepadButtonReleased")
    }

    private _gamepadEdge(name: string, button: string, index: number, read: Read, builder: string): InputReaderBuilder {
        const gamepadBit = getButtonBit(button)
        if (gamepadBit === 0) {
            throw new Error(`${PREFIX} ${builder}("${name}", "${button}"): unknown gamepad button "${button}". `
                + `Use a name such as South, East, West, North, LeftShoulder, RightShoulder, Start, Select or DpadUp.`)
        }
        return this._add({ name, read, builder, source: "gamepadButton", gamepadIndex: index, gamepadBit })
    }

    gamepadVec2(name: string, property: GamepadVec2Property, index: number = 0): InputReaderBuilder {
        return this._add({
            name, read: "vec2", builder: "gamepadVec2", source: "gamepadVec2", vec: { x: 0, y: 0 },
            gamepadProperty: property, gamepadIndex: index,
        })
    }

    gamepadFloat(name: string, property: GamepadFloatProperty, index: number = 0): InputReaderBuilder {
        return this._add({
            name, read: "float", builder: "gamepadFloat", source: "gamepadFloat",
            gamepadProperty: property, gamepadIndex: index,
        })
    }

    build(): InputReader {
        return new InputReaderImpl([...this._bindings])
    }
}

// ============ Factory Function ============

export function createReader(): InputReaderBuilder {
    return new InputReaderBuilderImpl()
}
