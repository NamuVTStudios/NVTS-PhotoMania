// API pública del paquete @nvts/wasm-bindings.
export { EngineClient, ImageHandle } from './EngineClient';
export { flushDirtyTiles } from './DirtyTiles';
export { BlendMode, blendModeFromManifest } from './BlendMode';
export type { BlendModeValue } from './BlendMode';
export type {
  NvtsEngineModule, ImageProcessor, TiledLayer, Compositor, HistoryManager,
} from '../build/engine.js';
