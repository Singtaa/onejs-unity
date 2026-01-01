/**
 * GPU Compute Module
 *
 * Provides access to Unity compute shaders from JavaScript.
 *
 * @example Basic usage
 * ```tsx
 * import { compute } from "onejs-unity/gpu"
 *
 * const shader = compute.register(myShader, "Effect")
 * const rt = compute.renderTexture({ autoResize: true })
 *
 * shader.kernel("CSMain")
 *     .float("_Time", time)
 *     .textureRW("_Result", rt)
 *     .dispatchAuto(rt)
 * ```
 *
 * @example With React hooks
 * ```tsx
 * import { useComputeShader, useComputeTexture, useAnimationFrame } from "onejs-unity/gpu"
 *
 * function Background({ shaderGlobal }) {
 *     const shader = useComputeShader(shaderGlobal)
 *     const { texture } = useComputeTexture({ autoResize: true })
 *
 *     useAnimationFrame(() => {
 *         if (!shader || !texture) return
 *         shader.kernel("CSMain")
 *             .float("_Time", performance.now() / 1000)
 *             .textureRW("_Result", texture)
 *             .dispatchAuto(texture)
 *     })
 *
 *     return <View style={{ backgroundImage: texture }} />
 * }
 * ```
 */

export { compute } from "./compute"
export { Platform } from "./platform"

// React hooks
export {
    useComputeTexture,
    useAnimationFrame,
    useComputeShader,
} from "./hooks"

// Types
export type {
    ComputeShader,
    KernelBuilder,
    ComputeBuffer,
    RenderTexture,
    RenderTextureOptions,
    BufferOptions,
    StructSchema,
    StructType,
} from "./types"

export type {
    UseComputeTextureOptions,
    UseComputeTextureResult,
    UseAnimationFrameOptions,
} from "./hooks"
