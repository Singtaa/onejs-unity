// timers.d.ts declares ambient globals (setTimeout on the OneJS clock), so a
// reference keeps this file a plain module; an import would pull it into the
// module graph for nothing.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../timers.d.ts" />
/**
 * React surface for the fx pipeline.
 *
 *     const tex = useTexture(() =>
 *         image.sdf(200, 200, "hexagon", { r: 0.4 }).outline(6, accent, "luminance"),
 *         [accent])
 *
 *     <View style={{ width: 200, height: 200, backgroundImage: tex }} />
 *
 * Without a hook you would reach for useMemo, and that gets two things wrong:
 * nothing releases the target when the component unmounts, and an empty
 * dependency list means the chain never follows its props. This does both.
 */

import { useEffect, useRef, useState, type DependencyList } from "react"
import { Image, RenderTarget, beginOwnership, endOwnership, image as imageFactory, type Texture } from "./image"

const createTarget = (w: number, h: number): RenderTarget => imageFactory.target(w, h)

/**
 * Builds a chain, renders it, and returns the Unity texture to hand to a
 * `backgroundImage` style or an `<Image src>`.
 *
 * The chain is rebuilt when `deps` change, and the previous one is released
 * first. Everything the build callback causes to be rendered is released
 * together, including an operand built inside it:
 *
 *     useTexture(() => {
 *         const mask = image.sdf(256, 256, "star", { r: 0.4 })  // owned too
 *         return image.noise(256, 256).blend(mask, "multiply")
 *     }, [])
 *
 * An `Image` created *outside* the callback has already rendered by the time it
 * gets here, so it stays yours to dispose. The rule is that this owns what it
 * caused to exist, not what it merely used.
 *
 * Returns null on the first render if the runtime is unavailable, so a caller
 * can render something rather than throwing.
 */
export function useTexture(build: () => Image, deps: DependencyList = []): Texture | null {
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
        } finally {
            images = endOwnership()
        }
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
 * The same, but returns the chain as well, for code that wants to read the
 * handle or dispose early.
 */
export function useImage(build: () => Image, deps: DependencyList = []): Image | null {
    const [img, setImg] = useState<Image | null>(null)

    useEffect(() => {
        let images: Image[] = []
        let result: Image | null = null
        beginOwnership()
        try {
            result = build()
            result.render()
        } finally {
            images = endOwnership()
        }
        setImg(result)
        return () => {
            for (const i of images) i.dispose()
            setImg(null)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps)

    return img
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
 */
export function useAnimatedTexture(
    width: number,
    height: number,
    build: (seconds: number) => Image,
    deps: DependencyList = [],
): Texture | null {
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
            try {
                latest.current(seconds).renderTo(target)
            } finally {
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
