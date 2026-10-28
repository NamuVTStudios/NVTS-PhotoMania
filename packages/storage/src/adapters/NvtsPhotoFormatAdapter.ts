import type { DocumentState, LayerNode } from '@nvts/document-model';
import { packNvtsPhoto, unpackNvtsPhoto } from '../NvtsPhotoIO';
import type { DocumentFormatAdapter } from './DocumentFormatAdapter';

const NVTS_SIGNATURE = new TextEncoder().encode('PK');

/** Adapter that exposes .nvtsphoto through the common document-format contract. */
export class NvtsPhotoFormatAdapter implements DocumentFormatAdapter {
  readonly id = 'nvtsphoto';
  readonly extensions = ['.nvtsphoto'] as const;

  canRead(bytes: Uint8Array, fileName = ''): boolean {
    const namedAsNative = fileName.toLowerCase().endsWith('.nvtsphoto');
    const zipSignature = bytes[0] === NVTS_SIGNATURE[0] && bytes[1] === NVTS_SIGNATURE[1];
    return namedAsNative || zipSignature;
  }

  encode(document: DocumentState, readPixels: (layer: LayerNode) => Uint8Array | null): Uint8Array {
    return packNvtsPhoto(document, readPixels);
  }

  decode(bytes: Uint8Array) {
    return unpackNvtsPhoto(bytes);
  }
}
