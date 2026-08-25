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

    // A root that is not there yet is the normal pre-extraction state. A child
    // that was just enumerated as a directory and then cannot be read is not,
    // and reporting it as "no themes" hides the fault behind a good message.
    it("throws naming the directory when a child cannot be read mid-walk", async () => {
        const { findThemeModules } = await import("./esbuild/themes.mjs")
        setFsProvider({
            readdirSync: (dir: string) => {
                if (dir.endsWith("/ui")) throw new Error("EACCES")
                return [{ name: "ui", isDirectory: () => true, isFile: () => false }]
            },
        })
        expect(() => findThemeModules("/app")).toThrow(/could not read/)
        expect(() => findThemeModules("/app")).toThrow(/ui/)
    })

    it("surfaces a missing provider instead of reporting an empty scan", async () => {
        const { findThemeModules } = await import("./esbuild/themes.mjs")
        setFsProvider(null)
        expect(() => findThemeModules("/app")).toThrow(/no fs provider installed/)
    })
    it("descends into nested directories of a virtual filesystem", async () => {
        const { setFsProvider } = await import("./fs-provider.mjs")
        const { findThemeModules } = await import("./esbuild/themes.mjs")
        // Two levels deep, which is the real cartridge shape
        // (@cartridges/@scope/name/nameTheme.ts). The old walk joined children
        // with the host separator, so on Windows it looked for "\app\@singtaa"
        // against a provider keyed on "/app/@singtaa", found nothing below the
        // root, and reported a single stray file instead of failing.
        const tree: Record<string, string[]> = {
            "/app": ["@singtaa"],
            "/app/@singtaa": ["kawaii", "sketch"],
            "/app/@singtaa/kawaii": ["kawaiiTheme.ts"],
            "/app/@singtaa/sketch": ["sketchTheme.ts", "notes.md"],
        }
        setFsProvider({
            readdirSync: (dir: string) => {
                const names = tree[dir]
                if (!names) throw new Error("ENOENT")
                return names.map((name) => ({
                    name,
                    isDirectory: () => `${dir}/${name}` in tree,
                    isFile: () => !(`${dir}/${name}` in tree),
                }))
            },
        })
        const { files, dirs } = findThemeModules("/app")
        expect(files).toEqual([
            "/app/@singtaa/kawaii/kawaiiTheme.ts",
            "/app/@singtaa/sketch/sketchTheme.ts",
        ])
        // Every directory is watched, so a newly extracted cartridge rebuilds.
        expect(dirs).toEqual([
            "/app", "/app/@singtaa", "/app/@singtaa/kawaii", "/app/@singtaa/sketch",
        ])
    })
})

