# NVTS-PhotoMania — Technical Design Document (TDD)

## Status and scope

This document describes the current repository implementation. It is not a promise that every planned feature is already implemented. The code is a browser-first prototype with a TypeScript application/document model, a C++ engine compiled to WebAssembly, a WebGPU renderer with WebGL2 fallback, and browser-backed file/storage APIs.

## Technical principles

- **TypeScript owns document structure and metadata.** The `DocumentController` manages `LayerNode` instances, grouping, layer properties, structure snapshots, and document-level orchestration.
- **C++/WebAssembly owns sparse pixel tile surfaces and the main raster compositor.** The UI writes edits through bindings instead of treating JSON as pixel storage.
- **The engine is tile-oriented.** Tiles are 256×256 pixels in RGBA8 format. Mutations mark tiles dirty; the compositor recomposes changed tiles and the renderer uploads affected regions.
- **Rendering is backend-agnostic at the UI boundary.** `RendererBackend` is implemented by WebGPU and WebGL2 renderers. WebGPU is attempted first; WebGL2 is used as a fallback where setup allows.
- **Some features have UI-level rendering paths.** When a document contains filter layers or supported masks, `AppDocumentFeatures.ts` composes those effects by tile using Canvas 2D. Local brush edits invalidate only affected tiles plus effect padding; layer/property changes trigger a full invalidation. The presence of non-destructive effects and filter padding are cached until a general invalidation, avoiding a full layer-tree scan for every brush dab. Filter tiles are processed across animation frames (up to eight tiles or roughly 6 ms per frame); a single expensive tile can exceed that budget, but a full-canvas invalidation no longer loops through every tile in one frame. While drawing through an enabled transform/colorization mask dependency, full filtered recomposition is deferred until the stroke ends so every dab does not restart the full-document tile queue. Otherwise it uses the Wasm compositor refresh path.
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
| `packages/templates` | UI-independent, reusable document preset definitions for NVTS programs | `src/types.ts`, individual preset modules, `src/index.ts` |
| `packages/ui` | Application entry point, startup orchestration, feature modules, toolbar, panels, workspaces, preferences and plugins; consumes `@nvts/templates` | `App.ts`, `app/*.ts`, `managers/*.ts`, `panels/*.ts`, `workspaces/*.ts` |
| `apps/web` | Vite entry point, index HTML, global styles, public assets/Wasm runtime | `src/main.ts`, `src/styles.css`, `vite.config.ts` |

## Shared template package

`@nvts/templates` is a workspace package intentionally kept separate from `@nvts/ui` so other NVTS applications can reuse document presets without importing PhotoMania's UI. The package has no runtime dependencies: its public API is TypeScript data only. `TemplateDef` defines a stable ID, title, category, default pixel dimensions, icon token, and gallery preview shape. Each preset lives in a separate module under `packages/templates/src/`; `index.ts` exports both the complete read-only `TEMPLATES` catalog and individual named definitions.

When adding a preset, create a module conforming to `TemplateDef`, export the definition from the package index, and add it to the catalog. A consuming workspace package should declare `@nvts/templates` as a `workspace:*` dependency. Vite and the root TypeScript paths are configured to resolve the package in this monorepo.

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

`TiledLayer` stores sparse 256×256 RGBA8 tiles. An absent tile represents transparency; a tile allocated for a layer contains a fixed-size pixel buffer. Writes mark tiles dirty. Pixel writes can notify the history manager before mutation, allowing snapshots of the pre-edit tile state. JS-to-C++ and C++-to-JS rectangle operations reuse a bounded scratch buffer (up to two 256×256 RGBA tiles, 512 KiB) for ordinary painting regions, while large one-off transfers use temporary memory so each layer does not retain a document-sized buffer.

### Compositor

The Wasm `Compositor` owns the runtime layer tree and output surface. It supports groups, visibility, opacity, movement/reparenting, and four blend modes. Composition proceeds bottom-to-top and tracks dirty regions. The principal blend implementation accumulates premultiplied floating-point color during composition and emits RGBA8 output.

Filter layers are represented as metadata nodes and use the `App` tile compositor path when any filter layer is present. That path applies Canvas 2D filter operations to the existing composition below each filter layer and then blends the result according to layer opacity. This is non-destructive in terms of source pixel data, but it is currently a UI-side composition path rather than a C++/GPU filter graph.

### Renderer

The app targets one canvas using the common `RendererBackend` interface:

- `WebGPURenderer`: primary backend when the browser and adapter support it.
- `WebGL2Renderer`: fallback backend.

The app uploads dirty image regions to the renderer. `WebGPURenderer` passes views backed by a regular `ArrayBuffer` directly to `writeTexture`; it copies only when a view is backed by shared memory that is not directly accepted by that API. Resizing/recreating a renderer texture may require reuploading image content.

### Tool editing

