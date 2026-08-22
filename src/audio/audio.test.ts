import { describe, it, expect, beforeEach, vi } from "vitest"
import { audio } from "./index"

/** A stand-in for AudioBridge that records what crossed. */
function fakeBridge() {
    const calls: Array<[string, ...unknown[]]> = []
    let nextVoice = 100
    const playing = new Set<number>()
    const api = {
        calls,
        LoadClip: vi.fn(async (url: string) => { calls.push(["LoadClip", url]); return 7 }),
        GetClipLength: vi.fn((h: number) => { calls.push(["GetClipLength", h]); return 1.25 }),
        UnloadClip: vi.fn((h: number) => { calls.push(["UnloadClip", h]) }),
        Play: vi.fn((h: number, v: number, p: number) => {
            calls.push(["Play", h, v, p]); const id = nextVoice++; playing.add(id); return id
        }),
        PlayLooping: vi.fn((h: number, v: number, p: number) => {
            calls.push(["PlayLooping", h, v, p]); const id = nextVoice++; playing.add(id); return id
        }),
        Stop: vi.fn((id: number) => { calls.push(["Stop", id]); playing.delete(id) }),
        StopAll: vi.fn(() => { calls.push(["StopAll"]); playing.clear() }),
        IsPlaying: vi.fn((id: number) => playing.has(id)),
        PauseVoice: vi.fn((id: number, p: boolean) => { calls.push(["PauseVoice", id, p]) }),
        SetVoiceVolume: vi.fn((id: number, v: number) => { calls.push(["SetVoiceVolume", id, v]) }),
        SetVoicePitch: vi.fn((id: number, p: number) => { calls.push(["SetVoicePitch", id, p]) }),
        SetMasterVolume: vi.fn((v: number) => { calls.push(["SetMasterVolume", v]) }),
        GetMasterVolume: vi.fn(() => 1),
        SetPaused: vi.fn((p: boolean) => { calls.push(["SetPaused", p]) }),
        GetVoiceCount: vi.fn(() => 24),
        GetActiveVoiceCount: vi.fn(() => playing.size),
    }
    ;(globalThis as any).CS = { OneJS: { Audio: { AudioBridge: api } } }
    return api
}

let api: ReturnType<typeof fakeBridge>
beforeEach(() => { api = fakeBridge() })

describe("audio.load", () => {
    it("returns a sound carrying the bridge handle", async () => {
        const s = await audio.load("blip.wav")
        expect(s.handle).toBe(7)
        expect(api.LoadClip).toHaveBeenCalledWith("blip.wav")
    })

    it("refuses an empty url rather than asking the bridge", async () => {
        await expect(audio.load("")).rejects.toThrow(/url/)
        await expect(audio.load(undefined as never)).rejects.toThrow(/url/)
        expect(api.LoadClip).not.toHaveBeenCalled()
    })

    it("says something useful when the bridge is missing", async () => {
        ;(globalThis as any).CS = {}
        await expect(audio.load("x.wav")).rejects.toThrow(/AudioBridge|link\.xml/)
    })
})

describe("playing", () => {
    it("plays once with defaults, in a single crossing", async () => {
        const s = await audio.load("blip.wav")
        api.calls.length = 0
        s.play()
        expect(api.calls).toEqual([["Play", 7, 1, 1]])
    })

    it("passes volume and pitch through", async () => {
        const s = await audio.load("blip.wav")
        api.calls.length = 0
        s.play({ volume: 0.5, pitch: 1.5 })
        expect(api.calls).toEqual([["Play", 7, 0.5, 1.5]])
    })

    it("clamps volume, so a bad number cannot be louder than everything else", async () => {
        const s = await audio.load("blip.wav")
        s.play({ volume: 9 })
        s.play({ volume: -3 })
        expect(api.Play).toHaveBeenNthCalledWith(1, 7, 1, 1)
        expect(api.Play).toHaveBeenNthCalledWith(2, 7, 0, 1)
    })

    it("loops through a different call, so music is never voice-stolen", async () => {
        const s = await audio.load("theme.ogg")
        s.loop({ volume: 0.4 })
        expect(api.PlayLooping).toHaveBeenCalledWith(7, 0.4, 1)
        expect(api.Play).not.toHaveBeenCalled()
    })

    it("reports whether a voice is still playing by asking, not remembering", async () => {
        const s = await audio.load("blip.wav")
        const v = s.play()
        expect(v.playing).toBe(true)
        v.stop()
        expect(v.playing).toBe(false)
    })

    it("gives each play its own voice", async () => {
        const s = await audio.load("blip.wav")
        expect(s.play().id).not.toBe(s.play().id)
    })
})

describe("unload", () => {
    it("frees the clip once, however many times it is called", async () => {
        const s = await audio.load("blip.wav")
        s.unload()
        s.unload()
        expect(api.UnloadClip).toHaveBeenCalledTimes(1)
    })

    it("stops playing an unloaded sound instead of using a dead handle", async () => {
        const s = await audio.load("blip.wav")
        s.unload()
        api.calls.length = 0
        const v = s.play()
        expect(v.id).toBe(0)
        expect(api.Play).not.toHaveBeenCalled()
        // A dead voice must be inert, not throw, so teardown paths stay simple.
        expect(() => { v.stop(); v.pause(); v.setVolume(0.5) }).not.toThrow()
        expect(api.calls).toEqual([])
    })
})

describe("global controls", () => {
    it("stops everything in one call", () => {
        audio.stopAll()
        expect(api.StopAll).toHaveBeenCalledTimes(1)
    })

    it("clamps master volume", () => {
        audio.setMasterVolume(5)
        expect(api.SetMasterVolume).toHaveBeenCalledWith(1)
    })

    it("reports the voice budget", () => {
        expect(audio.voices).toBe(24)
    })
})
