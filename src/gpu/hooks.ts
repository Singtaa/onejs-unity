/**
 * React hooks for GPU compute operations.
 *
 * These hooks simplify common patterns when working with compute shaders
 * and render textures in React components.
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { compute } from "./compute"
import type { RenderTexture, ComputeShader, RenderTextureOptions } from "./types"

/**
 * Options for useComputeTexture hook.
 */
export interface UseComputeTextureOptions {
    /**
     * Automatically resize to match screen dimensions.
     * @default true
     */
    autoResize?: boolean

    /**
     * Initial width (only used if autoResize is false).
     */
    width?: number

    /**
     * Initial height (only used if autoResize is false).
     */
    height?: number

    /**
     * Enable random write for compute shader output.
     * @default true
     */
    enableRandomWrite?: boolean
}

/**
 * Return type for useComputeTexture hook.
 */
export interface UseComputeTextureResult {
    /**
     * The RenderTexture for use with backgroundImage and compute shaders.
     * Pass directly to View's backgroundImage style.
     * Will be null until initialized.
     */
    texture: RenderTexture | null

    /**
     * Counter that increments on each resize.
     * Include in style object dependencies to force re-application after resize.
     *
     * @example
     * const { texture, resizeCount } = useComputeTexture({ autoResize: true })
     * const style = useMemo(() => ({
     *     backgroundImage: texture
     * }), [texture, resizeCount])
     */
    resizeCount: number
}

/**
 * Hook that creates and manages a RenderTexture for compute shader output.
 *
 * Handles creation, auto-resize, and cleanup automatically.
 *
 * @param options Configuration options
 * @returns The managed RenderTexture
 *
 * @example
 * function BackgroundEffect({ shader }) {
 *     const { texture } = useComputeTexture({ autoResize: true })
 *
 *     useAnimationFrame(() => {
 *         if (!texture) return
 *         shader.kernel("CSMain")
 *             .float("_Time", performance.now() / 1000)
 *             .vec2("_Resolution", [texture.width, texture.height])
 *             .textureRW("_Result", texture)
 *             .dispatchAuto(texture)
 *     })
 *
 *     return <View style={{ width: "100%", height: "100%", backgroundImage: texture }} />
 * }
 */
export function useComputeTexture(options: UseComputeTextureOptions = {}): UseComputeTextureResult {
    const { autoResize = true, width, height, enableRandomWrite = true } = options

    const [texture, setTexture] = useState<RenderTexture | null>(null)
    const [resizeCount, setResizeCount] = useState(0)

    useEffect(() => {
        const rtOptions: RenderTextureOptions = {
            autoResize,
            enableRandomWrite,
        }

        if (!autoResize) {
            rtOptions.width = width ?? compute.screenWidth
            rtOptions.height = height ?? compute.screenHeight
        }

        const rt = compute.renderTexture(rtOptions)
        setTexture(rt)

        return () => {
            rt.dispose()
        }
    }, [autoResize, width, height, enableRandomWrite])

    // Track resize events and increment counter
    useEffect(() => {
        if (!texture || !autoResize) return

        let animationId: number
        let lastWidth = texture.width
        let lastHeight = texture.height

        function checkResize() {
            if (!texture) return

            // Accessing width/height triggers auto-resize
            const w = texture.width
            const h = texture.height

            if (w !== lastWidth || h !== lastHeight) {
                lastWidth = w
                lastHeight = h
                setResizeCount(c => c + 1)
            }

            animationId = requestAnimationFrame(checkResize)
        }

        animationId = requestAnimationFrame(checkResize)

        return () => cancelAnimationFrame(animationId)
    }, [texture, autoResize])

    return { texture, resizeCount }
}

/**
 * Options for useAnimationFrame hook.
 */
export interface UseAnimationFrameOptions {
    /**
     * Whether the animation loop is active.
     * @default true
     */
    active?: boolean
}

/**
 * Hook that runs a callback on every animation frame.
 *
 * Automatically handles cleanup when the component unmounts.
 *
 * @param callback Function to call each frame. Receives delta time in seconds.
 * @param options Configuration options
 *
 * @example
 * useAnimationFrame((deltaTime) => {
 *     // Update shader uniforms, dispatch compute, etc.
 *     shader.kernel("CSMain")
 *         .float("_Time", performance.now() / 1000)
 *         .dispatchAuto(texture)
 * })
 */
export function useAnimationFrame(
    callback: (deltaTime: number) => void,
    options: UseAnimationFrameOptions = {}
): void {
    const { active = true } = options
    const callbackRef = useRef(callback)
    const lastTimeRef = useRef<number | null>(null)

    // Keep callback ref up to date
    useEffect(() => {
        callbackRef.current = callback
    }, [callback])

    useEffect(() => {
        if (!active) return

        let animationId: number

        function tick(time: number) {
            const deltaTime = lastTimeRef.current === null
                ? 0
                : (time - lastTimeRef.current) / 1000
            lastTimeRef.current = time

            callbackRef.current(deltaTime)
            animationId = requestAnimationFrame(tick)
        }

        animationId = requestAnimationFrame(tick)

        return () => {
            cancelAnimationFrame(animationId)
            lastTimeRef.current = null
        }
    }, [active])
}

/**
 * Hook that registers a compute shader from a global and manages its lifecycle.
 *
 * @param shaderGlobal The shader object injected via JSRunner globals
 * @param name Optional name for debugging
 * @returns The registered ComputeShader, or null if not ready
 *
 * @example
 * declare const myShader: unknown
 *
 * function Effect() {
 *     const shader = useComputeShader(myShader, "MyEffect")
 *     // shader is ready to use
 * }
 */
export function useComputeShader(
    shaderGlobal: unknown,
    name?: string
): ComputeShader | null {
    const [shader, setShader] = useState<ComputeShader | null>(null)

    useEffect(() => {
        if (!shaderGlobal) return

        try {
            const registered = compute.register(shaderGlobal, name)
            setShader(registered)

            return () => {
                // Note: We don't dispose here because the shader comes from globals
                // and may be reused. The global owns the lifecycle.
            }
        } catch (err) {
            console.error(`Failed to register compute shader${name ? ` "${name}"` : ""}:`, err)
        }
    }, [shaderGlobal, name])

    return shader
}