The UI handles pointer gestures, zoom/pan coordinate conversion, tool configuration, geometric brush stamps, fill selection, eyedropper sampling, and text/vector editing interactions. Pixel changes are written to engine-backed layer surfaces through `EditSession`/document controller methods. Brush/eraser dabs are queued and processed by animation-frame batches, up to 64 dabs or approximately 4 ms per frame, then yield to the browser. A single large dab can still exceed that budget. Expensive rasterization, merged color sampling, some filter operations, and full-document serialization can still use Canvas APIs or synchronous JavaScript loops; the engine has not yet been moved to a Worker.

## Undo/redo design

The Wasm `HistoryManager` observes pixel writes and captures the old contents of touched tiles once per action. Undo/redo swaps tile buffers rather than copying entire layers. The configured history budget (512 MiB by default) is shared by pixel snapshots and TypeScript structural snapshots. The native history manager includes snapshots for the active pixel action when trimming committed entries, rather than waiting until mouse release. The memory indicator includes pixel snapshots in undo/redo and snapshots held by an active action; structural metadata is estimated using UTF-8 JSON size. Oldest available actions are discarded when the combined budget is exceeded. This is a practical history bound, not a total process-memory guarantee: it excludes browser/GPU textures, working canvases, and JS/C++ allocator overhead.

The TypeScript `DocumentController` maintains structure/property actions (create, duplicate, delete/restore, reparent/reorder, rename, layer properties, and supported text/vector content updates) alongside pixel-history actions. The controller coordinates the undo and redo stacks so the user navigates document mutations in sequence. A newly recorded action invalidates the redo branch in both layers of history. Opening another document initializes a fresh history. UI history entries are synchronized to the Wasm engine's retained undo/redo counts, so discarded pixel actions are not presented as available.

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

### Compatibility policy (proposed; current format unchanged)

The current loader accepts the `nvtsphoto` format identifier, validates the major version, rejects invalid dimensions or missing/incorrect pixel payloads, and normalizes the legacy `raster` layer type to `paint`. It does not currently implement a general migration chain. Preserve this behavior while the format remains at `0.1.0`; add compatibility only with fixtures for each documented legacy case. Before a future format-version change, record the schema delta, identify whether conversion is lossless, add a version-specific migration function and fixtures, and retain the original file unless conversion succeeds. Unknown major versions should continue to fail clearly; additive fields can remain forward-compatible only when their owning reader safely ignores them. This policy documents future compatibility expectations and does not add migration code or change serialized data today.

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
- `StoryboardPanel.ts` — shot list and JSON export
- `AnimationTimelinePanel.ts` — tracks and keyframe cells
- `Panel.ts` — shared base class for panel controllers

Shared UI managers live in `packages/ui/src/managers/`, including `AppManager.ts`, `AppStartupManager.ts`, `UIManager.ts`, and `DockLayoutManager.ts`. Each workspace configuration lives in `packages/ui/src/workspaces/` and is collected by its `index.ts`.

`packages/ui/src/App.ts` is the application entry point. `AppManager` coordinates the home-screen transition, while `AppStartupManager` mounts the editor shell, initializes the renderer and Wasm engine, and handles startup errors. The editor implementation is divided into feature modules under `packages/ui/src/app/`: shared state and internal contracts (`AppBase.ts`), document/rendering (`AppDocumentFeatures.ts`), workspaces (`AppWorkspaceFeatures.ts`), comic-project workflows (`AppComicFeatures.ts`), layer-state synchronization (`AppLayerStateFeatures.ts`), layer operations (`AppLayerPanelFeatures.ts`), vector editing (`AppVectorFeatures.ts`), event wiring (`AppEventFeatures.ts`), drawing and filling (`AppDrawingFeatures.ts`), sampling (`AppSamplingFeatures.ts`), and file/history workflows (`AppFileFeatures.ts`). Pure helpers and comic file-system utilities live in `AppUtilities.ts`; the editor shell markup lives in `components/EditorTemplate.ts`. The feature classes share one editor instance through an internal inheritance chain to preserve existing state and event behavior during this incremental extraction. Global styling and theme tokens remain in `apps/web/src/styles.css`.

`DockLayoutManager.ts` turns all six right-dock panels—including Storyboard and Animation Timeline—into docking slots. It supports header-drag reordering, floating windows with move/resize controls, resizing between docked panels, and a draggable splitter for the overall side-dock width. It stores per-workspace layout state in local storage, including panel visibility, order, floating position/size, docked heights, dock width, and global panel visibility. Panel DOM nodes are moved rather than recreated so their tool and document event handlers remain attached. Each workspace's default visibility and order is defined in its own file under `packages/ui/src/workspaces/`; Storyboarding and Animation keep the animation timeline at the bottom, and Storyboarding also displays the storyboard panel.

### Plugin loading

Plugins are JavaScript ES modules selected by the user as `.js`/`.mjs` files. Their source is persisted in local storage and re-imported on startup through a blob URL. The first loader does not support relative imports and exposes the preliminary `PluginApi` defined in `PluginsPanel.ts`.

Available API operations: identity (`appName`, `version`), `registerMenuAction`, `notify`, `getDocumentInfo`, `getLayers`, `createLayer`, `renameLayer`, and `setLayerProperties`. A plugin can mutate the current document indirectly through these operations; support for history is determined by the underlying app operation. There is no sandbox or permission/capability isolation, so installed plugins execute with the page's available JavaScript privileges. The API is not guaranteed stable across versions.

