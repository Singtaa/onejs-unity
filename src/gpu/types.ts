/**
 * Type definitions for the GPU compute module
 */

// TypedArray union type
export type TypedArray =
    | Float32Array
    | Float64Array
    | Int32Array
    | Uint32Array
    | Int16Array
    | Uint16Array
    | Int8Array
    | Uint8Array

// Vector types (matching Unity)
export type Vector2 = { x: number; y: number }
export type Vector3 = { x: number; y: number; z: number }
export type Vector4 = { x: number; y: number; z: number; w: number }
export type Matrix4x4 = Float32Array // 16 floats, column-major

// Struct field types for buffer schemas
export type StructFieldType =
    | "float"
    | "float2"
    | "float3"
    | "float4"
    | "int"
    | "int2"
    | "int3"
    | "int4"
    | "uint"
    | "uint2"
    | "uint3"
    | "uint4"

export type StructSchema = Record<string, StructFieldType>

export interface StructType {
    readonly schema: StructSchema
    readonly stride: number
    readonly fieldOffsets: Record<string, number>
}

// Buffer usage modes
export type BufferUsage = "readonly" | "readwrite" | "gpuonly"

export interface BufferOptions<T extends TypedArray = Float32Array> {
    /** Initial data to upload */
    data?: T
    /** Number of elements (if no data provided) */
    count?: number
    /** Struct type for structured buffers */
    type?: StructType
    /** Buffer usage mode */
    usage?: BufferUsage
}

export interface RenderTextureOptions {
    /** Texture width (ignored if autoResize is true) */
    width?: number
    /** Texture height (ignored if autoResize is true) */
    height?: number
    /** Enable random write for RWTexture2D (default: true) */
    enableRandomWrite?: boolean
    /**
     * Automatically resize to match screen dimensions.
     * When enabled, the texture will check and resize on each width/height property access.
     * @default false
     */
    autoResize?: boolean
}

/**
 * Represents a GPU render texture for compute shader output.
 *
 * Can be passed directly to View's backgroundImage style property:
 * @example
 * const rt = compute.renderTexture({ autoResize: true })
 * <View style={{ backgroundImage: rt }} />
 */
export interface RenderTexture {
    /** Internal handle for C# interop */
    readonly __handle: number

    /**
     * Current width of the texture.
     * If autoResize is enabled, accessing this will check and resize to screen dimensions.
     */
    readonly width: number

    /**
     * Current height of the texture.
     * If autoResize is enabled, accessing this will check and resize to screen dimensions.
     */
    readonly height: number

    /** Whether auto-resize is enabled for this texture */
    readonly autoResize: boolean

    /**
     * Check if the texture was resized since last check.
     * Useful for updating UI bindings after resize.
     */
    readonly didResize: boolean

    /**
     * Resize the texture to new dimensions.
     * @returns true if resize succeeded
     */
    resize(width: number, height: number): boolean

    /**
     * Get the underlying Unity RenderTexture object.
     * Use this for UI binding (e.g., backgroundImage style property).
     * @deprecated Pass the RenderTexture directly to backgroundImage instead
     */
    getUnityObject(): unknown

    /**
     * Release the texture resources
     */
    dispose(): void
}

/**
 * Represents a GPU compute buffer
 */
export interface ComputeBuffer<T extends TypedArray = Float32Array> {
    /** Internal handle for C# interop */
    readonly __handle: number
    /** Number of elements in the buffer */
    readonly count: number
    /** Stride in bytes */
    readonly stride: number

    /**
     * Write data to the buffer
     * @param data Data to write
     * @param options Optional offset configuration
     */
    write(data: T, options?: { offset?: number }): void

    /**
     * Read buffer data back from GPU (async)
     * @returns Promise resolving to the buffer contents
     */
    read(): Promise<T>

    /**
     * Read a specific field from a structured buffer
     * @param fieldName Name of the field to read
     */
    readField(fieldName: string): Promise<T>

    /**
     * Check if a pending readback is ready
     */
    readonly readbackReady: boolean

    /**
     * Get the result of a completed readback (null if not ready)
     */
    readonly readbackResult: T | null

    /**
     * Release the buffer resources
     */
    dispose(): void
}

/**
 * Fluent builder for setting up and dispatching a compute kernel
 */
export interface KernelBuilder {
    // Scalar uniforms
    float(name: string, value: number): KernelBuilder
    int(name: string, value: number): KernelBuilder
    bool(name: string, value: boolean): KernelBuilder

    // Vector uniforms
    vec2(name: string, value: [number, number] | Vector2): KernelBuilder
    vec3(name: string, value: [number, number, number] | Vector3): KernelBuilder
    vec4(name: string, value: [number, number, number, number] | Vector4): KernelBuilder

    // Matrix uniforms
    matrix(name: string, value: Float32Array | Matrix4x4): KernelBuilder

    // Buffer bindings
    buffer(name: string, data: TypedArray | ComputeBuffer): KernelBuilder
    bufferReadOnly(name: string, data: TypedArray | ComputeBuffer): KernelBuilder

    // Texture bindings
    texture(name: string, tex: RenderTexture): KernelBuilder
    textureRW(name: string, tex: RenderTexture): KernelBuilder

