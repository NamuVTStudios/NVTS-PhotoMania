# NVTS-PhotoMania

NVTS-PhotoMania is a browser-based, layer-oriented image editor developed by NamuVT Studios. The current implementation combines a C++/WebAssembly tiled pixel engine, a TypeScript document/UI layer, and WebGPU rendering with a WebGL2 fallback. Its native project format is `.nvtsphoto`.

> **Project status:** active prototype. The documentation below describes the implementation in this repository, including its current limitations. See [GDD](docs/GDD.md) for product scope and [TDD](docs/TDD.md) for the technical design.

## Requirements

- Node.js 20 or newer.
- pnpm (the root `package.json` currently declares `pnpm@12.9.1`).
- Emscripten/emsdk activated to rebuild the C++ engine to WebAssembly.
- A modern browser with WebGPU or WebGL2. Chrome and Edge are the primary targets for File System Access API workflows such as choosing a project directory and keeping file handles.

When running on a browser without File System Access API support, document open/save can use classic file-input/download fallbacks. Directory-based Comic Manager workflows require browser support for `showDirectoryPicker` and a secure context such as `localhost` or HTTPS.

## Getting started

From the repository root:

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

Useful commands:

```bash
pnpm typecheck    # TypeScript check
pnpm build        # Production web build
pnpm build:wasm   # Rebuild the C++ engine and copy the Wasm assets
```

`pnpm build:wasm` requires Emscripten. The generated artifacts are copied to the web app's public Wasm directory by `tools/copy-wasm.mjs`.

## Current capabilities

- **Document templates:** the 20 document presets (social posts/stories, screen sizes, A4, US/European comics, manga/manhwa, animation, and UV/2D textures) are maintained as individual modules in the shared `@nvts/templates` workspace package so other NVTS apps can reuse them.
- **Canvas and navigation:** fit-to-window view, zoom with controls or Ctrl/Meta + mouse wheel, panning with the Hand tool or Space + drag, and responsive canvas sizing.
- **Drawing tools:** brush, eraser, eyedropper, line, rectangle, ellipse, bucket fill, text, and vector selection. The brush exposes size, opacity, hardness, spacing, and smoothing controls; the fill tool includes tolerance, contiguous fill, and merged-visible sampling options. Tool and vector-shape icons are individual SVG assets in `apps/web/src/icons/tools/`; CSS masks let them inherit the active foreground color and remain legible in both themes.
- **Layer model:** paint, filter, fill, file/image, vector, text, and group layers. Layers support names, order, visibility, lock state, opacity, blend mode, duplication, deletion, nested groups, and thumbnails.
- **History:** pixel edits use the Wasm tile history; document structure and property changes are recorded by the TypeScript `DocumentController`. Undo/redo shortcuts are `Ctrl/Meta+Z`, `Ctrl/Meta+Shift+Z`, and `Ctrl/Meta+Y`.
- **Text:** a text layer stores editable text and typography metadata along with a raster preview. The top tool bar contains font, style, size, and color; advanced options contain alignment, line height, letter spacing, stroke, and background controls.
- **Vector layers:** editable shape metadata, object list, move/resize interactions, shape editing controls, and SVG export. The displayed compositor image is currently rasterized; this is not yet a feature-complete vector illustration package.
- **Filters and layer effects:** grayscale, invert, sepia, blur, brightness, contrast, plus blend/opacity controls. Filter layers render non-destructively in the current UI renderer path.
- **Workspaces:** General, Digital Illustration, Vector Illustration, Image Manipulation, and Comics, with a saved workspace choice.
- **Panels and appearance:** modular Layers, History, Advanced Tool Options, Comic Manager, and supporting filter/vector/effects/plugin/preferences panels; light and dark themes; per-panel visibility under **View → Panels**; `Tab` toggles the panel zone. Dock panels can be reordered by dragging their headers, detached into floating windows, re-docked, resized individually, and the width of the whole panel zone can be dragged. Layouts are saved separately for each workspace.
- **Projects:** create, open, Save, Save As, `.nvtsphoto` serialization, and optional recent-project snapshots persisted in IndexedDB according to Preferences.
- **Linked image layers:** the image data is embedded in the project. Where the browser supports file handles, a local link ID and source metadata can also be retained so the application can offer a manual refresh/relink flow. The external file is not continuously watched.

