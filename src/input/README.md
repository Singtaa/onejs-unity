# Input Module

Ergonomic JavaScript API for Unity's Input System. Provides direct device access as the primary interface with InputActions support for complex scenarios.

## Installation

```typescript
import { input } from "onejs-unity/input"
```

## Quick Start

```typescript
import { input } from "onejs-unity/input"

// Keyboard
if (input.keyboard.wasKeyPressed("Space")) {
    player.jump()
}

// Mouse
const pos = input.mouse.position
if (input.mouse.wasLeftPressed) {
    shoot(pos.x, pos.y)
}

// Gamepad
const gp = input.gamepad
if (gp?.wasButtonPressed("South")) {
    gp.rumblePulse(0.5, 0.15)  // Haptic feedback!
}
```

## Backends

By default every device reads OneJS's `InputBridge` (`CS.OneJS.Input.InputBridge`). A host
where `CS` is not reachable can supply the same methods itself instead of
forking a second input API:

```typescript
import { setInputBackend, createInputBackend } from "onejs-unity/input"

setInputBackend(createInputBackend({
    GetKeyDown: (key) => held.has(key),
    GetKeyPressed: (key) => pressedThisFrame.has(key),
}, "my host"))
```

Anything the backend omits throws a message naming the method and the host,
rather than failing as "undefined is not a function" inside a device module. A
device that should read as simply absent is better implemented than omitted:
`GetGamepadCount` returning 0 makes `input.gamepad` null, which is what a game
expects when nothing is plugged in.

`setInputBackend(null)` returns to the CS bridge.

This is what OJPlay uses. Its container evaluates game bundles with the
runtime's globals shadowed, so `CS` is undefined there, and game code still
calls this same API. `resolveKeyName` and `keyNameFromDomCode` are exported for
backends fed by browser events: DOM `KeyboardEvent.code` is layout-independent,
so WASD stays the same physical row on AZERTY.

## API Reference

### Keyboard

```typescript
input.keyboard.isKeyDown(key: string): boolean   // Currently held
input.keyboard.wasKeyPressed(key: string): boolean  // Pressed this frame
input.keyboard.wasKeyReleased(key: string): boolean // Released this frame

input.keyboard.shift: boolean   // Shift held
input.keyboard.ctrl: boolean    // Ctrl held
input.keyboard.alt: boolean     // Alt held
input.keyboard.meta: boolean    // Meta/Command/Windows held

input.keyboard.anyKeyDown: boolean    // Any key held
input.keyboard.anyKeyPressed: boolean // Any key pressed this frame
input.keyboard.keysPressed: string[]  // Keys pressed this frame, in the order they went down

// Movement helpers, each -1 to 1 per axis
input.keyboard.wasd(): Vector2
input.keyboard.arrows(): Vector2
input.keyboard.axis2D({ up, down, left, right }): Vector2  // each a key or an array of keys
input.keyboard.axis({ negative, positive }): number
```

**Key Names:** `Space`, `Enter`, `Escape`, `Tab`, `A`-`Z`, `0`-`9`, `F1`-`F12`, `LeftArrow`, `UpArrow`, etc.

### Mouse

```typescript
input.mouse.position: Vector2   // Screen position { x, y }
input.mouse.delta: Vector2      // Frame movement { x, y }
input.mouse.scroll: Vector2     // Scroll wheel { x, y }

input.mouse.leftButton: boolean    // Currently held
input.mouse.rightButton: boolean
input.mouse.middleButton: boolean
input.mouse.forwardButton: boolean
input.mouse.backButton: boolean

input.mouse.wasLeftPressed: boolean   // Pressed this frame
input.mouse.wasRightPressed: boolean
input.mouse.wasMiddlePressed: boolean

input.mouse.wasLeftReleased: boolean  // Released this frame
input.mouse.wasRightReleased: boolean
input.mouse.wasMiddleReleased: boolean
```

### Gamepad

```typescript
input.gamepad: Gamepad | null      // First connected gamepad
input.gamepads: readonly Gamepad[] // All connected gamepads
input.gamepadCount: number         // Number of connected gamepads
```

