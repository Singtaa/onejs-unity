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
```

**Key Names:** `Space`, `Enter`, `Escape`, `Tab`, `A`-`Z`, `0`-`9`, `F1`-`F12`, `LeftArrow`, `Up`, etc.

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

**Button Names:** `South`, `East`, `West`, `North`, `A`, `B`, `X`, `Y`, `Cross`, `Circle`, `Square`, `Triangle`, `LeftShoulder`, `LB`, `L1`, `RightShoulder`, `RB`, `R1`, `Start`, `Select`, `Up`, `Down`, `Left`, `Right`

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
const dir = move.value<Vector2>()

// Callbacks
jump.on("performed", (ctx) => player.jump())
jump.on("started", (ctx) => player.startCharge())
jump.on("canceled", (ctx) => player.releaseCharge())

// Cleanup
actions.dispose()
```

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
    useKeyPress, useKeyDown, useMouseClick, useGamepadButton,
    useAction, useActionValue, useActionCallback
} from "onejs-unity/input"
```

### Device Hooks

```typescript
function Game() {
    const keyboard = useKeyboard()  // Auto-updates each frame
    const mouse = useMouse()
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

### Event Hooks

```typescript
function Game() {
    // Fire callback on key press
    useKeyPress("Space", () => {
        player.jump()
    })

    // Fire callback while key is held
    useKeyDown("W", () => {
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

function Game() {
    const jump = useAction("Player/Jump", actions)
    const moveDir = useActionValue<Vector2>("Player/Move", actions)

    if (jump.triggered) {
        player.jump()
    }
    player.move(moveDir.x, moveDir.y)

    // Or use callbacks
    useActionCallback("Player/Attack", "performed", () => {
        player.attack()
    }, actions)
}
```

### Hook Reference

| Hook | Description |
|------|-------------|
| `useKeyboard()` | Keyboard state (modifiers, isKeyDown, wasKeyPressed) |
| `useMouse()` | Mouse state (position, delta, scroll, buttons) |
| `useGamepad(index?)` | Gamepad state (sticks, triggers, buttons, dpad) |
| `useTouch()` | Touch state (touches array, count) |
| `useInput()` | Combined state for all devices |
| `useKeyPress(key, cb)` | Callback on key press |
| `useKeyDown(key, cb)` | Callback while key held |
| `useKeyRelease(key, cb)` | Callback on key release |
| `useMouseClick(btn, cb)` | Callback on mouse button click |
| `useGamepadButton(btn, cb)` | Callback on gamepad button press |
| `useAction(path, actions)` | InputAction state |
| `useActionValue<T>(path, actions)` | InputAction value |
| `useActionCallback(path, event, cb, actions)` | InputAction event callback |

## Manual Polling (Alternative)

If you prefer manual control, you can use `input` directly with your own animation loop:

```typescript
import { input } from "onejs-unity/input"

function useAnimationFrame(callback: () => void) {
    const ref = useRef(callback)
    ref.current = callback
    useEffect(() => {
        let id: number
        const tick = () => { ref.current(); id = requestAnimationFrame(tick) }
        id = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(id)
    }, [])
}

function Game() {
    const [pos, setPos] = useState({ x: 0, y: 0 })

    useAnimationFrame(() => {
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
│    getInputBridge() → CS proxy          │
├─────────────────────────────────────────┤
│  C# InputBridge (static methods)        │
│    OneJS.Input.InputBridge              │
├─────────────────────────────────────────┤
│  Unity Input System                     │
│    Keyboard.current, Mouse.current, etc │
└─────────────────────────────────────────┘
```

## Design Decisions

1. **Lazy Bridge Access**: Uses `getInputBridge()` function instead of direct `CS.OneJS.Input.InputBridge` to avoid issues during module load when CS proxy may not be ready.

2. **Cached Vector Objects**: Reuses Vector2 objects (`{ x, y }`) to reduce allocations in hot paths.

3. **Frame State Tracking**: C# bridge tracks per-frame button states for accurate `wasPressed`/`wasReleased` detection.

4. **Handle-Based InputActions**: Uses integer handles for C#↔JS object references, following the GPUBridge pattern.
