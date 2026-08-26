import { describe, it, expect } from "vitest"
import ts from "typescript"
import * as esbuild from "esbuild"
import fs from "fs"
import os from "os"
import path from "path"
import { transformCsImports, importTransformPlugin } from "./import-transform.mjs"

const byName = (name: string) => /^[A-Z]/.test(name)
const run = (source: string, file = "app.tsx") => transformCsImports(ts, source, file, byName)

describe("transformCsImports", () => {
    it("rewrites a named import to a destructure", () => {
        expect(run(`import { Texture2D, Material } from "UnityEngine"\n`))
            .toBe(`const { Texture2D, Material } = CS.UnityEngine\n`)
    })

    it("maps dotted and slashed module names onto the CS tree", () => {
        expect(run(`import { List } from "System.Collections.Generic"\n`))
            .toBe(`const { List } = CS.System.Collections.Generic\n`)
        expect(run(`import { VisualElement } from "UnityEngine/UIElements"\n`))
            .toBe(`const { VisualElement } = CS.UnityEngine.UIElements\n`)
    })

    it("handles default, namespace, and combined forms", () => {
        expect(run(`import UnityEngine from "UnityEngine"\n`))
            .toBe(`const UnityEngine = CS.UnityEngine\n`)
        expect(run(`import * as UE from "UnityEngine"\n`))
            .toBe(`const UE = CS.UnityEngine\n`)
        expect(run(`import UE, { Texture2D } from "UnityEngine"\n`))
            .toBe(`const UE = CS.UnityEngine; const { Texture2D } = CS.UnityEngine\n`)
        // default + namespace in one clause: legal, and the old regex never
        // matched it at all
        expect(run(`import UE, * as NS from "UnityEngine"\n`))
            .toBe(`const UE = CS.UnityEngine; const NS = CS.UnityEngine\n`)
    })

    // The old regex passed the braces through verbatim, so an alias produced
    // `const {A as B}`, which is a syntax error.
    it("turns an import alias into a destructuring rename", () => {
        expect(run(`import { Texture2D as Tex } from "UnityEngine"\n`))
            .toBe(`const { Texture2D: Tex } = CS.UnityEngine\n`)
    })

    // The old regex rewrote `import type` into a runtime destructure of types
    // that do not exist at runtime.
    it("erases type-only imports instead of executing them", () => {
        const out = run(`import type { Texture2D } from "UnityEngine"\nconst x = 1\n`)
        expect(out).not.toContain("const { Texture2D }")
        expect(out).toContain("removed, no runtime binding")
        expect(out).toContain("const x = 1")
    })

    it("keeps only the runtime members of a mixed type import", () => {
        expect(run(`import { type Material, Texture2D } from "UnityEngine"\n`))
            .toBe(`const { Texture2D } = CS.UnityEngine\n`)
    })

    it("comments out a side-effect import", () => {
        const out = run(`import "UnityEngine"\n`)
        expect(out).toContain("/*")
        expect(out).toContain("removed, no runtime binding")
    })

    it("leaves lowercase, relative and package imports alone", () => {
        expect(run(`import { useState } from "react"\n`)).toBeNull()
        expect(run(`import { thing } from "./local"\n`)).toBeNull()
        expect(run(`import styles from "./App.module.uss"\n`)).toBeNull()
    })

    // MARK: the corruption cases this rewrite exists for

    it("does not rewrite import text inside a string literal", () => {
        const src = `const code = 'import { Texture2D } from "UnityEngine"'\n`
        expect(run(src)).toBeNull()
    })

    // The DocDemos quickstart film held its code sample in a template literal
    // and shipped with the sample mangled into a const; the workaround in the
    // demo source ('"Unity' + 'Engine"') exists only because of this.
    it("does not rewrite import text inside a template literal", () => {
        const src = "const sample = `\nimport { Texture2D } from \"UnityEngine\"\nconst t = new Texture2D(2, 2)\n`\n"
        expect(run(src)).toBeNull()
    })

    it("does not resurrect a commented-out import", () => {
        expect(run(`// import { Texture2D } from "UnityEngine"\n`)).toBeNull()
        expect(run(`/*\nimport { Texture2D } from "UnityEngine"\n*/\n`)).toBeNull()
    })

    it("does not rewrite import text inside JSX", () => {
        const src = `export const Demo = () => <Text text={'import { X } from "UnityEngine"'} />\n`
        expect(run(src)).toBeNull()
    })

    it("still transforms the real import when a string holds a fake one", () => {
        const src = [
            `import { Texture2D } from "UnityEngine"`,
            `const sample = 'import { Material } from "UnityEngine"'`,
            ``,
        ].join("\n")
        const out = run(src)!
        expect(out).toContain(`const { Texture2D } = CS.UnityEngine`)
        expect(out).toContain(`'import { Material } from "UnityEngine"'`)
        expect(out).not.toContain(`const { Material }`)
    })

    // MARK: fidelity

    it("preserves the line count of a multi-line import", () => {
        const src = `import {\n    Texture2D,\n    Material,\n} from "UnityEngine"\nconst after = 1\n`
        const out = run(src)!
        expect(countLines(out)).toBe(countLines(src))
        expect(out.split("\n").indexOf("const after = 1")).toBe(src.split("\n").indexOf("const after = 1"))
    })

    it("keeps a same-line statement after the semicolon intact", () => {
        expect(run(`import { Texture2D } from "UnityEngine";const n = 1\n`))
            .toBe(`const { Texture2D } = CS.UnityEngine;const n = 1\n`)
    })

    it("does not consume a comment sitting above the import", () => {
        const out = run(`// keep me\nimport { Texture2D } from "UnityEngine"\n`)!
        expect(out).toContain("// keep me")
    })

    it("returns null when there is nothing to do", () => {
        expect(run(`const a = 1\n`)).toBeNull()
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
})