**Gamepad Properties:**
```typescript
gp.index: number           // Gamepad index
gp.leftStick: Vector2      // { x, y } from -1 to 1
gp.rightStick: Vector2
gp.leftTrigger: number     // 0 to 1
gp.rightTrigger: number

// Face buttons (currently held)
gp.buttonSouth: boolean    // A / Cross
gp.buttonEast: boolean     // B / Circle
gp.buttonWest: boolean     // X / Square
gp.buttonNorth: boolean    // Y / Triangle

// Shoulder buttons
gp.leftShoulder: boolean   // LB / L1
gp.rightShoulder: boolean  // RB / R1

// Stick buttons
gp.leftStickButton: boolean   // L3
gp.rightStickButton: boolean  // R3

// Menu buttons
gp.startButton: boolean
gp.selectButton: boolean

// D-Pad
gp.dpad.up: boolean
gp.dpad.down: boolean
gp.dpad.left: boolean
gp.dpad.right: boolean
```

**Gamepad Methods:**
```typescript
gp.wasButtonPressed(button: string): boolean
gp.wasButtonReleased(button: string): boolean
gp.isButtonDown(button: string): boolean

// Haptics
gp.rumble(lowFreq: number, highFreq: number, duration?: number): void
gp.rumblePulse(intensity: number, duration: number): void
gp.stopRumble(): void
```

**Button Names** (case-insensitive): `South`, `East`, `West`, `North`, `A`, `B`, `X`, `Y`, `Cross`, `Circle`, `Square`, `Triangle`, `LeftShoulder`, `LB`, `L1`, `RightShoulder`, `RB`, `R1`, `LeftStick`, `L3`, `RightStick`, `R3`, `Start`, `Menu`, `Select`, `Back`, `View`, `Up`, `Down`, `Left`, `Right`, `DpadUp`, `DpadDown`, `DpadLeft`, `DpadRight`. Triggers are analog: read `gp.leftTrigger` and `gp.rightTrigger`. An unrecognised name reads false.

### Touch

```typescript
input.touches: readonly Touch[]  // Active touches
input.touchCount: number         // Number of active touches
```

**Touch Properties:**
```typescript
touch.fingerId: number
touch.position: Vector2
touch.delta: Vector2
touch.phase: "began" | "moved" | "stationary" | "ended" | "canceled"
```

### InputActions

#### Loading from Unity Asset

```typescript
// Asset injected via JSRunner globals
declare const playerActions: unknown

const actions = input.loadActions(playerActions)
const jump = actions.action("Player/Jump")
const move = actions.action("Player/Move")

// Polling
if (jump.triggered) { player.jump() }
const dir = move.vec2()      // a 2D action: { x, y }, the same object every call
const charge = jump.float()  // a button or 1D axis: a number

// Callbacks
jump.on("performed", (ctx) => player.jump())
jump.on("started", (ctx) => player.startCharge())
jump.on("canceled", (ctx) => player.releaseCharge(ctx.float()))

// Cleanup
actions.dispose()
```

Read a value with the method that matches the action's control: `float()`
for a button or 1D axis, `vec2()` for a stick or a WASD composite. Unity
throws when the read type does not match the control that is actuated, so
there is no reliable way to guess. The deprecated `value<T>()` guesses
anyway (its `T` does not exist at runtime): at rest a 2D action reads as the
number 0.

#### Defining in JavaScript

```typescript
const actions = input.createActions("Player")
    .button("Jump")
        .bind("<Keyboard>/space")
        .bind("<Gamepad>/buttonSouth")
        .done()
    .axis2D("Move")
        .bind("<Gamepad>/leftStick")
        .bindComposite("dpad")
            .up("<Keyboard>/w")
            .down("<Keyboard>/s")
            .left("<Keyboard>/a")
            .right("<Keyboard>/d")
            .done()
        .done()
    .build()

actions.enable()
// ... use actions ...
actions.dispose()
```

### Global Haptics Control

```typescript
input.pauseHaptics()   // Pause all gamepad haptics
input.resumeHaptics()  // Resume all gamepad haptics
```

## React Hooks

The input module provides React hooks for cleaner integration:

```typescript
import {
    useKeyboard, useMouse, useGamepad, useTouch, useInput,
    useKeyPress, useKeyHeld, useMouseClick, useGamepadButton,
    useAction, useActionFloat, useActionVec2, useActionCallback
} from "onejs-unity/input"
```

### Device Hooks

