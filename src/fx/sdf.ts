/**
 * Shape names and parameter packing for the fx sdf source.
 *
 * The ids, the defaults and the awkward angle conventions are the same ones
 * onejs-react/texturefx.ts uses, because both feed the same SDF2D.cginc. They
 * are restated here rather than imported: onejs-unity does not depend on
 * onejs-react, and inverting that to share one table would make the whole
 * Unity utility package depend on the React renderer.
 *
 * If a shape id changes it changes in three places: here, texturefx.ts, and the
 * sdfDistance switch in both OneJS/TextureFX and OneJS/FxSources.
 */

const DEG2RAD = Math.PI / 180

export const SDF_SHAPES = {
    circle: 0, roundedBox: 1, box: 2, orientedBox: 3, segment: 4, rhombus: 5,
    trapezoid: 6, parallelogram: 7, equilateralTriangle: 8, triangleIsosceles: 9,
    triangle: 10, unevenCapsule: 11, pentagon: 12, hexagon: 13, octagon: 14,
    hexagram: 15, star5: 16, star: 17, pie: 18, cutDisk: 19, arc: 20, ring: 21,
    horseshoe: 22, vesica: 23, orientedVesica: 24, moon: 25, roundedCross: 26,
    egg: 27, heart: 28, cross: 29, roundedX: 30, ellipse: 31, parabola: 32,
    parabolaSegment: 33, bezier: 34, blobbyCross: 35, tunnel: 36, stairs: 37,
    quadraticCircle: 38, hyperbola: 39, coolS: 40, circleWave: 41,
} as const

export type SdfKind = keyof typeof SDF_SHAPES

export interface SdfOptions {
    /** Centre offset. Default 0, 0. */
    x?: number
    y?: number
    /** Degrees, clockwise. Default 0. */
    rotation?: number
    /** Uniform scale, for the shapes IQ authored at unit size. Default 1. */
    scale?: number
    /** Rounds every corner. Works on any shape. Default 0. */
    rounded?: number
    /** Turns the shape into an outline of this half width. Default 0. */
    onion?: number
    /** Width of the antialiased edge. Default 0.01. */
    softness?: number
    /** Emit the raw signed distance instead of a 0..1 mask. Default false. */
    field?: boolean
    [param: string]: unknown
}

type Quad = [number, number, number, number]
type Pair = [number, number]
const xy = (v: unknown, dx: number, dy: number): Pair =>
    Array.isArray(v) ? [v[0] as number, v[1] as number] : [dx, dy]
const n = (v: unknown, d: number): number => (typeof v === "number" ? v : d)

