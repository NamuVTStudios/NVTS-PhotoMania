# NVTS Photomania — Technical Design Document (TDD)

## Principles
- **TypeScript owns the structure; C++ owns the pixels.** Pixels never travel through JSON and are never copied unnecessarily.
- **Everything is tile-based (256×256 RGBA8).** Only what changed is recomposed and uploaded to the GPU.
- **The GPU belongs to TypeScript** (WebGPU primary, WebGL2 fallback, same `RendererBackend` interface).

## Modules
| Package | Role |
|---|---|
| `engine` (C++) | `TiledLayer` (sparse tiles + dirty tracking), `Compositor` (tree + blend modes), `HistoryManager` (tile-based undo/redo) |
| `wasm-bindings` | Wasm loading, embind types, zero-copy reading of dirty tiles |
| `renderer` | WebGPU / WebGL2, region-based uploads (`writeRegion`) |
| `document-model` | `DocumentController` (TS layer tree ↔ engine), `EditSession` (undoable actions) |
| `storage` | `.nvtsphoto` (ZIP + manifest) using the File System Access API |
| `ui` | App, layers panel, Toolbar |

## Key decisions
- **Alpha:** tiles are stored as *non-premultiplied* RGBA8; the compositor accumulates in *premultiplied* float and quantizes only once at the end. The shader outputs premultiplied.
- **Compositing:** bottom to top; isolated groups (max. 16 levels). Modes: Normal, Multiply, Screen, Overlay.
- **Undo:** copy-on-write of the touched tiles + pointer swapping on undo/redo (no pixel copies). Configurable memory cap. Covers pixels only.
- **Render flow:** edit → dirty tiles → `composite()` → `output()` → `flushDirtyTiles()` → GPU texture.
- **Isolation:** COOP/COEP enabled in Vite so `SharedArrayBuffer` can be used later.

## `.nvtsphoto` format 0.1.0
ZIP containing `manifest.json` + `layers/<id>/pixels.rgba` (deflate level 1, one blob per layer; empty layers are omitted). A different major version ⇒ the file is rejected. Per-tile storage will arrive in 1.x.

## Known limitations
- Engine and UI run on the main thread (no Worker).
- Layer structure (add/delete/move/properties) is not undoable; deleting a layer clears the history.
- GPU texture is the size of the canvas (no sparse atlas).
- Scalar CPU compositing (no SIMD or compute shaders).
- Saving/loading is synchronous and works on the full canvas per layer.

## Next technical steps
1. Engine in a Worker + `OffscreenCanvas`. 2. Per-tile saving (1.x). 3. Sparse GPU atlas. 4. Compositor on compute shaders / SIMD. 5. Structure undo. 6. `trimEmptyTiles`.
