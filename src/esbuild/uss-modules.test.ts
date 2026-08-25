import { describe, it, expect, afterEach } from "vitest"
import * as esbuild from "esbuild"
import fs from "fs"
import os from "os"
import path from "path"
import { ussModulesPlugin } from "./uss-modules.mjs"

/**
 * The scoped class name is a hash of the module's project-relative path, and it
 * ends up baked into the committed bundle. So the hash has to be a function of
 * the path alone, not of the machine that ran the build: on Windows
 * path.relative yields backslashes, and hashing those gave every class a
 * different name than the same file got on macOS. The committed bundle then
 * flipped wholesale each time the other machine rebuilt it.
 *
 * A separator bug is invisible on whichever OS you develop on, which is exactly
 * why it needs a test rather than care.
 */

const tmpDirs: string[] = []

function makeApp(structure: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-uss-test-"))
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

async function bundle(root: string, entry: string): Promise<string> {
    const prevCwd = process.cwd()
    process.chdir(root)
    try {
        const result = await esbuild.build({
            entryPoints: [path.join(root, entry)],
            bundle: true,
            write: false,
            format: "esm",
            plugins: [ussModulesPlugin({ generateTypes: false })],
        })
        // write:false guarantees outputFiles in practice, but not in the types.
        // Assert it rather than silencing it, so a build that somehow produced
        // nothing says so instead of failing on an unreadable undefined.
        const [out] = result.outputFiles ?? []
        if (!out) throw new Error(`esbuild produced no output for ${entry}`)
        return out.text
    } finally {
        process.chdir(prevCwd)
    }
}

/** The generated class name for `.button`, e.g. "button__90e86f". */
function scopedButton(out: string): string {
    const m = out.match(/button__([0-9a-f]{6})/)
    if (!m) throw new Error("no scoped .button class in output:\n" + out.slice(0, 500))
    return m[0]
}

describe("uss modules scoping", () => {
    it("scopes a class name with a hash of its path", async () => {
        const root = makeApp({
            "demos/demos.module.uss": ".button { color: red; }",
            "index.ts": 'import s from "./demos/demos.module.uss"\nexport default s',
        })
        const out = await bundle(root, "index.ts")
        expect(scopedButton(out)).toMatch(/^button__[0-9a-f]{6}$/)
    })

    it("hashes the same path to the same class on any separator", async () => {
        // The value is pinned, not just compared to itself, because the whole
        // point is that a Windows build and a macOS build agree. This is the
        // md5 of the forward-slashed relative path, which is what macOS
        // produced before the fix and what both produce after it.
        const root = makeApp({
            "demos/demos.module.uss": ".button { color: red; }",
            "index.ts": 'import s from "./demos/demos.module.uss"\nexport default s',
        })
        const out = await bundle(root, "index.ts")
        expect(scopedButton(out)).toBe("button__90e86f")
    })

    it("writes the module path into the bundle with forward slashes", async () => {
        const root = makeApp({
            "demos/demos.module.uss": ".button { color: red; }",
            "index.ts": 'import s from "./demos/demos.module.uss"\nexport default s',
        })
        const out = await bundle(root, "index.ts")
        // The name passed to compileStyleSheet reaches Unity, and a backslash
        // there is also an escape hazard in the emitted string.
        expect(out).toContain('compileStyleSheet(css, "demos/demos.module.uss")')
        // esbuild stamps its own per module annotation from whatever path the
        // resolver returned, so that has to be project relative too, or the
        // builder's home directory ends up inside a committed bundle.
        expect(out).toContain("// uss-module:demos/demos.module.uss")
        expect(out).not.toMatch(/uss-module:[A-Za-z]:[\\/]/)
        expect(out).not.toMatch(/uss-module:\/(Users|home)\//)
    })

    it("gives two modules in different folders different hashes", async () => {
        const root = makeApp({
            "a/style.module.uss": ".button { color: red; }",
            "b/style.module.uss": ".button { color: blue; }",
            "index.ts":
                'import a from "./a/style.module.uss"\n' +
                'import b from "./b/style.module.uss"\n' +
                "export default [a, b]",
        })
        const out = await bundle(root, "index.ts")
        const names = [...out.matchAll(/button__([0-9a-f]{6})/g)].map((m) => m[0])
        expect(new Set(names).size).toBe(2)
    })
})
