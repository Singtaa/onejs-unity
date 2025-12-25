/**
 * Main compute shader API implementation
 */

import type {
    ComputeModule,
    ComputeShader,
    ComputeBuffer,
    KernelBuilder,
    BufferOptions,
    StructSchema,
    StructType,
    TypedArray,
    Vector2,
    Vector3,
    Vector4,
} from "./types"

// C# interop declarations
declare const CS: {
    OneJS: {
        GPU: {
            GPUBridge: {
                LoadShader(name: string): number // Returns handle or -1
                DisposeShader(handle: number): void
                FindKernel(shaderHandle: number, kernelName: string): number
                SetFloat(shaderHandle: number, name: string, value: number): void
                SetInt(shaderHandle: number, name: string, value: number): void
                SetBool(shaderHandle: number, name: string, value: boolean): void
                SetVector(shaderHandle: number, name: string, x: number, y: number, z: number, w: number): void
                SetMatrix(shaderHandle: number, name: string, matrixJson: string): void
                CreateBuffer(count: number, stride: number): number
                DisposeBuffer(handle: number): void
                SetBufferData(handle: number, dataJson: string): void
                BindBuffer(shaderHandle: number, kernelIndex: number, name: string, bufferHandle: number): void
                Dispatch(shaderHandle: number, kernelIndex: number, groupsX: number, groupsY: number, groupsZ: number): void
                RequestReadback(bufferHandle: number): number // Returns request ID
                IsReadbackComplete(requestId: number): boolean
                GetReadbackData(requestId: number): string // JSON array
            }
        }
    }
}

// Pending readback requests
const pendingReadbacks = new Map<number, {
    requestId: number
    resolve: (data: TypedArray) => void
    reject: (error: Error) => void
    arrayType: "float32" | "int32" | "uint32"
}>()

let readbackPollTimer: ReturnType<typeof setInterval> | null = null

function startReadbackPolling() {
    if (readbackPollTimer) return
    readbackPollTimer = setInterval(() => {
        for (const [bufferHandle, pending] of pendingReadbacks) {
            if (CS.OneJS.GPU.GPUBridge.IsReadbackComplete(pending.requestId)) {
                const jsonData = CS.OneJS.GPU.GPUBridge.GetReadbackData(pending.requestId)
                const data = JSON.parse(jsonData) as number[]
                let result: TypedArray
                switch (pending.arrayType) {
                    case "float32":
                        result = new Float32Array(data)
                        break
                    case "int32":
                        result = new Int32Array(data)
                        break
                    case "uint32":
                        result = new Uint32Array(data)
                        break
                }
                pending.resolve(result)
                pendingReadbacks.delete(bufferHandle)
            }
        }
        if (pendingReadbacks.size === 0 && readbackPollTimer) {
            clearInterval(readbackPollTimer)
            readbackPollTimer = null
        }
    }, 16) // Poll at ~60fps
}

// Struct field sizes in bytes
const FIELD_SIZES: Record<string, number> = {
    float: 4, float2: 8, float3: 12, float4: 16,
    int: 4, int2: 8, int3: 12, int4: 16,
    uint: 4, uint2: 8, uint3: 12, uint4: 16,
}

/**
 * ComputeBuffer implementation
 */
class ComputeBufferImpl<T extends TypedArray = Float32Array> implements ComputeBuffer<T> {
    readonly __handle: number
    readonly count: number
    readonly stride: number
    private _readbackResult: T | null = null
    private _readbackReady = false
    private _arrayType: "float32" | "int32" | "uint32"

    constructor(handle: number, count: number, stride: number, arrayType: "float32" | "int32" | "uint32") {
        this.__handle = handle
        this.count = count
        this.stride = stride
        this._arrayType = arrayType
    }

    write(data: T, options?: { offset?: number }): void {
        // Convert TypedArray to JSON array for C# interop
        const arr = Array.from(data as unknown as ArrayLike<number>)
        const json = JSON.stringify(arr)
        CS.OneJS.GPU.GPUBridge.SetBufferData(this.__handle, json)
    }

