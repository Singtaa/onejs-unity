import { describe, it, expect } from "vitest"
import * as esbuild from "esbuild"
import fs from "fs"
import os from "os"
import path from "path"
import { transformCsImports, importTransformPlugin } from "./import-transform.mjs"

const byName = (name: string) => /^[A-Z]/.test(name)
const run = (source: string, file = "app.tsx") => transformCsImports(esbuild, source, file, byName)

describe("transformCsImports", () => {
    it("rewrites a named import to a destructure", async () => {
        expect(await run(`import { Texture2D, Material } from "UnityEngine"\n`))
            .toBe(`const { Texture2D, Material } = CS.UnityEngine\n`)
    })

    it("maps dotted and slashed module names onto the CS tree", async () => {
        expect(await run(`import { List } from "System.Collections.Generic"\n`))
            .toBe(`const { List } = CS.System.Collections.Generic\n`)
        expect(await run(`import { VisualElement } from "UnityEngine/UIElements"\n`))
            .toBe(`const { VisualElement } = CS.UnityEngine.UIElements\n`)
    })

    it("handles default, namespace, and combined forms", async () => {
        expect(await run(`import UnityEngine from "UnityEngine"\n`))
            .toBe(`const UnityEngine = CS.UnityEngine\n`)
        expect(await run(`import * as UE from "UnityEngine"\n`))
            .toBe(`const UE = CS.UnityEngine\n`)
        expect(await run(`import UE, { Texture2D } from "UnityEngine"\n`))
            .toBe(`const UE = CS.UnityEngine; const { Texture2D } = CS.UnityEngine\n`)
        // default + namespace in one clause: legal, and the old regex never
        // matched it at all
        expect(await run(`import UE, * as NS from "UnityEngine"\n`))
            .toBe(`const UE = CS.UnityEngine; const NS = CS.UnityEngine\n`)
    })

    // The old regex passed the braces through verbatim, so an alias produced
    // `const {A as B}`, which is a syntax error.
    it("turns an import alias into a destructuring rename", async () => {
        expect(await run(`import { Texture2D as Tex } from "UnityEngine"\n`))
            .toBe(`const { Texture2D: Tex } = CS.UnityEngine\n`)
    })

    // The old regex rewrote `import type` into a runtime destructure of types
    // that do not exist at runtime. esbuild erases it before resolving
    // anything, so the transform leaves it for the build to erase the same way
    // (the bundle below checks that it does).
    it("leaves a type-only import for esbuild to erase", async () => {
        expect(await run(`import type { Texture2D } from "UnityEngine"\nconst x = 1\n`)).toBeNull()
        expect(await run(`import type UE from "UnityEngine"\nimport { A } from "UnityEngine"\n`))
            .toBe(`import type UE from "UnityEngine"\nconst { A } = CS.UnityEngine\n`)
    })

    it("reads a default import named type as a binding, not a modifier", async () => {
        expect(await run(`import type from "UnityEngine"\n`)).toBe(`const type = CS.UnityEngine\n`)
        expect(await run(`import type, { A } from "UnityEngine"\n`))
            .toBe(`const type = CS.UnityEngine; const { A } = CS.UnityEngine\n`)
    })

    // esbuild resolves a path once per file, so each declaration is tagged on
    // its own: a second import of the same namespace must not be missed
    it("rewrites every import of a namespace imported twice", async () => {
        expect(await run(`import { A } from "UnityEngine"\nimport * as UE from "UnityEngine"\n`))
            .toBe(`const { A } = CS.UnityEngine\nconst UE = CS.UnityEngine\n`)
    })

    it("reads a clause with comments in it, an import keyword among them", async () => {
        expect(await run(`import { A, /* import { B } from "UnityEngine" */ C, // import\n D } from "UnityEngine"\n`))
            .toBe(`const { A, C, D } = CS.UnityEngine\n\n`)
    })

    it("finds an import after non-ASCII text on the same line", async () => {
        expect(await run(`/* é ✓ */ import { A } from "UnityEngine"\n`))
            .toBe(`/* é ✓ */ const { A } = CS.UnityEngine\n`)
    })

    it("leaves an import in a template literal's expression, a regex or a nested template alone", async () => {
        const src = [
            "const a = `${`import { A } from \"UnityEngine\"`}`",
            `const r = /import { B } from "UnityEngine"/`,
            `import { C } from "UnityEngine"`,
            ``,
        ].join("\n")
        expect(await run(src)).toBe(src.replace(`import { C } from "UnityEngine"`, `const { C } = CS.UnityEngine`))
    })

    it("does not rewrite import text on its own line inside JSX", async () => {
        const src = `const el = <p>\nimport {"{"} A {"}"} from "UnityEngine"\n</p>\n`
        expect(await run(src)).toBeNull()
    })

    // Neither binds a name the plugin could destructure; both are left as the
    // TypeScript parser left them
    it("leaves export-from and dynamic import alone", async () => {
        expect(await run(`export { A } from "UnityEngine"\n`)).toBeNull()
        expect(await run(`const m = import("UnityEngine")\n`)).toBeNull()
    })

    it("returns null for a file that does not parse, so the build reports it", async () => {
        expect(await run(`import { A } from "UnityEngine"\nconst = \n`)).toBeNull()
    })

    it("keeps only the runtime members of a mixed type import", async () => {
        expect(await run(`import { type Material, Texture2D } from "UnityEngine"\n`))
            .toBe(`const { Texture2D } = CS.UnityEngine\n`)
    })

    it("comments out a side-effect import", async () => {
        const out = await run(`import "UnityEngine"\n`)
        expect(out).toContain("/*")
        expect(out).toContain("removed, no runtime binding")
    })

    it("leaves lowercase, relative and package imports alone", async () => {
        expect(await run(`import { useState } from "react"\n`)).toBeNull()
        expect(await run(`import { thing } from "./local"\n`)).toBeNull()
        expect(await run(`import styles from "./App.module.uss"\n`)).toBeNull()
    })

    // MARK: the corruption cases this rewrite exists for

    it("does not rewrite import text inside a string literal", async () => {
        const src = `const code = 'import { Texture2D } from "UnityEngine"'\n`
        expect(await run(src)).toBeNull()
    })

    // The DocDemos quickstart film held its code sample in a template literal
    // and shipped with the sample mangled into a const; the workaround in the
    // demo source ('"Unity' + 'Engine"') exists only because of this.
    it("does not rewrite import text inside a template literal", async () => {
        const src = "const sample = `\nimport { Texture2D } from \"UnityEngine\"\nconst t = new Texture2D(2, 2)\n`\n"
        expect(await run(src)).toBeNull()
    })

    it("does not resurrect a commented-out import", async () => {
        expect(await run(`// import { Texture2D } from "UnityEngine"\n`)).toBeNull()
        expect(await run(`/*\nimport { Texture2D } from "UnityEngine"\n*/\n`)).toBeNull()
    })

    it("does not rewrite import text inside JSX", async () => {
        const src = `export const Demo = () => <Text text={'import { X } from "UnityEngine"'} />\n`
        expect(await run(src)).toBeNull()
    })

    it("still transforms the real import when a string holds a fake one", async () => {
        const src = [
            `import { Texture2D } from "UnityEngine"`,
            `const sample = 'import { Material } from "UnityEngine"'`,
            ``,
        ].join("\n")
        const out = await run(src)!
        expect(out).toContain(`const { Texture2D } = CS.UnityEngine`)
        expect(out).toContain(`'import { Material } from "UnityEngine"'`)
        expect(out).not.toContain(`const { Material }`)
    })

    // MARK: fidelity

    it("preserves the line count of a multi-line import", async () => {
        const src = `import {\n    Texture2D,\n    Material,\n} from "UnityEngine"\nconst after = 1\n`
        const out = await run(src)!
        expect(countLines(out)).toBe(countLines(src))
        expect(out.split("\n").indexOf("const after = 1")).toBe(src.split("\n").indexOf("const after = 1"))
    })

    it("keeps a same-line statement after the semicolon intact", async () => {
        expect(await run(`import { Texture2D } from "UnityEngine";const n = 1\n`))
            .toBe(`const { Texture2D } = CS.UnityEngine;const n = 1\n`)
    })

    it("does not consume a comment sitting above the import", async () => {
        const out = await run(`// keep me\nimport { Texture2D } from "UnityEngine"\n`)!
        expect(out).toContain("// keep me")
    })

    it("returns null when there is nothing to do", async () => {
        expect(await run(`const a = 1\n`)).toBeNull()
    })

    function countLines(s: string) { return s.split("\n").length }
})

