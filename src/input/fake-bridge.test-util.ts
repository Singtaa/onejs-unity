/**
 * A stand-in for C#'s InputBridge, for tests: the backend methods the device
 * modules call, plus the __zaInvokeN globals InputReader calls. Every call is
 * counted, so a test can assert how many crossings a frame costs.
 *
 * Action reads behave like Unity's InputAction.ReadValue<T>: reading the
 * wrong type throws once a control is actuated, and reads the default at
 * rest. That is the trap a guessing read falls into.
 */
import { setInputBackend } from "./backend"

export interface FakeGamepad {
    lx: number, ly: number, rx: number, ry: number, lt: number, rt: number
    held: number, pressed: number, released: number
}

export interface FakeTouch { fingerId: number, x: number, y: number, dx: number, dy: number, phase: number }

export interface FakeAction {
    type: "float" | "vec2"
    triggered: boolean, pressed: boolean, phase: number
    float: number, x: number, y: number
}

export interface FakeInput {
    held: Set<string>, pressed: Set<string>, released: Set<string>
    modifiers: number, anyKeyDown: boolean
    mouse: { x: number, y: number, dx: number, dy: number, sx: number, sy: number, held: number, pressed: number, released: number }
    gamepads: FakeGamepad[]
    touches: FakeTouch[]
    actions: Map<string, FakeAction>
    /** Calls per method name, backend and zero alloc invokers alike */
    calls: Record<string, number>
}

export const fake: FakeInput = blank()

function blank(): FakeInput {
    return {
        held: new Set(), pressed: new Set(), released: new Set(),
        modifiers: 0, anyKeyDown: false,
        mouse: { x: 0, y: 0, dx: 0, dy: 0, sx: 0, sy: 0, held: 0, pressed: 0, released: 0 },
        gamepads: [],
        touches: [],
        actions: new Map(),
        calls: {},
    }
}

export function gamepad(values: Partial<FakeGamepad> = {}): FakeGamepad {
    return { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, held: 0, pressed: 0, released: 0, ...values }
}

export function action(type: "float" | "vec2", values: Partial<FakeAction> = {}): FakeAction {
    return { type, triggered: false, pressed: false, phase: 1, float: 0, x: 0, y: 0, ...values }
}

// Key and gamepad button names become ids the way C# resolves them: once.
const keyNames: string[] = []
const keyId = (name: string) => {
    const i = keyNames.indexOf(name)
    return i >= 0 ? i : keyNames.push(name) - 1
}
const GAMEPAD_BUTTON_IDS: Record<string, number> = { south: 1, east: 2, west: 4, north: 8 }

const pad = (i: number) => fake.gamepads[i]
const actionHandles: string[] = []
const actionAt = (handle: number) => fake.actions.get(actionHandles[handle])!

function readActionFloat(a: FakeAction): number {
    if (a.type !== "float" && (a.x !== 0 || a.y !== 0)) {
        throw new Error("InvalidOperationException: Cannot read value of type 'float' from composite 'Vector2'")
    }
    return a.float
}

function readActionVec2(a: FakeAction): { x: number, y: number } {
    if (a.type !== "vec2" && a.float !== 0) {
        throw new Error("InvalidOperationException: Cannot read value of type 'Vector2' from control 'Button'")
    }
    return { x: a.x, y: a.y }
}

