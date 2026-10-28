import type { DocumentState, LayerNode, UnpackedDocument } from '@nvts/document-model';

/** Adapter contract for native and future interchange document formats. */
export interface DocumentFormatAdapter {
  readonly id: string;
  readonly extensions: readonly string[];
  canRead(bytes: Uint8Array, fileName?: string): boolean;
  encode(document: DocumentState, readPixels: (layer: LayerNode) => Uint8Array | null): Uint8Array;
  decode(bytes: Uint8Array): UnpackedDocument;
}
