import { describe, expect, it } from "vitest"
import * as game from "./index"
import * as compiler from "./compiler"

/**
 * What `onejs-unity/sl` and `onejs-unity/sl/compiler` export about the
 * shader language's machinery. The VM went in onejs-sl 0.3.0, and this
 * package works on 0.2.1 and 0.3.0 alike, so it re-exports nothing that only
 * the VM had and nothing 0.3.0 removed.
 */
const VM_ONLY = [
    "SL_WIRE_VERSION", "REGISTERS", "MAX_INSTRUCTIONS", "TEXELS_PER_INSTRUCTION", "liveRanges", "reachable",
    "VM_TEXTURES", "VM_UNIFORMS", "MAX_TEXTURES", "vmFit", "forVm",
]

describe("the shader language surface", () => {
    for (const [name, entry] of [["onejs-unity/sl", game], ["onejs-unity/sl/compiler", compiler]] as const) {
        it(`${name} re-exports nothing only the VM had`, () => {
            expect(Object.keys(entry).filter((k) => VM_ONLY.includes(k))).toEqual([])
        })

        it(`${name} gives the caps under their own names, and encode as compile`, () => {
            expect((entry as Record<string, unknown>).UNIFORM_SLOTS).toBe(16)
            expect((entry as Record<string, unknown>).TEXTURE_SLOTS).toBe(4)
            expect(entry.encode).toBe(entry.compile)
        })
    }
})
