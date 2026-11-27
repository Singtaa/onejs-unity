import { afterEach, describe, expect, it } from "vitest"
import { spawn, type ChildProcess } from "child_process"
import { createRequire } from "module"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

/**
 * `onejs-unity watch` as the Unity editor runs it: a child whose stdout and
 * stderr are pipes the editor reads. A domain reload loses the editor's end of
 * those pipes while the watcher keeps running, and a clean rebuild prints
 * nothing, so the first write after it is a build error, into a pipe nobody
 * reads. That write used to end the watcher, and the fix to the error was
 * then never built.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const cli = path.join(here, "cli.mjs")
const esbuildDir = path.dirname(createRequire(import.meta.url).resolve("esbuild/package.json"))

const tmpDirs: string[] = []
const children: ChildProcess[] = []

// Windows will not remove a folder a process still has open, and the watcher
// and esbuild's service hold the app folder until they have exited.
afterEach(async () => {
    await Promise.all(children.splice(0).map((child) => new Promise<void>((resolve) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve()
        child.once("exit", () => resolve())
        child.kill()
    })))
    while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
})

function makeApp(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-cli-watch-"))
    tmpDirs.push(root)
    fs.mkdirSync(path.join(root, "node_modules"))
    fs.symlinkSync(esbuildDir, path.join(root, "node_modules", "esbuild"), "junction")
    fs.writeFileSync(path.join(root, "package.json"), "{}\n")
    fs.writeFileSync(path.join(root, "esbuild.config.mjs"),
        `export default { entryPoints: ["index.ts"], bundle: true, outfile: "out.js", format: "iife" }\n`)
    fs.writeFileSync(path.join(root, "index.ts"), `console.log("first")\n`)
    return root
}

const until = async (ok: () => boolean, ms: number) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
        if (ok()) return true
        await new Promise((r) => setTimeout(r, 50))
    }
    return ok()
}

describe("onejs-unity watch", () => {
    it("keeps watching after its reader goes away, through a build error, and builds the fix", async () => {
        const root = makeApp()
        const child = spawn(process.execPath, [cli, "watch"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
        children.push(child)
        let out = ""
        child.stdout!.on("data", (d) => { out += d })
        expect(await until(() => out.includes("Watching for changes"), 10000)).toBe(true)
        const bundle = path.join(root, "out.js")
        expect(fs.readFileSync(bundle, "utf8")).toContain("first")

        // The reader goes, as the editor's does in a domain reload.
        child.stdout!.destroy()
        child.stderr!.destroy()

        fs.writeFileSync(path.join(root, "index.ts"), `console.log("broken"\n`)
        await new Promise((r) => setTimeout(r, 1500))
        expect(child.exitCode, "the watcher is still running after the error").toBeNull()

        fs.writeFileSync(path.join(root, "index.ts"), `console.log("fixed")\n`)
        expect(await until(() => fs.readFileSync(bundle, "utf8").includes("fixed"), 10000), "the fix was built").toBe(true)
    }, 30000)

    it("still prints a build error, with its file and line, to a reader that is there", async () => {
        const root = makeApp()
        const child = spawn(process.execPath, [cli, "watch"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
        children.push(child)
        let out = "", err = ""
        child.stdout!.on("data", (d) => { out += d })
        child.stderr!.on("data", (d) => { err += d })
        expect(await until(() => out.includes("Watching for changes"), 10000)).toBe(true)

        fs.writeFileSync(path.join(root, "index.ts"), `console.log("broken"\n`)
        expect(await until(() => err.includes("index.ts:"), 10000), err).toBe(true)
        expect(err).toContain("[ERROR]")
        expect(child.exitCode).toBeNull()
    }, 30000)
})
