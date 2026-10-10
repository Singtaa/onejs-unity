/**
 * texture.create was a placeholder that returned its input and made no
 * texture, silently. It is deprecated for texture.fromData: it still returns
 * what it always did, and now says so once.
 */
import { describe, it, expect, vi, afterEach } from "vitest"
import { texture } from "./index"

describe("texture.create", () => {
    afterEach(() => vi.restoreAllMocks())

    it("returns what it always did and warns once that it makes no texture", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        const data = new Uint8ClampedArray(2 * 2 * 4)

        expect(texture.create(data, 2, 2)).toEqual({ data, width: 2, height: 2 })
        expect(texture.create(data, 2, 2)).toEqual({ data, width: 2, height: 2 })

        expect(warn).toHaveBeenCalledTimes(1)
        expect(warn.mock.calls[0][0]).toMatch(/texture\.fromData/)
    })
})