const methods: Record<string, (...args: any[]) => unknown> = {
    // keyboard
    GetKeyDown: (k: string) => fake.held.has(k),
    GetKeyPressed: (k: string) => fake.pressed.has(k),
    GetKeyReleased: (k: string) => fake.released.has(k),
    GetModifiers: () => fake.modifiers,
    GetAnyKeyDown: () => fake.anyKeyDown,
    GetAnyKeyPressed: () => fake.pressed.size > 0,
    getKeyId: keyId,
    getKeyDownById: (id: number) => fake.held.has(keyNames[id]),
    getKeyPressedById: (id: number) => fake.pressed.has(keyNames[id]),
    getKeyReleasedById: (id: number) => fake.released.has(keyNames[id]),

    // mouse
    GetMousePositionX: () => fake.mouse.x,
    GetMousePositionY: () => fake.mouse.y,
    GetMouseDeltaX: () => fake.mouse.dx,
    GetMouseDeltaY: () => fake.mouse.dy,
    GetScrollX: () => fake.mouse.sx,
    GetScrollY: () => fake.mouse.sy,
    GetMouseButtons: () => fake.mouse.held,
    GetMouseButtonsPressed: () => fake.mouse.pressed,
    GetMouseButtonsReleased: () => fake.mouse.released,

    // gamepad
    GetGamepadCount: () => fake.gamepads.length,
    IsGamepadConnected: (i: number) => pad(i) !== undefined,
    GetGamepadButtons: (i: number) => pad(i)?.held ?? 0,
    GetGamepadButtonsPressed: (i: number) => pad(i)?.pressed ?? 0,
    GetGamepadButtonsReleased: (i: number) => pad(i)?.released ?? 0,
    GetLeftStickX: (i: number) => pad(i)?.lx ?? 0,
    GetLeftStickY: (i: number) => pad(i)?.ly ?? 0,
    GetRightStickX: (i: number) => pad(i)?.rx ?? 0,
    GetRightStickY: (i: number) => pad(i)?.ry ?? 0,
    GetLeftTrigger: (i: number) => pad(i)?.lt ?? 0,
    GetRightTrigger: (i: number) => pad(i)?.rt ?? 0,
    getGamepadButtonId: (name: string) => GAMEPAD_BUTTON_IDS[name.toLowerCase()] ?? 0,
    getGamepadButtonDownById: (i: number, id: number) => ((pad(i)?.held ?? 0) & id) !== 0,

    // touch
    GetTouchCount: () => fake.touches.length,
    GetTouchFingerId: (i: number) => fake.touches[i].fingerId,
    GetTouchPhase: (i: number) => fake.touches[i].phase,
    GetTouchPositionX: (i: number) => fake.touches[i].x,
    GetTouchPositionY: (i: number) => fake.touches[i].y,
    GetTouchDeltaX: (i: number) => fake.touches[i].dx,
    GetTouchDeltaY: (i: number) => fake.touches[i].dy,

    // actions
    RegisterActionAsset: () => 1,
    FindAction: (_asset: number, path: string) => {
        if (!fake.actions.has(path)) return -1
        const i = actionHandles.indexOf(path)
        return i >= 0 ? i : actionHandles.push(path) - 1
    },
    GetActionTriggered: (h: number) => actionAt(h).triggered,
    GetActionPressed: (h: number) => actionAt(h).pressed,
    GetActionPhase: (h: number) => actionAt(h).phase,
    GetActionValueFloat: (h: number) => readActionFloat(actionAt(h)),
    GetActionValueVector2X: (h: number) => readActionVec2(actionAt(h)).x,
    GetActionValueVector2Y: (h: number) => readActionVec2(actionAt(h)).y,
}

function counted(name: string): (...args: any[]) => unknown {
    const fn = methods[name]
    return (...args) => {
        fake.calls[name] = (fake.calls[name] ?? 0) + 1
        return fn(...args)
    }
}

// The zero alloc invokers: each wire id names a method above.
const ZA_NAMES = [
    "getKeyId", "getKeyDownById", "getKeyPressedById", "getKeyReleasedById",
    "getMouseButtons", "getMousePositionX", "getMousePositionY",
    "getMouseDeltaX", "getMouseDeltaY", "getScrollX", "getScrollY",
    "getGamepadButtonId", "getGamepadButtonDownById",
    "getLeftStickX", "getLeftStickY", "getRightStickX", "getRightStickY",
    "getLeftTrigger", "getRightTrigger",
]
const ZA_SOURCES: Record<string, string> = {
    getMouseButtons: "GetMouseButtons", getMousePositionX: "GetMousePositionX",
    getMousePositionY: "GetMousePositionY", getMouseDeltaX: "GetMouseDeltaX",
    getMouseDeltaY: "GetMouseDeltaY", getScrollX: "GetScrollX", getScrollY: "GetScrollY",
    getLeftStickX: "GetLeftStickX", getLeftStickY: "GetLeftStickY",
    getRightStickX: "GetRightStickX", getRightStickY: "GetRightStickY",
    getLeftTrigger: "GetLeftTrigger", getRightTrigger: "GetRightTrigger",
}
const zaIds: Record<string, number> = Object.fromEntries(ZA_NAMES.map((n, i) => [n, 100 + i]))
const zaInvoke = (id: number, ...args: unknown[]) => {
    const name = ZA_NAMES[id - 100]
    const counter = `za.${name}`
    fake.calls[counter] = (fake.calls[counter] ?? 0) + 1
    return (methods[name] ?? methods[ZA_SOURCES[name]])(...args)
}

/** Resets every reading and count, and installs the fake as the bridge. */
export function installFakeBridge(): FakeInput {
    Object.assign(fake, blank())
    const backend: Record<string, unknown> = { GetZeroAllocBindingIds: () => zaIds }
    for (const name of Object.keys(methods)) backend[name] = counted(name)
    setInputBackend(backend)
    const g = globalThis as Record<string, unknown>
    g.__zaInvoke0 = zaInvoke
    g.__zaInvoke1 = zaInvoke
    g.__zaInvoke2 = zaInvoke
    return fake
}

export function resetCalls(): void {
    fake.calls = {}
}
