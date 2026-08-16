import { describe, it, expect, afterEach } from "vitest"
import * as esbuild from "esbuild"
import fs from "fs"
import os from "os"
import path from "path"
import { findThemeModules, themesPlugin } from "./themes.mjs"

const tmpDirs: string[] = []

function makeApp(structure: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-themes-test-"))
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

// ============================================================================
// findThemeModules
// ============================================================================

describe("findThemeModules", () => {
    it("finds *Theme.ts files recursively, sorted, with visited dirs", () => {
        const root = makeApp({
            "@cartridges/@singtaa/kawaii/kawaiiTheme.ts": "",
            "@cartridges/@singtaa/kawaii/kawaii.d.ts": "",
            "@cartridges/@singtaa/pixel/pixelTheme.ts": "",
            "@cartridges/local/myTheme.tsx": "",
            "@cartridges/@singtaa/inventory/inventory.tsx": "",
        })
        const { files, dirs } = findThemeModules(path.join(root, "@cartridges"))
        const names = files.map((f: string) => path.basename(f))
        // Sorted by full path: @singtaa/* precedes local/*
        expect(names).toEqual(["kawaiiTheme.ts", "pixelTheme.ts", "myTheme.tsx"])
        expect(names).not.toContain("inventory.tsx")
        expect(names).not.toContain("kawaii.d.ts")
        expect(dirs.length).toBeGreaterThan(3)
    })

    it("returns empty results for a missing directory", () => {
        const { files, dirs } = findThemeModules("/nonexistent/for/sure")
        expect(files).toEqual([])
        expect(dirs).toEqual([])
    })
})

// ============================================================================
// themesPlugin (real esbuild build)
// ============================================================================

const REGISTER_STUB = `globalThis.__registered = globalThis.__registered || []
`

describe("themesPlugin", () => {
    it("bundles every extracted theme module through onejs:themes", async () => {
        const root = makeApp({
            "index.ts": `import "onejs:themes"`,
            "@cartridges/@singtaa/kawaii/kawaiiTheme.ts":
                REGISTER_STUB + `globalThis.__registered.push("kawaii")`,
            "@cartridges/@singtaa/sketch/sketchTheme.ts":
                REGISTER_STUB + `globalThis.__registered.push("sketch")`,
            "@cartridges/@singtaa/inventory/inventory.tsx":
                `globalThis.__registered.push("SHOULD NOT LOAD")`,
        })

        const result = await esbuild.build({
            absWorkingDir: root,
            entryPoints: ["index.ts"],
            bundle: true,
            write: false,
            format: "iife",
            plugins: [themesPlugin()],
        })

        const code = result.outputFiles[0].text
        expect(code).toContain(`"kawaii"`)
        expect(code).toContain(`"sketch"`)
        expect(code).not.toContain("SHOULD NOT LOAD")

        // The generated module must actually execute the registrations
        const registered: string[] = []
        ;(globalThis as any).__registered = registered
        // eslint-disable-next-line no-eval
        eval(code)
        expect(registered.sort()).toEqual(["kawaii", "sketch"])
        delete (globalThis as any).__registered
    })

    it("emits an empty module (not an error) when nothing is extracted yet", async () => {
        const root = makeApp({ "index.ts": `import "onejs:themes"` })

        const result = await esbuild.build({
            absWorkingDir: root,
            entryPoints: ["index.ts"],
            bundle: true,
            write: false,
            plugins: [themesPlugin()],
        })

        expect(result.errors).toEqual([])
        expect(result.outputFiles[0].text).not.toContain("import")
    })
})
