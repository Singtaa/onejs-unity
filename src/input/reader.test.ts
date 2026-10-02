/**
 * InputReader reads check the kind of binding they read. Before, down(),
 * pressed() and released() all returned whatever the binding held, so
 * `.mouseButton("fire", "left")` read with `pressed("fire")` fired every frame
 * the button was held, and a misspelled name read false forever.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { setInputBackend } from "./backend"
import { createReader } from "./reader"
import { installFakeBridge, resetCalls, gamepad, fake } from "./fake-bridge.test-util"

beforeEach(() => { installFakeBridge() })
afterEach(() => setInputBackend(null))

const LEFT = 1
const RIGHT = 2

describe("mouse button edges", () => {
    it("mouseButtonPressed is true on the press frame only, while mouseButton stays held", () => {
        const reader = createReader()
            .mouseButton("aim", "left")
            .mouseButtonPressed("fire", "left")
            .mouseButtonReleased("stop", "left")
            .build()

        fake.mouse.held = LEFT
        fake.mouse.pressed = LEFT
        reader.tick()
        expect(reader.pressed("fire")).toBe(true)
        expect(reader.down("aim")).toBe(true)
        expect(reader.released("stop")).toBe(false)

        fake.mouse.pressed = 0
        reader.tick()
        expect(reader.pressed("fire")).toBe(false)
        expect(reader.down("aim")).toBe(true)

        fake.mouse.held = 0
        fake.mouse.released = LEFT
        reader.tick()
        expect(reader.released("stop")).toBe(true)
        expect(reader.down("aim")).toBe(false)
    })

    it("reads each mouse mask once a frame however many buttons are bound", () => {
        const reader = createReader()
            .mouseButton("a", "left")
            .mouseButton("b", "right")
            .mouseButton("c", "middle")
            .mouseButtonPressed("d", "left")
            .mouseButtonPressed("e", "right")
            .build()
        fake.mouse.held = RIGHT
        fake.mouse.pressed = RIGHT
        resetCalls()
        reader.tick()
        expect(fake.calls["za.getMouseButtons"]).toBe(1)
        expect(fake.calls.GetMouseButtonsPressed).toBe(1)
        expect(fake.calls.GetMouseButtonsReleased).toBeUndefined()
        expect(reader.down("b")).toBe(true)
        expect(reader.pressed("e")).toBe(true)
        expect(reader.pressed("d")).toBe(false)
    })
})

describe("gamepad button edges", () => {
    it("gamepadButtonPressed is true on the press frame only", () => {
        fake.gamepads.push(gamepad())
        const reader = createReader()
            .gamepadButton("guard", "East")
            .gamepadButtonPressed("jump", "South")
            .gamepadButtonReleased("land", "South")
            .build()

        fake.gamepads[0].held = 1
        fake.gamepads[0].pressed = 1
        reader.tick()
        expect(reader.pressed("jump")).toBe(true)
        expect(reader.down("guard")).toBe(false)

        fake.gamepads[0].pressed = 0
        reader.tick()
        expect(reader.pressed("jump")).toBe(false)

        fake.gamepads[0].released = 1
        reader.tick()
        expect(reader.released("land")).toBe(true)
    })

    it("refuses an edge binding on a button name it does not know", () => {
        expect(() => createReader().gamepadButtonPressed("jump", "Jump")).toThrow(/"Jump"/)
    })
})

describe("reads check the binding kind", () => {
    it("pressed() on a held binding throws and names the edge binding to use", () => {
        const reader = createReader().mouseButton("fire", "left").build()
        fake.mouse.held = LEFT
        reader.tick()
        expect(() => reader.pressed("fire")).toThrow(/mouseButtonPressed/)
        expect(() => reader.pressed("fire")).toThrow(/reader\.down\("fire"\)/)
    })

    it("down() on a press edge binding throws and names the read that fits", () => {
        const reader = createReader().keyPressed("interact", "E").build()
        expect(() => reader.down("interact")).toThrow(/reader\.pressed\("interact"\)/)
    })

    it("vec2() on a float binding throws", () => {
        const reader = createReader().mouseFloat("zoom", "scrollY").build()
        expect(() => reader.vec2("zoom")).toThrow(/reader\.float\("zoom"\)/)
    })

    it("each kind reads through its own method", () => {
        fake.held.add("Space")
        fake.pressed.add("E")
        fake.released.add("Q")
        fake.held.add("D")
        fake.mouse.sy = 3
        fake.mouse.dx = 4
        const reader = createReader()
            .key("jump", "Space")
            .keyPressed("interact", "E")
            .keyReleased("drop", "Q")
            .keyAxis("turn", { negative: "A", positive: "D" })
            .keyAxis2D("move", { up: "W", down: "S", left: "A", right: ["D", "RightArrow"] })
            .mouseFloat("zoom", "scrollY")
            .mouseVec2("look", "delta")
            .build()
        reader.tick()
        expect(reader.down("jump")).toBe(true)
        expect(reader.pressed("interact")).toBe(true)
        expect(reader.released("drop")).toBe(true)
        expect(reader.float("turn")).toBe(1)
        expect(reader.vec2("move")).toEqual({ x: 1, y: 0 })
        expect(reader.float("zoom")).toBe(3)
        expect(reader.vec2("look")).toEqual({ x: 4, y: 0 })
    })

    it("a misspelled name throws and lists the names that are bound", () => {
        const reader = createReader().mouseButton("fire", "left").keyAxis2D("move", {
            up: "W", down: "S", left: "A", right: "D",
        }).build()
        expect(() => reader.down("fier")).toThrow(/no binding named "fier".*fire, move/)
    })

    it("binding the same name twice throws at build time", () => {
        expect(() => createReader().key("jump", "Space").keyPressed("jump", "Space")).toThrow(/"jump" is already bound/)
    })

    it("vec2() returns the same object every frame", () => {
        const reader = createReader().mouseVec2("look", "delta").build()
        const first = reader.vec2("look")
        fake.mouse.dx = 2
        reader.tick()
        expect(reader.vec2("look")).toBe(first)
        expect(first.x).toBe(2)
    })

    it("a read after dispose says the reader was disposed", () => {
        const reader = createReader().key("jump", "Space").build()
        reader.dispose()
        expect(() => reader.down("jump")).toThrow(/disposed/)
    })
})
