/**
 * Zero-Allocation Interop Module
 *
 * Provides a way to call C# methods from JavaScript with reduced or eliminated
 * managed heap allocations, making it suitable for performance-critical code.
 *
 * @see CS.QuickJSNative for the C# side of this API
 *
 * ## Two Binding Modes
 *
 * ### 1. Pre-registered Bindings (Truly Zero-Alloc)
 *
 * C# pre-registers handlers using typed delegates:
 * ```csharp
 * // In C# initialization code
 * int setFloatId = QuickJSNative.Bind<int, string, float>((h, n, v) => {
 *     GPUBridge.SetFloat(h, n, v);
 * });
 * // Expose setFloatId to JavaScript somehow (e.g., via globals or a registry)
 * ```
 *
 * Then JavaScript uses the pre-registered ID:
 * ```typescript
 * const setFloat = interop.bindById(setFloatId, 3)
 * setFloat(handle, "_Time", time)  // Zero allocations!
 * ```
 *
 * ### 2. Dynamic Binding (Convenient, but allocates per-call)
 *
 * ```typescript
 * // At init time
 * const setFloat = interop.bind("OneJS.GPU.GPUBridge", "SetFloat", 3)
 *
 * // Per-frame - uses reflection, allocates object[] for args
 * setFloat(handle, "_Time", time)
 * ```
 *
 * The dynamic path is useful for:
 * - Prototyping and development
 * - Methods not called in hot loops
 * - When convenience outweighs performance
 *
 * ## Native-Side Zero-Alloc
 *
 * Both paths use the same native mechanism:
 * - Fixed-arity __zaInvokeN functions (no array allocation)
 * - Stack-allocated InteropValue arrays in C
 * - Direct primitive passing
 *
 * The difference is what happens in C#:
 * - Pre-registered: Direct delegate invocation, no boxing
 * - Dynamic: Reflection-based method.Invoke with object[] boxing
 *
 * ## Supported Types
 *
 * - Primitives: int, float, double, bool
 * - Strings: Passed as pointer (valid during call)
 * - Object handles: Objects with __csHandle property
 * - Vectors: { x, y, z } and { x, y, z, w } patterns
 * - Colors: { r, g, b, a } patterns
 *
 * ## Limitations
 *
 * - Max 8 arguments per call
 * - Complex objects require JSON serialization (not zero-alloc)
 * - Return values limited to primitives, vectors, and handles
 *
 * @module
 */

// Native zero-alloc invoke functions (registered by quickjs_unity.c)
declare const __zaInvoke0: (bindingId: number) => unknown
declare const __zaInvoke1: (bindingId: number, a0: unknown) => unknown
declare const __zaInvoke2: (bindingId: number, a0: unknown, a1: unknown) => unknown
declare const __zaInvoke3: (bindingId: number, a0: unknown, a1: unknown, a2: unknown) => unknown
declare const __zaInvoke4: (bindingId: number, a0: unknown, a1: unknown, a2: unknown, a3: unknown) => unknown
declare const __zaInvoke5: (bindingId: number, a0: unknown, a1: unknown, a2: unknown, a3: unknown, a4: unknown) => unknown
declare const __zaInvoke6: (bindingId: number, a0: unknown, a1: unknown, a2: unknown, a3: unknown, a4: unknown, a5: unknown) => unknown
declare const __zaInvoke7: (bindingId: number, a0: unknown, a1: unknown, a2: unknown, a3: unknown, a4: unknown, a5: unknown, a6: unknown) => unknown
declare const __zaInvoke8: (bindingId: number, a0: unknown, a1: unknown, a2: unknown, a3: unknown, a4: unknown, a5: unknown, a6: unknown, a7: unknown) => unknown

/**
 * Zero-alloc callable function type.
 * The actual signature depends on the method being called.
 */
export type ZeroAllocFunc = (...args: unknown[]) => unknown

/**
 * Binding options for customizing behavior.
 */
