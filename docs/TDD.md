# NVTS-PhotoMania — Technical Design Document (TDD)

## Status and scope

This document describes the current repository implementation. It is not a promise that every planned feature is already implemented. The code is a browser-first prototype with a TypeScript application/document model, a C++ engine compiled to WebAssembly, a WebGPU renderer with WebGL2 fallback, and browser-backed file/storage APIs.

## Technical principles

- **TypeScript owns document structure and metadata.** The `DocumentController` manages `LayerNode` instances, grouping, layer properties, structure snapshots, and document-level orchestration.
- **C++/WebAssembly owns sparse pixel tile surfaces and the main raster compositor.** The UI writes edits through bindings instead of treating JSON as pixel storage.
- **The engine is tile-oriented.** Tiles are 256×256 pixels in RGBA8 format. Mutations mark tiles dirty; the compositor recomposes changed tiles and the renderer uploads affected regions.
- **Rendering is backend-agnostic at the UI boundary.** `RendererBackend` is implemented by WebGPU and WebGL2 renderers. WebGPU is attempted first; WebGL2 is used as a fallback where setup allows.
- **Some features have UI-level rendering paths.** When a document contains filter layers, `App.ts` composes those effects by tile using Canvas 2D and uploads the resulting regions; otherwise it uses the Wasm compositor refresh path.
- **Panel modules do not own independent engines.** Each panel module defines/renderers its UI and forwards document mutations through callbacks to the `App` coordinator.

## Monorepo packages

| Package | Responsibility | Principal code |
|---|---|---|
| `packages/engine` | C++ tile store, layer tree/compositor, blend modes, pixel history | `tiled_layer.{h,cpp}`, `compositor.{h,cpp}`, `history.{h,cpp}`, `blend.h`, `engine.cpp` |
| `packages/wasm-bindings` | Emscripten/Embind exports, typed API wrappers, engine memory and dirty-tile helpers | `index.ts`, `ts-wrapper/EngineSession.ts`, `DirtyTiles.ts`, `SafeMemory.ts`, `BlendMode.ts` |
| `packages/renderer` | Rendering contract and WebGPU/WebGL2 implementations | `RendererBackend.ts`, `createRenderer.ts`, `webgpu/`, `webgl2/` |
| `packages/shared` | Shared document-format constants and types | `nvtsphoto.ts` |
| `packages/document-model` | Layer/document tree, pixel bridge, structural actions, integrated undo/redo | `DocumentController.ts`, `EditSession.ts`, `types.ts` |
| `packages/storage` | `.nvtsphoto` serialization, file open/save, recent projects, linked-image handles | `NvtsPhotoIO.ts`, `RecentProjects.ts` |
| `packages/ui` | Application coordinator, toolbar, modular panels, preferences and plugins | `App.ts`, `Toolbar.ts`, `panels/*.ts` |
| `apps/web` | Vite entry point, index HTML, global styles, public assets/Wasm runtime | `src/main.ts`, `src/styles.css`, `vite.config.ts` |

## Runtime data model

### Document

`DocumentState` stores `id`, `name`, `width`, `height`, and an ordered root `layers` array. `LayerNode` adds a runtime engine ID, tree children, and metadata specific to the layer type. Child arrays are ordered from bottom to top; the Layers panel visually reverses the sequence so the topmost layer is displayed first.

### Layer types

`packages/shared/src/nvtsphoto.ts` declares the following layer types:

- `paint` (and legacy `raster` on load): editable pixel layer.
- `fill`: solid-color pixel surface plus `fillColor` metadata.
- `file`: image layer whose pixel data is embedded in the native project, with optional file-link metadata (`sourceLinkId`, source name, last-modified timestamp, and file size).
- `filter`: non-destructive effect node with `filterKind` and `filterStrength`.
- `vector`: editable `vectorShapes` metadata and a rasterized preview for the current compositor.
- `text`: editable text/font/position/style metadata and a rasterized preview.
- `group`: child layer nodes with group opacity/blend settings.

Supported layer blend-mode identifiers are `normal`, `multiply`, `screen`, and `overlay`. Filter kinds currently defined by the app are grayscale, invert, sepia, blur, brightness, and contrast.

### Text and vector representation

Vector objects use a typed shape model (`VectorShape`) with coordinates and geometry attributes; Bézier points may contain incoming/outgoing control coordinates. The UI can select, move, resize and edit object fields and export a vector layer as SVG. The compositor currently consumes the vector layer's rasterized preview, not a fully vector-native scene.

Text metadata includes content, origin, font family, size, color, style, alignment, line height, letter spacing, stroke, and background settings. A rasterized RGBA preview is stored in the layer's pixel data for display/composition. Text remains editable at the model level, but exact visual appearance still depends on font availability/rendering in the browser.

