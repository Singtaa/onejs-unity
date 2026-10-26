/**
 * Tensor shapes as types: einsum and slicing checked by the TypeScript
 * checker, with no runtime cost and no build step.
 *
 * Types only. A tensor library binds them by declaring its own functions
 * against them, and its errors then land on the spec string in the editor:
 *
 *     declare function einsum<S extends string, A extends Shape, B extends Shape>(
 *         spec: S & EinsumCheck<S, A, B>, a: Tensor<A>, b: Tensor<B>): EinsumResult<S, A, B>
 *
 *     einsum("bhqd,bhkd->bhqk", q, k)   // Tensor<["B", 8, 64, 128]>
 *     einsum("bhqd,bhkd->bhqk", q, k2)  // error on the spec: size mismatch on 'd'
 *
 * A dimension is a literal size (8) or a symbolic one ("B"). Two symbolic
 * names never unify, and a symbolic name never matches a literal. A
 * dimension widened to `number`, which is what a slice with bounds produces,
 * matches anything.
 */

declare const shape: unique symbol

/** A dimension: a literal size, a symbolic name such as "B", or `number` when unknown. */
export type Dim = number | string

/** A tensor's shape, outermost dimension first. */
export type Shape = readonly Dim[]

/** A tensor of shape `S`. Only the shape is typed; a runtime supplies the rest. */
export interface Tensor<S extends Shape> {
    readonly [shape]: S
}

// MARK: Shared

type Chars<S extends string> = S extends `${infer C}${infer R}` ? [C, ...Chars<R>] : []

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never

type Reverse<T extends readonly unknown[]> = T extends readonly [infer H, ...infer R] ? [...Reverse<R>, H] : []

/** The error a check reports on the spec string, or `unknown` when the spec is valid. */
type CheckOf<R> = R extends Tensor<Shape> ? unknown : { error: R }

// MARK: Einsum

/** Pairs each index letter with the dimension it labels, or "rank" when the counts differ. */
type Bind<L extends readonly string[], D extends Shape> =
    L extends readonly [infer L0, ...infer LR extends string[]]
        ? D extends readonly [infer D0, ...infer DR extends Shape] ? [L0, D0] | Bind<LR, DR> : "rank"
        : D extends readonly [] ? never : "rank"

type Letters<E> = E extends [infer K extends string, unknown] ? K : never
type DimOf<E, K> = E extends [K, infer D extends Dim] ? D : never
type Conflicts<E> = { [K in Letters<E>]: IsUnion<DimOf<E, K>> extends true ? K : never }[Letters<E>]
type Out<O extends readonly string[], E> = { [I in keyof O]: DimOf<E, O[I]> }

type EinsumOf<E, O extends readonly string[]> =
    "rank" extends E ? "einsum: rank mismatch"
    : [Exclude<O[number], Letters<E>>] extends [never]
        ? [Conflicts<E>] extends [never] ? Tensor<Out<O, E>>
        : `einsum: size mismatch on '${Conflicts<E> & string}'`
    : `einsum: unknown output index '${Exclude<O[number], Letters<E>> & string}'`

/**
 * The result of a two-operand einsum: the output tensor, or the error message
 * when the spec does not fit the operands.
 */
export type EinsumResult<S extends string, A extends Shape, B extends Shape> =
    S extends `${infer IA},${infer IB}->${infer IO}`
        ? EinsumOf<Bind<Chars<IA>, A> | Bind<Chars<IB>, B>, Chars<IO>>
        : "einsum: bad spec"

/** Intersect with the spec parameter so an invalid spec is an error on the spec string. */
export type EinsumCheck<S extends string, A extends Shape, B extends Shape> = CheckOf<EinsumResult<S, A, B>>

// MARK: Slice

type Trim<S extends string> = S extends ` ${infer R}` ? Trim<R> : S extends `${infer R} ` ? Trim<R> : S
type Parts<S extends string> = S extends `${infer H},${infer T}` ? [Trim<H>, ...Parts<T>] : [Trim<S>]

type Int = `${bigint}`
type Bound = Int | ""

