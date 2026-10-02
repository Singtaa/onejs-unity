import { afterEach, describe, expect, it } from "vitest"
import { spawnSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"

/**
 * `"types": ["onejs-unity/globals"]` is how a OneJS app's tsconfig gets the
 * runtime's globals. These typecheck an app set up that way, with tsc, because
 * a declaration file proves nothing by existing: the entry has to resolve
 * through the exports map, and each global has to type the way code uses it.
 */

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const TSC = path.join(PACKAGE_ROOT, "node_modules/typescript/bin/tsc")
const tmpDirs: string[] = []

afterEach(() => {
    while (tmpDirs.length) fs.rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

// What unity-types declares for the few C# types the globals name.
const CS_STUB = `
declare namespace CS.UnityEngine.UIElements { class VisualElement { Add(child: VisualElement): void } }
declare namespace CS.UnityEngine { class Component {} class GameObject {} class MeshFilter extends Component {} }
declare namespace CS.System { class Type {} }
`

/** Typechecks `code` as a OneJS app's source; returns tsc's diagnostics, empty when clean. */
function typecheck(code: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-globals-test-"))
    tmpDirs.push(root)
    fs.mkdirSync(path.join(root, "node_modules"))
    fs.symlinkSync(PACKAGE_ROOT, path.join(root, "node_modules/onejs-unity"), "junction")
    fs.writeFileSync(path.join(root, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
            target: "ES2022", lib: ["ES2022"], module: "ESNext", moduleResolution: "Bundler",
            noEmit: true, strict: true, skipLibCheck: true, isolatedModules: true,
            types: ["onejs-unity/globals"],
        },
        include: ["*.ts"],
    }))
    fs.writeFileSync(path.join(root, "cs.d.ts"), CS_STUB)
    fs.writeFileSync(path.join(root, "app.ts"), `${code}\nexport {}\n`)
    const res = spawnSync(process.execPath, [TSC, "-p", root], { encoding: "utf8" })
    return (res.stdout + res.stderr).trim()
}

describe("onejs-unity/globals", () => {
    it("types the runtime's globals for an app that names it in tsconfig", () => {
        expect(typecheck(`
            import "onejs:tailwind"
            import "onejs:themes"
            import css from "./theme.uss"
            const sheet: string = css
            compileStyleSheet(sheet, "theme")
            __root.Add(new CS.UnityEngine.UIElements.VisualElement())
            const playing: boolean = __isPlaying
            const type: CS.System.Type = $typeof(CS.UnityEngine.MeshFilter)
            const persistent: string = __persistentDataPath
            requestAnimationFrame((t: number) => console.log(t, playing, type, persistent))
            fetch("https://example.com", { method: "PATCH", body: "{}" }).then((r) => r.json())
            for (const [k, v] of new Headers({ a: "1" })) console.log(k, v)
            for (const [k, v] of new URLSearchParams("a=1")) console.log(k, v)
            localStorage.setItem("k", new URL("https://example.com").host)
            new WebSocket("wss://example.com").onmessage = (e) => console.log(e.data)
        `)).toBe("")
    })

    it("types setTimeout and setInterval's extra arguments against the callback", () => {
        expect(typecheck(`
            setTimeout((name: string, n: number) => console.log(name, n), 10, "a", 1)
            setInterval((name: string) => console.log(name), 10, "a")
            setTimeout(() => {}, 10)
            // @ts-expect-error a number where the callback takes a string
            setTimeout((name: string) => console.log(name), 10, 5)
        `)).toBe("")
    })

    it("keeps the runtime's internals out of an app's names", () => {
        expect(typecheck(`
            // @ts-expect-error internal, reached through onejs-react
            __eventAPI.addEventListener
            // @ts-expect-error internal to the interop
            __csHelpers.callStatic
        `)).toBe("")
    })
})
