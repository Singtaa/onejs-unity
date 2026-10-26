import { afterEach, describe, expect, it } from "vitest"
import { spawnSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

/**
 * `onejs-unity/tensor` is types only, so these typecheck an app that imports
 * it, with tsc. A shape error is only useful where the reader is looking, so
 * each expected error is marked in the source, `/*! text *\/` right before the
 * spec string it belongs on, and must land on that string's first column.
 *
 * Both compilers run: 5.9, which this package develops on, and 7, which the
 * OneJS scaffold installs.
 */

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const COMPILERS = {
    "TypeScript 5": path.join(PACKAGE_ROOT, "node_modules/typescript/bin/tsc"),
    "TypeScript 7": path.join(PACKAGE_ROOT, "node_modules/typescript7/bin/tsc"),
}
const tmpDirs: string[] = []

afterEach(() => {
    while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

// How a runtime binds the types: a tensor library declares its own functions
// against them. These stand in for that library.
const BINDING = `
import type { Tensor, Shape, EinsumCheck, EinsumResult, SliceCheck, SliceResult } from "onejs-unity/tensor"
declare function einsum<S extends string, A extends Shape, B extends Shape>(
    spec: S & EinsumCheck<S, A, B>, a: Tensor<A>, b: Tensor<B>): EinsumResult<S, A, B>
declare function at<S extends Shape, P extends string>(x: Tensor<S>, spec: P & SliceCheck<S, P>): SliceResult<S, P>
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false
declare function same<X, Y>(check: Equal<X, Y>): void
`

interface Expected { line: number, col: number, text: string }
interface Found { line: number, col: number, message: string }

/** Pulls the `/*! text *\/` markers out of `code`, noting where each one's string begins. */
function markers(code: string): { code: string, expected: Expected[] } {
    const expected: Expected[] = []
    const lines = code.split("\n").map((line, i) => {
        let out = ""
        let rest = line
        for (let m = rest.match(/\/\*!\s*(.*?)\s*\*\//); m; m = rest.match(/\/\*!\s*(.*?)\s*\*\//)) {
            out += rest.slice(0, m.index)
            expected.push({ line: i + 1, col: out.length + 1, text: m[1] })
            rest = rest.slice(m.index! + m[0].length)
        }
        return out + rest
    })
    return { code: lines.join("\n"), expected }
}

/** Typechecks `body` after the binding, as an app's source; returns where each error landed. */
function typecheck(tsc: string, body: string): { expected: Expected[], found: Found[], raw: string } {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-tensor-test-"))
    tmpDirs.push(root)
    fs.mkdirSync(path.join(root, "node_modules"))
    fs.symlinkSync(PACKAGE_ROOT, path.join(root, "node_modules/onejs-unity"), "junction")
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
            target: "ES2022", lib: ["ES2022"], module: "ESNext", moduleResolution: "Bundler",
            noEmit: true, strict: true, skipLibCheck: true, isolatedModules: true, types: [],
        },
        include: ["app.ts"],
    }))
    const { code, expected } = markers(`${BINDING}\n${body}\nexport {}\n`)
    fs.writeFileSync(path.join(root, "app.ts"), code)
    const res = spawnSync(process.execPath, [tsc, "-p", ".", "--pretty", "false"], { cwd: root, encoding: "utf8" })
    const raw = (res.stdout + res.stderr).trim()
    const found: Found[] = []
    for (const m of raw.matchAll(/^app\.ts\((\d+),(\d+)\): error TS\d+: (.*)$/gm)) {
        found.push({ line: Number(m[1]), col: Number(m[2]), message: m[3] })
    }
    if (raw && found.length === 0) throw new Error(`tsc failed without an app.ts error:\n${raw}`)
    return { expected, found, raw }
}

/** Every marked error, and only those, each on its spec string with its text in the message. */
function expectErrors(tsc: string, body: string): void {
    const { expected, found, raw } = typecheck(tsc, body)
    const at = (e: { line: number, col: number }) => `${e.line}:${e.col}`
    expect(found.map(at), raw).toEqual(expected.map(at))
    for (const e of expected) {
        const f = found.find((x) => at(x) === at(e))!
        expect(f.message, raw).toContain(e.text)
    }
}

