// API pública del paquete @nvts/wasm-bindings.
export { EngineClient, ImageHandle } from './EngineClient';
export type { EngineCapabilities } from './EngineClient';
export { EngineSession } from './EngineSession';
export type { TileUploader, LayerProps, AddLayerOptions } from './EngineSession';
export { HeapAccess, isSharedBuffer } from './SafeMemory';
export { flushDirtyTiles } from './DirtyTiles';
export { BlendMode, blendModeFromManifest, blendModeToManifest } from './BlendMode';
export type { BlendModeValue } from './BlendMode';
export type {
  NvtsEngineModule, ImageProcessor, TiledLayer, Compositor, HistoryManager,
} from '../build/engine.js';

export { WasmRuntimeManager } from './WasmRuntimeManager';
