import { afterEach, describe, expect, it } from "vitest"
import { spawn, spawnSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { oneJSConfig } from "./preset.mjs"

/**
 * The preset is the build every new OneJS project runs, so these build real
 * apps with it rather than inspecting the options it returns: an option can be
 * present and still not do what it says, which is how players got React's
 * development build for months with nothing in the config looking wrong.
 */

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")
const CLI = path.join(PACKAGE_ROOT, "src/cli.mjs")
const tmpDirs: string[] = []

/**
 * An app laid out the way Initialize Project lays one out: the working
 * directory `~` inside the app folder, the bundle written one level up. Its
 * node_modules links to this package and to the React and esbuild this package
 * already installs, so the app resolves exactly what a real one would.
 */
function makeApp(files: Record<string, string>): { root: string, bundle: string } {
    const app = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-preset-test-"))
    tmpDirs.push(app)
    const root = path.join(app, "~")
    fs.mkdirSync(path.join(root, "node_modules"), { recursive: true })
    for (const name of ["react", "esbuild"]) {
        fs.symlinkSync(path.join(PACKAGE_ROOT, "node_modules", name), path.join(root, "node_modules", name), "junction")
    }
    fs.symlinkSync(PACKAGE_ROOT, path.join(root, "node_modules", "onejs-unity"), "junction")
    fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "app", type: "module" }))
    for (const [rel, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
        fs.writeFileSync(path.join(root, rel), content)
    }
    return { root, bundle: path.join(app, "app.js.txt") }
}