## Rendering and pixel pipeline

### Tile storage

`TiledLayer` stores sparse 256×256 RGBA8 tiles. An absent tile represents transparency; a tile allocated for a layer contains a fixed-size pixel buffer. Writes mark tiles dirty. Pixel writes can notify the history manager before mutation, allowing copy-on-write snapshots of the pre-edit tile state.

### Compositor

The Wasm `Compositor` owns the runtime layer tree and output surface. It supports groups, visibility, opacity, movement/reparenting, and four blend modes. Composition proceeds bottom-to-top and tracks dirty regions. The principal blend implementation accumulates premultiplied floating-point color during composition and emits RGBA8 output.

Filter layers are represented as metadata nodes and use the `App` tile compositor path when any filter layer is present. That path applies Canvas 2D filter operations to the existing composition below each filter layer and then blends the result according to layer opacity. This is non-destructive in terms of source pixel data, but it is currently a UI-side composition path rather than a C++/GPU filter graph.

### Renderer

The app targets one canvas using the common `RendererBackend` interface:

- `WebGPURenderer`: primary backend when the browser and adapter support it.
- `WebGL2Renderer`: fallback backend.

The app uploads dirty image regions to the renderer. Resizing/recreating a renderer texture may require reuploading image content.

### Tool editing

The UI handles pointer gestures, zoom/pan coordinate conversion, tool configuration, geometric brush stamps, fill selection, eyedropper sampling, and text/vector editing interactions. Pixel changes are written to engine-backed layer surfaces through `EditSession`/document controller methods. Expensive rasterization, merged color sampling, filter operations, and full-document serialization can still use Canvas APIs or synchronous JavaScript loops.

## Undo/redo design

The Wasm `HistoryManager` observes pixel writes and captures the old contents of touched tiles once per action. Undo/redo swaps tile buffers rather than copying entire layers. Its retained tile memory is limited by a configurable cap, currently initialized by the document controller to 512 MiB unless another value is provided; older entries may be trimmed to respect that limit.

The TypeScript `DocumentController` maintains structure/property actions (create, duplicate, delete/restore, reparent/reorder, rename, layer properties, and supported text/vector content updates) alongside pixel-history actions. The controller coordinates the undo and redo stacks so the user navigates document mutations in sequence. A newly recorded action invalidates the redo branch. Opening another document initializes a fresh history.

History is not persisted inside `.nvtsphoto`; it represents the current editing session.

## Native file format: `.nvtsphoto` 0.1.0

The file is a ZIP created with `fflate` and includes:

```text
project.nvtsphoto
├─ manifest.json
└─ layers/
   └─ <layer-id>/
      └─ pixels.rgba
```

`manifest.json` includes:

- `format: "nvtsphoto"`, format `version`, and generator metadata.
- Document ID/name/dimensions and declared color space (`sRGB`) / bit depth (`8`).
- The layer hierarchy and each layer's visibility, lock state, opacity, blend mode, and type-specific metadata.
- Pixel paths for pixel-backed layers; empty pixel layers can omit pixel blobs.
- An `extensions` record reserved for future format additions.

The current serializer stores each pixel-backed layer as a full uncompressed RGBA byte array inside a deflated ZIP entry (`layers/<id>/pixels.rgba`). Despite the sparse tile representation in memory, this is not a sparse/per-tile on-disk format. A loader validates format identity, major version, dimensions, required manifest/pixel entries, and expected RGBA byte length. Older `raster` layer names are normalized to `paint` on load.

External source-file handles cannot be embedded as live operating-system handles in the project file. The manifest stores source metadata/link ID; the corresponding browser `FileSystemFileHandle` is held separately in IndexedDB, subject to browser permissions.

## Persistence and browser APIs

### Open and save

`packages/storage/src/NvtsPhotoIO.ts` packages/unpackages `.nvtsphoto` files. In supporting browsers, File System Access API file pickers are used for open/save/save-as and a `FileSystemFileHandle` can be retained for subsequent Save. Other browsers use a classic file input and a download for the native document; the classic fallback does not provide persistent direct-write handles.

Serialization and decompression are synchronous today. A 1 GiB per-entry ceiling is used as a basic protection against oversized ZIP entries; this is not a full archive-security sandbox.

### Recent projects

`packages/storage/src/RecentProjects.ts` stores project snapshots and metadata in IndexedDB. The Preferences option is opt-in; disabling it clears the recent-project store. Removing one recent entry removes the browser-held snapshot/metadata, not the original file on disk. Recent-project snapshots are browser-local and should not be treated as a substitute for saving a native file.

