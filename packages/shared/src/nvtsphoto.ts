// nvtsphoto.ts — Manifiesto de proyecto nativo NVTS PhotoMania.
// Las nuevas propiedades son opcionales para mantener compatibilidad con .nvtsphoto 0.1.x anteriores.
export const NVTS_FORMAT = 'nvtsphoto' as const;
export const NVTS_VERSION = '0.1.0';

export type LayerType = 'paint' | 'filter' | 'fill' | 'file' | 'vector' | 'group' | 'raster';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';
export type FilterKind = 'grayscale' | 'invert' | 'sepia' | 'blur' | 'brightness' | 'contrast';
export type VectorShape = {
  id: string;
  kind: 'rectangle' | 'ellipse' | 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  opacity: number;
  strokeWidth: number;
};

export interface LayerManifest {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // [0..1]
  blendMode: BlendMode;
  /** Solo capas con superficie RGBA (pintura, relleno, archivo y vector). */
  pixelData?: { path: string; codec: 'deflate'; format: 'rgba8' };
  /** Datos de una capa de relleno de color. */
  fillColor?: string;
  /** Ajuste no destructivo aplicado a lo que hay debajo de esta capa. */
  filterKind?: FilterKind;
  filterStrength?: number; // [0..1]
  /** Metadatos de objetos vectoriales; la previsualización actual también se rasteriza. */
  vectorShapes?: VectorShape[];
  /** Nombre del archivo fuente en capas de archivo incrustadas. */
  sourceName?: string;
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
  extensions: Record<string, unknown>;
}

export const isPixelLayerType = (type: LayerType): boolean =>
  type === 'paint' || type === 'raster' || type === 'fill' || type === 'file' || type === 'vector';
