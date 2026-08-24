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
import { Image, beginOwnership, endOwnership } from "./image"

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
export function useTexture(build: () => Image, deps: DependencyList = []): unknown {
    const owned = useRef<Image[] | null>(null)
    const [texture, setTexture] = useState<unknown>(null)

    useEffect(() => {
        let images: Image[] = []
        let tex: unknown = null
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
