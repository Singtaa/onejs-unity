# sl: the shader language, re-exported

The shader language is its own package, [`onejs-sl`](https://github.com/Singtaa/onejs-sl),
checked out beside this one at `JSModules/onejs-sl`. Its README is the design:
the IR, the hash, versions, the VM and every emitter. It has no Unity in it,
so Magerie runs the same compiler.

This folder keeps OneJS's two import paths working, and the one piece that is
OneJS's own:

| File | What it is |
|---|---|
| `index.ts` | `onejs-unity/sl`, what a game imports. Built on `onejs-sl/core` and the backend entries, never on the parser |
| `compiler.ts` | `onejs-unity/sl/compiler`, what a build imports: the esbuild loader and the Play worker. Parser included |
| `manifest.ts` | `app.sl.json` for `SLShaderGenerator` in the Unity editor |
| `shapes.test.ts` | Pins `onejs-sl`'s shape table to `fx`'s, since both index `SDF2D.cginc` |

Both barrels name every export rather than `export *`, so each one's surface is
exactly what it was before the move, and a name `onejs-sl` adds does not appear
here until somebody decides it should.

`onejs-sl` is a peer dependency (`^0.1.0`), installed with this package by npm,
and a `file:../onejs-sl` dev dependency here, so the container always builds
against the checkout beside it. Run `npm install` here after pulling a change
to that link.
