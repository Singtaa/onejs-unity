/**
 * A texture you can chain operations on.
 *
 *     import { image } from "onejs-unity/fx"
 *
 *     const out = image.load("portrait.png")
 *         .multiply(0.15)
 *         .add(0.5)
 *         .pow(2.2)
 *         .clamp(0, 1)
 *         .render()
 *
 *     <View style={{ backgroundImage: out }} />
 *
 * Nothing runs until render(). The chain is a description, which is what lets
 * the C# side fuse a run of per pixel operations into one blit, borrow its
 * intermediates from a pool, and pick a backend. Spark2D dispatched per
 * operation instead, so `mul(0.15).add(0.5).pow(2.2).clamp(0,1)` cost four full
 * screen passes and roughly twelve reflection crossings; here it is one pass and
 * one crossing.
 *
 * Values are semantics, not mutation: every operation returns a new node and
 * nothing writes into its own input. Which physical render target backs a node
 * is the runtime's business.
 */

import { MAX_GRADIENT_STOPS, MODE, OP, SOURCE, WIRE_VERSION, type Mode, type OpCode } from "./ops"
import { SDF_SHAPES, packSdfCommon, packSdfParams, type SdfKind, type SdfOptions } from "./sdf"

const DEG2RAD = Math.PI / 180

declare const CS: {
    OneJS: {
        Fx: {
            FxBridge: {
                LoadTexture: (path: string) => number
                Execute: (buffer: unknown) => number
                GetTexture: (handle: number) => unknown
                Release: (handle: number) => void
            }
        }
    }
}

/** A right hand operand: a number, a per channel float4, or another image. */
export type Operand = number | [number, number, number, number] | Image

interface Step {
    op: OpCode
    mode: Mode
    /** Up to four floats, or a single texture handle when mode is TEXTURE. */
    args: number[]
}

/** Colour written as 0..1 components. */
export type RGBA = [number, number, number, number]

export interface NoiseOptions {
    /** Repeats across the texture. A scalar applies to both axes. Default 4. */
    scale?: number | [number, number]
    /** Any number; different seeds give unrelated fields. Default 1. */
    seed?: number
    /** Detail levels, 1 to 4. More is wispier and costs more. Default 3. */
    octaves?: number
    /** Pans the field, in noise space. Default [0, 0]. */
    offset?: [number, number]
    /** Rotates the field, in degrees. Default 0. */
    rotation?: number
}

export interface GradientStop {
    color: RGBA
    /** Position along the gradient, 0..1. */
    at: number
}

function operandParts(v: Operand): { mode: Mode; args: number[] } {
    if (typeof v === "number") return { mode: MODE.SCALAR, args: [v] }
    if (Array.isArray(v)) return { mode: MODE.VECTOR, args: [v[0], v[1], v[2], v[3]] }
    // An Image operand has to be resolved to a real texture before this chain
    // can run, so it renders first. Its own chain is usually short and the
    // result is cached on the node, so a shared operand is not re-rendered.
    return { mode: MODE.TEXTURE, args: [v.render()] }
}

export class Image {
    /** The source op, then everything applied to it in order. */
    readonly #steps: Step[]
    #rendered: number | null = null

    private constructor(steps: Step[]) {
        this.#steps = steps
    }

    /** @internal Starts a chain from a source op. */
    static from(op: OpCode, args: number[]): Image {
        return new Image([{ op, mode: MODE.SCALAR, args }])
    }

    #then(op: OpCode, mode: Mode, args: number[]): Image {
        return new Image([...this.#steps, { op, mode, args }])
    }

    #binary(op: OpCode, v: Operand): Image {
        const { mode, args } = operandParts(v)
        return this.#then(op, mode, args)
    }