    read(): Promise<T> {
        return new Promise((resolve, reject) => {
            const requestId = CS.OneJS.GPU.GPUBridge.RequestReadback(this.__handle)
            if (requestId < 0) {
                reject(new Error("Failed to request GPU readback"))
                return
            }
            pendingReadbacks.set(this.__handle, {
                requestId,
                resolve: (data) => {
                    this._readbackResult = data as T
                    this._readbackReady = true
                    resolve(data as T)
                },
                reject,
                arrayType: this._arrayType,
            })
            startReadbackPolling()
        })
    }

    readField(_fieldName: string): Promise<T> {
        // For now, just read the whole buffer
        // TODO: Implement field-specific readback
        return this.read()
    }

    get readbackReady(): boolean {
        return this._readbackReady
    }

    get readbackResult(): T | null {
        return this._readbackResult
    }

    dispose(): void {
        pendingReadbacks.delete(this.__handle)
        CS.OneJS.GPU.GPUBridge.DisposeBuffer(this.__handle)
    }
}

/**
 * KernelBuilder implementation
 */
class KernelBuilderImpl implements KernelBuilder {
    private _shader: ComputeShaderImpl
    private _kernelName: string
    private _kernelIndex: number
    private _boundBuffers: Map<string, ComputeBuffer> = new Map()

    constructor(shader: ComputeShaderImpl, kernelName: string) {
        this._shader = shader
        this._kernelName = kernelName
        this._kernelIndex = CS.OneJS.GPU.GPUBridge.FindKernel(shader.__handle, kernelName)
        if (this._kernelIndex < 0) {
            throw new Error(`Kernel "${kernelName}" not found in shader "${shader.name}"`)
        }
    }

    float(name: string, value: number): KernelBuilder {
        CS.OneJS.GPU.GPUBridge.SetFloat(this._shader.__handle, name, value)
        return this
    }

    int(name: string, value: number): KernelBuilder {
        CS.OneJS.GPU.GPUBridge.SetInt(this._shader.__handle, name, Math.floor(value))
        return this
    }

    bool(name: string, value: boolean): KernelBuilder {
        CS.OneJS.GPU.GPUBridge.SetBool(this._shader.__handle, name, value)
        return this
    }

    vec2(name: string, value: [number, number] | Vector2): KernelBuilder {
        const v = Array.isArray(value) ? value : [value.x, value.y]
        CS.OneJS.GPU.GPUBridge.SetVector(this._shader.__handle, name, v[0], v[1], 0, 0)
        return this
    }

    vec3(name: string, value: [number, number, number] | Vector3): KernelBuilder {
        const v = Array.isArray(value) ? value : [value.x, value.y, value.z]
        CS.OneJS.GPU.GPUBridge.SetVector(this._shader.__handle, name, v[0], v[1], v[2], 0)
        return this
    }

    vec4(name: string, value: [number, number, number, number] | Vector4): KernelBuilder {
        const v = Array.isArray(value) ? value : [value.x, value.y, value.z, value.w]
        CS.OneJS.GPU.GPUBridge.SetVector(this._shader.__handle, name, v[0], v[1], v[2], v[3])
        return this
    }

    matrix(name: string, value: Float32Array): KernelBuilder {
        const arr = Array.from(value)
        CS.OneJS.GPU.GPUBridge.SetMatrix(this._shader.__handle, name, JSON.stringify(arr))
        return this
    }

    buffer(name: string, data: TypedArray | ComputeBuffer): KernelBuilder {
        let buf: ComputeBuffer
        if ("__handle" in data) {
            buf = data as ComputeBuffer
        } else {
            // Create a transient buffer from TypedArray
            buf = compute.buffer({ data: data as Float32Array })
        }
        CS.OneJS.GPU.GPUBridge.BindBuffer(this._shader.__handle, this._kernelIndex, name, buf.__handle)
        this._boundBuffers.set(name, buf)
        this._shader._trackBuffer(name, buf)
        return this
    }