/** What one comma-separated part does to its dimension. */
type Kind<P extends string> =
    P extends ":" | "::" | "::1" ? "keep"
    : P extends Int ? "drop"
    : P extends `${Bound}:${Bound}` | `${Bound}:${Bound}:${Bound}` ? "widen"
    : P extends "..." ? "ellipsis"
    : "bad"

type Step<D extends Dim, P extends string> =
    Kind<P> extends "keep" ? [D] : Kind<P> extends "drop" ? [] : [number]

/** Applies parts to dimensions pairwise; both tuples have the same length here. */
type Apply<S extends Shape, Ps extends readonly string[]> =
    Ps extends readonly [infer P extends string, ...infer PR extends string[]]
        ? S extends readonly [infer D extends Dim, ...infer SR extends Shape] ? [...Step<D, P>, ...Apply<SR, PR>] : []
        : []

/** Splits `S` after as many dimensions as `Ps` has parts: [head, rest]. */
type SplitAt<S extends Shape, Ps extends readonly unknown[], H extends Dim[] = []> =
    Ps extends readonly [unknown, ...infer PR]
        ? S extends readonly [infer D extends Dim, ...infer SR extends Shape] ? SplitAt<SR, PR, [...H, D]> : [H, S]
        : [H, S]

type FirstBad<Ps extends readonly string[]> =
    Ps extends readonly [infer P extends string, ...infer PR extends string[]]
        ? Kind<P> extends "bad" ? P : FirstBad<PR>
        : never

type Ellipses<Ps extends readonly string[]> = Ps extends readonly [infer P, ...infer PR extends string[]]
    ? P extends "..." ? [P, ...Ellipses<PR>] : Ellipses<PR>
    : []

/** True when there are more parts (ellipsis aside) than dimensions. */
type TooMany<S extends Shape, Ps extends readonly string[]> =
    Ps extends readonly [infer P, ...infer PR extends string[]]
        ? P extends "..." ? TooMany<S, PR>
        : S extends readonly [unknown, ...infer SR extends Shape] ? TooMany<SR, PR> : true
        : false

/** Splits parts at the ellipsis: [before, after], or "none". Not never, which every conditional accepts. */
type AtEllipsis<Ps extends readonly string[], B extends string[] = []> =
    Ps extends readonly [infer P extends string, ...infer PR extends string[]]
        ? P extends "..." ? [B, PR] : AtEllipsis<PR, [...B, P]>
        : "none"

type Sliced<S extends Shape, Ps extends readonly string[]> =
    AtEllipsis<Ps> extends [infer Before extends string[], infer After extends string[]]
        ? SplitAt<S, Before> extends [infer Head extends Shape, infer Rest extends Shape]
            ? SplitAt<Reverse<Rest>, After> extends [infer TailR extends Shape, infer MidR extends Shape]
                ? [...Apply<Head, Before>, ...Reverse<MidR>, ...Apply<Reverse<TailR>, After>]
                : never
            : never
        : SplitAt<S, Ps> extends [infer Head extends Shape, infer Rest extends Shape]
            ? [...Apply<Head, Ps>, ...Rest]
            : never

type SliceOf<S extends Shape, Ps extends readonly string[]> =
    [FirstBad<Ps>] extends [never]
        ? Ellipses<Ps>["length"] extends 0 | 1
            ? TooMany<S, Ps> extends true ? "slice: too many indices" : Tensor<Sliced<S, Ps>>
            : "slice: more than one ellipsis"
        : `slice: bad slice '${FirstBad<Ps>}'`

/**
 * The result of slicing a tensor of shape `S` with a numpy-style spec such as
 * ":, 1:3, ::2" or "..., -1". A full slice keeps its dimension, an index drops
 * it, and bounds or a step widen it to `number`: sizes are not computed in
 * types. Dimensions past the last part are kept, and one "..." stands for
 * those in the middle.
 */
export type SliceResult<S extends Shape, P extends string> =
    number extends S["length"] ? Tensor<Dim[]> : SliceOf<S, Parts<P>>

/** Intersect with the spec parameter so an invalid spec is an error on the spec string. */
export type SliceCheck<S extends Shape, P extends string> = CheckOf<SliceResult<S, P>>