/** The six shape floats, in the order sdfDistance reads them. */
export function packSdfParams(kind: SdfKind, o: SdfOptions): [Quad, Pair] {
    const q = (a = 0, b = 0, c = 0, d = 0): Quad => [a, b, c, d]
    const none: Pair = [0, 0]
    switch (kind) {
        case "circle": return [q(n(o.r, 0.35)), none]
        case "roundedBox": {
            const c = o.corners ?? 0.1
            const [tr, br, tl, bl] = typeof c === "number" ? [c, c, c, c] : (c as Quad)
            return [q(n(o.w, 0.3), n(o.h, 0.35), tr, br), [tl, bl]]
        }
        case "box": return [q(n(o.w, 0.3), n(o.h, 0.35)), none]
        case "orientedBox": {
            const [ax, ay] = xy(o.a, -0.25, -0.2), [bx, by] = xy(o.b, 0.25, 0.2)
            return [q(ax, ay, bx, by), [n(o.thickness, 0.15), 0]]
        }
        case "segment": {
            const [ax, ay] = xy(o.a, -0.25, -0.25), [bx, by] = xy(o.b, 0.25, 0.25)
            return [q(ax, ay, bx, by), none]
        }
        case "rhombus": return [q(n(o.w, 0.3), n(o.h, 0.4)), none]
        case "trapezoid": return [q(n(o.rBottom, 0.35), n(o.rTop, 0.2), n(o.h, 0.35)), none]
        case "parallelogram": return [q(n(o.w, 0.3), n(o.h, 0.3), n(o.skew, 0.12)), none]
        case "equilateralTriangle": return [q(n(o.r, 0.35)), none]
        case "triangleIsosceles": return [q(n(o.w, 0.3), n(o.h, 0.45)), none]
        case "triangle": {
            const [ax, ay] = xy(o.a, -0.35, -0.3), [bx, by] = xy(o.b, 0.35, -0.25)
            return [q(ax, ay, bx, by), xy(o.c, 0, 0.4)]
        }
        case "unevenCapsule": return [q(n(o.rBottom, 0.2), n(o.rTop, 0.1), n(o.h, 0.35)), none]
        case "pentagon": return [q(n(o.r, 0.35)), none]
        case "hexagon": return [q(n(o.r, 0.35)), none]
        case "octagon": return [q(n(o.r, 0.35)), none]
        case "hexagram": return [q(n(o.r, 0.25)), none]
        case "star5": return [q(n(o.r, 0.35), n(o.inset, 0.45)), none]
        case "star": return [q(n(o.r, 0.35), n(o.points, 6), n(o.sharpness, 3)), none]
        // pie and arc want the sine and cosine of a half angle; ring and
        // horseshoe want the cosine and sine of a rotation. Not a typo.
        case "pie": {
            const a = n(o.aperture, 60) * DEG2RAD
            return [q(Math.sin(a), Math.cos(a), n(o.r, 0.38)), none]
        }
        case "cutDisk": return [q(n(o.r, 0.38), n(o.cut, -0.15)), none]
        case "arc": {
            const a = n(o.aperture, 70) * DEG2RAD
            return [q(Math.sin(a), Math.cos(a), n(o.r, 0.32), n(o.thickness, 0.06)), none]
        }
        case "ring": {
            const a = n(o.angle, 70) * DEG2RAD
            return [q(Math.cos(a), Math.sin(a), n(o.r, 0.3), n(o.thickness, 0.1)), none]
        }
        case "horseshoe": {
            const a = n(o.angle, 57) * DEG2RAD
            return [q(Math.cos(a), Math.sin(a), n(o.r, 0.3), n(o.w, 0.1)), [n(o.h, 0.06), 0]]
        }
        case "vesica": return [q(n(o.r, 0.4), n(o.d, 0.2)), none]
        case "orientedVesica": {
            const [ax, ay] = xy(o.a, -0.25, -0.2), [bx, by] = xy(o.b, 0.25, 0.2)
            return [q(ax, ay, bx, by), [n(o.w, 0.12), 0]]
        }
        case "moon": return [q(n(o.d, 0.15), n(o.r, 0.35), n(o.rCut, 0.32)), none]
        case "roundedCross": return [q(n(o.h, 0.5)), none]
        case "egg": return [q(n(o.r, 0.3), n(o.rTop, 0.12)), none]
        case "heart": return [q(), none]
        case "cross": return [q(n(o.w, 0.35), n(o.h, 0.12), n(o.r, 0.03)), none]
        case "roundedX": return [q(n(o.w, 0.5), n(o.r, 0.08)), none]
        case "ellipse": return [q(n(o.rx, 0.4), n(o.ry, 0.25)), none]
        case "parabola": return [q(n(o.k, 2)), none]
        case "parabolaSegment": return [q(n(o.w, 0.35), n(o.h, 0.4)), none]
        case "bezier": {
            const [ax, ay] = xy(o.a, -0.35, -0.25), [bx, by] = xy(o.b, 0, 0.5)
            return [q(ax, ay, bx, by), xy(o.c, 0.35, -0.25)]
        }
        case "blobbyCross": return [q(n(o.h, 0.4)), none]
        case "tunnel": return [q(n(o.w, 0.3), n(o.h, 0.3)), none]
        case "stairs": return [q(n(o.w, 0.12), n(o.h, 0.12), n(o.steps, 4)), none]
        case "quadraticCircle": return [q(), none]
        case "hyperbola": return [q(n(o.k, 0.01), n(o.h, 0.35)), none]
        case "coolS": return [q(), none]
        case "circleWave": return [q(n(o.tightness, 0.5), n(o.r, 0.25)), none]
    }
}

/** The transform and edge floats that follow the shape params on the wire. */
export function packSdfCommon(o: SdfOptions): number[] {
    return [
        o.x ?? 0,
        o.y ?? 0,
        (o.rotation ?? 0) * DEG2RAD,
        o.scale ?? 1,
        o.rounded ?? 0,
        o.onion ?? 0,
        o.softness ?? 0.01,
        o.field ? 1 : 0,
    ]
}
