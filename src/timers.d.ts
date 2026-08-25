/**
 * Timer and frame-callback globals provided by the OneJS runtime.
 *
 * Deliberately separate from the CS shim next door. A consuming package that
 * compiles one of this package's modules directly does not pick up an ambient
 * file just because it sits in the same package, so modules depending on these
 * reference this file explicitly. Pulling in the CS shim the same way would
 * collide with the real CS namespace from unity-types, so it stays put.
 */

declare function setTimeout(callback: () => void, delay?: number): number
declare function clearTimeout(id: number): void
declare function setInterval(callback: () => void, delay?: number): number
declare function clearInterval(id: number): void
declare function requestAnimationFrame(callback: (timestamp: number) => void): number
declare function cancelAnimationFrame(id: number): void
