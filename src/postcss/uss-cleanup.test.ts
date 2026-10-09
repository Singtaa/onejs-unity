import { describe, expect, it } from "vitest"
import postcss from "postcss"
import { ussCleanup } from "./uss-cleanup.mjs"

const clean = async (css: string) => (await postcss([ussCleanup()]).process(css, { from: undefined })).css

describe("ussCleanup", () => {
    // Each was stripped as unsupported, and each is a USS property: filter, text-shadow,
    // transform-origin and cursor from Unity 6.3, backdrop-filter and
    // animation-play-state from 6.6 (Unity's StylePropertyUtil table).
    it("keeps properties USS has", async () => {
        const decls = [
            "filter: blur(4px)", "backdrop-filter: blur(8px)", "text-shadow: 1px 1px 2px black",
            "transform-origin: left top", "cursor: arrow", "animation-play-state: paused",
        ]
        const out = await clean(`.a { ${decls.join("; ")}; }`)
        for (const d of decls) expect(out).toContain(d)
    })

    // Whether a property exists depends on the Unity version, which only the editor
    // knows: OneJS's runtime compiler checks each one against that editor's own table
    // and reports what UI Toolkit will ignore. A list here would go stale with each Unity.
    it("leaves the judgement of other properties to the runtime compiler", async () => {
        expect(await clean(".a { box-shadow: 0 1px 2px black; }")).toContain("box-shadow")
    })

    it("still removes the at-rules USS cannot parse", async () => {
        const out = await clean("@keyframes k { from { opacity: 0 } } @font-face { font-family: x } @supports (x: y) { .a { color: red } } .b { color: red }")
        expect(out).not.toMatch(/@keyframes|@font-face|@supports/)
        expect(out).toContain(".b { color: red }")
    })
})
