/**
 * Keyboard input implementation
 */

import type { Keyboard } from "./types"

// Get InputBridge lazily to avoid issues during module load
function getInputBridge() {
    return (CS as any).OneJS.Input.InputBridge
}

/**
 * Keyboard implementation that wraps the C# InputBridge
 */
class KeyboardImpl implements Keyboard {
    isKeyDown(key: string): boolean {
        return getInputBridge().GetKeyDown(key)
    }

    wasKeyPressed(key: string): boolean {
        return getInputBridge().GetKeyPressed(key)
    }

    wasKeyReleased(key: string): boolean {
        return getInputBridge().GetKeyReleased(key)
    }

    get shift(): boolean {
        return (getInputBridge().GetModifiers() & 1) !== 0
    }

    get ctrl(): boolean {
        return (getInputBridge().GetModifiers() & 2) !== 0
    }

    get alt(): boolean {
        return (getInputBridge().GetModifiers() & 4) !== 0
    }

    get meta(): boolean {
        return (getInputBridge().GetModifiers() & 8) !== 0
    }

    get anyKeyDown(): boolean {
        return getInputBridge().GetAnyKeyDown()
    }

    get anyKeyPressed(): boolean {
        return getInputBridge().GetAnyKeyPressed()
    }
}

// Singleton keyboard instance
export const keyboard: Keyboard = new KeyboardImpl()
