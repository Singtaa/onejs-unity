/**
 * Main compute shader API implementation
 */

import type {
    ComputeModule,
    ComputeShader,
    ComputeBuffer,
    RenderTexture,
    RenderTextureOptions,
    KernelBuilder,
    KernelDispatcher,
    DispatcherSchema,
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
                // Shader registration
                RegisterShader(shader: unknown): number
                // RenderTexture API
                CreateRenderTexture(width: number, height: number, enableRandomWrite: boolean): number
                ResizeRenderTexture(handle: number, width: number, height: number): boolean
                DisposeRenderTexture(handle: number): void
                GetRenderTextureObject(handle: number): unknown
                GetRenderTextureAsBackground(handle: number): unknown
                GetRenderTextureWidth(handle: number): number
                GetRenderTextureHeight(handle: number): number
                SetTexture(shaderHandle: number, kernelIndex: number, name: string, textureHandle: number): void
                // Screen API
                GetScreenWidth(): number
                GetScreenHeight(): number
                // Property ID conversion (for zero-alloc dispatch)
                PropertyToID(name: string): number
                // Zero-alloc binding system
                GetZeroAllocBindingIds(): {
                    dispatch: number
                    propertyToId: number
                    setFloatById: number
                    setIntById: number
                    setVectorById: number
                    setTextureById: number
                    getScreenWidth: number
                    getScreenHeight: number
                }
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
 * RenderTexture implementation with optional auto-resize support.
 */
class RenderTextureImpl implements RenderTexture {
    readonly __handle: number
    readonly autoResize: boolean
    private _width: number
    private _height: number
    private _didResize: boolean = false

    constructor(handle: number, width: number, height: number, autoResize: boolean = false) {
        this.__handle = handle
        this._width = width
        this._height = height
        this.autoResize = autoResize
    }

    /**
     * Get width, checking for auto-resize if enabled.
     */
    get width(): number {
        if (this.autoResize) {
            this._checkAutoResize()
        }
        return this._width
    }

    /**
     * Get height, checking for auto-resize if enabled.
     */
    get height(): number {
        if (this.autoResize) {
            this._checkAutoResize()
        }
        return this._height
    }

    /**
     * Check if resized since last check and reset the flag.
     */
    get didResize(): boolean {
        const result = this._didResize
        this._didResize = false
        return result
    }

    /**
     * Internal: check if screen size changed and resize if needed.
     * Uses zero-alloc path when available.
     */
    private _checkAutoResize(): void {
        // Use zero-alloc invokers if initialized, otherwise fall back to CS proxy
        const sw = _invokers ? _invokers.getScreenWidth() : CS.OneJS.GPU.GPUBridge.GetScreenWidth()
        const sh = _invokers ? _invokers.getScreenHeight() : CS.OneJS.GPU.GPUBridge.GetScreenHeight()
        if (this._width !== sw || this._height !== sh) {
            this.resize(sw, sh)
            this._didResize = true
        }
    }

    resize(width: number, height: number): boolean {
        const success = CS.OneJS.GPU.GPUBridge.ResizeRenderTexture(this.__handle, width, height)
        if (success) {
            this._width = width
            this._height = height
        }
        return success
    }

    /**
     * @deprecated Pass the RenderTexture directly to backgroundImage instead
     */
    getUnityObject(): unknown {
        // Return a marker object with the RT handle
        // The style system will detect this and use SetElementBackgroundImage
        return { __rtHandle: this.__handle }
    }

    dispose(): void {
        CS.OneJS.GPU.GPUBridge.DisposeRenderTexture(this.__handle)
    }
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

    texture(name: string, tex: RenderTexture): KernelBuilder {
        CS.OneJS.GPU.GPUBridge.SetTexture(this._shader.__handle, this._kernelIndex, name, tex.__handle)
        return this
    }

    textureRW(name: string, tex: RenderTexture): KernelBuilder {
        // Same binding for RW textures - the RW distinction is in the HLSL declaration
        CS.OneJS.GPU.GPUBridge.SetTexture(this._shader.__handle, this._kernelIndex, name, tex.__handle)
        return this
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

    dispatchAuto(texture: RenderTexture, threadGroupSize = 8): ComputeShader {
        const groupsX = Math.ceil(texture.width / threadGroupSize)
        const groupsY = Math.ceil(texture.height / threadGroupSize)
        return this.dispatch(groupsX, groupsY, 1)
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

// ============ Zero-Alloc Binding System ============
// These are initialized lazily on first KernelDispatcher creation

// Binding IDs from C# (cached once)
interface ZeroAllocBindingIds {
    dispatch: number
    propertyToId: number
    setFloatById: number
    setIntById: number
    setVectorById: number
    setTextureById: number
    getScreenWidth: number
    getScreenHeight: number
}

// Zero-alloc invoker function types
type InvokerFn = (...args: unknown[]) => unknown

// Native zero-alloc invoke functions (registered by quickjs_unity.c)
declare const __zaInvoke0: (bindingId: number) => unknown
declare const __zaInvoke1: (bindingId: number, a0: unknown) => unknown
declare const __zaInvoke3: (bindingId: number, a0: unknown, a1: unknown, a2: unknown) => unknown
declare const __zaInvoke4: (bindingId: number, a0: unknown, a1: unknown, a2: unknown, a3: unknown) => unknown
declare const __zaInvoke5: (bindingId: number, a0: unknown, a1: unknown, a2: unknown, a3: unknown, a4: unknown) => unknown
declare const __zaInvoke6: (bindingId: number, a0: unknown, a1: unknown, a2: unknown, a3: unknown, a4: unknown, a5: unknown) => unknown

// Cached invokers - created once on first use
let _invokers: {
    dispatch: (sh: number, ki: number, gx: number, gy: number, gz: number) => void
    propertyToId: (name: string) => number
    setFloatById: (sh: number, id: number, v: number) => void
    setIntById: (sh: number, id: number, v: number) => void
    setVectorById: (sh: number, id: number, x: number, y: number, z: number, w: number) => void
    setTextureById: (sh: number, ki: number, id: number, th: number) => void
    getScreenWidth: () => number
    getScreenHeight: () => number
} | null = null

/**
 * Initialize zero-alloc invokers. Called once on first KernelDispatcher creation.
 */
function initZeroAllocInvokers(): void {
    if (_invokers) return

    // Get binding IDs from C#
    const ids = CS.OneJS.GPU.GPUBridge.GetZeroAllocBindingIds() as ZeroAllocBindingIds

    // Create invokers using the native __zaInvokeN functions
    _invokers = {
        // dispatch: 5 args (shaderHandle, kernelIndex, groupsX, groupsY, groupsZ)
        dispatch: (sh, ki, gx, gy, gz) => {
            __zaInvoke5(ids.dispatch, sh, ki, gx, gy, gz)
        },
        // propertyToId: 1 arg (name) -> returns int
        propertyToId: (name) => __zaInvoke1(ids.propertyToId, name) as number,
        // setFloatById: 3 args (shaderHandle, propertyId, value)
        setFloatById: (sh, id, v) => {
            __zaInvoke3(ids.setFloatById, sh, id, v)
        },
        // setIntById: 3 args (shaderHandle, propertyId, value)
        setIntById: (sh, id, v) => {
            __zaInvoke3(ids.setIntById, sh, id, v)
        },
        // setVectorById: 6 args (shaderHandle, propertyId, x, y, z, w)
        setVectorById: (sh, id, x, y, z, w) => {
            __zaInvoke6(ids.setVectorById, sh, id, x, y, z, w)
        },
        // setTextureById: 4 args (shaderHandle, kernelIndex, propertyId, textureHandle)
        setTextureById: (sh, ki, id, th) => {
            __zaInvoke4(ids.setTextureById, sh, ki, id, th)
        },
        // getScreenWidth: 0 args -> returns int
        getScreenWidth: () => __zaInvoke0(ids.getScreenWidth) as number,
        // getScreenHeight: 0 args -> returns int
        getScreenHeight: () => __zaInvoke0(ids.getScreenHeight) as number,
    }
}

/**
 * KernelDispatcher implementation - zero-allocation per-frame dispatch.
 *
 * Uses pre-registered C# bindings and cached property IDs to achieve
 * zero managed allocations per frame. All string->int conversions happen
 * once on first use and are cached.
 *
 * @example
 * ```typescript
 * // Create once at init
 * const dispatch = shader.createDispatcher("CSMain")
 *
 * // Per-frame - zero allocations!
 * dispatch
 *     .float("_Time", time)
 *     .vec2("_Resolution", width, height)
 *     .textureRW("_Result", texture)
 *     .dispatchAuto(texture)
 * ```
 */
class KernelDispatcherImpl implements KernelDispatcher {
    private readonly _shaderHandle: number
    private readonly _kernelIndex: number
    // Property ID cache: string name -> integer ID
    // Populated upfront if schema provided, otherwise lazily on first use
    private readonly _propertyIdCache: Map<string, number> = new Map()

    constructor(shaderHandle: number, kernelName: string, schema?: DispatcherSchema) {
        // Initialize zero-alloc system if needed
        initZeroAllocInvokers()

        this._shaderHandle = shaderHandle
        this._kernelIndex = CS.OneJS.GPU.GPUBridge.FindKernel(shaderHandle, kernelName)
        if (this._kernelIndex < 0) {
            throw new Error(`Kernel "${kernelName}" not found`)
        }

        // Pre-resolve all property IDs from schema (if provided)
        if (schema) {
            for (const name of Object.keys(schema)) {
                const id = _invokers!.propertyToId(name)
                this._propertyIdCache.set(name, id)
            }
        }
    }

    /**
     * Get cached property ID. If schema was provided, ID is already cached.
     * Otherwise, first call uses propertyToId binding, subsequent calls use cache.
     */
    private _getPropertyId(name: string): number {
        let id = this._propertyIdCache.get(name)
        if (id === undefined) {
            // Not in cache - resolve now (only happens without schema or for unlisted props)
            id = _invokers!.propertyToId(name)
            this._propertyIdCache.set(name, id)
        }
        return id
    }

    float(name: string, value: number): KernelDispatcher {
        const id = this._getPropertyId(name)
        _invokers!.setFloatById(this._shaderHandle, id, value)
        return this
    }

    int(name: string, value: number): KernelDispatcher {
        const id = this._getPropertyId(name)
        _invokers!.setIntById(this._shaderHandle, id, Math.floor(value))
        return this
    }

    bool(name: string, value: boolean): KernelDispatcher {
        // Bool uses int binding (0 or 1)
        const id = this._getPropertyId(name)
        _invokers!.setIntById(this._shaderHandle, id, value ? 1 : 0)
        return this
    }

    vec2(name: string, x: number, y: number): KernelDispatcher {
        const id = this._getPropertyId(name)
        _invokers!.setVectorById(this._shaderHandle, id, x, y, 0, 0)
        return this
    }

    vec3(name: string, x: number, y: number, z: number): KernelDispatcher {
        const id = this._getPropertyId(name)
        _invokers!.setVectorById(this._shaderHandle, id, x, y, z, 0)
        return this
    }

    vec4(name: string, x: number, y: number, z: number, w: number): KernelDispatcher {
        const id = this._getPropertyId(name)
        _invokers!.setVectorById(this._shaderHandle, id, x, y, z, w)
        return this
    }

    matrix(name: string, value: Float32Array): KernelDispatcher {
        // Matrix still uses JSON serialization (not hot-path typically)
        const arr = Array.from(value)
        CS.OneJS.GPU.GPUBridge.SetMatrix(this._shaderHandle, name, JSON.stringify(arr))
        return this
    }

    texture(name: string, tex: RenderTexture): KernelDispatcher {
        const id = this._getPropertyId(name)
        _invokers!.setTextureById(this._shaderHandle, this._kernelIndex, id, tex.__handle)
        return this
    }

    textureRW(name: string, tex: RenderTexture): KernelDispatcher {
        const id = this._getPropertyId(name)
        _invokers!.setTextureById(this._shaderHandle, this._kernelIndex, id, tex.__handle)
        return this
    }

    dispatch(groupsX: number, groupsY = 1, groupsZ = 1): void {
        _invokers!.dispatch(
            this._shaderHandle,
            this._kernelIndex,
            groupsX,
            groupsY,
            groupsZ
        )
    }

    dispatchAuto(texture: RenderTexture, threadGroupSize = 8): void {
        const groupsX = Math.ceil(texture.width / threadGroupSize)
        const groupsY = Math.ceil(texture.height / threadGroupSize)
        this.dispatch(groupsX, groupsY, 1)
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

    createDispatcher(kernelName: string, schema?: DispatcherSchema): KernelDispatcher {
        return new KernelDispatcherImpl(this.__handle, kernelName, schema)
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

    register(shaderObject: unknown, name = "registered"): ComputeShader {
        const handle = CS.OneJS.GPU.GPUBridge.RegisterShader(shaderObject)
        if (handle < 0) {
            throw new Error("Failed to register compute shader. Make sure the object is a valid ComputeShader.")
        }
        return new ComputeShaderImpl(handle, name)
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

    renderTexture(options: RenderTextureOptions): RenderTexture {
        const { enableRandomWrite = true, autoResize = false } = options

        // Initialize zero-alloc system early if auto-resize is requested
        // This ensures screen dimension checks use the fast path
        if (autoResize) {
            initZeroAllocInvokers()
        }

        // Determine initial dimensions
        let width: number
        let height: number

        if (autoResize) {
            // Use screen dimensions for auto-resize textures (zero-alloc path now available)
            width = _invokers!.getScreenWidth()
            height = _invokers!.getScreenHeight()
        } else {
            // Use provided dimensions
            width = options.width ?? 0
            height = options.height ?? 0
        }

        if (width <= 0 || height <= 0) {
            throw new Error(`Invalid RenderTexture dimensions: ${width}x${height}. ` +
                `Provide width/height or use autoResize: true`)
        }

        const handle = CS.OneJS.GPU.GPUBridge.CreateRenderTexture(width, height, enableRandomWrite)
        if (handle < 0) {
            throw new Error("Failed to create RenderTexture")
        }

        return new RenderTextureImpl(handle, width, height, autoResize)
    },

    struct(schema: StructSchema): StructType {
        return new StructTypeImpl(schema)
    },

    get screenWidth(): number {
        // Use zero-alloc path when available
        return _invokers ? _invokers.getScreenWidth() : CS.OneJS.GPU.GPUBridge.GetScreenWidth()
    },

    get screenHeight(): number {
        // Use zero-alloc path when available
        return _invokers ? _invokers.getScreenHeight() : CS.OneJS.GPU.GPUBridge.GetScreenHeight()
    },
}
