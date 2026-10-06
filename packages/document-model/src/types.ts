// types.ts — Estado en memoria del documento (lo que usa la UI).
// TS posee la ESTRUCTURA; los píxeles viven en C++ (Compositor/TiledLayer) y se referencian por id numérico.

import type { LayerManifest } from '@nvts/shared';

export interface LayerNode extends Omit<LayerManifest, 'pixelData' | 'children'> {
  /** id numérico de la capa en el Compositor C++. 0 = sin asignar (lo asigna DocumentController). */
  engineId: number;
  /** Solo grupos. Orden de apilado: índice 0 = abajo. */
  children: LayerNode[];
}

export interface DocumentState {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Orden de apilado: índice 0 = abajo. */
  layers: LayerNode[];
}

/** Resultado de leer un .nvtsphoto: estructura + blobs RGBA8 (width*height*4) por id de capa. */
export interface UnpackedDocument {
  doc: DocumentState;
  pixels: Map<string, Uint8Array>;
}
