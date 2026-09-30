import { describe, expect, it } from "vitest"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { pathToFileURL } from "node:url"

/**
 * Each case runs in a child process with a timeout, because the bug this guards
 * against was an infinite loop: in this process it would hang the run rather
 * than fail it.
 */
function inChild(body: string): unknown {
    // A URL rather than a path: on Windows import() reads "D:\..." as a
    // URL whose scheme is "d:" and refuses it.
    const plugin = pathToFileURL(path.resolve(import.meta.dirname, "uss-unwrap-is.mjs")).href
    const script = `
        const { default: postcss } = await import("postcss")
        const { ussUnwrapIs } = await import(${JSON.stringify(plugin)})
        ${body}
    `
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: import.meta.dirname, encoding: "utf8", timeout: 10_000 })
    if (run.error) throw run.error
    if (run.status !== 0) throw new Error(run.stderr)
    return JSON.parse(run.stdout)
}

function unwrap(css: string[]): string[] {
    return inChild(`
        const out = []
        for (const css of ${JSON.stringify(css)}) out.push((await postcss([ussUnwrapIs()]).process(css, { from: undefined })).css)
        console.log(JSON.stringify(out))
    `) as string[]
}

describe("ussUnwrapIs", () => {
    it("expands the README's own example, whose :is() holds a comma", () => {
        expect(unwrap([".button:is(.primary, .secondary) { color: blue; }"]))
            .toEqual([".button.primary, .button.secondary { color: blue; }"])
    })

    it("keeps a selector list's own commas, and expands each member", () => {
        expect(unwrap([".a:is(.b, .c), .d { color: red; }", ".x:where(.y) { color: red; }"]))
            .toEqual([".a.b, .a.c, .d { color: red; }", ".x.y { color: red; }"])
    })

    it("expands nested :is() and keeps the commas inside an attribute selector", () => {
        expect(unwrap([":is(.a, .b):is(.c, .d) { color: red; }", ".a:is([data-x=\"1,2\"], .b) { color: red; }"]))
            .toEqual([".a.c, .a.d, .b.c, .b.d { color: red; }", ".a[data-x=\"1,2\"], .a.b { color: red; }"])
    })

    // PostCSS refuses an unclosed bracket before the plugin sees it, so the
    // plugin's rule hook is handed one directly.
    it("returns a malformed :is() as it was rather than spinning", () => {
        expect(inChild(`
            const rule = { selector: ".a:is(.b" }
            ussUnwrapIs().Rule(rule)
            console.log(JSON.stringify(rule.selector))
        `)).toBe(".a:is(.b")
    })
})