```typescript
function InputPanel() {
    const keyboard = useKeyboard()  // Re-renders when a modifier changes
    const mouse = useMouse()        // Re-renders when the mouse moves or a button changes
    const gamepad = useGamepad()
    const touch = useTouch()

    return (
        <View>
            <Label>Mouse: ({mouse.position.x}, {mouse.position.y})</Label>
            <Label>Shift: {keyboard.shift ? "ON" : "off"}</Label>
            <Label>Gamepad: {gamepad.connected ? "Connected" : "None"}</Label>
        </View>
    )
}
```

Each reads its device once a frame and re-renders only when the reading
changes, so a still mouse and an idle keyboard cost no render. Each change is a
new object, safe to keep or compare.

They are for showing input, not reacting to it. A render does not happen every
frame, so `keyboard.wasKeyPressed("Space")` checked during render misses most
presses: react to a press with an event hook (`useKeyPress`, `useMouseClick`,
`useGamepadButton`). The functions on `useKeyboard()` (`isKeyDown`, `wasd`, ...)
read live input when called, which suits an event handler or a frame loop.

For game logic, read `input` directly inside your frame loop, where the values
cost no render at all:

```typescript
import { useFrame } from "onejs-react"

useFrame(() => {
    if (input.keyboard.isKeyDown("Space")) jump()
})
```

Keep the hooks for the parts of the screen that show input, and keep the parts
that react to it out of React.

### Event Hooks

```typescript
function Game() {
    // Fire callback on key press
    useKeyPress("Space", () => {
        player.jump()
    })

    // Fire callback every frame while key is held
    useKeyHeld("W", () => {
        player.moveForward()
    })

    // Fire callback on mouse click
    useMouseClick("left", (pos) => {
        shoot(pos.x, pos.y)
    })

    // Fire callback on gamepad button
    useGamepadButton("South", (gp) => {
        player.jump()
        gp.rumblePulse(0.3, 0.1)
    })
}
```

### Combined Hook

```typescript
function Game() {
    const { keyboard, mouse, gamepad } = useInput()

    // Movement from keyboard or gamepad
    let moveX = 0
    if (keyboard.isKeyDown("A")) moveX -= 1
    if (keyboard.isKeyDown("D")) moveX += 1
    if (gamepad.connected) moveX += gamepad.leftStick.x

    // Aim with mouse
    player.aimAt(mouse.position)
}
```

### InputAction Hooks

```typescript
const actions = input.loadActions(playerActionsAsset)

function ControlsReadout() {
    const jump = useAction("Player/Jump", actions)         // triggered, isPressed, phase
    const move = useActionVec2("Player/Move", actions)     // a 2D action
    const throttle = useActionFloat("Player/Throttle", actions)  // a button or 1D axis

    return (
        <View>
            <Label>{jump.isPressed ? "Jumping" : "Grounded"}</Label>
            <Label>Move: {move.x.toFixed(2)}, {move.y.toFixed(2)}</Label>
            <Label>Throttle: {Math.round(throttle * 100)}%</Label>
        </View>
    )
}

function Game() {
    // React to the action firing
    useActionCallback("Player/Attack", "performed", () => {
        player.attack()
    }, actions)
}
```

Like the device hooks, `useAction`, `useActionFloat` and `useActionVec2`
re-render only when their reading changes, and follow a changed action path.

### Hook Reference

| Hook | Description |
|------|-------------|
| `useKeyboard()` | Keyboard modifiers and live read functions; re-renders on a modifier change |
| `useMouse()` | Mouse state (position, delta, scroll, buttons); re-renders on change |
| `useGamepad(index?)` | Gamepad state (sticks, triggers, buttons, dpad); re-renders on change |
| `useTouch()` | Touch state (touches array, count); re-renders on change |
| `useInput()` | Combined state for all devices |
| `useKeyPress(key, cb)` | Callback on key press |
| `useKeyHeld(key, cb)` | Callback every frame while key held |
| `useKeyDown(key, cb)` | Deprecated name for `useKeyHeld`; warns once |
| `useKeyRelease(key, cb)` | Callback on key release |
| `useMouseClick(btn, cb)` | Callback on mouse button click (`"left"`, `"right"`, `"middle"`) |
| `useGamepadButton(btn, cb, index?)` | Callback on gamepad button press |
| `useAction(path, actions)` | InputAction state (triggered, isPressed, phase) |
| `useActionFloat(path, actions)` | Value of a button or 1D axis action |
| `useActionVec2(path, actions)` | Value of a 2D action |
| `useActionCallback(path, event, cb, actions)` | InputAction event callback |
| `useInputReader(build)` | Zero-alloc InputReader with auto-tick |

