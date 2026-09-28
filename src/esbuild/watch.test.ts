import { afterEach, describe, expect, it } from "vitest"
import * as esbuild from "esbuild"
import fs from "fs"
import os from "os"
import path from "path"
import { ussModulesPlugin } from "./uss-modules.mjs"
import { slPlugin } from "./sl.mjs"
import { tailwindPlugin } from "./tailwind.mjs"

/**
 * Watch mode has to rebuild when a file a plugin read changes.
 *
 * esbuild watches only the files it loaded itself. A plugin that resolves into
 * its own namespace and reads the file by hand has to name that file in
 * `watchFiles`, or an edit to it rebuilds nothing: hot reload then waits until
 * some TS file happens to change too, which is what a user reported for
 * `.module.uss`. A build that succeeds proves nothing here, so these drive a
 * real watch context and wait for the rebuild the edit should cause.
 */

const tmpDirs: string[] = []

function makeApp(structure: Record<string, string>): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "onejs-watch-test-"))
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

interface Build {
    code: string
    errors: string[]
}

/**
 * Starts watching, rewrites `file` once the first build is done, and returns
 * the first build and the rebuild the edit caused. The rebuild is null when
 * none arrived within the wait, which is the failure these tests exist to see.
 */
async function editWhileWatching(
    root: string, plugin: esbuild.Plugin, file: string, content: string,
): Promise<{ first: Build, rebuild: Build | null }> {
    const builds: Build[] = []
    let arrived: () => void = () => {}
    const record: esbuild.Plugin = {
        name: "record",
        setup(build) {
            build.onEnd((result) => {
                builds.push({
                    code: result.outputFiles?.[0]?.text ?? "",
                    errors: result.errors.map((e) => e.text),
                })
                arrived()
            })
        },
    }
    const next = (count: number, ms: number) => new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), ms)
        arrived = () => {
            if (builds.length >= count) {
                clearTimeout(timer)
                resolve(true)
            }
        }
        arrived()
    })

    // Both plugins name modules relative to the working directory.
    const prevCwd = process.cwd()
    process.chdir(root)
    const ctx = await esbuild.context({
        entryPoints: [path.join(root, "index.ts")],
        bundle: true,
        write: false,
        format: "esm",
        logLevel: "silent",
        plugins: [plugin, record],
    })
    try {
        await ctx.watch()
        if (!await next(1, 5000)) throw new Error("the first build never finished")
        fs.writeFileSync(path.join(root, file), content)
        // esbuild polls rather than subscribing, so a change takes a moment to
        // be seen; the wait is generous because it only runs out on failure.
        const rebuilt = await next(2, 8000)
        return { first: builds[0], rebuild: rebuilt ? builds[1] : null }
    } finally {
        await ctx.dispose()
        process.chdir(prevCwd)
    }
}

/**
 * How many builds a watch context runs, untouched, in `ms` after it starts.
 * One is right; more means each build changes a file it watches.
 *
 * A one-off build runs first, so its output is already on disk when watching
 * starts, as it is in any project built before. Without it the scan runs before
 * the output exists, never watches it, and a loop could not show.
 */
async function buildsWhileIdle(root: string, options: esbuild.BuildOptions, ms: number): Promise<number> {
    let count = 0
    const counter: esbuild.Plugin = { name: "count", setup(build) { build.onEnd(() => { count++ }) } }
    const prevCwd = process.cwd()
    process.chdir(root)
    await esbuild.build({ ...options, logLevel: "silent" })
    const ctx = await esbuild.context({ ...options, logLevel: "silent", plugins: [...(options.plugins ?? []), counter] })
    try {
        await ctx.watch()
        await new Promise((r) => setTimeout(r, ms))
        return count
    } finally {
        await ctx.dispose()
        process.chdir(prevCwd)
    }
}

const PLAIN = "float4 main() {\n    return float4(uv, 0, 1);\n}\n"
const BROKEN = "float4 main() {\n    float z = uv.z;\n    return float4(z, 0, 0, 1);\n}\n"

