/**
 * GPU Compute Module
 *
 * Provides access to Unity compute shaders from JavaScript.
 */

export { compute } from "./compute"
export { Platform } from "./platform"
export type {
    ComputeShader,
    KernelBuilder,
    ComputeBuffer,
    BufferOptions,
    StructSchema,
    StructType,
} from "./types"
