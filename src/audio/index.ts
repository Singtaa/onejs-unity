/**
 * Sound that works on every platform OneJS runs on.
 *
 *     import { audio } from "onejs-unity/audio"
 *
 *     const blip = await audio.load("assets/blip.wav")
 *     blip.play({ volume: 0.7 })
 *
 *     const music = await audio.load("assets/theme.ogg")
 *     const voice = music.loop({ volume: 0.4 })
 *     voice.stop()
 *
 * WHY NOT WEBAUDIO
 *
 * WebAudio exists only in a browser, so a game built on it can never leave the
 * web. This runs on Unity's AudioSource underneath, which is the same on WebGL
 * and on QuickJS, so a game that makes noise here makes noise everywhere.
 *
 * COST
 *
 * Loading crosses once and hands back a handle. Playing is one call with
 * primitives and no allocation. Nothing calls into JavaScript while a sound is
 * playing, so the cost is per sound started, not per frame.
 */

declare const CS: any

/** A sound that has finished loading. */
export interface Sound {
    /** Handle the bridge knows this clip by. */
    readonly handle: number
    /** Length in seconds. */
    readonly length: number
    /** Plays once. Returns a handle for the playing sound. */
    play(options?: PlayOptions): Voice
    /** Plays until stopped. For music and ambience. */
    loop(options?: PlayOptions): Voice
    /** Frees the clip. Anything still playing it stops. */
    unload(): void
}

export interface PlayOptions {
    /** 0 to 1. Defaults to 1. */
    volume?: number
    /** Playback rate; 2 is an octave up. Defaults to 1. */
    pitch?: number
}

/** One playing sound. Safe to keep: it will not act on a later, unrelated one. */
export interface Voice {
    readonly id: number
    readonly playing: boolean
    stop(): void
    pause(): void
    resume(): void
    setVolume(volume: number): void
    setPitch(pitch: number): void
}

function bridge(): any {
    const found = CS?.OneJS?.Audio?.AudioBridge
    if (found === undefined || found === null) {
        throw new Error(
            "[oj] audio is unavailable: OneJS.Audio.AudioBridge was not found. " +
            "In a stripped build this usually means UnityEngine.AudioModule was not preserved in link.xml.",
        )
    }
    return found
}

function makeVoice(id: number): Voice {
    return {
        id,
        get playing() {
            // Asked rather than remembered: a one-shot ends on its own, and a
            // voice can be taken over when every slot is busy.
            return id !== 0 && bridge().IsPlaying(id) === true
        },
        stop() { if (id !== 0) bridge().Stop(id) },
        pause() { if (id !== 0) bridge().PauseVoice(id, true) },
        resume() { if (id !== 0) bridge().PauseVoice(id, false) },
        setVolume(volume: number) { if (id !== 0) bridge().SetVoiceVolume(id, clamp01(volume)) },
        setPitch(pitch: number) { if (id !== 0) bridge().SetVoicePitch(id, pitch) },
    }
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

function makeSound(handle: number): Sound {
    let unloaded = false
    const start = (looping: boolean, options?: PlayOptions): Voice => {
        if (unloaded) return makeVoice(0)
        const volume = clamp01(options?.volume ?? 1)
        const pitch = options?.pitch ?? 1
        const api = bridge()
        return makeVoice(looping ? api.PlayLooping(handle, volume, pitch) : api.Play(handle, volume, pitch))
    }
    return {
        handle,
        get length() { return unloaded ? 0 : bridge().GetClipLength(handle) },
        play: (options) => start(false, options),
        loop: (options) => start(true, options),
        unload() {
            if (unloaded) return
            unloaded = true
            bridge().UnloadClip(handle)
        },
    }
}

export const audio = {
    /**
     * Loads a sound.
     *
     * The URL is fetched the same way anywhere: on WebGL from the game's own
     * origin, elsewhere from the file system or the network. Format is inferred
     * from the extension, which matters on WebGL where the browser has to be
     * told what it is decoding. Prefer .ogg, which every platform supports.
     */
    async load(url: string): Promise<Sound> {
        if (typeof url !== "string" || url === "") throw new Error("[oj] audio.load needs a url")
        return makeSound(await bridge().LoadClip(url))
    },

    /** Stops everything, one call rather than one per voice. */
    stopAll(): void { bridge().StopAll() },

    /** 0 to 1, across every sound. */
    setMasterVolume(volume: number): void { bridge().SetMasterVolume(clamp01(volume)) },
    getMasterVolume(): number { return bridge().GetMasterVolume() },

    /** Silences everything without losing where each sound was. */
    setPaused(paused: boolean): void { bridge().SetPaused(paused === true) },

    /** How many sounds can play at once, and how many are. */
    get voices(): number { return bridge().GetVoiceCount() },
    get activeVoices(): number { return bridge().GetActiveVoiceCount() },
}
