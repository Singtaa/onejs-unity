/**
 * `onejs-unity/sl/compiler`: the BUILD TIME surface of the shader language.
 *
 * Everything here runs while a game is being built and nothing runs while one
 * is being played: the `.sl` parser, the encoder that turns a program into the
 * buffer the VM reads, and the manifest an editor turns into compiled shaders.
 * The esbuild plugin and the Play worker import this; a game imports
 * `onejs-unity/sl`, which leaves the parser out.
 *
 * A re-export of `onejs-sl`, by name, so every import that worked before the
 * shader language became its own package still does.
 */

export {
    analyze, classify, diagnose, parse, parseUnit, preludeFunctions, tokenize, PRELUDE_SOURCE, SLParseError,
    INPUTS, SL_IR_VERSION, TYPE, widthName, toJSON, fromJSON, SL_SDF_SHAPES,
} from "onejs-sl"
export type {
    Checked, Expr, FuncDecl, ParseOptions, Stmt, Unit, ProgramJSON, Program, SLType, SlSdfKind,
    SLClassifiedToken, SLFix, SLTokenClass,
} from "onejs-sl"
export { encode } from "onejs-sl/vm"
export type { Encoded } from "onejs-sl/vm"
export { emitShader, emitFragmentBody, uniformProperty } from "onejs-sl/emit/unity"
export { emitGLSL, emitWGSL, WEB_UNIFORM_SLOTS } from "onejs-sl/emit/web"
export type { WebLanguage } from "onejs-sl/emit/web"
export {
    SL_HLSL, SL_CALL_NAMES, SL_GLSL_HINT, SL_UNIMPLEMENTED, BUILTINS, NOT_YET,
    SL_KEYWORDS, SL_TYPES, BUILTIN_DOCS, INPUT_DOCS, PRELUDE_DOCS,
} from "onejs-sl/tables"
export type { SLSurface } from "onejs-sl/tables"
export { VM_TEXTURES, VM_UNIFORMS } from "onejs-sl/vm"
export { manifest } from "./manifest"
export type { ManifestEntry, ProgramManifest } from "./manifest"