export interface BindOptions {
    /**
     * Number of arguments the method takes.
     * Required for selecting the correct __zaInvokeN function.
     * @default Inferred from target method if possible
     */
    argCount?: number
}

/**
 * Internal binding registry.
 * Maps binding IDs to their metadata for debugging.
 */
const _bindings = new Map<number, { typeName: string; methodName: string; argCount: number }>()

/**
 * Bind a C# static method for zero-allocation calling.
 *
 * This registers the method with C# and returns a callable function
 * that invokes it without any managed allocations.
 *
 * @param typeName Full C# type name (e.g., "OneJS.GPU.GPUBridge")
 * @param methodName Method name (e.g., "SetFloat")
 * @param argCount Number of arguments the method takes (0-8)
 * @returns A callable function that invokes the method
 *
 * @example
 * ```typescript
 * // Bind a 3-arg method
 * const setFloat = bind("OneJS.GPU.GPUBridge", "SetFloat", 3)
 *
 * // Call it (zero-alloc)
 * setFloat(shaderHandle, "_Time", 1.5)
 * ```
 */
export function bind(typeName: string, methodName: string, argCount: number): ZeroAllocFunc {
    if (argCount < 0 || argCount > 8) {
        throw new Error(`interop.bind: argCount must be 0-8, got ${argCount}`)
    }

    // Request binding from C# - this returns the binding ID
    // We use the regular CS proxy for setup (one-time allocation is OK)
    const bindingId = CS.QuickJSNative.RegisterZeroAllocMethodBinding(typeName, methodName, argCount)

    if (bindingId <= 0) {
        throw new Error(`interop.bind: Failed to bind ${typeName}.${methodName}`)
    }

    // Store metadata for debugging
    _bindings.set(bindingId, { typeName, methodName, argCount })

    // Return a wrapper function that calls the correct __zaInvokeN
    return createInvoker(bindingId, argCount)
}

/**
 * Bind a method using a delegate that's already been registered in C#.
 *
 * This is useful when the C# side pre-registers commonly used methods
 * (like GPU operations) and exposes their binding IDs.
 *
 * @param bindingId Pre-registered binding ID from C#
 * @param argCount Number of arguments (for selecting __zaInvokeN)
 * @returns A callable function that invokes the method
 *
 * @example
 * ```typescript
 * // GPU methods are pre-registered by OneJS
 * const dispatchId = GPUBindings.Dispatch  // Pre-registered binding ID
 * const dispatch = bindById(dispatchId, 5)
 *
 * // Call it (zero-alloc)
 * dispatch(shaderHandle, kernelIndex, x, y, z)
 * ```
 */
export function bindById(bindingId: number, argCount: number): ZeroAllocFunc {
    if (argCount < 0 || argCount > 8) {
        throw new Error(`interop.bindById: argCount must be 0-8, got ${argCount}`)
    }
    return createInvoker(bindingId, argCount)
}

/**
 * Create an invoker function for a binding.
 */
function createInvoker(bindingId: number, argCount: number): ZeroAllocFunc {
    switch (argCount) {
        case 0:
            return () => __zaInvoke0(bindingId)
        case 1:
            return (a0) => __zaInvoke1(bindingId, a0)
        case 2:
            return (a0, a1) => __zaInvoke2(bindingId, a0, a1)
        case 3:
            return (a0, a1, a2) => __zaInvoke3(bindingId, a0, a1, a2)
        case 4:
            return (a0, a1, a2, a3) => __zaInvoke4(bindingId, a0, a1, a2, a3)
        case 5:
            return (a0, a1, a2, a3, a4) => __zaInvoke5(bindingId, a0, a1, a2, a3, a4)
        case 6:
            return (a0, a1, a2, a3, a4, a5) => __zaInvoke6(bindingId, a0, a1, a2, a3, a4, a5)
        case 7:
            return (a0, a1, a2, a3, a4, a5, a6) => __zaInvoke7(bindingId, a0, a1, a2, a3, a4, a5, a6)
        case 8:
            return (a0, a1, a2, a3, a4, a5, a6, a7) => __zaInvoke8(bindingId, a0, a1, a2, a3, a4, a5, a6, a7)
        default:
            throw new Error(`Unsupported arg count: ${argCount}`)
    }
}

