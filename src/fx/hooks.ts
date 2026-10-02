// timers.d.ts declares ambient globals (setTimeout on the OneJS clock), so a
// reference keeps this file a plain module; an import would pull it into the
// module graph for nothing.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../timers.d.ts" />
/**
 * React surface for the fx pipeline. A texture and an animation, named as a pair:
 *
 *     const c = canvas(200)
 *     const badge = useTexture(c, () => c.sdf("hexagon", { r: 0.4 }).outline(6, accent, "luminance"), [accent])
 *     const fire = useAnimation(c, (t) => c.noise({ scroll: [0, -0.3] }).ramp(FIRE))
 *
 *     <View style={{ width: 200, height: 200, backgroundImage: badge }} />
 *
 * Without a hook you would reach for useMemo, and that gets two things wrong:
 * nothing releases the target when the component unmounts, and an empty
 * dependency list means the chain never follows its props. This does both.
 */

import { useEffect, useRef, useState, type DependencyList } from "react"
import { Image, RenderTarget, beginOwnership, endOwnership, image as imageFactory, setAnimationTime, type Canvas, type Texture } from "./image"

const createTarget = (w: number, h: number): RenderTarget => imageFactory.target(w, h)

/**
 * Renders `build()` into a target the canvas's size and frees every image the
 * build caused to exist. The target is the caller's to dispose. If the build
 * throws, everything it made and the target are freed before the throw goes on.
 * Exported for the tests; the package exports the hooks.
 */
export function renderOnce(canvas: Canvas, build: () => Image): RenderTarget {
    const target = createTarget(canvas.width, canvas.height)
    let owned: Image[] = []
    beginOwnership()
    try {
        build().renderTo(target)
    } catch (e) {
        target.dispose()
        throw e
    } finally {
        owned = endOwnership()
        for (const img of owned) img.dispose()
    }
    return target
}

/**
 * An animation: `build(seconds)` runs every frame against a clock and renders
 * into one texture at the canvas's size, so the element is assigned once.
 *
 *     const c = canvas(512)
 *     const fire = useAnimation(c, (t) => c.noise({ scale: 4, scroll: [0, -0.3] }).ramp(FIRE))
 *
 * A build that throws stops the animation and logs once, rather than every
 * frame.
 */
export function useAnimation(canvas: Canvas, build: (seconds: number) => Image, deps: DependencyList = []): Texture | null {
    return useAnimatedTexture(canvas, build, deps)
}

/**
 * A texture: builds a chain once, and again when `deps` change, renders it at
 * the canvas's size, and returns the Unity texture for a `backgroundImage`
 * style or an `<Image src>`.
 *
 *     const c = canvas(256)
 *     const glow = useTexture(c, () => c.sdf("circle", { r: 0.3 }).blur(12), [])
 *
 * Everything the build makes is released after rendering, including an
 * operand built inside it, and the texture is released when the deps change or
 * the component unmounts. An `Image` created outside the build has already
 * rendered by the time it gets here, so it stays yours to dispose. Returns null
 * until the first render has happened, so render something in its place.
 *
 * The older form without a canvas, `useTexture(build, deps)`, still works and
 * keeps the chain's own size.
 */
export function useTexture(canvas: Canvas, build: () => Image, deps?: DependencyList): Texture | null
export function useTexture(build: () => Image, deps?: DependencyList): Texture | null
export function useTexture(
    a: Canvas | (() => Image),
    b?: (() => Image) | DependencyList,
    c?: DependencyList,
): Texture | null {
    // The form is fixed for a call site, so the hooks below run in the same
    // order on every render.
    return typeof a === "function"
        ? useChainTexture(a, (b as DependencyList | undefined) ?? [])
        : useCanvasTexture(a, b as () => Image, c ?? [])
}

function useCanvasTexture(canvas: Canvas, build: () => Image, deps: DependencyList): Texture | null {
    const [texture, setTexture] = useState<Texture | null>(null)
    const latest = useRef(build)
    latest.current = build

    useEffect(() => {
        const target = renderOnce(canvas, () => latest.current())
        setTexture(target.texture())
        return () => target.dispose()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvas.width, canvas.height, ...deps])

    return texture
}

