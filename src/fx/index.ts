/**
 * onejs-unity/fx: textures as values.
 *
 * A chain of operations is built as a description and executed in one crossing,
 * so the runtime can fuse per pixel operations into a single blit and pool the
 * intermediates. See ops.ts for the wire contract shared with FxBridge.cs.
 */

export { image, Image } from "./image"
export type { Operand, RGBA } from "./image"
export { OP, MODE, WIRE_VERSION, MAX_FUSED_OPS, isPixelOp } from "./ops"
export type { OpCode, Mode } from "./ops"