    /**
     * Dispatch the kernel with explicit thread group counts.
     * @param groupsX Number of thread groups in X
     * @param groupsY Number of thread groups in Y (default 1)
     * @param groupsZ Number of thread groups in Z (default 1)
     * @returns The parent ComputeShader for chaining
     */
    dispatch(groupsX: number, groupsY?: number, groupsZ?: number): ComputeShader

    /**
     * Dispatch the kernel with automatic thread group calculation based on texture dimensions.
     * Calculates thread groups as ceil(width/threadGroupSize) x ceil(height/threadGroupSize).
     *
     * @param texture The RenderTexture to dispatch for
     * @param threadGroupSize Thread group size (default 8, matching common [numthreads(8,8,1)])
     * @returns The parent ComputeShader for chaining
     *
     * @example
     * shader.kernel("CSMain")
     *     .float("_Time", time)
     *     .textureRW("_Result", rt)
     *     .dispatchAuto(rt)  // Calculates ceil(width/8) x ceil(height/8) x 1
     */
    dispatchAuto(texture: RenderTexture, threadGroupSize?: number): ComputeShader

    /**
     * Dispatch multiple times (for iterative solvers)
     * @param iterations Number of times to dispatch
     */
    repeat(iterations: number): ComputeShader
}

/**
 * Reusable kernel dispatcher for zero-allocation per-frame dispatch.
 *
 * Unlike KernelBuilder which is created fresh each frame, KernelDispatcher
 * caches property IDs and uses specialized bindings to avoid allocations.
 *
 * @example
 * ```typescript
 * // Create once at init
 * const dispatch = shader.createDispatcher("CSMain")
 *
 * // Per-frame - zero allocations
 * dispatch
 *     .float("_Time", time)
 *     .vec2("_Resolution", width, height)
 *     .textureRW("_Result", texture)
 *     .dispatchAuto(texture)
 * ```
 */
export interface KernelDispatcher {
    // Scalar uniforms (uses cached property IDs)
    float(name: string, value: number): KernelDispatcher
    int(name: string, value: number): KernelDispatcher
    bool(name: string, value: boolean): KernelDispatcher

    // Vector uniforms - separate args to avoid array allocation
    vec2(name: string, x: number, y: number): KernelDispatcher
    vec3(name: string, x: number, y: number, z: number): KernelDispatcher
    vec4(name: string, x: number, y: number, z: number, w: number): KernelDispatcher

    // Matrix uniforms
    matrix(name: string, value: Float32Array): KernelDispatcher

    // Texture bindings
    texture(name: string, tex: RenderTexture): KernelDispatcher
    textureRW(name: string, tex: RenderTexture): KernelDispatcher

    /**
     * Dispatch the kernel with explicit thread group counts.
     */
    dispatch(groupsX: number, groupsY?: number, groupsZ?: number): void

    /**
     * Dispatch with automatic thread group calculation based on texture dimensions.
     */
    dispatchAuto(texture: RenderTexture, threadGroupSize?: number): void
}

/**
 * Represents a loaded compute shader
 */
export interface ComputeShader {
    /** Internal handle for C# interop */
    readonly __handle: number
    /** Name of the shader */
    readonly name: string

    /**
     * Get a kernel builder for the named kernel
     * @param name Kernel function name (e.g., "CSMain")
     */
    kernel(name: string): KernelBuilder

    /**
     * Create a reusable dispatcher for zero-allocation per-frame dispatch.
     *
     * @param kernelName Kernel function name (e.g., "CSMain")
     * @returns A KernelDispatcher that caches property IDs
     *
     * @example
     * ```typescript
     * const dispatch = shader.createDispatcher("CSMain")
     * // Use dispatch.float(...).dispatch(...) per frame
     * ```
     */
    createDispatcher(kernelName: string): KernelDispatcher

    /**
     * Read back data from a buffer bound to this shader
     * @param bufferName Name of the buffer to read
     */
    readback<T extends TypedArray>(bufferName: string): Promise<T>

    /**
     * Release the shader resources
     */
    dispose(): void
}

/**
 * Main compute module interface
 */
export interface ComputeModule {
    /**
     * Load a compute shader by registered name
     * @param name Name registered via ComputeShaderProvider in Unity
     */
    load(name: string): Promise<ComputeShader>

    /**
     * Register a compute shader from a Unity object (e.g., from JSRunner globals)
     * @param shaderObject The ComputeShader object injected via globals
     * @param name Optional name for debugging
     */
    register(shaderObject: unknown, name?: string): ComputeShader

    /**
     * Create a compute buffer
     * @param options Buffer configuration
     */
    buffer<T extends TypedArray>(options: BufferOptions<T>): ComputeBuffer<T>

    /**
     * Create a render texture for compute shader output
     * @param options Texture configuration
     */
    renderTexture(options: RenderTextureOptions): RenderTexture

    /**
     * Define a struct type for structured buffers
     * @param schema Field definitions
     */
    struct(schema: StructSchema): StructType

    /**
     * Get current screen dimensions
     */
    readonly screenWidth: number
    readonly screenHeight: number
}