describe("importTransformPlugin through esbuild", () => {
    it("bundles a file whose strings hold fake imports, transforming only the real one", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-import-transform-"))
        try {
            const entry = path.join(dir, "entry.tsx")
            fs.writeFileSync(entry, [
                `import { Texture2D } from "UnityEngine"`,
                `// import { Shader } from "UnityEngine"`,
                "const sample = `import { Material } from \"UnityEngine\"`",
                `console.log(new Texture2D(2, 2), sample)`,
                ``,
            ].join("\n"))
            const result = await esbuild.build({
                entryPoints: [entry],
                bundle: true,
                write: false,
                format: "iife",
                plugins: [importTransformPlugin()],
            })
            const out = result.outputFiles[0]?.text ?? ""
            expect(out).toContain("CS.UnityEngine")
            // the template literal survives, sample text intact
            expect(out).toContain(`import { Material } from`)
            expect(out).not.toContain("const { Material }")
            expect(out).not.toContain("const { Shader }")
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it("bundles a type-only import as nothing at all", async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-import-transform-"))
        try {
            const entry = path.join(dir, "entry.ts")
            fs.writeFileSync(entry, [
                `import type { Material } from "UnityEngine"`,
                `import { Texture2D } from "UnityEngine"`,
                `const m: Material | null = null`,
                `console.log(new Texture2D(2, 2), m)`,
                ``,
            ].join("\n"))
            const result = await esbuild.build({
                entryPoints: [entry],
                bundle: true,
                write: false,
                format: "iife",
                plugins: [importTransformPlugin()],
            })
            const out = result.outputFiles[0]?.text ?? ""
            expect(out).toContain("CS.UnityEngine")
            expect(out).not.toContain("Material")
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })
})
