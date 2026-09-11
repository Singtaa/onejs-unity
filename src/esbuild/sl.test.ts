import { afterEach, describe, expect, it } from "vitest"
import * as esbuild from "esbuild"
import fs from "fs"
import os from "os"
import path from "path"
import { slPlugin } from "./sl.mjs"
import { parse } from "../sl/lang"
import { encode } from "../sl/encode"
import { manifest } from "../sl/manifest"

/**
 * The loader, end to end through a real esbuild.
 *
 * Two things this has to hold, and neither is about parsing, which
 * `sl/lang/parity.test.ts` covers:
 *
 * **The bundle carries numbers, not a parser and not the source.** That is the
 * whole reason the file format is worth having on a platform where a game is
 * downloaded before it is played.
 *
 * **The manifest lands where the editor looks.** `SLShaderGenerator` walks
 * Assets and Packages for `*.sl.json` and skips `~` folders, so a manifest
 * written inside the app's source folder would be invisible and an ejected
 * game would silently interpret. That failure looks exactly like success, only
 * slower, which is why it is asserted rather than assumed.
 */

const PLASMA = `
uniform float warp = 0.5;
uniform float hue = 0.25;

float4 main() {
    float2 p = (uv - 0.5) * (warp * 14 + 2);
    float v = sin(p.x + time) + sin(p.y - time * 0.8);
    float n = saturate(v * 0.22 + 0.5);
    return float4(hsv2rgb(float3(frac(hue + n * 0.18), 0.75, n)), 1);
}
`

const tmpDirs: string[] = []

function makeApp(structure: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-sl-test-"))
    tmpDirs.push(root)
    for (const [rel, content] of Object.entries(structure)) {
        const full = path.join(root, rel)
        fs.mkdirSync(path.dirname(full), { recursive: true })
        fs.writeFileSync(full, content)
    }
    return root
}

