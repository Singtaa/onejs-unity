import { describe, it, expect, afterEach } from "vitest"
import nodeFs from "node:fs"
import { setFsProvider, getFsProvider, getFs } from "./fs-provider.mjs"

// test-setup.mjs installs node:fs for the whole suite; restore it after any
// test that swaps it out.
afterEach(() => setFsProvider(nodeFs))

describe("fs provider", () => {
    it("reports the installed provider", () => {
        expect(getFsProvider()).toBe(nodeFs)
        expect(getFs()).toBe(nodeFs)
    })

    it("swaps the provider", () => {
        const virtual = { readdirSync: () => [] }
        setFsProvider(virtual)
        expect(getFs()).toBe(virtual)
    })

    // A silent fallback to node:fs would work in Node and fail in a Worker,
    // far from the actual mistake.
    it("throws a message naming the fix when nothing is installed", () => {
        setFsProvider(null)
        expect(() => getFs()).toThrow(/no fs provider installed/)
        expect(() => getFs()).toThrow(/setFsProvider/)
    })

    it("has no node imports of its own", () => {
        const src = nodeFs.readFileSync(new URL("./fs-provider.mjs", import.meta.url), "utf8")
        expect(src).not.toMatch(/from ["']node:/)
        expect(src).not.toMatch(/from ["']fs["']/)
    })
})

describe("plugins read through the provider", () => {
    it("lets a virtual filesystem satisfy a directory scan", async () => {
        const { findThemeModules } = await import("./esbuild/themes.mjs")
        const tree: Record<string, string[]> = {
            "/app": ["ui", "kawaiiTheme.ts"],
            "/app/ui": ["sketchTheme.ts", "notes.md"],
        }
        setFsProvider({
            readdirSync: (dir: string) => {
                const names = tree[dir]
                if (!names) throw new Error("ENOENT")
                return names.map((name) => ({
                    name,
                    isDirectory: () => name in { ui: 1 } || `${dir}/${name}` in tree,
                    isFile: () => !(`${dir}/${name}` in tree),
                }))
            },
        })
        const { files } = findThemeModules("/app")
        expect(files.map((f: string) => f.split("/").pop())).toEqual(["kawaiiTheme.ts", "sketchTheme.ts"])
    })

    it("surfaces a missing provider instead of reporting an empty scan", async () => {
        const { findThemeModules } = await import("./esbuild/themes.mjs")
        setFsProvider(null)
        expect(() => findThemeModules("/app")).toThrow(/no fs provider installed/)
    })
})
