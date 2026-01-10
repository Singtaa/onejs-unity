/**
 * OneJS Tailwind - Lightweight utility class generator for USS
 *
 * A Tailwind-like utility class system designed specifically for Unity Style Sheets.
 * No external dependencies - generates USS directly from utility definitions.
 *
 * Usage:
 *   import { generateUSS, generateFromFiles } from "onejs-unity/tailwind"
 */

export { allUtilities, staticUtilities } from "./utilities.mjs"
export { spacing, colors, fontSize, breakpoints } from "./config.mjs"
export {
    escapeClassName,
    extractClassNames,
    scanFiles,
    parseClassName,
    generateUSS,
    generateFromFiles,
} from "./generator.mjs"