### Linked image layers

The source image's pixels are embedded in the document so the layer remains usable even when the original file is unavailable. When File System Access API supports it, the app stores file handles under IndexedDB, keyed by a link ID, and records source metadata so it can offer a manual refresh/relink interaction. File handles may require permission renewal and are not portable across browsers/devices. No continuous file watcher is implemented.

### Comic Manager

Comic configuration uses `format: "nvts-comic-config"`, `version: 1`, and the fixed filename `comicConfig.json`. Its persisted properties include project/folder names, title/author, reading direction, page dimensions, DPI, bleed, safe margin, gutter, facing-page setting and the ordered page list.

When folder access is supported, a chosen base directory contains a project folder with `comicConfig.json`, `páginas/`, and `exportación/`. Each comic page is a separate `.nvtsphoto` document in the pages directory. Exporting a project copy copies the JSON config and already-saved page documents into `exportación/` and `exportación/páginas/`; this workflow does not produce final PDF/CBZ/rendered output.

Without directory access, the configuration can still be stored in browser local storage and imported/exported as JSON, but the manager cannot create real directories or default file destinations.

### Preferences and workspace state

Theme, recent-project opt-in, workspace selection, plugin source code, comic config fallback, and file handles are stored in browser storage (local storage and/or IndexedDB, depending on the data). These settings are local to a browser profile unless the user exports a config file or native project.

## Panel and plugin architecture

Each substantial panel has its own TypeScript file in `packages/ui/src/panels/`:

- `LayersPanel.ts`
- `HistoryPanel.ts`
- `AdvancedToolOptionsPanel.ts`
- `ComicManagerPanel.ts`
- `FilterPanel.ts`
- `LayerEffectsPanel.ts`
- `VectorEditorPanel.ts`
- `PluginsPanel.ts`
- `PreferencesPanel.ts`

`App.ts` owns document/motor instances, event wiring, canvas gestures, command callbacks, workspace layout, keyboard shortcuts and interactions with browser storage. Global styling and theme tokens remain in `apps/web/src/styles.css`.

### Plugin loading

Plugins are JavaScript ES modules selected by the user as `.js`/`.mjs` files. Their source is persisted in local storage and re-imported on startup through a blob URL. The first loader does not support relative imports and exposes the preliminary `PluginApi` defined in `PluginsPanel.ts`.

Available API operations: identity (`appName`, `version`), `registerMenuAction`, `notify`, `getDocumentInfo`, `getLayers`, `createLayer`, `renameLayer`, and `setLayerProperties`. A plugin can mutate the current document indirectly through these operations; support for history is determined by the underlying app operation. There is no sandbox or permission/capability isolation, so installed plugins execute with the page's available JavaScript privileges. The API is not guaranteed stable across versions.

## Build and development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm build
```

Rebuilding the C++/Wasm engine requires an activated Emscripten toolchain:

```bash
pnpm build:wasm
```

The web app uses Vite, monorepo aliases and COOP/COEP dev-server headers. The browser must load the appropriate generated Wasm JavaScript/binary assets for the engine to initialize.

## Technical constraints and next steps

### Current constraints

- The app/engine are not moved to a Worker; pointer work, filter paths and native ZIP processing can block the main thread.
- Pixel format is sRGB RGBA8 only; no ICC-managed or 16/32-bit color pipeline is present.
- The on-disk layer format is full-layer RGBA per entry; per-tile persistence is not implemented.
- The compositor and filters are not a full GPU render graph. Filter layers use Canvas 2D composition when present.
- Text and vector compositor images are raster previews, even though their metadata is editable. The vector editor lacks several features of a dedicated vector illustration app.
- Comic Manager organizes individual native page files but does not support a native multipage canvas or PDF/CBZ output.
- Plugins are not sandboxed and API versioning/permissions are not yet formalized.
- Recent projects, plugin records, comic fallback configuration, and file handles are local to a browser profile.

### Suggested technical roadmap

1. Add automated unit/integration tests for document round-trips, layer operations, pixel/structural history ordering, tool interactions, Comic Manager persistence, and plugin lifecycle.
2. Move expensive serialization/compositing/filter jobs to Workers where platform APIs allow it; evaluate `OffscreenCanvas` support.
3. Add migration tests and formally version manifest schemas, layer type metadata, and plugin API.
4. Introduce sparse/per-tile disk storage to avoid full-document full-layer serialization costs.
5. Improve vector source/render separation and direct Bézier node/handle editing.
6. Build reliable comic output pipelines (PDF/CBZ and image sequences) separately from the native per-page document format.
7. Profile the renderer, texture memory, and history retention on large documents before adopting advanced atlases or compute-shader paths.
