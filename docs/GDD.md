# NVTS-PhotoMania — Game/Product Design Document (GDD)

## Product vision

NVTS-PhotoMania is a browser-based image editor from NamuVT Studios. Its goal is to provide an integrated workspace for pixel painting, image manipulation, simple vector work, text, layered documents, and comic-page organization while remaining part of the larger NVTS creative-tool ecosystem.

The current repository is an active prototype. This document distinguishes implemented behavior from longer-term goals so that planned capabilities are not mistaken for completed features.

## Intended users and workflows

- **Digital illustrators:** paint, erase, sample colors, fill regions, and organize artwork into layers and groups.
- **Image editors:** import raster images as layers, apply filters, adjust opacity/blend mode, and save native editable projects.
- **Vector-oriented artists:** manage vector objects, edit basic shape data and export a vector layer to SVG.
- **Letterers and designers:** add editable text layers with typography controls.
- **Comic creators:** set up a comic project, define reading direction and page dimensions, organize pages, and keep separate `.nvtsphoto` files inside a project folder.
- **Community developers:** extend the current prototype with JavaScript plugins using the preliminary plugin API.

## Implemented product scope

### Document templates

The new-project selector currently offers 23 presets for social media content, screen/video sizes, A4 print, US and European comics, manga/manhwa, animation, and UV/2D textures. Their definitions live in the shared `@nvts/templates` package rather than inside the UI, allowing future NVTS programs to reuse the same presets. The current presets define default canvas dimensions and selector metadata; they do not yet encode complete print profiles, animation timelines, UV layouts, or application-specific setup procedures.

### Document and layers

- Create, open, save, and save-as native `.nvtsphoto` documents.
- Optional recent-project snapshots in browser storage, controlled by Preferences.
- Hierarchical layer tree with paint, filter, fill, file/image, vector, text, and group layer types.
- Layer operations include create, duplicate, delete, rename, reorder/reparent, visibility, locking, opacity, blend mode, and thumbnails.
- Undo/redo combines pixel-history entries from the Wasm engine with structural/property actions from the TypeScript document controller.

### Canvas tools

- Brush and eraser, with size and opacity; brush options also include hardness, spacing, and smoothing.
- Eyedropper, including an option to sample the merged visible result.
- Line, rectangle, and ellipse drawing on pixel layers.
- Clone Stamp for copying pixels from an Alt-clicked source point into a paint layer.
- Comic frame/panel tool that creates a full-page frame or draggable rectangular panels on vector layers.
- Bucket fill with tolerance, contiguous/non-contiguous behavior, opacity, and optional merged sampling. Large-image safety limits are enforced by the current implementation.
- Text tool creates an individual text layer. Main controls include font family, style, size, and color. Advanced controls include alignment, line height, letter spacing, stroke, and background.
- Vector selection supports selecting, moving, and resizing vector objects. A separate editor exposes object properties and supports SVG export.
- Hand/pan, zoom controls, Ctrl/Meta + wheel zoom, and Space + drag for panning.

### Effects and rendering

- Layer blend modes: Normal, Multiply, Screen, and Overlay.
- Filter layer kinds: grayscale, invert, sepia, blur, brightness, and contrast. These are presented as non-destructive filter layers in the UI rendering path.
- WebGPU is preferred when available; WebGL2 is the fallback renderer.
- The C++/WebAssembly engine stores sparse RGBA8 tiles and composites dirty regions.

### User interface

- Workspaces: General, Digital Illustration, Vector Illustration, Image Manipulation, Comics, Storyboarding, and Animation.
- Light and dark themes; a Preferences setting controls whether recent-project data is kept.
- Modular panels include Layers, History, Advanced Tool Options, Comic Manager, and supporting filter, vector, layer-effects, plugin, and preferences UI.
- `View → Panels` controls panel visibility. `Tab` toggles the whole panel zone while avoiding normal text-field and menu interaction.
- Panel headers can be dragged to reorder docked panels or pulled out into floating windows; each panel can be re-docked with its header control. Drag dividers to resize individual panel heights and the overall right-side panel zone. Layouts are persisted independently per workspace.
- Main file operations are available from the File menu with keyboard shortcuts.

### Comic Manager

- Project name and base directory selection; creation/linking of a project directory where supported by the browser.
- Standard project contents: `comicConfig.json`, `páginas/`, and `exportación/`.
- Comic presets: US, European/A4, Manga, and Manhwa/Webtoon.
- Configurable title, author, reading direction, page dimensions, DPI, bleed, safe margin, gutter, and facing-page setting.
- Add, duplicate, rename, reorder, and remove page entries.
- Each page is an individual `.nvtsphoto` file; the manager can create a page canvas or copy an existing native project into the page directory.
- Import/export `comicConfig.json` and export an organized copy of the configuration plus already-saved pages.

### Plugins

- Install and manage `.js`/`.mjs` ES modules from `View → Plugins`.
- Plugins can register menu actions, show status messages, inspect document/layer metadata, create certain layer types, rename layers, and set supported properties.
- Plugin API remains preliminary (`0.1.0`) and is not sandboxed.

## Design principles

