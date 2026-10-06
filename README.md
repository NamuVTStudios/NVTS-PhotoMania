# NVTS Photomania

Clon web de Photoshop de alto rendimiento — NamuVT Studios.
Motor C++ → WebAssembly (Emscripten), UI en TypeScript, render WebGPU (WebGL2 de respaldo), archivos `.nvtsphoto`.

## Requisitos
- Node 20+ y pnpm 9+
- [Emscripten (emsdk)](https://emscripten.org) activado en la terminal. `build.sh` es bash: en Windows usa WSL o Git Bash.
- Navegador con WebGPU (Chrome/Edge recientes) o WebGL2.

## Puesta en marcha
```bash
pnpm install
pnpm build:wasm     # compila el motor y copia engine.wasm a apps/web/public/wasm/
pnpm dev            # http://localhost:5173
pnpm typecheck
```

## Estructura
```
nvts-photomania/
├─ packages/
│  ├─ engine/               # C++ → Wasm
│  │  ├─ build.sh
│  │  └─ src/ engine.cpp · tiled_layer.{h,cpp} · blend.h · compositor.{h,cpp} · history.{h,cpp}
│  ├─ wasm-bindings/        # Puente TS ↔ Wasm
│  │  ├─ index.ts · build/ (generado)
│  │  └─ ts-wrapper/ engine.d.ts · EngineClient.ts · DirtyTiles.ts · BlendMode.ts
│  ├─ renderer/             # WebGPU + WebGL2
│  │  ├─ index.ts · RendererBackend.ts · createRenderer.ts
│  │  ├─ webgpu/WebGPURenderer.ts · webgl2/WebGL2Renderer.ts · shaders/layer.wgsl
│  ├─ shared/src/           # Tipos del manifest .nvtsphoto
│  ├─ document-model/src/   # types · DocumentController · EditSession
│  ├─ storage/src/          # NvtsPhotoIO (fflate + File System Access API)
│  └─ ui/src/               # App · Toolbar
├─ apps/web/                # Vite, index.html, src/main.ts, public/wasm/
├─ tools/copy-wasm.mjs
└─ docs/                    # TDD.md · GDD.md
```

## Flujo de datos
```
Herramientas (pincel, filtros) → EditSession → TiledLayer (C++) marca tiles sucios
  → Compositor.composite() recompone solo esos tiles → output() → flushDirtyTiles()
  → RendererBackend.writeRegion() → pantalla
Deshacer/Rehacer: HistoryManager intercambia buffers de tiles y marca sucio → mismo flujo.
Guardar: DocumentController.readPixels → NvtsPhotoIO → .nvtsphoto (ZIP: manifest.json + píxeles por capa)
```

## Estado
Prototipo: el motor y la UI corren en el hilo principal; ver límites conocidos en `docs/TDD.md`.