describe("watch mode", () => {
    it("rebuilds when a .module.uss file changes", async () => {
        const root = makeApp({
            "package.json": "{}",
            "button.module.uss": ".button { color: red; }\n",
            "index.ts": `import styles from "./button.module.uss"\nexport default styles`,
        })
        const { first, rebuild } = await editWhileWatching(
            root, ussModulesPlugin({ generateTypes: false }),
            "button.module.uss", ".button { color: blue; }\n")
        expect(first.code).toContain("color: red")
        expect(rebuild?.code).toContain("color: blue")
    }, 15000)

    it("rebuilds when a .sl file changes", async () => {
        const root = makeApp({
            "plasma.sl": PLAIN,
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        const { first, rebuild } = await editWhileWatching(
            root, slPlugin({ generateTypes: false }),
            "plasma.sl", PLAIN.replace("uv, 0, 1", "uv, 1, 1"))
        expect(first.errors).toEqual([])
        expect(rebuild).not.toBeNull()
        expect(rebuild!.errors).toEqual([])
        expect(rebuild!.code).not.toBe(first.code)
    }, 15000)

    it("rebuilds when the mistake in a .sl file that failed to parse is fixed", async () => {
        const root = makeApp({
            "plasma.sl": BROKEN,
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        const { first, rebuild } = await editWhileWatching(
            root, slPlugin({ generateTypes: false }), "plasma.sl", PLAIN)
        // The parser's own words, so an error from anywhere else (a compiler
        // that failed to load, say) does not pass for the one this is about.
        expect(first.errors).toHaveLength(1)
        expect(first.errors[0]).toMatch(/"z" is component 3 of a float2/)
        expect(rebuild?.errors).toEqual([])
    }, 15000)

    // Saving the import before the file is the ordinary order to write them
    // in. The failed build has to go on watching the path it could not read,
    // or creating the file rebuilds nothing.
    it("rebuilds when an imported .module.uss file is created after the import", async () => {
        const root = makeApp({
            "package.json": "{}",
            "index.ts": `import styles from "./button.module.uss"\nexport default styles`,
        })
        const { first, rebuild } = await editWhileWatching(
            root, ussModulesPlugin({ generateTypes: false }),
            "button.module.uss", ".button { color: blue; }\n")
        expect(first.errors).toHaveLength(1)
        expect(first.errors[0]).toMatch(/button\.module\.uss/)
        expect(rebuild?.errors).toEqual([])
        expect(rebuild?.code).toContain("color: blue")
    }, 15000)

    it("rebuilds when an imported .sl file is created after the import", async () => {
        const root = makeApp({
            "index.ts": `import plasma from "./plasma.sl"\nexport default plasma`,
        })
        const { first, rebuild } = await editWhileWatching(
            root, slPlugin({ generateTypes: false }), "plasma.sl", PLAIN)
        expect(first.errors).toHaveLength(1)
        expect(first.errors[0]).toMatch(/plasma\.sl/)
        expect(rebuild?.errors).toEqual([])
    }, 15000)

    // `content` can name files the bundle never imports, and their classes
    // still belong in the stylesheet.
    it("rebuilds the Tailwind stylesheet when a scanned file outside the bundle changes", async () => {
        const root = makeApp({
            "app.tsx": `export const A = <div className="p-4" />`,
            "extra.tsx": `export const B = <div className="p-4" />`,
            "index.ts": `import "onejs:tailwind"\nimport { A } from "./app"\nexport default A`,
        })
        const { first, rebuild } = await editWhileWatching(
            root, tailwindPlugin({ content: ["./**/*.{tsx,ts}"] }),
            "extra.tsx", `export const B = <div className="p-4 mt-8" />`)
        expect(first.code).not.toContain(".mt-8")
        expect(rebuild?.code).toContain(".mt-8")
    }, 15000)

    // The scan watches every file it reads, so a bundle written inside the
    // scanned folder is watched too. esbuild compares contents, so that is
    // fine while a build is deterministic; a stylesheet that changed on every
    // build (a timestamp in it, say) would rebuild forever.
    it("settles after one build when the bundle is written inside the scanned folder", async () => {
        const root = makeApp({
            "index.tsx": `import "onejs:tailwind"\nexport default <div className="p-4" />`,
        })
        const builds = await buildsWhileIdle(root, {
            entryPoints: [path.join(root, "index.tsx")],
            bundle: true,
            outfile: path.join(root, "dist/app.js"),
            plugins: [tailwindPlugin({ content: ["./**/*.{tsx,ts,jsx,js}"] })],
        }, 4000)
        expect(fs.readFileSync(path.join(root, "dist/app.js"), "utf8")).toContain(".p-4")
        expect(builds).toBe(1)
    }, 15000)
})