/**
 * Get debug info about a binding.
 */
export function getBindingInfo(bindingId: number): { typeName: string; methodName: string; argCount: number } | undefined {
    return _bindings.get(bindingId)
}

/**
 * Get count of registered bindings.
 */
export function getBindingCount(): number {
    return _bindings.size
}

/**
 * Interop module namespace for convenient access.
 */
export const interop = {
    bind,
    bindById,
    getBindingInfo,
    getBindingCount
}

// ============================================================================
// Zero-Alloc Proxy API (za)
// ============================================================================

/**
 * Method specification for za.static().
 * Can be a number (arg count) or an object with more details.
 */
export type MethodSpec = number | {
    /** Number of arguments */
    args: number
    /** Return type hint (for documentation only) */
    returns?: string
}

/**
 * Schema defining methods to bind.
 */
export type MethodSchema = Record<string, MethodSpec>

/**
 * Extract arg count from a MethodSpec.
 */
function getArgCount(spec: MethodSpec): number {
    return typeof spec === "number" ? spec : spec.args
}

/**
 * Proxy type with methods matching the schema.
 * All methods return unknown - use type assertions at call site if needed.
 */
export type StaticProxy<T extends MethodSchema> = {
    readonly [K in keyof T]: ZeroAllocFunc
}

/**
 * Cache of created proxies to avoid re-binding.
 * Key: "TypeName" -> proxy object
 */
const _proxyCache = new Map<string, StaticProxy<MethodSchema>>()

/**
 * Create a zero-alloc proxy for static methods on a C# class.
 *
 * All methods are bound lazily on first access, then cached.
 * Binding failures throw immediately (fail loudly).
 *
 * @param typeName Full C# type name (e.g., "UnityEngine.Physics")
 * @param methods Schema defining methods to bind
 * @returns Proxy object with zero-alloc methods
 *
 * @example
 * ```typescript
 * const Physics = za.static("UnityEngine.Physics", {
 *     Raycast: 4,  // shorthand: 4 args
 *     SphereCast: { args: 5, returns: "bool" },  // with metadata
 * })
 *
 * // Per-frame - zero-alloc after first call
 * if (Physics.Raycast(origin, direction, maxDistance, layerMask)) {
 *     // hit something
 * }
 * ```
 *
 * @example For instance methods, use static wrappers in C#:
 * ```csharp
 * // C# side - create static wrapper
 * public static class CharacterControllerExt {
 *     public static void MoveStatic(int handle, float x, float y, float z) {
 *         var cc = ObjectRegistry.Get<CharacterController>(handle);
 *         cc.Move(new Vector3(x, y, z));
 *     }
 * }
 * ```
 * ```typescript
 * // JS side
 * const CharacterController = za.static("CharacterControllerExt", {
 *     MoveStatic: 4,  // handle + x, y, z
 * })
 * CharacterController.MoveStatic(ccHandle, velocity.x, velocity.y, velocity.z)
 * ```
 */