    #unary(op: OpCode, args: number[] = []): Image {
        return this.#then(op, MODE.SCALAR, args)
    }

    // MARK: basic

    add(v: Operand): Image { return this.#binary(OP.ADD, v) }
    subtract(v: Operand): Image { return this.#binary(OP.SUBTRACT, v) }
    multiply(v: Operand): Image { return this.#binary(OP.MULTIPLY, v) }
    divide(v: Operand): Image { return this.#binary(OP.DIVIDE, v) }
    /** Raises the absolute value, so a negative input does not produce NaN. */
    pow(v: Operand): Image { return this.#binary(OP.POW, v) }
    sqrt(): Image { return this.#unary(OP.SQRT) }

    // MARK: range

    clamp(min: number, max: number): Image { return this.#unary(OP.CLAMP, [min, max]) }
    frac(): Image { return this.#unary(OP.FRACTION) }
    max(v: Operand): Image { return this.#binary(OP.MAXIMUM, v) }
    min(v: Operand): Image { return this.#binary(OP.MINIMUM, v) }
    oneMinus(): Image { return this.#unary(OP.ONE_MINUS) }
    remap(fromMin: number, fromMax: number, toMin: number, toMax: number): Image {
        return this.#unary(OP.REMAP, [fromMin, fromMax, toMin, toMax])
    }
    saturate(): Image { return this.#unary(OP.SATURATE) }

    // MARK: advanced

    abs(): Image { return this.#unary(OP.ABSOLUTE) }
    exp(): Image { return this.#unary(OP.EXPONENTIAL) }
    log(): Image { return this.#unary(OP.LOG) }
    modulo(v: Operand): Image { return this.#binary(OP.MODULO, v) }
    negate(): Image { return this.#unary(OP.NEGATE) }
    posterize(v: Operand): Image { return this.#binary(OP.POSTERIZE, v) }
    reciprocal(): Image { return this.#unary(OP.RECIPROCAL) }

    // MARK: interpolation

    /** Mixes toward `v` by `t`. */
    lerp(v: Operand, t: number): Image {
        const { mode, args } = operandParts(v)
        // t rides in the last slot, which a scalar or texture operand leaves free.
        return this.#then(OP.LERP, mode, mode === MODE.VECTOR ? [...args] : [args[0], 0, 0, t])
    }
    smoothstep(edge0: number, edge1: number): Image {
        return this.#unary(OP.SMOOTHSTEP, [edge0, edge1])
    }
    inverseLerp(v: Operand): Image { return this.#binary(OP.INVERSE_LERP, v) }

    /**
     * Flattens the chain into the buffer FxBridge reads. Exposed for tests and
     * for anyone who wants to see what a chain costs; render() calls it.
     */
    encode(): Float32Array {
        const out: number[] = [WIRE_VERSION, this.#steps.length]
        for (const s of this.#steps) {
            out.push(s.op, s.mode, s.args.length, ...s.args)
        }
        return new Float32Array(out)
    }

    /**
     * Runs the chain and returns a texture handle. Cached, so passing one image
     * as an operand to several others renders it once.
     */
    render(): number {
        if (this.#rendered === null) {
            this.#rendered = CS.OneJS.Fx.FxBridge.Execute(this.encode())
        }
        return this.#rendered
    }

    /** The Unity texture, for `backgroundImage` or `<Image src>`. */
    texture(): unknown {
        return CS.OneJS.Fx.FxBridge.GetTexture(this.render())
    }

    /** Returns this image's target to the pool. */
    dispose(): void {
        if (this.#rendered !== null) {
            CS.OneJS.Fx.FxBridge.Release(this.#rendered)
            this.#rendered = null
        }
    }
}

export const image = {
    /** Loads a texture and starts a chain from it. */
    load(path: string): Image {
        return Image.from(OP.SOURCE_TEXTURE, [CS.OneJS.Fx.FxBridge.LoadTexture(path)])
    },

    /** Wraps a texture handle you already hold, from GPUBridge or elsewhere. */
    fromHandle(handle: number): Image {
        return Image.from(OP.SOURCE_TEXTURE, [handle])
    },

    /** A flat colour. Give it a size, since there is no input to take one from. */
    color(width: number, height: number, rgba: RGBA): Image {
        return Image.from(OP.SOURCE_COLOR, [width, height, ...rgba])
    },

    /** A transparent target of the given size. */
    blank(width: number, height: number): Image {
        return image.color(width, height, [0, 0, 0, 0])
    },

    /**
     * Scrolling fBm value noise, greyscale in 0..1. Computed from a seed rather
     * than sampled, so it needs no art and never repeats.
     */
    noise(width: number, height: number, o: NoiseOptions = {}): Image {
        const scale = o.scale === undefined ? [4, 4]
            : typeof o.scale === "number" ? [o.scale, o.scale]
            : o.scale
        const offset = o.offset ?? [0, 0]
        return Image.from(SOURCE.NOISE, [
            width, height,
            scale[0], scale[1],
            Math.max(1, Math.min(4, Math.floor(o.octaves ?? 3))),
            o.seed ?? 1,
            offset[0], offset[1],
            (o.rotation ?? 0) * DEG2RAD,
        ])
    },

    /**
     * A multi stop linear gradient. Stops are sorted and clamped to 0..1 here,
     * because the shader walks them in order and reads a descending pair as a
     * zero width span rather than an error.
     */
    gradient(width: number, height: number, stops: GradientStop[], angle = 0): Image {
        if (stops.length < 1) throw new Error("[onejs fx] a gradient needs at least one stop")
        if (stops.length > MAX_GRADIENT_STOPS)
            throw new Error(`[onejs fx] a gradient takes at most ${MAX_GRADIENT_STOPS} stops`)
        const sorted = [...stops].sort((a, b) => a.at - b.at)
        const args: number[] = [width, height, angle * DEG2RAD, sorted.length]
        for (const s of sorted) {
            args.push(s.color[0], s.color[1], s.color[2], s.color[3], Math.min(1, Math.max(0, s.at)))
        }
        return Image.from(SOURCE.GRADIENT, args)
    },

    /**
     * One of the 42 signed distance shapes, as a greyscale mask. Same shapes,
     * defaults and centred aspect corrected space as `fx.sdf` in TextureFX.
     */
    sdf(width: number, height: number, kind: SdfKind, o: SdfOptions = {}): Image {
        const [params, params2] = packSdfParams(kind, o)
        return Image.from(SOURCE.SDF, [
            width, height, SDF_SHAPES[kind],
            ...params, ...params2,
            ...packSdfCommon(o),
        ])
    },
}