function useChainTexture(build: () => Image, deps: DependencyList): Texture | null {
    const owned = useRef<Image[] | null>(null)
    const [texture, setTexture] = useState<Texture | null>(null)

    useEffect(() => {
        let images: Image[] = []
        let tex: Texture | null = null
        beginOwnership()
        try {
            const result = build()
            // render() before endOwnership, or the chain's own target is not
            // counted among what this hook owns.
            result.render()
            tex = result.texture()
        } catch (e) {
            for (const img of endOwnership()) img.dispose()
            throw e
        }
        images = endOwnership()
        owned.current = images
        setTexture(tex)

        return () => {
            for (const img of images) img.dispose()
            owned.current = null
            // Not setTexture(null): this runs on unmount too, and setting state
            // there warns. The next effect overwrites it anyway.
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)

    return texture
}

/**
 * A chain kept for the life of the component: a mask, an envelope, anything
 * built once and used by every frame of an animated chain.
 *
 *     const mask = useImage(() => image.sdf(512, 512, "star", { r: 0.4 }).blur(40), [])
 *     const fire = useAnimatedTexture(512, 512, (t) => image.noise(512, 512, { scroll: [0, -0.2] }).multiply(mask), [mask])
 *
 * Built synchronously, on the first render and again when `deps` change, so
 * the result is always an Image and never null: the first version handed back
 * null until an effect ran, and every caller grew an `envelope ? ... :` guard
 * around it. What the build causes to render is owned here and released when
 * the chain is rebuilt or the component unmounts.
 */
export function useImage(build: () => Image, deps: DependencyList = []): Image {
    const held = useRef<{ deps: DependencyList; img: Image; owned: Image[] } | null>(null)
    const current = held.current
    if (current === null || !sameDeps(current.deps, deps)) {
        if (current !== null) for (const i of current.owned) i.dispose()
        let owned: Image[] = []
        let img: Image
        beginOwnership()
        try {
            img = build()
            // render() before endOwnership, or the chain's own target is not
            // counted among what this hook owns.
            img.render()
        } finally {
            owned = endOwnership()
        }
        held.current = { deps: [...deps], img, owned }
    }

    useEffect(() => () => {
        const h = held.current
        if (h === null) return
        for (const i of h.owned) i.dispose()
        held.current = null
    }, [])

    return held.current!.img
}

function sameDeps(a: DependencyList, b: DependencyList): boolean {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false
    return true
}

/**
 * An animated chain: rebuilt every frame against a clock, rendered into one
 * stable target.
 *
 *     const fire = useAnimatedTexture(512, 512, (t) => buildFire(t), [])
 *     <View style={{ backgroundImage: fire }} />
 *
 * The returned texture never changes identity, so the element is assigned once
 * and the component does not re-render per frame. That is the whole reason this
 * exists rather than driving `useTexture` off a ticking state value: doing it
 * that way costs a React render, a fresh target and a released target every
 * frame, for a picture that was going to change anyway.
 *
 * `build` receives seconds since the effect started, accumulated from the frame
 * delta rather than read off the wall clock, so it follows whatever clock the
 * frame loop is on. An offline render runs far faster than realtime, and wall
 * time would leave it looking frozen.
 *
 * Each frame calls the `build` from the LATEST render, not the one the loop
 * started with, so a chain can read props and state directly and `deps` only
 * says when to restart the clock and reallocate the target. Before this, a
 * callback captured its first render's values for as long as the loop ran,
 * and every game with a slider ended up mirroring its state into a ref to get
 * around it.
 *
 * @deprecated Use `useAnimation(canvas, build, deps)`, the animated half of
 * `useTexture` and `useAnimation`.
 */
export function useAnimatedTexture(canvas: Canvas, build: (seconds: number) => Image, deps?: DependencyList): Texture | null
export function useAnimatedTexture(width: number, height: number, build: (seconds: number) => Image, deps?: DependencyList): Texture | null
export function useAnimatedTexture(
    sizeOrCanvas: number | Canvas,
    heightOrBuild: number | ((seconds: number) => Image),
    buildOrDeps?: ((seconds: number) => Image) | DependencyList,
    maybeDeps: DependencyList = [],
): Texture | null {
    // Either (canvas, build, deps) or (width, height, build, deps).
    const width = typeof sizeOrCanvas === "number" ? sizeOrCanvas : sizeOrCanvas.width
    const height = typeof sizeOrCanvas === "number" ? (heightOrBuild as number) : sizeOrCanvas.height
    const build = typeof sizeOrCanvas === "number" ? (buildOrDeps as (seconds: number) => Image) : (heightOrBuild as (seconds: number) => Image)
    const deps: DependencyList = typeof sizeOrCanvas === "number" ? maybeDeps : ((buildOrDeps as DependencyList | undefined) ?? [])
    const [texture, setTexture] = useState<Texture | null>(null)
    const latest = useRef(build)
    latest.current = build

    useEffect(() => {
        const target = createTarget(width, height)
        setTexture(target.texture())

        let raf = 0
        let last: number | null = null
        let seconds = 0
        const tick = (ms: number) => {
            raf = requestAnimationFrame(tick)
            if (last !== null) seconds += (ms - last) / 1000
            last = ms
            // The same ownership scope useTexture uses, per frame.
            //
            // renderTo itself tracks nothing, but an Image used as an operand
            // renders when the chain is BUILT, not when it is rendered, so a
            // build that composes two fresh sources allocates and tracks a
            // target for each of them every frame. Measured at 348 live handles
            // and climbing before this was here.
            //
            // An operand created outside the callback, which is the usual way to
            // hold something constant like a mask, has already rendered and so
            // does not join the scope. It survives.
            beginOwnership()
            let owned: Image[] = []
            // The clock a `scroll` reads. Cleared after, so a chain built
            // outside an animated build is a still at time zero.
            setAnimationTime(seconds)
            try {
                latest.current(seconds).renderTo(target)
            } catch (e) {
                // Stop rather than throw the same error sixty times a second
                cancelAnimationFrame(raf)
                console.error("[onejs fx] the animation's build threw, so it stopped:", e)
            } finally {
                setAnimationTime(0)
                owned = endOwnership()
            }
            for (const img of owned) img.dispose()
        }
        raf = requestAnimationFrame(tick)

        return () => {
            cancelAnimationFrame(raf)
            target.dispose()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [width, height, ...deps])

    return texture
}
