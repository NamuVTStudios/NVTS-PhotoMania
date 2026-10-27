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
pnpm test         # History and native-format regression tests
pnpm build        # Production web build
pnpm build:wasm   # Rebuild the C++ engine and copy the Wasm assets
```

`pnpm build:wasm` requires Emscripten. The generated artifacts are copied to the web app's public Wasm directory by `tools/copy-wasm.mjs`.

The history and `.nvtsphoto` tests use Node's built-in test runner and the generated Wasm module. Rebuild the engine with `pnpm build:wasm` before running them after C++ changes.

## Arquitectura, DRY, SOLID y orientación a objetos

- **Clase base `Panel`:** los controladores visuales que administran un panel interactivo heredan de `packages/ui/src/panels/Panel.ts`. La clase encapsula el elemento DOM y proporciona `show()`, `hide()`, `visible` y un punto de extensión de ciclo de vida.
- **Jerarquía de paneles:** `FilterPanelController`, `LayerEffectsPanelController`, `AnimationTimelineController`, `StoryboardPanelController`, `PluginPanelController` y `RecentProjectsPanel` extienden `Panel`. Los renderizadores puros y procesadores de imagen continúan como módulos especializados; no se fuerza herencia donde no existe estado o comportamiento de panel.
- **Responsabilidad única (S):** cada controlador de panel administra su interfaz y sus eventos; `App` coordina las operaciones del documento y el flujo entre herramientas.
- **Abierto/cerrado (O) y polimorfismo:** los paneles pueden especializar el ciclo de vida definido por `Panel`; sus acciones de aplicación se conectan mediante callbacks en lugar de acoplar el panel al motor o al documento.
- **Sustitución de Liskov (L):** todos los subtipos conservan el contrato de visibilidad de `Panel`. **Segregación de interfaces (I):** los callbacks se limitan a las acciones que cada panel necesita.
- **Inversión de dependencias (D):** los paneles reciben callbacks para cambios de capa/aplicación, en lugar de importar o construir directamente el motor. El renderizado, el procesamiento de filtros, el modelo de documentos, la persistencia y la UI permanecen separados en sus paquetes o módulos.
- **DRY:** la selección/configuración de filtros, el selector de capas y el estado de visibilidad se centralizan en sus controladores. `DockLayoutManager` preserva los paneles editoriales cuando reconstruye los slots acoplables, evitando que esos paneles se desconecten del DOM.
- **Separación por paquetes:** los algoritmos puros de pincel, filtros y colorización viven en `@nvts/image-processing`; el renderizador de formas y el exportador SVG viven en `@nvts/vector`; las consultas sobre árboles de capas viven en `@nvts/document-model`. `@nvts/ui` contiene los elementos que realmente dependen de la interfaz: Managers, Panels, Workspaces, plantillas de shell y controladores de aplicación.

La refactorización es incremental: los módulos que solo definen datos, renderizan una vista o procesan píxeles no se convierten en clases artificialmente. Así se aplica herencia donde representa una relación real y se evita crear abstracciones que no aporten comportamiento compartido.

## Current capabilities

- **Document templates:** the 23 document presets (social posts/stories, screen sizes, A4, US/European comics, manga/manhwa, animation, and UV/2D textures) are maintained as individual modules in the shared `@nvts/templates` workspace package so other NVTS apps can reuse them.
- **Canvas and navigation:** fit-to-window view, zoom with controls or Ctrl/Meta + mouse wheel, panning with the Hand tool or Space + drag, and responsive canvas sizing.
- **Drawing tools:** brush, eraser, eyedropper, line, rectangle, ellipse, bucket fill, text, and vector selection. The brush exposes size, opacity, hardness, spacing, and smoothing controls; the fill tool includes tolerance, contiguous fill, and merged-visible sampling options. Tool and vector-shape icons are individual SVG assets in `apps/web/src/icons/tools/`; CSS masks let them inherit the active foreground color and remain legible in both themes.
- **Non-destructive layer masks:** affine transform masks, colorization masks with editable color strokes, and filter masks with per-layer filter stacks. All three mask types are created from **Layers → New Layer** in the Layers panel; the “Máscaras de capa” disclosure keeps the selected mask controls available. Mask metadata is saved in `.nvtsphoto`; colorization currently uses a line-barrier region fill and is limited to 4 million document pixels. Filter masks apply to the entire layer; painted grayscale coverage and advanced warp transforms are not implemented yet.
- **Layer model:** paint, filter, fill, file/image, vector, text, and group layers. Layers support names, order, visibility, lock state, opacity, blend mode, duplication, deletion, nested groups, and thumbnails.
- **History:** pixel edits use the Wasm tile history; document structure and property changes are recorded by the TypeScript `DocumentController`. Undo/redo shortcuts are `Ctrl/Meta+Z`, `Ctrl/Meta+Shift+Z`, and `Ctrl/Meta+Y`.
- **Text:** a text layer stores editable text and typography metadata along with a raster preview. The top tool bar contains font, style, size, and color; advanced options contain alignment, line height, letter spacing, stroke, and background controls.
- **Vector layers:** editable shape metadata, object list, move/resize interactions, shape editing controls, and SVG export. The displayed compositor image is currently rasterized; this is not yet a feature-complete vector illustration package.
- **Filters and layer effects:** 17 effects covering grayscale, invert, sepia, blur, brightness, contrast, saturation, hue rotation, sharpen, posterize, threshold, duotone, solarize, pixelation, edge detection, grain and vignette, plus blend/opacity controls. Filter layers render non-destructively in the current UI renderer path.
- **Workspaces:** General, Digital Illustration, Vector Illustration, Image Manipulation, Comics, Storyboarding, and Animation, with a saved workspace choice.
- **Panels and appearance:** modular Layers, History, Advanced Tool Options, Comic Manager, and supporting filter/vector/effects/plugin/preferences panels; light and dark themes; per-panel visibility under **View → Panels**; `Tab` toggles the panel zone. Dock panels can be reordered by dragging their headers, detached into floating windows, re-docked, resized individually, and the width of the whole panel zone can be dragged. Layouts are saved separately for each workspace.
- **Projects:** create, open, Save, Save As, `.nvtsphoto` serialization, and optional recent-project snapshots persisted in IndexedDB according to Preferences.
- **Linked image layers:** the image data is embedded in the project. Where the browser supports file handles, a local link ID and source metadata can also be retained so the application can offer a manual refresh/relink flow. The external file is not continuously watched.

## Repository structure (folders first, alphabetical)

The tree below reflects the contents of this archive. At each level, directories and their subdirectories are listed first in alphabetical order, followed by files in alphabetical order. `.git/` and any `node_modules/` directories are excluded because they are repository metadata and installed dependencies; run `pnpm install` to restore dependencies. Build output is shown only when it is included in the archive.

```text
NVTS-PhotoMania/
├─ .github/
│  └─ workflows/
│     └─ deploy.yml
├─ apps/
│  └─ web/
│     ├─ public/
│     │  ├─ branding/
│     │  │  ├─ photomania-icon.png
│     │  │  └─ photomania-icon.svg
│     │  └─ wasm/
│     │     ├─ coi-serviceworker.js
│     │     └─ engine.wasm
│     ├─ src/
│     │  ├─ icons/
│     │  │  └─ tools/
│     │  │     ├─ brush.svg
│     │  │     ├─ delete.svg
│     │  │     ├─ duplicate.svg
│     │  │     ├─ ellipse.svg
│     │  │     ├─ eraser.svg
│     │  │     ├─ eyedropper.svg
│     │  │     ├─ file-layer.svg
│     │  │     ├─ fill-layer.svg
│     │  │     ├─ fill.svg
│     │  │     ├─ filter-layer.svg
│     │  │     ├─ group-layer-open.svg
│     │  │     ├─ group-layer.svg
│     │  │     ├─ hand.svg
│     │  │     ├─ layers.svg
│     │  │     ├─ line.svg
│     │  │     ├─ lock.svg
│     │  │     ├─ move-down.svg
│     │  │     ├─ move-up.svg
│     │  │     ├─ paint-layer.svg
│     │  │     ├─ plus.svg
│     │  │     ├─ rectangle.svg
│     │  │     ├─ shape-bezier.svg
│     │  │     ├─ shape-ellipse.svg
│     │  │     ├─ shape-freehand.svg
│     │  │     ├─ shape-line.svg
│     │  │     ├─ shape-polygon.svg
│     │  │     ├─ shape-polyline.svg
│     │  │     ├─ shape-rectangle.svg
│     │  │     ├─ shape-rounded-rectangle.svg
│     │  │     ├─ shape-spiral.svg
│     │  │     ├─ shape-star.svg
│     │  │     ├─ shape-text.svg
│     │  │     ├─ text-layer.svg
│     │  │     ├─ text.svg
│     │  │     ├─ unlock.svg
│     │  │     ├─ vector-layer.svg
│     │  │     ├─ vector-select.svg
│     │  │     ├─ zoom-fit.svg
│     │  │     ├─ zoom-in.svg
│     │  │     └─ zoom-out.svg
│     │  ├─ main.ts
│     │  └─ styles.css
│     ├─ index.html
│     ├─ package.json
│     └─ vite.config.ts
├─ docs/
│  ├─ GDD.md
│  └─ TDD.md
├─ packages/
│  ├─ document-model/
│  │  ├─ src/
│  │  │  ├─ DocumentController.ts
│  │  │  ├─ EditSession.ts
│  │  │  ├─ index.ts
│  │  │  ├─ LayerTreeQueries.ts
│  │  │  └─ types.ts
│  │  └─ package.json
│  ├─ engine/
│  │  ├─ src/
│  │  │  ├─ blend.h
│  │  │  ├─ compositor.cpp
│  │  │  ├─ compositor.h
│  │  │  ├─ engine.cpp
│  │  │  ├─ history.cpp
│  │  │  ├─ history.h
│  │  │  ├─ tiled_layer.cpp
│  │  │  └─ tiled_layer.h
│  │  └─ build.sh
│  ├─ image-processing/
│  │  ├─ src/
│  │  │  ├─ brush/
│  │  │  │  └─ BrushStampProcessor.ts
│  │  │  ├─ colorize/
│  │  │  │  └─ ColorizeProcessor.ts
│  │  │  ├─ filters/
│  │  │  │  ├─ FilterProcessor.ts
│  │  │  │  └─ FilterTileLayout.ts
│  │  │  └─ index.ts
│  │  └─ package.json
│  ├─ renderer/
│  │  ├─ shaders/
│  │  │  └─ layer.wgsl
│  │  ├─ webgl2/
│  │  │  └─ WebGL2Renderer.ts
│  │  ├─ webgpu/
│  │  │  └─ WebGPURenderer.ts
│  │  ├─ createRenderer.ts
│  │  ├─ index.ts
│  │  ├─ package.json
│  │  ├─ RendererBackend.ts
│  │  └─ wgsl.d.ts
│  ├─ shared/
│  │  ├─ src/
│  │  │  ├─ index.js
│  │  │  ├─ index.ts
│  │  │  ├─ layerMaskLabels.ts
│  │  │  ├─ layerMasks.ts
│  │  │  ├─ nvtsphoto.js
│  │  │  ├─ nvtsphoto.ts
│  │  │  └─ vectorShapes.ts
│  │  └─ package.json
│  ├─ storage/
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ LayerMaskCodec.ts
│  │  │  ├─ NvtsPhotoIO.ts
│  │  │  └─ RecentProjects.ts
│  │  └─ package.json
│  ├─ templates/
│  │  ├─ src/
│  │  │  ├─ 4k-uhd.ts
│  │  │  ├─ a4.ts
│  │  │  ├─ animation-2d.ts
│  │  │  ├─ animation-vertical.ts
│  │  │  ├─ animation-web.ts
│  │  │  ├─ comic-eu.ts
│  │  │  ├─ comic-us.ts
│  │  │  ├─ facebook-post.ts
│  │  │  ├─ facebook-story.ts
│  │  │  ├─ full-hd.ts
│  │  │  ├─ index.ts
│  │  │  ├─ instagram-post.ts
│  │  │  ├─ instagram-story.ts
│  │  │  ├─ manga.ts
│  │  │  ├─ manhwa.ts
│  │  │  ├─ storyboard-horizontal.ts
│  │  │  ├─ storyboard-vertical.ts
│  │  │  ├─ texture-2d-wide.ts
│  │  │  ├─ texture-2d.ts
│  │  │  ├─ texture-uv-4k.ts
│  │  │  ├─ texture-uv.ts
│  │  │  ├─ tiktok-post.ts
│  │  │  ├─ tiktok-story.ts
│  │  │  ├─ types.ts
│  │  │  └─ youtube-thumb.ts
│  │  └─ package.json
│  ├─ ui/
│  │  ├─ src/
│  │  │  ├─ components/
│  │  │  │  ├─ ShellTemplates.ts
│  │  │  │  └─ Toolbar.ts
│  │  │  ├─ features/
│  │  │  │  └─ comics/
│  │  │  │     └─ types.ts
│  │  │  ├─ managers/
│  │  │  │  ├─ AppManager.ts
│  │  │  │  ├─ ComicProjectManager.ts
│  │  │  │  ├─ DockLayoutManager.ts
│  │  │  │  ├─ DocumentLifecycleManager.ts
│  │  │  │  ├─ ToolManager.ts
│  │  │  │  ├─ UIManager.ts
│  │  │  │  └─ WorkspaceManager.ts
│  │  │  ├─ panels/
│  │  │  │  ├─ AdvancedToolOptionsPanel.ts
│  │  │  │  ├─ AnimationTimelinePanel.ts
│  │  │  │  ├─ ComicManagerPanel.ts
│  │  │  │  ├─ FilterCatalog.ts
│  │  │  │  ├─ FilterPanel.ts
│  │  │  │  ├─ HistoryPanel.ts
│  │  │  │  ├─ LayerEffectsPanel.ts
│  │  │  │  ├─ LayerMaskEditor.ts
│  │  │  │  ├─ LayersPanel.ts
│  │  │  │  ├─ Panel.ts
│  │  │  │  ├─ PluginsPanel.ts
│  │  │  │  ├─ PreferencesPanel.ts
│  │  │  │  ├─ RecentProjectsPanel.ts
│  │  │  │  ├─ StoryboardPanel.ts
│  │  │  │  └─ VectorEditorPanel.ts
│  │  │  ├─ persistence/
│  │  │  │  ├─ DockLayoutStorage.ts
│  │  │  │  └─ PluginStorage.ts
│  │  │  ├─ screens/
│  │  │  │  └─ HomeScreenController.ts
│  │  │  ├─ workspaces/
│  │  │  │  ├─ AnimationWorkspace.ts
│  │  │  │  ├─ ComicsWorkspace.ts
│  │  │  │  ├─ DigitalIllustrationWorkspace.ts
│  │  │  │  ├─ GeneralWorkspace.ts
│  │  │  │  ├─ ImageManipulationWorkspace.ts
│  │  │  │  ├─ index.ts
│  │  │  │  ├─ persistence.ts
│  │  │  │  ├─ StoryboardingWorkspace.ts
│  │  │  │  ├─ types.ts
│  │  │  │  └─ VectorIllustrationWorkspace.ts
│  │  │  ├─ App.ts
│  │  │  └─ index.ts
│  │  └─ package.json
│  ├─ vector/
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ VectorCanvasRenderer.ts
│  │  │  └─ VectorSvgExporter.ts
│  │  └─ package.json
│  └─ wasm-bindings/
│     ├─ build/
│     │  ├─ engine.js
│     │  └─ engine.wasm
│     ├─ ts-wrapper/
│     │  ├─ BlendMode.ts
│     │  ├─ DirtyTiles.ts
│     │  ├─ engine.d.ts
│     │  ├─ EngineClient.ts
│     │  ├─ EngineSession.ts
│     │  ├─ index.ts
│     │  ├─ SafeMemory.ts
│     │  └─ WasmRuntimeManager.ts
│     ├─ index.ts
│     └─ package.json
├─ tests/
│  ├─ helpers/
│  │  └─ vite-test-server.mjs
│  ├─ blend-mode.test.mjs
│  ├─ brush-stamp-processor.test.mjs
│  ├─ dock-layout-storage.test.mjs
│  ├─ filter-processor.test.mjs
│  ├─ filter-tile-layout.test.mjs
│  ├─ history-and-format.test.mjs
│  ├─ layer-mask-cloning.test.mjs
│  ├─ layer-tree-queries.test.mjs
│  ├─ mask-format.test.mjs
│  ├─ plugin-storage.test.mjs
│  ├─ vector-shape-cloning.test.mjs
│  └─ vector-svg-export.test.mjs
├─ tools/
│  └─ copy-wasm.mjs
├─ .env.example
├─ .gitattributes
├─ .gitignore
├─ LICENSE
├─ package.json
├─ pnpm-lock.yaml
├─ pnpm-workspace.yaml
├─ README.md
├─ tsconfig.base.json
└─ tsconfig.json
```


## Organización por responsabilidad

- `packages/ui/src/components/`: componentes reutilizables de interfaz, como la barra de herramientas y las plantillas compartidas del shell.
- `packages/ui/src/features/comics/`: tipos de dominio del proyecto de cómic, compartidos entre el gestor y su panel, sin que el Manager dependa de la vista.
- `packages/ui/src/managers/`: coordinación de la aplicación, herramientas, espacios de trabajo, cómics y distribución de paneles.
- `packages/ui/src/panels/`: renderizadores/controladores de los paneles que el usuario ve y utiliza.
- `packages/ui/src/persistence/`: persistencia local de configuración de plugins y distribución de paneles. La persistencia propia de cada espacio de trabajo permanece en `workspaces/`.
- `packages/ui/src/screens/`: controladores de pantallas completas, como la pantalla inicial.
- `packages/ui/src/workspaces/`: definiciones y tipos de las distribuciones por actividad (ilustración, imagen, cómic, guion gráfico y animación).
- `packages/image-processing/`: algoritmos que transforman píxeles sin gestionar la interfaz.
- `packages/vector/`: renderizado geométrico y exportación SVG, separados de los controles del editor.
- `packages/document-model/`: modelo de documento y consultas sobre el árbol de capas.

Por eso `Managers`, `Panels` y `Workspaces` siguen dentro de `@nvts/ui`: coordinan o presentan la interfaz. Lo que no necesita esa capa —procesamiento de píxeles, utilidades vectoriales y consultas del modelo— se separa en paquetes independientes para reducir dependencias y permitir que otras aplicaciones del ecosistema NVTS reutilicen el código.

## Architecture managers

The UI package now separates several existing responsibilities into focused managers:

- `AppManager` initializes preferences and coordinates the welcome screen with the project-launch callback.
- `UIManager` mounts the editor shell, connects the shared storyboard/timeline panels, and renders launch errors.
- `DocumentLifecycleManager` creates new documents, restores unpacked `.nvtsphoto` data, and disposes the previous document when replacing it. The renderer and editor-specific refresh remain in `App`.
- `ToolManager` tracks the active drawing/navigation tool. Tool availability checks and UI updates remain in `App`.
- `WorkspaceManager` validates workspace IDs and centralizes workspace persistence and definition lookup.
- `ComicProjectManager` manages the selected comic page and page-list operations; filesystem access, configuration persistence, and rendering remain in `App`.
- `WasmRuntimeManager` is a Singleton per JavaScript context. It memoizes the `EngineClient` initialization so repeated launches reuse the same Wasm runtime. A failed initialization clears its cached promise so the app can retry. It deliberately does not make individual documents, sessions, or panels global singletons. If the engine is moved to a Worker later, each Worker will have its own JavaScript context and runtime manager.

These managers are intentionally not all Singletons. Their instances are lightweight and can be created as needed; the Wasm runtime is the special case because repeated initialization of the same runtime within one context should be avoided.

## Shared template catalog

The `@nvts/templates` workspace package contains reusable document presets independent of the PhotoMania UI. Each preset is defined in its own file under `packages/templates/src/`; `types.ts` defines the shared `TemplateDef` contract and `index.ts` exports the full `TEMPLATES` catalog plus individual named presets. The package contains plain TypeScript data and does not import UI code, browser APIs, the engine, or the document model.

PhotoMania consumes the catalog via `import { TEMPLATES } from '@nvts/templates'`. To add a preset, create a module that exports a `TemplateDef`, then export and add it to the catalog in `packages/templates/src/index.ts`. Another NVTS application can declare `"@nvts/templates": "workspace:*"` in its package dependencies and import the same catalog or individual presets without depending on `@nvts/ui`.

## Data flow and document format

The TypeScript document model owns the layer tree, document metadata and tree queries; image algorithms live in `@nvts/image-processing`, and vector rendering/export lives in `@nvts/vector`. Pixel surfaces are stored in the C++ engine as sparse 256×256 RGBA8 tiles. Edits mark tiles dirty; the compositor recomposes affected tiles and the selected renderer uploads image regions. Filter layers use an alternate tile composition path in the UI so they can affect the content below them non-destructively. The filter set includes photographic adjustments (grayscale, brightness, contrast, saturation, hue, sepia, invert and blur), illustration effects (posterize, threshold, duotone, solarize, pixelation and edge detection), and finishing effects (grain, vignette and sharpening). CSS and pixel-based filters share a processor so destructive application, editable filter layers and sampling use the same effect definitions.

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


## Storyboarding and animation workspaces

The shared `@nvts/templates` package includes `storyboard-horizontal.ts` (1920×1080), `storyboard-vertical.ts` (1080×1920), and `animation-vertical.ts` (1080×1920). These are TypeScript modules, not text files; package manifests and configuration remain real `.json` files.

Each workspace is configured in its own TypeScript file under `packages/ui/src/workspaces/` (`GeneralWorkspace.ts`, `DigitalIllustrationWorkspace.ts`, `VectorIllustrationWorkspace.ts`, `ImageManipulationWorkspace.ts`, `ComicsWorkspace.ts`, `StoryboardingWorkspace.ts`, and `AnimationWorkspace.ts`). `index.ts` is only the shared registry.

The **Storyboarding** workspace exposes the storyboard panel and the **Animation** workspace places its animation timeline in a dedicated bottom dock, separate from the right-side tool, history and layer panels. The bottom timeline height is adjustable and persisted per workspace. Each right-side panel also has its own lower resize handle, so resizing History no longer depends on the Layers panel being visible. The storyboard panel supports adding/removing shots, editing shot titles, descriptions and duration, local persistence in the browser, and exporting the shot list as `storyboard.json`. The timeline supports tracks, selectable frames and keyframe cells (double-click a cell to toggle a keyframe), plus FPS and current-frame controls. These are initial organizational tools, not yet a full Krita-equivalent animation renderer: playback is a UI preview only and does not render the canvas as a sequence.
