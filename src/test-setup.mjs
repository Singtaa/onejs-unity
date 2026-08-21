/**
 * Installs the real filesystem for tests.
 *
 * Tests import plugin modules directly rather than through
 * src/esbuild/index.mjs, which is what installs node:fs for ordinary Node
 * consumers. See src/fs-provider.mjs.
 */
import nodeFs from "node:fs"
import { setFsProvider } from "./fs-provider.mjs"

setFsProvider(nodeFs)