afterEach(() => {
    while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

interface Built {
    code: string
    errors: string[]
    root: string
}

async function bundle(
    root: string, entry: string, options: Parameters<typeof slPlugin>[0] = {},
    outfile?: string,
): Promise<Built> {
    const prevCwd = process.cwd()
    process.chdir(root)
    try {
        const result = await esbuild.build({
            entryPoints: [path.join(root, entry)],
            bundle: true,
            write: outfile !== undefined,
            outfile: outfile === undefined ? undefined : path.join(root, outfile),
            format: "esm",
            logLevel: "silent",
            plugins: [slPlugin({ generateTypes: false, ...options })],
        })
        const [out] = result.outputFiles ?? []
        return { code: out?.text ?? "", errors: [], root }
    } catch (e) {
        const errors = (e as { errors?: Array<{ text: string; location?: { line?: number; column?: number } }> }).errors
        if (errors === undefined) throw e
        return {
            code: "",
            errors: errors.map((x) => `${x.location?.line ?? 0}:${(x.location?.column ?? 0) + 1}: ${x.text}`),
            root,
        }
    } finally {
        process.chdir(prevCwd)
    }
}

describe("importing a .sl file", () => {
    it("resolves to the program, encoded, with nothing else along for the ride", async () => {
        const root = makeApp({
            "plasma.sl": PLASMA,
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        const { code } = await bundle(root, "index.ts")

        const twin = encode(parse(PLASMA, { file: "plasma.sl" }))
        expect(code).toContain(`"hash": "${twin.hash}"`)
        expect(code).toContain(`"uniforms": ["warp", "hue"]`)
        // The parser and the source stay out of the bundle. Both would be dead
        // weight in a game that is downloaded before it is played.
        expect(code).not.toContain("uniform float warp")
        expect(code).not.toContain("SLParseError")
        expect(code.length).toBeLessThan(4000)
    })

    it("carries the declared defaults, so the VM starts where the compiled shader starts", async () => {
        const root = makeApp({
            "plasma.sl": PLASMA,
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        const { code } = await bundle(root, "index.ts")
        // warp 0.5 and hue 0.25, four floats per slot.
        expect(code).toContain("[0.5, 0, 0, 1, 0.25, 0, 0, 1]")
    })

    it("keeps the source out of a bundle that does not ask for it", async () => {
        const root = makeApp({
            "plasma.sl": PLASMA,
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        const { code } = await bundle(root, "index.ts")
        expect(code).not.toContain("uniform float warp")
    })

    it("hands the source over when something asks, so a panel can show the file itself", async () => {
        const root = makeApp({
            "plasma.sl": PLASMA,
            "index.ts": `import plasma, { source } from "./plasma.sl"\nexport default [plasma, source]`,
        })
        const { code } = await bundle(root, "index.ts")
        expect(code).toContain("uniform float warp = 0.5")
    })

    it("names the textures in slot order, so a host can bind one", async () => {
        const root = makeApp({
            "art.sl": `texture2D grain;\ntexture2D mask;\nfloat4 main() { return tex2D(grain, uv) * tex2D(mask, uv).r; }`,
            "index.ts": `import art from "./art.sl"\nexport default art`,
        })
        const { code } = await bundle(root, "index.ts")
        expect(code).toContain(`"textures": ["grain", "mask"]`)
    })

    it("writes a .d.ts naming the uniforms", async () => {
        const root = makeApp({
            "plasma.sl": PLASMA,
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        await bundle(root, "index.ts", { generateTypes: true })
        const dts = fs.readFileSync(path.join(root, "plasma.sl.d.ts"), "utf8")
        expect(dts).toContain(`EncodedProgram<"warp" | "hue">`)
    })

    it("gives a program with no uniforms a .d.ts that refuses every name", async () => {
        const root = makeApp({
            "flat.sl": `float4 main() { return #ff8040; }`,
            "index.ts": `import flat from "./flat.sl"\nexport default flat`,
        })
        await bundle(root, "index.ts", { generateTypes: true })
        expect(fs.readFileSync(path.join(root, "flat.sl.d.ts"), "utf8"))
            .toContain("EncodedProgram<never>")
    })

    it("does not put the builder's home directory in the bundle", async () => {
        const root = makeApp({
            "plasma.sl": PLASMA,
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        const { code } = await bundle(root, "index.ts")
        // esbuild annotates each module with `// <namespace>:<path>`, and that
        // annotation is committed with the bundle. Project relative, so two
        // machines produce the same bytes.
        expect(code).toContain("// sl-program:plasma.sl")
        expect(code).not.toContain(`sl-program:${root}`)
    })
})

describe("a parse error is an esbuild error", () => {
    it("carries the line and column, so an editor can put a marker on it", async () => {
        const root = makeApp({
            "bad.sl": "float4 main() {\n    float z = uv.z;\n    return float4(z, 0, 0, 1);\n}",
            "index.ts": `import bad from "./bad.sl"\nexport default bad`,
        })
        const { errors } = await bundle(root, "index.ts")
        expect(errors).toHaveLength(1)
        expect(errors[0]).toContain("2:18")
        expect(errors[0]).toContain("is component 3 of a vec2")
        // The location prefix belongs to esbuild's marker, not to the text.
        expect(errors[0]).not.toContain("bad.sl:2:18:")
    })

    it("reports a program the VM cannot run, since no single line is to blame", async () => {
        const body = Array.from({ length: 300 }, (_, i) => `    v = v + sin(uv.x * ${i + 1});`).join("\n")
        const root = makeApp({
            "long.sl": `float4 main() {\n    float v = 0;\n${body}\n    return float4(v, 0, 0, 1);\n}`,
            "index.ts": `import long from "./long.sl"\nexport default long`,
        })
        const { errors } = await bundle(root, "index.ts")
        expect(errors[0]).toContain("runs at most 256")
    })
})

describe("the manifest", () => {
    it("lands beside the bundle, where the editor looks", async () => {
        const root = makeApp({
            "app/~/plasma.sl": PLASMA,
            "app/~/index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        await bundle(root, "app/~/index.ts", {}, "app/app.js.txt")
        const manifest = JSON.parse(fs.readFileSync(path.join(root, "app/app.sl.json"), "utf8"))
        expect(manifest.version).toBe(1)
        expect(manifest.programs).toHaveLength(1)
        expect(manifest.programs[0].hlsl).toContain("Shader \"Hidden/SLGenerated/")
        expect(manifest.programs[0].uniforms).toEqual(["warp", "hue"])
    })

    it("is emptied when the last .sl file goes, so its shaders stop being generated", async () => {
        const root = makeApp({
            "app/~/plasma.sl": PLASMA,
            "app/~/index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        await bundle(root, "app/~/index.ts", {}, "app/app.js.txt")
        expect(JSON.parse(fs.readFileSync(path.join(root, "app/app.sl.json"), "utf8")).programs)
            .toHaveLength(1)

        fs.writeFileSync(path.join(root, "app/~/index.ts"), "export default 1")
        await bundle(root, "app/~/index.ts", {}, "app/app.js.txt")
        expect(JSON.parse(fs.readFileSync(path.join(root, "app/app.sl.json"), "utf8")).programs)
            .toEqual([])
    })

    it("leaves no manifest in a project that has never had a program", async () => {
        const root = makeApp({ "app/~/index.ts": `export default 1` })
        await bundle(root, "app/~/index.ts", {}, "app/app.js.txt")
        expect(fs.existsSync(path.join(root, "app/app.sl.json"))).toBe(false)
    })

    it("agrees with manifest() about the shape of an empty one", async () => {
        const root = makeApp({ "index.ts": `export default 1` })
        const seen: Array<Record<string, unknown>> = []
        await bundle(root, "index.ts", { onManifest: (m) => { seen.push(m as never) } })
        expect(seen[0]).toEqual(manifest([]))
    })

    it("collapses two imports of one program, because the hash is the identity", async () => {
        const root = makeApp({
            "a.sl": PLASMA,
            "b.sl": PLASMA,
            "index.ts": `import a from "./a.sl"\nimport b from "./b.sl"\nexport default [a, b]`,
        })
        const seen: Array<{ programs: unknown[] }> = []
        await bundle(root, "index.ts", { onManifest: (m) => { seen.push(m as never) } })
        expect(seen).toHaveLength(1)
        expect(seen[0]!.programs).toHaveLength(1)
    })

    it("hands the manifest to a caller that cannot be given a path", async () => {
        const root = makeApp({
            "plasma.sl": PLASMA,
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        const seen: Array<{ programs: Array<{ hash: string }> }> = []
        await bundle(root, "index.ts", { onManifest: (m) => { seen.push(m as never) } })
        expect(seen[0]!.programs[0]!.hash).toBe(encode(parse(PLASMA, { file: "plasma.sl" })).hash)
        // Nothing was written: there is no outfile to be beside.
        expect(fs.existsSync(path.join(root, "app.sl.json"))).toBe(false)
    })
})
