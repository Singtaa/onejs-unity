/**
 * Global declarations for OneJS runtime environment
 */

// Timer functions provided by OneJS runtime
declare function setTimeout(callback: () => void, delay?: number): number
declare function clearTimeout(id: number): void
declare function setInterval(callback: () => void, delay?: number): number
declare function clearInterval(id: number): void
declare function requestAnimationFrame(callback: (timestamp: number) => void): number
declare function cancelAnimationFrame(id: number): void

// C# interop via bootstrap
declare const CS: {
    [namespace: string]: {
        [type: string]: unknown
    }
}
