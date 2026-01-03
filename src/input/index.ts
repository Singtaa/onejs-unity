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

    // Main module type
    InputModule,
} from "./types"