## Repository structure

```text
NVTS-PhotoMania/
├─ apps/
│  └─ web/
│     ├─ src/
│     │  ├─ main.ts              # Web entry point
│     │  ├─ styles.css           # Global styles and themes
│     │  └─ icons/tools/         # Individual SVG tool, shape, and layer-action icons
│     └─ public/                 # Branding and Wasm runtime assets
├─ packages/
│  ├─ engine/                    # C++/Wasm: tiled layers, compositor, tile history
│  ├─ wasm-bindings/             # Embind module and typed TypeScript wrappers
│  ├─ renderer/                  # WebGPU renderer + WebGL2 fallback
│  ├─ shared/                    # Native document manifest and shared layer/vector types
│  ├─ document-model/            # DocumentController, LayerNode tree, edit and undo/redo
│  ├─ storage/                   # .nvtsphoto serialization, open/save, recent projects, linked handles
│  ├─ templates/                 # Shared document-template catalog for NVTS applications
│  │  └─ src/                    # One preset per file, types.ts, and public index.ts
│  └─ ui/
│     └─ src/
│        ├─ App.ts               # Application coordinator and event wiring
│        ├─ Toolbar.ts           # Tool bar helpers
│        └─ panels/              # One module per panel plus DockLayoutManager.ts
├─ tools/copy-wasm.mjs
├─ docs/
│  ├─ GDD.md                # Product/design scope
│  └─ TDD.md                # Architecture and technical design
├─ README.md
└─ pnpm-workspace.yaml
```

## Shared template catalog

The `@nvts/templates` workspace package contains reusable document presets independent of the PhotoMania UI. Each preset is defined in its own file under `packages/templates/src/`; `types.ts` defines the shared `TemplateDef` contract and `index.ts` exports the full `TEMPLATES` catalog plus individual named presets. The package contains plain TypeScript data and does not import UI code, browser APIs, the engine, or the document model.

PhotoMania consumes the catalog via `import { TEMPLATES } from '@nvts/templates'`. To add a preset, create a module that exports a `TemplateDef`, then export and add it to the catalog in `packages/templates/src/index.ts`. Another NVTS application can declare `"@nvts/templates": "workspace:*"` in its package dependencies and import the same catalog or individual presets without depending on `@nvts/ui`.

## Data flow and document format

The TypeScript document model owns the layer tree and document metadata. Pixel surfaces are stored in the C++ engine as sparse 256×256 RGBA8 tiles. Edits mark tiles dirty; the compositor recomposes affected tiles and the selected renderer uploads image regions. Filter layers currently use an alternate tile composition path in the UI so that filters can affect the content below them non-destructively.

A `.nvtsphoto` file is a ZIP containing `manifest.json` plus RGBA pixel blobs for pixel-backed layers (for example `layers/<layer-id>/pixels.rgba`). The manifest stores document dimensions, layer properties, group nesting, filter metadata, vector object data, text data, and source-link metadata where applicable. The currently declared native format version is `0.1.0`.

## Comic Manager

The panel is available from **View → Panels → Comic Manager** and from the Comics workspace. It organizes a comic as a project configuration plus individual `.nvtsphoto` page documents; it does **not** yet combine all pages into one multi-page drawing document.

### Project folders

In Chrome/Edge or another browser supporting the File System Access API, choose a base directory and a project name, then select **Create project structure**. The project directory is organized like this:

```text
My Comic/
├─ comicConfig.json
├─ páginas/       # individual editable .nvtsphoto page documents
└─ exportación/   # destination for an organized project copy
```