### Deprecated Names

Each still works, so nothing written against it breaks.

| Deprecated | Use instead |
|------------|-------------|
| `action.value<T>()` | `action.float()` or `action.vec2()` |
| `ctx.readValue<T>()` in an action callback | `ctx.float()` or `ctx.vec2()` |
| `useActionValue<T>(path, actions)` | `useActionFloat` or `useActionVec2` |
| `useAction(...).value<T>()` | `useActionFloat` / `useActionVec2`, or `action.float()` / `action.vec2()` in a frame loop |
| `useKeyDown(key, cb)` | `useKeyHeld` (every frame while held) or `useKeyPress` (once per press) |

## Zero-Allocation Input Reader

For performance-critical game loops, use `InputReader` to avoid per-frame allocations. All Vector2 objects are pre-allocated and reused, and key/button names are resolved to integer IDs at build time.

### Using the Hook (Recommended)

```typescript
import { useInputReader } from "onejs-unity/input"
import { useFrame } from "onejs-react"

function Game() {
    // Reader is built once and ticks each frame while mounted
    const reader = useInputReader(b => b
        // keyAxis2D: 4 directions → vec2, supports multiple keys per direction
        .keyAxis2D("move", {
            up: ["W", "UpArrow"],
            down: ["S", "DownArrow"],
            left: ["A", "LeftArrow"],
            right: ["D", "RightArrow"],
        })
        // Mouse bindings
        .mouseButtonPressed("fire", "left")  // true on the press frame only
        .mouseVec2("look", "delta")
        .mouseFloat("zoom", "scrollY")
        // Gamepad bindings
        .gamepadVec2("gamepadMove", "leftStick")
        .gamepadVec2("gamepadLook", "rightStick")
    )

    useFrame(() => {
        // All vec2() calls return the SAME cached object each frame
        const move = reader.vec2("move")
        const look = reader.vec2("look")

        player.move(move.x, move.y)
        player.rotate(look.x, look.y)

        if (reader.pressed("fire")) {
            player.shoot()  // once per click
        }
    })
}
```

The reader holds no C# resources, so the hook disposes nothing on unmount: it
stops ticking. That also keeps it working under React StrictMode, whose
simulated remount reuses the same reader.

### Manual Reader Creation

```typescript
import { input, createReader } from "onejs-unity/input"

// Build once at init
const reader = createReader()
    .key("jump", "Space")
    .keyPressed("interact", "E")
    .keyAxis("horizontal", { negative: "A", positive: "D" })
    .keyAxis2D("move", {
        up: ["W", "UpArrow"],
        down: ["S", "DownArrow"],
        left: ["A", "LeftArrow"],
        right: ["D", "RightArrow"],
    })
    .mouseButton("aim", "right")
    .mouseButtonPressed("fire", "left")
    .mouseVec2("look", "delta")
    .mouseFloat("zoom", "scrollY")
    .gamepadButtonPressed("gamepadJump", "South")
    .gamepadVec2("gamepadMove", "leftStick")
    .gamepadFloat("leftTrigger", "leftTrigger")
    .build()

// In the game loop, call tick() once per frame
function update() {
    reader.tick()  // Updates all bindings

    // Read cached values (zero allocations!)
    if (reader.down("jump")) { ... }
    if (reader.pressed("interact")) { ... }
    if (reader.down("aim") && reader.pressed("fire")) { ... }
    const h = reader.float("horizontal")
    const move = reader.vec2("move")  // Same object each frame!
}

// Cleanup
reader.dispose()
```

### InputReader Builder Methods

| Method | Reads | Read with |
|--------|-------|-----------|
| `key(name, key)` | Key held | `down` |
| `keyPressed(name, key)` | Key pressed this frame | `pressed` |
| `keyReleased(name, key)` | Key released this frame | `released` |
| `keyAxis(name, {negative, positive})` | Two keys → -1, 0 or 1 | `float` |
| `keyAxis2D(name, {up, down, left, right})` | Four keys → vec2, several keys per direction | `vec2` |
| `mouseButton(name, button)` | Mouse button held ("left", "right", "middle", "forward", "back") | `down` |
| `mouseButtonPressed(name, button)` | Mouse button pressed this frame | `pressed` |
| `mouseButtonReleased(name, button)` | Mouse button released this frame | `released` |
| `mouseVec2(name, property)` | "position", "delta" or "scroll" | `vec2` |
| `mouseFloat(name, property)` | "scrollX", "scrollY", "positionX", ... | `float` |
| `gamepadButton(name, button, index?)` | Gamepad button held | `down` |
| `gamepadButtonPressed(name, button, index?)` | Gamepad button pressed this frame | `pressed` |
| `gamepadButtonReleased(name, button, index?)` | Gamepad button released this frame | `released` |
| `gamepadVec2(name, property, index?)` | "leftStick" or "rightStick" | `vec2` |
| `gamepadFloat(name, property, index?)` | "leftTrigger", "rightTrigger", "leftStickX", ... | `float` |

