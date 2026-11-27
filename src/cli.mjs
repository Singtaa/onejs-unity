#!/usr/bin/env node
/**
 * Builds a OneJS app from its esbuild.config.mjs.
 *
 *   onejs-unity build            one build
 *   onejs-unity watch            rebuild on every save
 *   onejs-unity build <config>   a config somewhere else; the build runs from its folder
 *
 * The config's default export is esbuild options, normally oneJSConfig(...).
 * esbuild comes from the app, never from this package, so the app's own
 * esbuild version decides how its code is bundled.
 */

import path from "node:path"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"

const USAGE = "usage: onejs-unity build [config] | onejs-unity watch [config]"

async function main() {
    const [command, configArg = "esbuild.config.mjs"] = process.argv.slice(2)
    if (command !== "build" && command !== "watch") return fail(USAGE)

    const configPath = path.resolve(configArg)
    const root = path.dirname(configPath)
    // The config, its plugins and oneJSConfig's defaults all read paths
    // relative to the app, so the build runs from the app's folder.
    process.chdir(root)

    let config
    try {
        config = (await import(pathToFileURL(configPath).href)).default
    } catch (e) {
        if (e?.code === "ERR_MODULE_NOT_FOUND" && e.message.includes(configPath)) {
            return fail(`[onejs-unity] No ${path.basename(configPath)} in ${root}.`)
        }
        throw e
    }
    if (!config || typeof config !== "object") {
        return fail(`[onejs-unity] ${path.basename(configPath)} has no default export. End it with:\n` +
            `  export default oneJSConfig({ entry: "index.tsx" })`)
    }

    let esbuild
    try {
        const require = createRequire(path.join(root, "package.json"))
        esbuild = await import(pathToFileURL(require.resolve("esbuild")).href)
    } catch {
        return fail(`[onejs-unity] esbuild is not installed in ${root}. Run: npm install --save-dev esbuild`)
    }

    if (command === "watch") {
        keepWritingWithoutAReader()
        const ctx = await esbuild.context(reportThroughNode(config, esbuild))
        await ctx.watch()
        console.log("Watching for changes...")
        return
    }

    try {
        await esbuild.build(config)
    } catch (e) {
        // esbuild prints every error that has a file and line. One without,
        // an invalid option say, it only throws.
        if (!e?.errors?.some((m) => m.location)) console.error(e?.message ?? e)
        process.exit(1)
    }
    console.log("Build complete!")
}

/**
 * The Unity editor reads a watcher's stdout and stderr through pipes, and a
 * domain reload loses its end of them while the watcher runs on. A write into
 * a pipe nobody reads fails with EPIPE: on Node's own streams that is an
 * error event, ignored here, so the watcher keeps building with no one
 * listening.
 */
function keepWritingWithoutAReader() {
    for (const stream of [process.stdout, process.stderr]) {
        stream.on("error", (e) => { if (e?.code !== "EPIPE") throw e })
    }
}

/**
 * esbuild's service writes its messages to the stderr it inherits, and it ends
 * on the first one that has no reader, which ends the watch. So in watch mode
 * esbuild logs nothing itself, and its errors and warnings are printed here,
 * through Node's guarded stderr, with the text esbuild would have printed.
 */
function reportThroughNode(config, esbuild) {
    const color = config.color ?? !!process.stderr.isTTY
    // What the config's own logLevel would have printed: esbuild's default is warnings and errors.
    const level = config.logLevel ?? "warning"
    const kinds = level === "silent" ? [] : level === "error" ? ["error"] : ["warning", "error"]
    const report = {
        name: "onejs-unity-report",
        setup(build) {
            build.onEnd(async (result) => {
                for (const [kind, messages] of [["warning", result.warnings], ["error", result.errors]]) {
                    if (!messages.length || !kinds.includes(kind)) continue
                    const text = await esbuild.formatMessages(messages, { kind, color })
                    process.stderr.write(text.join(""))
                }
            })
        },
    }
    return { ...config, logLevel: "silent", plugins: [...(config.plugins ?? []), report] }
}

function fail(message) {
    console.error(message)
    process.exit(1)
}

await main()
