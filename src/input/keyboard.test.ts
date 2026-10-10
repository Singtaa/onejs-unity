/**
 * keyboard.keysPressed lists the keys pressed this frame in the order they
 * went down. wasKeyPressed answers per key and cannot say which came first,
 * so letters typed inside one slow frame reached a game in whatever order it
 * asked about them (onejs-play#4).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { installFakeBridge, type FakeInput } from "./fake-bridge.test-util"
import { setInputBackend } from "./backend"
import { keyboard } from "./keyboard"

describe("keyboard.keysPressed", () => {
    let fake: FakeInput
    beforeEach(() => { fake = installFakeBridge() })
    afterEach(() => setInputBackend(null))

    it("keeps the order two keys went down in within one frame", () => {
        fake.pressedInOrder = ["R", "C"]
        expect(keyboard.keysPressed).toEqual(["R", "C"])
    })

    it("is empty on a frame where nothing went down", () => {
        expect(keyboard.keysPressed).toEqual([])
    })

    it("lists a key pressed twice in one frame twice", () => {
        fake.pressedInOrder = ["E", "E"]
        expect(keyboard.keysPressed).toEqual(["E", "E"])
    })
})
