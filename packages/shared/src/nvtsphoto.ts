// nvtsphoto.ts — Manifiesto de proyecto nativo NVTS PhotoMania.
// Las nuevas propiedades son opcionales para mantener compatibilidad con .nvtsphoto 0.1.x anteriores.
export const NVTS_FORMAT = 'nvtsphoto' as const;
export const NVTS_VERSION = '0.1.0';

export type LayerType = 'paint' | 'filter' | 'fill' | 'file' | 'vector' | 'group' | 'raster';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';
export type FilterKind = 'grayscale' | 'invert' | 'sepia' | 'blur' | 'brightness' | 'contrast';
export type VectorKind =
  | 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'line'
  | 'polygon' | 'polyline' | 'bezier' | 'freehand'
  | 'star' | 'spiral' | 'text';

/** Un nodo de una ruta vectorial. Los controles Bezier son opcionales y absolutos. */
export interface VectorPoint {
  x: number;
  y: number;
  inX?: number;
  inY?: number;
  outX?: number;
  outY?: number;
}

/** Modelo vectorial nativo: la previsualización rasterizada es solo una caché del compositor. */
export type VectorShape = {
  id: string;
  kind: VectorKind;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Compatibilidad con documentos 0.1.x: actúa como relleno/trazo si no hay colores separados. */
  color: string;
  opacity: number;
  strokeWidth: number;
  fillColor?: string;
  strokeColor?: string;
  fillEnabled?: boolean;
  strokeEnabled?: boolean;
  strokeDash?: 'solid' | 'dash' | 'dot';
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
  cornerRadius?: number;
  points?: VectorPoint[];
  starPoints?: number;
  rotation?: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
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
  /** Nombre del archivo fuente de la capa de archivo. */
  sourceName?: string;
  /** ID local que vincula la capa con un FileSystemFileHandle guardado en IndexedDB. */
  sourceLinkId?: string;
  /** Metadata usada para detectar cambios en la fuente cuando se vuelve a abrir el proyecto. */
  sourceLastModified?: number;
  sourceFileSize?: number;
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
