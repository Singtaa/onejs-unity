/**
 * Asset loading utilities for OneJS
 *
 * Provides cross-platform access to assets in StreamingAssets/onejs/
 * copied by the copyAssetsPlugin.
 *
 * Usage:
 *   import { getAssetPath, loadText, loadJson, loadTexture } from "onejs-unity"
 *
 *   // Get platform-appropriate path/URL
 *   const url = getAssetPath("my-package/images/logo.png")
 *
 *   // Load text/JSON
 *   const data = await loadJson("my-package/config.json")
 *
 *   // Load texture
 *   const texture = await loadTexture("my-package/images/sprite.png")
 */

declare const CS: any

// Base path for copied npm package assets
const ASSETS_SUBDIR = "onejs"

/**
 * Get the full path/URL to an asset in StreamingAssets/onejs/
 *
 * @param assetPath - Relative path from onejs/ (e.g., "my-package/images/logo.png")
 * @returns Full path suitable for the current platform
 */
export function getAssetPath(assetPath: string): string {
    const basePath = CS.UnityEngine.Application.streamingAssetsPath
    return `${basePath}/${ASSETS_SUBDIR}/${assetPath}`
}

/**
 * Check if running on WebGL platform
 */
export function isWebGL(): boolean {
    return CS.UnityEngine.Application.platform === CS.UnityEngine.RuntimePlatform.WebGLPlayer
}

/**
 * Check if running on Android (requires special async loading)
 */
export function isAndroid(): boolean {
    return CS.UnityEngine.Application.platform === CS.UnityEngine.RuntimePlatform.Android
}

/**
 * Load a text file from StreamingAssets
 *
 * @param assetPath - Relative path from onejs/
 * @returns Promise resolving to file contents as string
 */
export async function loadText(assetPath: string): Promise<string> {
    const fullPath = getAssetPath(assetPath)

    // WebGL and Android: Use UnityWebRequest
    if (isWebGL() || isAndroid()) {
        return loadTextAsync(fullPath)
    }

    // Other platforms: Use synchronous File.ReadAllText
    const File = CS.System.IO.File
    if (File.Exists(fullPath)) {
        return File.ReadAllText(fullPath)
    }

    throw new Error(`Asset not found: ${assetPath}`)
}

/**
 * Load a JSON file from StreamingAssets
 *
 * @param assetPath - Relative path from onejs/
 * @returns Promise resolving to parsed JSON
 */
export async function loadJson<T = any>(assetPath: string): Promise<T> {
    const text = await loadText(assetPath)
    return JSON.parse(text)
}

/**
 * Load raw bytes from StreamingAssets
 *
 * @param assetPath - Relative path from onejs/
 * @returns Promise resolving to byte array
 */
export async function loadBytes(assetPath: string): Promise<Uint8Array> {
    const fullPath = getAssetPath(assetPath)

    // WebGL and Android: Use UnityWebRequest
    if (isWebGL() || isAndroid()) {
        return loadBytesAsync(fullPath)
    }

    // Other platforms: Use synchronous File.ReadAllBytes
    const File = CS.System.IO.File
    if (File.Exists(fullPath)) {
        const bytes = File.ReadAllBytes(fullPath)
        // Convert C# byte[] to Uint8Array
        const result = new Uint8Array(bytes.Length)
        for (let i = 0; i < bytes.Length; i++) {
            result[i] = bytes[i]
        }
        return result
    }

    throw new Error(`Asset not found: ${assetPath}`)
}

/**
 * Load a texture from StreamingAssets
 *
 * @param assetPath - Relative path from onejs/
 * @returns Promise resolving to Texture2D
 */
export async function loadTexture(assetPath: string): Promise<any> {
    const fullPath = getAssetPath(assetPath)
    return loadTextureAsync(fullPath)
}

// Internal async loaders using UnityWebRequest

function loadTextAsync(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const UnityWebRequest = CS.UnityEngine.Networking.UnityWebRequest
        const request = UnityWebRequest.Get(url)
        const operation = request.SendWebRequest()

        operation.completed.Add(() => {
            if (request.result === CS.UnityEngine.Networking.UnityWebRequest.Result.Success) {
                resolve(request.downloadHandler.text)
            } else {
                reject(new Error(`Failed to load ${url}: ${request.error}`))
            }
            request.Dispose()
        })
    })
}

function loadBytesAsync(url: string): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const UnityWebRequest = CS.UnityEngine.Networking.UnityWebRequest
        const request = UnityWebRequest.Get(url)
        const operation = request.SendWebRequest()

        operation.completed.Add(() => {
            if (request.result === CS.UnityEngine.Networking.UnityWebRequest.Result.Success) {
                const data = request.downloadHandler.data
                const result = new Uint8Array(data.Length)
                for (let i = 0; i < data.Length; i++) {
                    result[i] = data[i]
                }
                resolve(result)
            } else {
                reject(new Error(`Failed to load ${url}: ${request.error}`))
            }
            request.Dispose()
        })
    })
}

function loadTextureAsync(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const UnityWebRequestTexture = CS.UnityEngine.Networking.UnityWebRequestTexture
        const DownloadHandlerTexture = CS.UnityEngine.Networking.DownloadHandlerTexture
        const request = UnityWebRequestTexture.GetTexture(url)
        const operation = request.SendWebRequest()

        operation.completed.Add(() => {
            if (request.result === CS.UnityEngine.Networking.UnityWebRequest.Result.Success) {
                const texture = DownloadHandlerTexture.GetContent(request)
                resolve(texture)
            } else {
                reject(new Error(`Failed to load texture ${url}: ${request.error}`))
            }
            request.Dispose()
        })
    })
}