export function zaStatic<T extends MethodSchema>(typeName: string, methods: T): StaticProxy<T> {
    // Check cache first
    const cacheKey = typeName + ":" + Object.keys(methods).sort().join(",")
    const cached = _proxyCache.get(cacheKey)
    if (cached) {
        return cached as StaticProxy<T>
    }

    // Storage for bound methods
    const boundMethods: Record<string, ZeroAllocFunc> = {}

    // Bind all methods eagerly (fail loudly)
    for (const [methodName, spec] of Object.entries(methods)) {
        const argCount = getArgCount(spec)

        if (argCount < 0 || argCount > 8) {
            throw new Error(`za.static: ${typeName}.${methodName} argCount must be 0-8, got ${argCount}`)
        }

        // Register binding with C# (one-time cost)
        const bindingId = CS.QuickJSNative.RegisterZeroAllocMethodBinding(typeName, methodName, argCount)

        if (bindingId <= 0) {
            throw new Error(`za.static: Failed to bind ${typeName}.${methodName}. ` +
                `Make sure the method exists and is static.`)
        }

        // Store metadata for debugging
        _bindings.set(bindingId, { typeName, methodName, argCount })

        // Create invoker
        boundMethods[methodName] = createInvoker(bindingId, argCount)
    }

    // Create proxy object
    const proxy = boundMethods as StaticProxy<T>

    // Cache it
    _proxyCache.set(cacheKey, proxy)

    return proxy
}

/**
 * Create a zero-alloc function for a single C# static method.
 *
 * This is a convenience wrapper around bind() with cleaner naming.
 *
 * @param typeName Full C# type name
 * @param methodName Method name
 * @param argCount Number of arguments (0-8)
 * @returns Zero-alloc callable function
 *
 * @example
 * ```typescript
 * const getTime = za.method("UnityEngine.Time", "get_time", 0)
 * const getDeltaTime = za.method("UnityEngine.Time", "get_deltaTime", 0)
 *
 * // Per-frame - zero-alloc
 * const t = getTime()
 * const dt = getDeltaTime()
 * ```
 */
export function zaMethod(typeName: string, methodName: string, argCount: number): ZeroAllocFunc {
    return bind(typeName, methodName, argCount)
}

/**
 * Create an invoker from a pre-registered binding ID.
 *
 * Use this when C# has pre-registered bindings and exposed their IDs.
 *
 * @param bindingId Pre-registered binding ID from C#
 * @param argCount Number of arguments (0-8)
 * @returns Zero-alloc callable function
 *
 * @example
 * ```typescript
 * // C# exposes binding IDs via a globals object
 * declare const GPUBindingIds: { dispatch: number, setFloat: number }
 *
 * const dispatch = za.fromId(GPUBindingIds.dispatch, 5)
 * dispatch(shaderHandle, kernelIndex, x, y, z)
 * ```
 */
export function zaFromId(bindingId: number, argCount: number): ZeroAllocFunc {
    return bindById(bindingId, argCount)
}

/**
 * Zero-Allocation Proxy API.
 *
 * Provides ergonomic ways to create zero-alloc bindings for C# methods.
 * Use this for performance-critical code paths that need to avoid
 * managed heap allocations.
 *
 * @example
 * ```typescript
 * import { za } from "onejs-unity/interop"
 *
 * // Bind multiple methods on a class
 * const Physics = za.static("UnityEngine.Physics", {
 *     Raycast: 4,
 *     SphereCast: 5,
 *     OverlapSphereNonAlloc: 4,
 * })
 *
 * // Or bind a single method
 * const getTime = za.method("UnityEngine.Time", "get_time", 0)
 *
 * // Per-frame usage - zero allocations!
 * function update() {
 *     const t = getTime()
 *     if (Physics.Raycast(origin, dir, dist, mask)) {
 *         // ...
 *     }
 * }
 * ```
 */
export const za = {
    /**
     * Create a zero-alloc proxy for static methods on a C# class.
     * @see zaStatic for full documentation
     */
    static: zaStatic,

    /**
     * Create a zero-alloc function for a single C# static method.
     * @see zaMethod for full documentation
     */
    method: zaMethod,

    /**
     * Create an invoker from a pre-registered binding ID.
     * @see zaFromId for full documentation
     */
    fromId: zaFromId,

    /**
     * Get debug info about all registered bindings.
     */
    getBindingInfo,

    /**
     * Get count of registered bindings.
     */
    getBindingCount,
}
