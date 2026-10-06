# NVTS Photomania — Documento técnico (TDD)

## Principios
- **TypeScript posee la estructura; C++ posee los píxeles.** Los píxeles nunca viajan por JSON ni se copian sin necesidad.
- **Todo es por tiles de 256×256 RGBA8.** Solo se recompone y se sube a la GPU lo que cambió.
- **La GPU pertenece a TypeScript** (WebGPU principal, WebGL2 fallback, misma interfaz `RendererBackend`).

## Módulos
| Paquete | Rol |
|---|---|
| `engine` (C++) | `TiledLayer` (tiles dispersos + dirty), `Compositor` (árbol + modos de fusión), `HistoryManager` (undo/redo por tiles) |
| `wasm-bindings` | Carga del Wasm, tipos embind, lectura de tiles sucios sin copia |
| `renderer` | WebGPU / WebGL2, subida por regiones (`writeRegion`) |
| `document-model` | `DocumentController` (árbol de capas TS ↔ motor), `EditSession` (acciones deshacibles) |
| `storage` | `.nvtsphoto` (ZIP + manifest) con File System Access API |
| `ui` | App, panel de capas, Toolbar |

## Decisiones clave
- **Alpha:** tiles en RGBA8 *sin premultiplicar*; el compositor acumula en float *premultiplicado* y cuantiza una sola vez al final. El shader sale premultiplicado.
- **Composición:** de abajo hacia arriba; grupos aislados (máx. 16 niveles). Modos: Normal, Multiplicar, Screen, Overlay.
- **Undo:** copy-on-write de los tiles tocados + intercambio de punteros al deshacer/rehacer (sin copiar píxeles). Tope de memoria configurable. Solo cubre píxeles.
- **Flujo de render:** edición → tiles sucios → `composite()` → `output()` → `flushDirtyTiles()` → textura GPU.
- **Aislamiento:** COOP/COEP activados en Vite para poder usar `SharedArrayBuffer` más adelante.

## Formato `.nvtsphoto` 0.1.0
ZIP con `manifest.json` + `layers/<id>/pixels.rgba` (deflate nivel 1, un blob por capa; las capas vacías se omiten). Versión mayor distinta ⇒ se rechaza. Tiles por archivo llegarán en 1.x.

## Límites conocidos
- Motor y UI en el hilo principal (sin Worker).
- Estructura de capas (añadir/borrar/mover/propiedades) no deshacible; borrar una capa vacía el historial.
- Textura GPU del tamaño del lienzo (sin atlas disperso).
- Composición escalar en CPU (sin SIMD ni compute shaders).
- Guardado/lectura síncronos de lienzo completo por capa.

## Próximos pasos técnicos
1. Motor en Worker + `OffscreenCanvas`. 2. Guardado por tiles (1.x). 3. Atlas disperso en GPU. 4. Compositor en compute shaders / SIMD. 5. Deshacer de estructura. 6. `trimEmptyTiles`.
