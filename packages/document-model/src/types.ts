// Estado del documento: la estructura y los metadatos viven en TypeScript; los píxeles, en C++.
import type { ComicClipBounds, FilterKind, LayerManifest, LayerMask, VectorShape } from '@nvts/shared';

export interface LayerNode extends Omit<LayerManifest, 'pixelData' | 'children'> {
  /** ID numérico de la capa de respaldo en el compositor Wasm. 0 está reservado. */
  engineId: number;
  /** Solo grupos. Orden de apilado: índice 0 = abajo. */
  children: LayerNode[];
  filterKind?: FilterKind;
  filterStrength?: number;
  fillColor?: string;
  vectorShapes?: VectorShape[];
  comicClipBounds?: ComicClipBounds;
  sourceName?: string;
  masks?: LayerMask[];
}

export interface DocumentState {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Orden de apilado: índice 0 = abajo. */
  layers: LayerNode[];
}

/** Resultado de abrir .nvtsphoto: estructura + píxeles RGBA8 de las capas con superficie. */
export interface UnpackedDocument {
  doc: DocumentState;
  pixels: Map<string, Uint8Array>;
}