The directory names default to `páginas` and `exportación`. `comicConfig.json` is written in the project root when a project directory is linked. The browser may hide the absolute path for privacy; the app remembers a directory handle in IndexedDB where browser permissions allow it. A handle may need to be re-authorized after restarting the browser or moving to another browser profile/computer.

When no directory is linked, the manager still stores the configuration in browser local storage and can import/export `comicConfig.json` as a download. Real folders and default page-save destinations require File System Access API support.

### Comic configuration and pages

The JSON uses `format: "nvts-comic-config"` and `version: 1`. It contains project name, title, author, reading direction, page size in pixels, DPI, bleed, safe margin, gutter, facing-page setting, directory names, timestamps, and page entries.

Available presets are US comic, European comic/A4, Manga, and Manhwa/Webtoon. A page can be added, duplicated, renamed, reordered, or removed from the configuration. Removing a page from the list does not delete a file from disk. Creating a canvas uses the selected page's dimensions. Opening an existing `.nvtsphoto` for a page copies it into `páginas/` when a project folder is linked. Saved pages remain individual `.nvtsphoto` files.

**Export project copy** copies `comicConfig.json` and already-saved `.nvtsphoto` pages into `exportación/`, with page files placed under `exportación/páginas/`. It is an organized project copy, not a final PDF, CBZ, or flattened comic export.

## Plugins

Community plugins are installed from **View → Plugins → Install plugin (.js)…**. Plugins are JavaScript ES modules stored in this browser's local storage and loaded when the app starts. An installed module must be self-contained: relative imports are not supported by this first loader.

A minimal plugin looks like this:

```js
export const name = 'My plugin';
export const version = '0.1.0';

export function activate(api) {
  api.registerMenuAction('Say hello', () => {
    api.notify('Hello from the plugin');
  });
}
```

A default export may instead be an `activate` function or an object containing an `activate` function, `name`, and `version`.

### Initial plugin API

- `api.appName` and `api.version`: application/API identity (`NVTS-PhotoMania`, `0.1.0`).
- `api.registerMenuAction(label, callback)`: adds an action under the Plugins menu.
- `api.notify(message)`: displays a status message in the plugin manager.
- `api.getDocumentInfo()`: returns document `name`, `width`, `height`, and `activeLayerId`, or `null` on the start screen.
- `api.getLayers()`: returns a flat list of layers with `id`, `name`, `type`, `visible`, `locked`, and `opacity`.
- `api.createLayer(type, name?)`: creates and selects a `paint`, `filter`, `fill`, `vector`, `text`, or `group` layer. `file` and legacy `raster` are not accepted by this API method.
- `api.renameLayer(id, name)`: renames a layer.
- `api.setLayerProperties(id, properties)`: sets supported `visible`, `locked`, `opacity` (0–1), and `blendMode` (`normal`, `multiply`, `screen`, `overlay`) values.

The plugin API is an **initial, version-0.1 interface**, not a stable compatibility contract. Document operations are delegated to the app and are recorded in history where the underlying operation supports it.

> **Security warning:** installing a plugin executes code chosen by the user with the privileges available to the app page. The initial system does not provide a security sandbox. Install only source code from developers you trust; inspect plugins before running them.

## Known limitations

- The engine, document management, and UI run on the main thread. Large operations can block the interface; save/open and ZIP processing are synchronous in this version.
- The pixel format is sRGB RGBA8. There is no 16/32-bit workflow, RAW development, ICC-profile pipeline, or PSD interoperability in the current implementation.
- Vector and text layers keep editable metadata, but use raster previews for the compositor. The vector editor is not yet equivalent to a dedicated vector illustration program.
- File-linked image layers retain embedded image data for portability. External links depend on browser file-handle permissions and require an explicit refresh/relink flow; they are not watched continuously.
- Comic Manager stores per-page `.nvtsphoto` documents and a JSON project configuration. PDF/CBZ output and a single native multi-page document are not implemented.
- The plugin API is preliminary and plugins are not sandboxed.
- The WebGPU/WebGL2 backend is selected at runtime, but full build/runtime behavior should be verified on the target browser and GPU.
