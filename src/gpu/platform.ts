/**
 * Platform capabilities detection
 */

declare const CS: {
    OneJS: {
        GPU: {
            GPUBridge: {
                SupportsCompute: boolean
                SupportsAsyncReadback: boolean
                MaxComputeWorkGroupSizeX: number
                MaxComputeWorkGroupSizeY: number
                MaxComputeWorkGroupSizeZ: number
            }
        }
    }
}

/**
 * Platform capabilities for GPU compute
 */
export const Platform = {
    /**
     * Whether compute shaders are supported on this platform
     * (false on WebGL, true on WebGPU and native platforms)
     */
    get supportsCompute(): boolean {
        try {
            return CS.OneJS.GPU.GPUBridge.SupportsCompute
        } catch {
            return false
        }
    },

    /**
     * Whether async GPU readback is supported
     */
    get supportsAsyncReadback(): boolean {
        try {
            return CS.OneJS.GPU.GPUBridge.SupportsAsyncReadback
        } catch {
            return false
        }
    },

    /**
     * Maximum compute work group size [x, y, z]
     */
    get maxComputeWorkGroupSize(): [number, number, number] {
        try {
            return [
                CS.OneJS.GPU.GPUBridge.MaxComputeWorkGroupSizeX,
                CS.OneJS.GPU.GPUBridge.MaxComputeWorkGroupSizeY,
                CS.OneJS.GPU.GPUBridge.MaxComputeWorkGroupSizeZ,
            ]
        } catch {
            return [0, 0, 0]
        }
    },
}
