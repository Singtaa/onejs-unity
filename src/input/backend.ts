/**
 * The seam between the input API and whatever actually supplies input.
 *
 * By default every device module reads UnityEngine's InputBridge through CS.
 * That is correct for a normal OneJS project and impossible anywhere CS is not
 * reachable: OneJS Play evaluates game bundles with the runtime's globals
 * shadowed, so `CS.OneJS.Input.InputBridge` is undefined there.
 *
 * Rather than a second input API for those hosts, the bridge lookup goes
 * through here and a host can install its own backend. Game code keeps calling
 * `input.keyboard.wasKeyPressed("Space")` and reads identically in both worlds,
 * which is the point: one API, one implementation, a swappable source.
 *
 *     import { setInputBackend, createInputBackend } from "onejs-unity/input"
 *
 *     setInputBackend(createInputBackend({
 *         GetKeyDown: (key) => held.has(key),
 *         GetKeyPressed: (key) => pressedThisFrame.has(key),
 *     }, "OneJS Play container"))
 *
 * getInputBridge keeps returning `any`, exactly as the per-module copies it
 * replaces did, so none of the call sites change shape and the default path
 * behaves as it always has.
 */

/**
 * Device methods a replacement backend is expected to provide.
 *
 * The InputActions surface (action maps, bindings, readers) is deliberately not
 * listed: it is a much larger contract, and a backend that omits it gets a
 * clear error rather than a wrong answer. See createInputBackend.
 */
export interface InputBackendMethods {
    // keyboard
    GetKeyDown(key: string): boolean
    GetKeyPressed(key: string): boolean
    GetKeyReleased(key: string): boolean
    GetAnyKeyDown(): boolean
    GetAnyKeyPressed(): boolean
    GetModifiers(): number

    // mouse
    GetMousePositionX(): number
    GetMousePositionY(): number
    GetMouseDeltaX(): number
    GetMouseDeltaY(): number
    GetScrollX(): number
    GetScrollY(): number
    GetMouseButtons(): number
    GetMouseButtonsPressed(): number
    GetMouseButtonsReleased(): number

    // gamepad
    GetGamepadCount(): number
    IsGamepadConnected(index: number): boolean
    GetGamepadButtons(index: number): number
    GetGamepadButtonsPressed(index: number): number
    GetGamepadButtonsReleased(index: number): number
    GetLeftStickX(index: number): number
    GetLeftStickY(index: number): number
    GetRightStickX(index: number): number
    GetRightStickY(index: number): number
    GetLeftTrigger(index: number): number
    GetRightTrigger(index: number): number
    SetRumble(index: number, low: number, high: number, duration: number): void
    StopRumble(index: number): void
    PauseHaptics(index: number): void
    ResumeHaptics(index: number): void

    // touch
    GetTouchCount(): number
    GetTouchFingerId(index: number): number
    GetTouchPhase(index: number): number
    GetTouchPositionX(index: number): number
    GetTouchPositionY(index: number): number
    GetTouchDeltaX(index: number): number
    GetTouchDeltaY(index: number): number
}

/** Anything callable the input modules might reach for. */
export type InputBackend = Partial<InputBackendMethods> & Record<string, unknown>

let installed: InputBackend | null = null

/**
 * Installs a backend, or clears it with null to fall back to the CS bridge.
 * Call before any input is read.
 */
export function setInputBackend(backend: InputBackend | null): void {
    installed = backend
}

/** The backend currently in use, or null when reading the default CS bridge. */
export function getInputBackend(): InputBackend | null {
    return installed
}

/**
 * The bridge every device module calls.
 *
 * Deliberately typed `any`, matching the per-module copies it replaces, so the
 * default path is unchanged at all of its call sites.
 */
export function getInputBridge(): any {
    if (installed !== null) return installed
    return (CS as any).OneJS.Input.InputBridge
}

/**
 * Wraps a partial implementation so anything it does not provide throws with a
 * message naming the backend, instead of failing as "undefined is not a
 * function" somewhere inside a device module.
 *
 * A backend that wants a device to read as simply absent should implement it
 * rather than omit it: GetGamepadCount returning 0 makes input.gamepad null,
 * which is what a game expects when nothing is plugged in.
 */
export function createInputBackend(
    impl: Partial<InputBackendMethods>,
    label = "custom input backend",
): InputBackend {
    return new Proxy(impl as InputBackend, {
        get(target, prop) {
            if (prop in target) return (target as Record<string | symbol, unknown>)[prop]
            if (typeof prop !== "string") return undefined
            return () => {
                throw new Error(`[onejs-unity/input] ${prop} is not available in the ${label}`)
            }
        },
    })
}

// MARK: key names

/**
 * Aliases accepted for key names, lowercased.
 *
 * Mirrors the _keyNameMap built in InputBridge.cs, which is case-insensitive.
 * The two are a contract: change one and change the other. Canonical names are
 * the UnityEngine.InputSystem.Key enum names, which a backend stores.
 */
