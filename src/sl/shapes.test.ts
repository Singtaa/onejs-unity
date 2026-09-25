import { describe, it, expect } from "vitest"
import { SL_SDF_SHAPES } from "./index"
import { SDF_SHAPES } from "../fx/sdf"

describe("the sl shape table is pinned to fx's", () => {
    it("has identical names and ids", () => {
        // onejs-sl keeps its own copy because it has no Unity in it and cannot
        // import fx. This is the guard that makes the copy safe: both tables
        // index the same switch in SDF2D.cginc, so a divergence would draw the
        // wrong shape rather than fail.
        expect(SL_SDF_SHAPES).toEqual(SDF_SHAPES)
    })
})
