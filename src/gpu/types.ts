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

    // Texture bindings (future)
    // texture(name: string, tex: unknown): KernelBuilder
    // textureRW(name: string, tex: unknown): KernelBuilder

    /**
     * Dispatch the kernel
     * @param groupsX Number of thread groups in X
     * @param groupsY Number of thread groups in Y (default 1)
     * @param groupsZ Number of thread groups in Z (default 1)
     * @returns The parent ComputeShader for chaining
     */
    dispatch(groupsX: number, groupsY?: number, groupsZ?: number): ComputeShader

    /**
     * Dispatch multiple times (for iterative solvers)
     * @param iterations Number of times to dispatch
     */
    repeat(iterations: number): ComputeShader
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
     * Create a compute buffer
     * @param options Buffer configuration
     */
    buffer<T extends TypedArray>(options: BufferOptions<T>): ComputeBuffer<T>

    /**
     * Define a struct type for structured buffers
     * @param schema Field definitions
     */
    struct(schema: StructSchema): StructType
}
