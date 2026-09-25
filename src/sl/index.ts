/**
 * `onejs-unity/sl`: write a per pixel program in TypeScript.
 *
 * The shader language lives in its own package, `onejs-sl`, which has no
 * Unity in it so another host can run it. This barrel re-exports the parts a
 * game uses, by name, so every import that worked before still does, plus
 * `manifest`, which is OneJS's own.
 *
 * Built on `onejs-sl/core` and the backend entries, never on `onejs-sl`
 * itself: that one carries the `.sl` parser, which runs while a game is built
 * and never while one is played, and the Play eject scaffold vendors every
 * file this barrel reaches. `onejs-unity/sl/compiler` is the build time
 * surface, parser included.
 */
export {
    sl, SLOP, SL_ARITY, SL_NAME, INPUT_ID, isSampling, SL_IR_VERSION, toJSON, fromJSON, SL_SDF_SHAPES,
    TYPE, INPUTS, MAX_TEXTURES, MAX_NODES, SLError, hashProgram, widthName,
} from "onejs-sl/core"
export type {
    ProgramJSON, SlSdfKind, SLOpCode, SLType, InputName, NodeRef, SLNode, Program, UniformDecl, TextureDecl,
    Float, Vec2, Vec3, Vec4, Num, ProgramInputs, Texture,
} from "onejs-sl/core"
export {
    SL_WIRE_VERSION, REGISTERS, MAX_INSTRUCTIONS, TEXELS_PER_INSTRUCTION, encode, reachable, liveRanges,
} from "onejs-sl/vm"
export type { Encoded } from "onejs-sl/vm"
export { emitShader, emitFragmentBody, uniformProperty } from "onejs-sl/emit/unity"
export type { EmitOptions } from "onejs-sl/emit/unity"
export { emitGLSL, emitWGSL, WEB_UNIFORM_SLOTS } from "onejs-sl/emit/web"
export type { WebLanguage } from "onejs-sl/emit/web"
export { manifest } from "./manifest"
export type { ProgramManifest, ManifestEntry } from "./manifest"