## Build and development

```bash
pnpm install
pnpm dev
pnpm typecheck
pnpm test
pnpm build
```

Rebuilding the C++/Wasm engine requires an activated Emscripten toolchain:

```bash
pnpm build:wasm
```

`pnpm test` runs focused regression checks for pixel undo/redo memory bounds, structural redo invalidation, and `.nvtsphoto` round-trips and rejection paths. It requires the generated `packages/wasm-bindings/build/engine.js` and `.wasm` artifacts.

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


## Storyboarding and animation panels

`packages/ui/src/panels/StoryboardPanel.ts` implements an editable shot list, persists its data in `localStorage`, and exports it as `storyboard.json`. `packages/ui/src/panels/AnimationTimelinePanel.ts` implements tracks and keyframe cells with local persistence. Cells can be selected with a click, and keyframes can be toggled with a double-click. Shared templates live in `packages/templates/src/` as `.ts` modules; `package.json` and other configuration files keep the `.json` extension and valid JSON syntax. Playback is currently a UI preview, not an animation renderer.

## Incremental refactoring conventions

- **Aim for no more than three tasks or responsibilities per function or method whenever practical.** If a method validates data, builds objects, mutates state, wires events, and updates the UI, move those responsibilities into clearly named helpers. An orchestration method should primarily coordinate the steps.
- **Do not nest control-flow structures.** Prefer guard clauses and early returns. When a loop needs conditional or additional iteration logic, delegate the body to a helper instead of placing another `if`, loop, or `switch` inside it. Keep each helper focused and avoid changing behavior just to satisfy a stylistic rule.
- Work in bounded subtasks: identify a method, extract one responsibility, run TypeScript checks and available tests, review the diff, then continue.
- Do not split code mechanically by line count. Prioritize cohesive responsibilities, clear names, real reuse, and preservation of observable behavior.
- Do not claim the refactor is complete while large methods remain unreviewed or checks are pending. Record remaining candidates and verification limits.

### Responsibility-refactoring status

The incremental decomposition has extracted responsibilities into the following modules while retaining public APIs where applicable:

- `packages/ui/src/App.ts`: small application entry point and startup-facing adapter; `AppStartupManager.ts` coordinates editor initialization, while feature logic resides in `packages/ui/src/app/`.
- `packages/ui/src/components/Toolbar.ts` and `packages/ui/src/panels/`: toolbar creation; rendering and events for Layers, Preferences, Comic Manager, Storyboard, Animation Timeline, and Vector Editor; advanced controls split by tool type.
- `packages/ui/src/screens/HomeScreenController.ts` and `packages/ui/src/components/ShellTemplates.ts`: home screen and shell templates separated from the main application coordinator.
- `packages/document-model/src/DocumentController.ts`: layer duplication, linked-layer replacement, and deletion validation.
- `packages/document-model/src/LayerTreeQueries.ts`: tree and mask queries; these no longer live in the UI package.
- `packages/image-processing/src/`: brush stamps, colorization, tiled filter layout, and pixel filters, isolated from panel rendering.
- `packages/vector/src/`: canvas vector-shape rendering and SVG serialization, independent of editor controls.
- `packages/ui/src/managers/DockLayoutManager.ts`, `packages/ui/src/persistence/`, `packages/ui/src/components/`, and `packages/ui/src/screens/`: docking coordination, UI state persistence, reusable shell components, and full-screen controllers are separated by responsibility.
- `packages/storage/src/NvtsPhotoIO.ts` and `RecentProjects.ts`: manifest creation/restoration, file reads/writes, and recent-project tracking.
- `packages/ui/src/panels/PluginsPanel.ts`: plugin lifecycle, loading, and UI rendering split into controller methods.
- `packages/ui/src/managers/DockLayoutManager.ts`: the `createDockLayoutManager` factory creates a controller; panel slots, drag events, floating/docking, resizing, layout serialization, and restoration are distributed among focused methods.
- `packages/renderer/webgpu/WebGPURenderer.ts` and `packages/renderer/webgl2/WebGL2Renderer.ts`: resource creation, canvas sizing, `contain`-scale calculation, and render command submission are separated into methods.
- `packages/ui/src/app/AppSamplingFeatures.ts`: full-document and single-pixel sampling share helpers for raster layers, groups, and filters. `AppLayerPanelFeatures.ts` owns layer thumbnails and linked-file refresh.

The previous control-flow audit reported zero nested control-flow structures across the source files it reviewed. This repository reorganization moves several modules into clearer package boundaries; it does not constitute a new full control-flow audit. The audit excludes generated `dist/` and `build/` outputs, installed dependencies, and repository metadata. This does not mean every method already meets the responsibility limit: the refactor remains incremental, and some shape-drawing paths, event handlers, and renderer/document operations still need behavior-driven review. Before splitting methods that coordinate shared state, verify that extracted functions preserve event order, history, persistence, and rendering.