1. **Browser-first workflow:** use a browser runtime and browser APIs instead of requiring a native application install.
2. **Native editable document:** preserve layer hierarchy and layer-specific metadata alongside pixel data.
3. **Composable workspaces:** expose contextual controls and let users configure the arrangement of panels.
4. **History as a core behavior:** user-visible document mutations should participate in undo/redo where the operation can be represented safely.
5. **Accurate feature claims:** a vector or text layer may preserve editable metadata while its current compositor representation is rasterized; this should not be described as full vector-native rendering.
6. **Open ecosystem:** allow community plugins, while warning that the first plugin loader executes code without a sandbox.

## Current non-functional expectations

- Documents use sRGB, 8-bit/channel RGBA.
- Pixel storage uses sparse 256×256 tiles in the Wasm engine.
- Basic drawing and common layer operations should remain usable in normal-sized images, but performance work is still required for large documents.
- Project-file compatibility is currently managed through the `.nvtsphoto` format version declared in the manifest.
- File and directory access depends on browser capability and user-granted permissions.

## Known product limitations

- UI, document management, drawing orchestration, filters, and synchronous ZIP file processing can run on the main thread and may block during large operations.
- The current vector editor is not a complete vector illustration environment: direct advanced Bézier-handle editing, boolean path operations, rich multi-selection, and many specialized vector tools remain future work.
- Text retains editable metadata, but its visible compositor representation is a raster preview; font availability depends on the browser/system.
- Linked images are embedded for portability. A saved file handle may enable explicit refresh, but the app does not continuously monitor the source file, and handles are browser/profile-specific.
- Comic Manager is a project/page organizer, not a multipage document engine. It does not currently create PDF/CBZ packages or final print/digital exports.
- Plugins are not isolated in a security sandbox and the API is not yet stable.
- There is no cloud sync, collaboration, AI gateway, paid-plan/credits system, RAW workflow, PSD support, or color-managed 16/32-bit pipeline in this prototype.

## Suggested roadmap

| Priority | Milestone | Scope / exit criteria |
|---|---|---|
| 1 | Stability and regression tests | Verify new/open/save, layer structure history, tool gestures, recent-project opt-in, themes, and comic folder workflows in supported browsers. |
| 2 | Document lifecycle | Dirty-state tracking, reliable autosave/recovery, schema validation and migration tests for `.nvtsphoto`, and large-file handling off the main thread. |
| 3 | Drawing workflow | Improve selection/transforms, brush presets, better pressure/device support where available, and predictable stroke/fill behavior on large canvases. |
| 4 | Vector editing | Direct on-canvas node and Bézier handle editing, multi-selection, alignment/distribution, boolean operations, and a clear split between vector source and preview cache. |
| 5 | Text/typography | Improve text editing UX, bounds/transform interaction, text layout controls, and consistency of rendering across platforms. |
| 6 | Comic output | Page previews, panel/page templates, export to PDF/CBZ and image sequences, and output checks for bleed/DPI. |
| 7 | Performance | Move expensive jobs to Workers where possible, profile memory/history, and optimize renderer uploads and filter operations. |
| 8 | Ecosystem | Versioned plugin API with permissions/capability model; only later consider cloud, collaboration, AI, accounts, and plans. |

## Acceptance checklist for current workflows

- Creating a document, drawing on a paint layer, saving, closing, and reopening restores its dimensions, layer properties, and pixel content.
- Creating, duplicating, moving, renaming, deleting, and restoring a layer preserves the expected document state under undo/redo.
- The tool bar and Advanced Tool Options show the controls for the selected tool.
- Text and vector layers retain their metadata when saved and reopened.
- Recent projects are only retained when the preference is enabled; deleting a recent entry does not delete the source file.
- In a supported browser, Comic Manager creates or links the project directory and writes `comicConfig.json` and saved page files under the expected folders.
- A plugin installation is explicit and its security warning is visible before users install arbitrary code.


## Storyboarding and animation

Dedicated Storyboarding and Animation workspaces are available. Storyboarding provides a panel for organizing shots, descriptions, and durations, with JSON export, and places the animation timeline at the bottom of the right dock. Animation also keeps the timeline at the bottom. Each workspace configuration is maintained in its own TypeScript file. These features are an initial production-planning foundation and are not yet equivalent to a complete animation system such as Krita's animation tools.


## Comic panel workflow

- The comic tool supports an outer page frame, rectangular panels, and a split/cut mode that creates either one full-page horizontal or vertical divider or two parallel dividers with configurable spacing. The live preview reflects the selected line count and spacing.
- Creating a rectangular panel also creates a dedicated paint layer whose `comicClipBounds` metadata limits brush, eraser, clone-stamp, shape, and fill writes to the panel rectangle. The bounds are serialized in `.nvtsphoto` files.
- The panel border remains editable vector content on the selected vector layer; the dedicated paint layer is selected after creation.
- Current limitation: panel clipping is rectangular; polygonal and slanted panel boundaries are not yet supported.


Comic frame splitting creates straight dividers from the gesture start/end points, supports one or two parallel lines with adjustable spacing, and opens the full-page outer frame border where the dividers meet it when a matching frame rectangle exists.
