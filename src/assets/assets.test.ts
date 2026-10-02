import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The Editor branch of resolveAssetPath over a real temp folder: CS.System.IO
// is node's fs and path, with C# arrays as JS arrays carrying Length.
function csArray<T>(items: T[]): T[] & { Length: number } {
    return Object.assign(items, { Length: items.length })
}

let workingDir: string

function write(rel: string, text = "x") {
    const full = path.join(workingDir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text)
}

async function load() {
    vi.resetModules()
    return await import("./index")
}

beforeEach(() => {
    workingDir = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-assets-"))
    ;(globalThis as any).useExtensions = () => {}
    ;(globalThis as any).__workingDir = workingDir
    ;(globalThis as any).CS = {
        UnityEngine: {
            ImageConversion: {},
            Application: { isEditor: true, dataPath: "", streamingAssetsPath: "" },
        },
        System: {
            IO: {
                Path: {
                    Combine: (...parts: string[]) => path.join(...parts),
                    IsPathRooted: (p: string) => path.isAbsolute(p),
                    GetDirectoryName: (p: string) => path.dirname(p),
                    GetFileName: (p: string) => path.basename(p),
                },
                File: {
                    Exists: (p: string) => fs.existsSync(p) && fs.statSync(p).isFile(),
                    ReadAllText: (p: string) => fs.readFileSync(p, "utf8"),
                },
                Directory: {
                    Exists: (p: string) => fs.existsSync(p) && fs.statSync(p).isDirectory(),
                    GetDirectories: (p: string) => csArray(fs.readdirSync(p, { withFileTypes: true })
                        .filter((d) => d.isDirectory()).map((d) => path.join(p, d.name))),
                },
            },
        },
    }
})

afterEach(() => {
    fs.rmSync(workingDir, { recursive: true, force: true })
    delete (globalThis as any).CS
    delete (globalThis as any).__workingDir
    delete (globalThis as any).useExtensions
})

describe("resolveAssetPath in the Editor, for a package's assets", () => {
    it("finds node_modules/{pkg}/assets/@{ns}/ with no manifest", async () => {
        write("node_modules/hud/assets/@hud/map.jpg")
        const { getAssetPath } = await load()
        expect(getAssetPath("@hud/map.jpg")).toBe(path.join(workingDir, "node_modules/hud/assets/@hud/map.jpg"))
    })

    it("finds a scoped package's namespace", async () => {
        write("node_modules/@scope/kit/assets/@kit/theme.json")
        const { getAssetPath } = await load()
        expect(getAssetPath("@kit/theme.json")).toBe(path.join(workingDir, "node_modules/@scope/kit/assets/@kit/theme.json"))
    })

    // The build processor ships the app's own folder for a namespace in place
    // of the package's, so the Editor has to read the same one.
    it("lets the app's own folder for the namespace win", async () => {
        write("node_modules/hud/assets/@hud/map.jpg")
        write("assets/@hud/map.jpg")
        const { getAssetPath } = await load()
        expect(getAssetPath("@hud/map.jpg")).toBe(path.join(workingDir, "assets/@hud/map.jpg"))
    })

    it("leaves a namespace no package has in the app's assets", async () => {
        write("node_modules/hud/assets/@hud/map.jpg")
        const { getAssetPath } = await load()
        expect(getAssetPath("@other/a.png")).toBe(path.join(workingDir, "assets/@other/a.png"))
        expect(getAssetPath("images/a.png")).toBe(path.join(workingDir, "assets/images/a.png"))
    })

    it("still prefers a manifest entry", async () => {
        write("node_modules/hud/assets/@hud/map.jpg")
        write(".onejs/assets-manifest.json", JSON.stringify({
            namespaces: { "@hud": { type: "package", path: "elsewhere" } },
            userAssetsPath: "assets",
            destPath: "",
        }))
        const { getAssetPath } = await load()
        expect(getAssetPath("@hud/map.jpg")).toBe(path.join(workingDir, "elsewhere/map.jpg"))
    })
})

describe("loadBytes", () => {
    it("reads a file in a fixed number of crossings, not two per byte", async () => {
        write("assets/data.bin", "")
        fs.writeFileSync(path.join(workingDir, "assets/data.bin"), Buffer.from([0, 1, 2, 250, 255]))
        let crossings = 0
        const io = (globalThis as any).CS.System.IO
        // A C# byte[] proxy: every member read is a crossing.
        io.File.ReadAllBytes = (p: string) => {
            crossings++
            const buf = fs.readFileSync(p)
            return new Proxy({ __buf: buf }, {
                get(t, k) { crossings++; return k === "Length" ? buf.length : k === "__buf" ? t.__buf : buf[Number(k)] },
            })
        }
        ;(globalThis as any).CS.System.Convert = {
            ToBase64String: (b: any) => { crossings++; return Buffer.from(b.__buf).toString("base64") },
        }
        ;(globalThis as any).atob = (s: string) => Buffer.from(s, "base64").toString("binary")

        const { loadBytes } = await load()
        const bytes = loadBytes("data.bin")
        expect(Array.from(bytes)).toEqual([0, 1, 2, 250, 255])
        expect(crossings).toBeLessThanOrEqual(3)
    })
})