Each name is bound once; binding it twice throws at build time. To read the same
button held and on its press, bind it twice under two names.

### InputReader Methods

| Method | Description |
|--------|-------------|
| `tick()` | Update all bindings (call once per frame) |
| `down(name)` | Held state of a `key`, `mouseButton` or `gamepadButton` binding |
| `pressed(name)` | True the frame a `...Pressed` binding is pressed |
| `released(name)` | True the frame a `...Released` binding is released |
| `float(name)` | Value of a `keyAxis`, `mouseFloat` or `gamepadFloat` binding |
| `vec2(name)` | Value of a `keyAxis2D`, `mouseVec2` or `gamepadVec2` binding (cached object) |
| `dispose()` | Drop the bindings; reads after it throw |

**A read must match its binding.** `reader.pressed("fire")` on a binding made
with `mouseButton()` throws, naming `mouseButtonPressed()` and `reader.down("fire")`
as the two fixes, and a misspelled name throws with the list of bound names. A
mismatched read used to return the held value, so a weapon fired every frame the
button was held while the code read as correct.

Mouse and gamepad button edges are read through the bridge rather than a zero
alloc invoker: one crossing a frame for the mouse, one per edge binding for a
gamepad.

### Disabling Pointer Events

When using InputReader for mouse input, you can disable UI Toolkit's PointerMoveEvent forwarding to eliminate ~0.6KB/frame GC allocation:

```typescript
import { input, useInputReader } from "onejs-unity/input"

// Disable pointer move events at module load
input.setPointerMoveEventsEnabled(false)

function Game() {
    const reader = useInputReader(b => b
        .mouseVec2("look", "delta")  // Use InputReader instead of React events
    )
    // ...
}
```

Note: This only disables `onPointerMove` handlers. `onPointerEnter`, `onPointerLeave`, `onClick`, etc. still work.

## Manual Polling (Alternative)

If you prefer manual control, read `input` directly from a frame loop:

```typescript
import { input } from "onejs-unity/input"
import { useFrame } from "onejs-react"

function Game() {
    const [pos, setPos] = useState({ x: 0, y: 0 })

    useFrame(() => {
        setPos(input.mouse.position)
        if (input.keyboard.wasKeyPressed("Space")) {
            player.jump()
        }
    })

    return <Label>Mouse: ({pos.x}, {pos.y})</Label>
}
```

## Architecture

```
┌─────────────────────────────────────────┐
│  JavaScript (onejs-unity/input)         │
│    input.keyboard / mouse / gamepad     │
├─────────────────────────────────────────┤
│  Lazy Bridge Access                     │
│    getInputBridge() → backend or CS     │
├─────────────────────────────────────────┤
│  C# InputBridge (static methods)        │
│    OneJS.Input.InputBridge              │
├─────────────────────────────────────────┤
│  Unity Input System                     │
│    Keyboard.current, Mouse.current, etc │
└─────────────────────────────────────────┘
```

## Design Decisions

1. **Lazy Bridge Access**: Every device calls `getInputBridge()` (`backend.ts`) instead of `CS.OneJS.Input.InputBridge` directly, which avoids touching the CS proxy at module load and lets `setInputBackend` swap the source.

2. **Cached Vector Objects**: Reuses Vector2 objects (`{ x, y }`) to reduce allocations in hot paths.

3. **Frame State Tracking**: C# bridge tracks per-frame button states for accurate `wasPressed`/`wasReleased` detection.

4. **Handle-Based InputActions**: Uses integer handles for C#↔JS object references, following the GPUBridge pattern.

5. **State Hooks Change Only When Input Does**: `useKeyboard`, `useMouse`, `useGamepad`, `useTouch` and the action hooks share one `useReading` helper: each frame it reads the device and keeps the previous object when nothing changed, so an idle player costs no render and no allocation.
