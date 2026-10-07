# NVTS Photomania

NVTS-PhotoMania – High-performance web image editor — NamuVT Studios.
C++ engine → WebAssembly (Emscripten), TypeScript UI, WebGPU rendering (WebGL2 fallback), `.nvtsphoto` files.

## Requirements
- Node 20+ and pnpm 9+
- [Emscripten (emsdk)](https://emscripten.org) activated in your terminal. `build.sh` is a bash script: on Windows, use WSL or Git Bash.
- A browser with WebGPU (recent Chrome/Edge) or WebGL2.

## Getting started
```bash
pnpm install
pnpm build:wasm     # builds the engine and copies engine.wasm to apps/web/public/wasm/
pnpm dev            # http://localhost:5173
pnpm typecheck
```

## Structure
```
nvts-photomania/
├─ packages/
│  ├─ engine/               # C++ → Wasm
│  │  ├─ build.sh
│  │  └─ src/ engine.cpp · tiled_layer.{h,cpp} · blend.h · compositor.{h,cpp} · history.{h,cpp}
│  ├─ wasm-bindings/        # TS ↔ Wasm bridge
│  │  ├─ index.ts · build/ (generated)
│  │  └─ ts-wrapper/ engine.d.ts · EngineClient.ts · DirtyTiles.ts · BlendMode.ts
│  ├─ renderer/             # WebGPU + WebGL2
│  │  ├─ index.ts · RendererBackend.ts · createRenderer.ts
│  │  ├─ webgpu/WebGPURenderer.ts · webgl2/WebGL2Renderer.ts · shaders/layer.wgsl
│  ├─ shared/src/           # Types for the .nvtsphoto manifest
│  ├─ document-model/src/   # types · DocumentController · EditSession
│  ├─ storage/src/          # NvtsPhotoIO (fflate + File System Access API)
│  └─ ui/src/               # App · Toolbar
├─ apps/web/                # Vite, index.html, src/main.ts, public/wasm/
├─ tools/copy-wasm.mjs
└─ docs/                    # TDD.md · GDD.md (English: TDD.en.md · GDD.en.md)
```

## Data flow
```
Tools (brush, filters) → EditSession → TiledLayer (C++) marks dirty tiles
  → Compositor.composite() recomposes only those tiles → output() → flushDirtyTiles()
  → RendererBackend.writeRegion() → screen
Undo/Redo: HistoryManager swaps tile buffers and marks them dirty → same flow.
Save: DocumentController.readPixels → NvtsPhotoIO → .nvtsphoto (ZIP: manifest.json + per-layer pixels)
```

## Status
Prototype: the engine and the UI run on the main thread; see the known limitations in `docs/TDD.en.md`.
