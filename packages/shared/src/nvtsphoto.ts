// nvtsphoto.ts — Tipos del manifest.json dentro del contenedor .nvtsphoto.
// Versión 0.1.0 (prototipo): 1 blob RGBA8 por capa. Los tiles llegarán en 1.x.

export const NVTS_FORMAT = 'nvtsphoto' as const;
export const NVTS_VERSION = '0.1.0';

export type LayerType = 'raster' | 'group';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

export interface LayerManifest {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // [0..1]
  blendMode: BlendMode;
  /** Solo capas raster: ruta del blob dentro del ZIP. */
  pixelData?: { path: string; codec: 'deflate'; format: 'rgba8' };
  /** Solo grupos. El orden del array = orden de apilado (abajo -> arriba). */
  children?: LayerManifest[];
}

export interface NvtsManifest {
  format: typeof NVTS_FORMAT;
  version: string;
  generator: string;
  document: {
    id: string;
    name: string;
    width: number;
    height: number;
    colorSpace: 'sRGB';
    bitDepth: 8;
  };
  layers: LayerManifest[];
  /** Espacio reservado para compatibilidad hacia adelante. */
  extensions: Record<string, unknown>;
}
