/**
 * Input module - provides ergonomic access to Unity's Input System
 *
 * @example
 * import { input } from "onejs-unity/input"
 *
 * // Direct device access
 * if (input.keyboard.isKeyDown("Space")) { jump() }
 * if (input.mouse.leftButton) { shoot() }
 * if (input.gamepad?.buttonSouth) { confirm() }
 *
 * // InputActions
 * const actions = input.loadActions(playerActions)
 * if (actions.action("Jump").triggered) { jump() }
 */

// Main input module
export { input } from "./input"

// Individual device modules (for direct imports if needed)
export { keyboard } from "./keyboard"
export { mouse } from "./mouse"
export { getGamepad, getGamepads, getGamepadCount, pauseHaptics, resumeHaptics } from "./gamepad"
export { getTouches, getTouchCount } from "./touch"

// Zero-alloc input reader
export { createReader } from "./reader"

// React hooks
export {
    // Device hooks
    useKeyboard,
    useMouse,
    useGamepad,
    useTouch,
    useInput,

    // Event hooks
    useKeyPress,
    useKeyDown,
    useKeyRelease,
    useMouseClick,
    useGamepadButton,

    // InputAction hooks
    useAction,
    useActionValue,
    useActionCallback,

    // Zero-alloc reader hook
    useInputReader,
} from "./hooks"

// Hook state types
export type {
    KeyboardState,
    MouseState,
    GamepadState,
    TouchState,
    InputState,
    ActionState,
} from "./hooks"

// Types
export type {
    // Device types
    Keyboard,
    Mouse,
    Gamepad,
    DPad,
    Touch,
    TouchPhase,
    Vector2,

    // InputActions types
    InputActions,
    InputAction,
    InputActionMap,
    ActionPhase,
    ActionCallback,
    ActionCallbackContext,

    // Builder types
    ActionMapBuilder,
    ActionBuilder,
    CompositeBindingBuilder,

    // Zero-alloc reader types
    InputReader,
    InputReaderBuilder,
    MouseVec2Property,
    MouseFloatProperty,
    MouseButtonType,
    GamepadVec2Property,
    GamepadFloatProperty,
    KeyAxis2DConfig,
    ReaderKeyBinding,

    // Main module type
    InputModule,
} from "./types"