afterEach(() => {
    while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

const REACT_APP = `import { useState } from "react"\nexport function useCount() { return useState(0) }\n`
const CONFIG = `import { oneJSConfig } from "onejs-unity/esbuild"\nexport default oneJSConfig({ entry: "index.tsx" })\n`

function cli(root: string, args: string[], env: Record<string, string> = {}) {
    return spawnSync(process.execPath, [CLI, ...args], {
        cwd: root, encoding: "utf8", env: { ...process.env, NODE_ENV: "", ...env },
    })
}

describe("oneJSConfig", () => {
    it("bundles index.tsx into ../app.js.txt as the IIFE JSRunner reads lifecycle exports from", () => {
        const { root } = makeApp({})
        const config = oneJSConfig({ root })
        expect(config.entryPoints).toEqual(["index.tsx"])
        expect(path.resolve(root, config.outfile!)).toBe(path.resolve(root, "../app.js.txt"))
        expect(config.format).toBe("iife")
        expect(config.globalName).toBe("__exports")
        expect(config.absWorkingDir).toBe(root)
    })

    it("runs the project's own plugins after its built-in ones, and merges what it overrides", () => {
        const { root } = makeApp({})
        const mine = { name: "mine", setup() {} }
        const config = oneJSConfig({ root, plugins: [mine], alias: { lodash: "lodash-es" }, loader: { ".glsl": "text" }, minify: true })
        const names = config.plugins!.map((p) => p.name)
        expect(names.indexOf("mine")).toBeGreaterThan(names.indexOf("tailwind-uss"))
        expect(config.alias).toMatchObject({ lodash: "lodash-es" })
        expect(config.alias!.react).toBeTruthy()
        expect(config.loader).toEqual({ ".uss": "text", ".glsl": "text" })
        expect(config.minify).toBe(true)
    })

    it("resolves React and oj from the app, whatever directory the build runs from", () => {
        // ojplay's real exports map, which does not export its package.json.
        const { root } = makeApp({
            "node_modules/ojplay/package.json": JSON.stringify({ name: "ojplay", exports: { ".": "./src/index.ts" } }),
            "node_modules/ojplay/src/index.ts": "export const oj = 1\n",
        })
        const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-preset-cwd-"))
        tmpDirs.push(elsewhere)
        const prev = process.cwd()
        process.chdir(elsewhere)
        try {
            const config = oneJSConfig({ root })
            expect(fs.realpathSync(config.alias!.oj)).toBe(fs.realpathSync(path.join(root, "node_modules/ojplay/src/index.ts")))
            expect(fs.realpathSync(config.alias!.react)).toBe(fs.realpathSync(path.join(PACKAGE_ROOT, "node_modules/react")))
        } finally {
            process.chdir(prev)
        }
    })

    it("leaves oj unaliased in an app without ojplay", () => {
        const { root } = makeApp({})
        expect(oneJSConfig({ root }).alias!.oj).toBeUndefined()
    })
})

describe("onejs-unity build", () => {
    it("ships React's production build when NODE_ENV is production, and the development build otherwise", () => {
        const { root, bundle } = makeApp({ "index.tsx": REACT_APP, "esbuild.config.mjs": CONFIG })

        const dev = cli(root, ["build"])
        expect(dev.status, dev.stdout + dev.stderr).toBe(0)
        const devCode = fs.readFileSync(bundle, "utf8")
        expect(devCode).toContain("react.development.js")

        const prod = cli(root, ["build"], { NODE_ENV: "production" })
        expect(prod.status, prod.stdout + prod.stderr).toBe(0)
        const prodCode = fs.readFileSync(bundle, "utf8")
        expect(prodCode).not.toContain("react.development.js")
        expect(prodCode).toContain("react.production.js")
        expect(prodCode.length).toBeLessThan(devCode.length)
    })

    it("writes the source map as app.js.map.txt, the name Unity imports as a TextAsset", () => {
        const { root, bundle } = makeApp({ "index.tsx": REACT_APP, "esbuild.config.mjs": CONFIG })
        expect(cli(root, ["build"]).status).toBe(0)
        expect(fs.existsSync(bundle.replace(/app\.js\.txt$/, "app.js.map.txt"))).toBe(true)
        expect(fs.existsSync(`${bundle}.map`)).toBe(false)
    })

    it("builds a config named on the command line from that config's folder", () => {
        const { root, bundle } = makeApp({ "index.tsx": REACT_APP, "esbuild.config.mjs": CONFIG })
        const res = spawnSync(process.execPath, [CLI, "build", path.join(root, "esbuild.config.mjs")], {
            cwd: os.tmpdir(), encoding: "utf8",
        })
        expect(res.status, res.stdout + res.stderr).toBe(0)
        expect(fs.existsSync(bundle)).toBe(true)
    })

    it("exits 1 with esbuild's own error when the app does not compile", () => {
        const { root } = makeApp({ "index.tsx": "export const x = (\n", "esbuild.config.mjs": CONFIG })
        const res = cli(root, ["build"])
        expect(res.status).toBe(1)
        expect(res.stderr).toContain("index.tsx")
    })

    it("says what to export when the config exports nothing", () => {
        const { root } = makeApp({ "index.tsx": REACT_APP, "esbuild.config.mjs": "export const x = 1\n" })
        const res = cli(root, ["build"])
        expect(res.status).toBe(1)
        expect(res.stderr).toContain("export default oneJSConfig(")
    })

    it("rebuilds on a save in watch mode", async () => {
        const { root, bundle } = makeApp({ "index.tsx": "export const word = \"first\"\n", "esbuild.config.mjs": CONFIG })
        const child = spawn(process.execPath, [CLI, "watch"], { cwd: root, env: { ...process.env, NODE_ENV: "" } })
        const until = async (test: () => boolean, ms: number) => {
            for (const end = Date.now() + ms; Date.now() < end; await new Promise((r) => setTimeout(r, 50))) {
                if (test()) return true
            }
            return false
        }
        const read = () => fs.existsSync(bundle) ? fs.readFileSync(bundle, "utf8") : ""
        try {
            expect(await until(() => read().includes("first"), 10000)).toBe(true)
            fs.writeFileSync(path.join(root, "index.tsx"), "export const word = \"second\"\n")
            expect(await until(() => read().includes("second"), 10000)).toBe(true)
        } finally {
            child.kill()
        }
    }, 30000)
})