for (const [name, tsc] of Object.entries(COMPILERS)) {
    describe(`onejs-unity/tensor under ${name}`, () => {
        it("keeps shapes apart: a tensor of one shape is not a tensor of another", () => {
            expectErrors(tsc, `
                declare const a: Tensor<[2, 3]>
                const b: Tensor<[2, 3]> = a
                // @ts-expect-error transposed
                const c: Tensor<[3, 2]> = a
            `)
        })

        it("infers einsum's output shape, symbolic dimensions included", () => {
            expectErrors(tsc, `
                declare const q: Tensor<["B", 8, 64, 32]>
                declare const k: Tensor<["B", 8, 128, 32]>
                const att = einsum("bhqd,bhkd->bhqk", q, k)
                same<typeof att, Tensor<["B", 8, 64, 128]>>(true)

                declare const u: Tensor<[3]>
                declare const v: Tensor<[4]>
                const outer = einsum("i,j->ij", u, v)
                same<typeof outer, Tensor<[3, 4]>>(true)
                const dot = einsum("i,i->", u, u)
                same<typeof dot, Tensor<[]>>(true)
            `)
        })

        it("puts a size mismatch on the spec string, naming the index", () => {
            expectErrors(tsc, `
                declare const q: Tensor<["B", 8, 64, 32]>
                declare const k: Tensor<["B", 8, 128, 16]>
                einsum(/*! size mismatch on "d" */"bhqd,bhkd->bhqk", q, k)
                declare const n: Tensor<["N", 8]>
                declare const m: Tensor<["B", 8]>
                einsum(/*! size mismatch on "b" */"bi,bi->b", n, m)
            `)
        })

        it("puts rank mismatches, unknown output indices and bad specs on the spec string", () => {
            expectErrors(tsc, `
                declare const q: Tensor<["B", 8, 64, 32]>
                declare const k: Tensor<["B", 8, 128, 32]>
                einsum(/*! rank mismatch */"bhqd,bhk->bhqk", q, k)
                einsum(/*! rank mismatch */"bhqd,bhkdx->bhqk", q, k)
                einsum(/*! unknown output index "x" */"bhqd,bhkd->bhqx", q, k)
                einsum(/*! bad spec */"bhqd bhkd", q, k)
            `)
        })

        it("lets a widened dimension meet a literal one", () => {
            expectErrors(tsc, `
                declare const a: Tensor<[number, 4]>
                declare const b: Tensor<[4, 5]>
                const c = einsum("ij,jk->ik", a, b)
                same<typeof c, Tensor<[number, 5]>>(true)
            `)
        })

        it("slices: a full slice keeps a dimension, an index drops it, bounds or a step widen it", () => {
            expectErrors(tsc, `
                declare const x: Tensor<[2, 3, 4]>
                const all = at(x, ":, :, :")
                same<typeof all, Tensor<[2, 3, 4]>>(true)
                const first = at(x, "0")
                same<typeof first, Tensor<[3, 4]>>(true)
                const row = at(x, " 1 , : ")
                same<typeof row, Tensor<[3, 4]>>(true)
                const last = at(x, "..., -1")
                same<typeof last, Tensor<[2, 3]>>(true)
                const cut = at(x, ":, 1:3")
                same<typeof cut, Tensor<[2, number, 4]>>(true)
                const stepped = at(x, "::2")
                same<typeof stepped, Tensor<[number, 3, 4]>>(true)
                const whole = at(x, "::, ::1")
                same<typeof whole, Tensor<[2, 3, 4]>>(true)
                const mid = at(x, ":, 1, ...")
                same<typeof mid, Tensor<[2, 4]>>(true)
            `)
        })

        it("puts slice errors on the spec string", () => {
            expectErrors(tsc, `
                declare const x: Tensor<[2, 3, 4]>
                at(x, /*! too many indices */"0, 0, 0, 0")
                at(x, /*! bad slice "a:b" */":, a:b")
                at(x, /*! bad slice "1.5" */"1.5")
                at(x, /*! more than one ellipsis */"..., 0, ...")
            `)
        })
    })
}
