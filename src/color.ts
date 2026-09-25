/**
 * "#rgb", "#rrggbb" or "#rrggbbaa" to 0..1 components.
 *
 * Shared by `sl` and `fx`, so a colour is written the same way in a program
 * and in an image chain. The one implementation is the shader language's,
 * now in `onejs-sl`; `fx` reads it through here.
 */
export { parseColor } from "onejs-sl/core"