const KEY_ALIASES: Record<string, string> = {
    return: "Enter",
    esc: "Escape",
    left: "LeftArrow",
    right: "RightArrow",
    up: "UpArrow",
    down: "DownArrow",
    shift: "LeftShift",
    ctrl: "LeftCtrl",
    control: "LeftCtrl",
    alt: "LeftAlt",
    meta: "LeftMeta",
    command: "LeftMeta",
    windows: "LeftMeta",
}

/** Canonical Key enum names, lowercased, for the ones generated in a loop. */
const CANONICAL = new Map<string, string>()
for (let c = 0; c < 26; c++) {
    const letter = String.fromCharCode(65 + c)
    CANONICAL.set(letter.toLowerCase(), letter)
}
for (let d = 0; d <= 9; d++) {
    CANONICAL.set(String(d), `Digit${d}`)
    CANONICAL.set(`digit${d}`, `Digit${d}`)
    CANONICAL.set(`numpad${d}`, `Numpad${d}`)
}
for (let f = 1; f <= 12; f++) CANONICAL.set(`f${f}`, `F${f}`)
for (const name of [
    "Space", "Enter", "Escape", "Tab", "Backspace", "Delete", "Insert",
    "Home", "End", "PageUp", "PageDown", "CapsLock", "NumLock", "Pause",
    "PrintScreen", "ScrollLock", "ContextMenu",
    "LeftArrow", "RightArrow", "UpArrow", "DownArrow",
    "LeftShift", "RightShift", "LeftCtrl", "RightCtrl",
    "LeftAlt", "RightAlt", "LeftMeta", "RightMeta",
    "Backquote", "Quote", "Semicolon", "Comma", "Period", "Slash", "Backslash",
    "LeftBracket", "RightBracket", "Minus", "Equals",
    "NumpadEnter", "NumpadDivide", "NumpadMultiply", "NumpadPlus",
    "NumpadMinus", "NumpadPeriod", "NumpadEquals",
]) {
    CANONICAL.set(name.toLowerCase(), name)
}

/** The canonical Key name for any accepted spelling, or null if unrecognised. */
export function resolveKeyName(name: string): string | null {
    const lower = name.toLowerCase()
    return KEY_ALIASES[lower] ?? DOM_QUERY_ALIASES[lower] ?? CANONICAL.get(lower) ?? null
}

/**
 * Extra DOM code spellings that are not just the canonical name.
 *
 * DOM KeyboardEvent.code is layout-independent, so a browser-fed backend keeps
 * WASD on the same physical keys regardless of the user's layout. Everything
 * regular (KeyA, Digit3, F7, Numpad4) is derived rather than listed.
 */
const DOM_CODE_SPECIALS: Record<string, string> = {
    ArrowUp: "UpArrow",
    ArrowDown: "DownArrow",
    ArrowLeft: "LeftArrow",
    ArrowRight: "RightArrow",
    ShiftLeft: "LeftShift",
    ShiftRight: "RightShift",
    ControlLeft: "LeftCtrl",
    ControlRight: "RightCtrl",
    AltLeft: "LeftAlt",
    AltRight: "RightAlt",
    MetaLeft: "LeftMeta",
    MetaRight: "RightMeta",
    OSLeft: "LeftMeta",
    OSRight: "RightMeta",
    Equal: "Equals",
    Quote: "Quote",
    NumpadAdd: "NumpadPlus",
    NumpadSubtract: "NumpadMinus",
    NumpadDecimal: "NumpadPeriod",
    NumpadEqual: "NumpadEquals",
    ContextMenu: "ContextMenu",
    Escape: "Escape",
}

/**
 * The same DOM spellings, accepted as QUERIES as well as as incoming codes.
 *
 * A browser sends `ArrowUp` and this backend stores `UpArrow`, so a game
 * written by somebody who knows KeyboardEvent asks for the spelling their own
 * events use and gets silence: no error, no warning, a key that simply never
 * fires. That cost a live game its controls.
 *
 * Derived from the table above rather than restated, so the ingest direction
 * and the query direction cannot drift apart. Only the irregular spellings
 * need it; a game asks for "W", never "KeyW".
 */
const DOM_QUERY_ALIASES: Record<string, string> = Object.fromEntries(
    Object.entries(DOM_CODE_SPECIALS).map(([code, name]) => [code.toLowerCase(), name]),
)

/** The canonical Key name for a DOM KeyboardEvent.code, or null if unmapped. */
export function keyNameFromDomCode(code: string): string | null {
    const special = DOM_CODE_SPECIALS[code]
    if (special !== undefined) return special
    if (/^Key[A-Z]$/.test(code)) return code.slice(3)
    if (/^Digit[0-9]$/.test(code)) return code
    if (/^Numpad[0-9]$/.test(code)) return code
    if (/^F([1-9]|1[0-2])$/.test(code)) return code
    return resolveKeyName(code)
}