    bufferReadOnly(name: string, data: TypedArray | ComputeBuffer): KernelBuilder {
        // Same as buffer for now - the readonly distinction is in the HLSL declaration
        return this.buffer(name, data)
    }

    dispatch(groupsX: number, groupsY = 1, groupsZ = 1): ComputeShader {
        CS.OneJS.GPU.GPUBridge.Dispatch(
            this._shader.__handle,
            this._kernelIndex,
            groupsX,
            groupsY,
            groupsZ
        )
        return this._shader
    }

    repeat(iterations: number): ComputeShader {
        for (let i = 0; i < iterations; i++) {
            CS.OneJS.GPU.GPUBridge.Dispatch(
                this._shader.__handle,
                this._kernelIndex,
                1, 1, 1 // TODO: Remember last dispatch dimensions
            )
        }
        return this._shader
    }
}

/**
 * ComputeShader implementation
 */
class ComputeShaderImpl implements ComputeShader {
    readonly __handle: number
    readonly name: string
    private _boundBuffers: Map<string, ComputeBuffer> = new Map()

    constructor(handle: number, name: string) {
        this.__handle = handle
        this.name = name
    }

    _trackBuffer(name: string, buffer: ComputeBuffer): void {
        this._boundBuffers.set(name, buffer)
    }

    kernel(name: string): KernelBuilder {
        return new KernelBuilderImpl(this, name)
    }

    readback<T extends TypedArray>(bufferName: string): Promise<T> {
        const buffer = this._boundBuffers.get(bufferName)
        if (!buffer) {
            return Promise.reject(new Error(`Buffer "${bufferName}" not bound to shader`))
        }
        return buffer.read() as Promise<T>
    }

    dispose(): void {
        CS.OneJS.GPU.GPUBridge.DisposeShader(this.__handle)
    }
}

/**
 * StructType implementation
 */
class StructTypeImpl implements StructType {
    readonly schema: StructSchema
    readonly stride: number
    readonly fieldOffsets: Record<string, number>

    constructor(schema: StructSchema) {
        this.schema = schema
        this.fieldOffsets = {}

        let offset = 0
        for (const [name, type] of Object.entries(schema)) {
            this.fieldOffsets[name] = offset
            offset += FIELD_SIZES[type] || 4
        }
        // Align to 16 bytes (GPU requirement)
        this.stride = Math.ceil(offset / 16) * 16
    }
}

/**
 * Main compute module
 */
export const compute: ComputeModule = {
    load(name: string): Promise<ComputeShader> {
        return new Promise((resolve, reject) => {
            const handle = CS.OneJS.GPU.GPUBridge.LoadShader(name)
            if (handle < 0) {
                reject(new Error(`Compute shader "${name}" not found. Make sure it's registered via ComputeShaderProvider.`))
                return
            }
            resolve(new ComputeShaderImpl(handle, name))
        })
    },

    buffer<T extends TypedArray>(options: BufferOptions<T>): ComputeBuffer<T> {
        const { data, count: optCount, type } = options
        const count = data ? data.length : (optCount || 0)
        const stride = type ? type.stride : 4 // Default to float stride

        if (count === 0) {
            throw new Error("Buffer must have count > 0")
        }

        // Determine array type from data
        let arrayType: "float32" | "int32" | "uint32" = "float32"
        if (data) {
            if (data instanceof Int32Array) arrayType = "int32"
            else if (data instanceof Uint32Array) arrayType = "uint32"
        }

        const handle = CS.OneJS.GPU.GPUBridge.CreateBuffer(count, stride)
        if (handle < 0) {
            throw new Error("Failed to create compute buffer")
        }

        const buffer = new ComputeBufferImpl<T>(handle, count, stride, arrayType)

        if (data) {
            buffer.write(data)
        }

        return buffer
    },

    struct(schema: StructSchema): StructType {
        return new StructTypeImpl(schema)
    },
}
