// nvtsphoto.ts — Manifiesto de proyecto nativo NVTS PhotoMania.
// Las nuevas propiedades son opcionales para mantener compatibilidad con .nvtsphoto 0.1.x anteriores.
export const NVTS_FORMAT = 'nvtsphoto' as const;
export const NVTS_VERSION = '0.1.0';

export type LayerType = 'paint' | 'filter' | 'fill' | 'file' | 'vector' | 'text' | 'group' | 'raster';
export type TextLayerStyle = 'normal' | 'bold' | 'italic' | 'bold-italic';
export type TextLayerAlign = 'left' | 'center' | 'right';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

export interface LayerStyleStroke { enabled: boolean; color: string; size: number; opacity: number }
export interface LayerStyleOuterGlow { enabled: boolean; color: string; size: number; opacity: number }
export interface LayerStyleDropShadow { enabled: boolean; color: string; size: number; distance: number; angle: number; opacity: number }
export interface LayerStyleBevelEmboss { enabled: boolean; size: number; depth: number; angle: number; altitude: number; highlightColor: string; shadowColor: string; opacity: number }
export interface LayerStyleGradientOverlay { enabled: boolean; startColor: string; endColor: string; angle: number; opacity: number }
export interface LayerStyleInnerShadow { enabled: boolean; color: string; size: number; distance: number; angle: number; opacity: number }
export interface LayerStyles {
  stroke: LayerStyleStroke;
  outerGlow: LayerStyleOuterGlow;
  dropShadow: LayerStyleDropShadow;
  bevelEmboss: LayerStyleBevelEmboss;
  gradientOverlay: LayerStyleGradientOverlay;
  innerShadow: LayerStyleInnerShadow;
  /** Ordered effect stacks; singular properties remain for legacy document compatibility. */
  strokes?: LayerStyleStroke[];
  outerGlows?: LayerStyleOuterGlow[];
  dropShadows?: LayerStyleDropShadow[];
  bevelEmbosses?: LayerStyleBevelEmboss[];
  gradientOverlays?: LayerStyleGradientOverlay[];
  innerShadows?: LayerStyleInnerShadow[];
}

export function createDefaultLayerStyles(): LayerStyles {
  return {
    stroke: { enabled: false, color: '#ffffff', size: 3, opacity: 1 },
    outerGlow: { enabled: false, color: '#fff2a8', size: 12, opacity: 0.75 },
    dropShadow: { enabled: false, color: '#000000', size: 8, distance: 6, angle: 45, opacity: 0.55 },
    bevelEmboss: { enabled: false, size: 4, depth: 5, angle: 45, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', opacity: 0.7 },
    gradientOverlay: { enabled: false, startColor: '#ff5e62', endColor: '#6a5af9', angle: 90, opacity: 1 },
    innerShadow: { enabled: false, color: '#000000', size: 8, distance: 4, angle: 45, opacity: 0.55 },
  };
}

export function cloneLayerStyles(styles?: LayerStyles): LayerStyles {
  const defaults = createDefaultLayerStyles();
  if (!styles) return defaults;
  return {
    stroke: { ...defaults.stroke, ...styles.stroke },
    outerGlow: { ...defaults.outerGlow, ...styles.outerGlow },
    dropShadow: { ...defaults.dropShadow, ...styles.dropShadow },
    bevelEmboss: { ...defaults.bevelEmboss, ...styles.bevelEmboss },
    gradientOverlay: { ...defaults.gradientOverlay, ...styles.gradientOverlay },
    innerShadow: { ...defaults.innerShadow, ...styles.innerShadow },
    ...(Array.isArray(styles.strokes) ? { strokes: normalizeStrokeStack(styles.strokes, styles.stroke) } : {}),
    ...(Array.isArray(styles.outerGlows) ? { outerGlows: styles.outerGlows.map((effect) => ({ ...defaults.outerGlow, ...effect })) } : {}),
    ...(Array.isArray(styles.dropShadows) ? { dropShadows: styles.dropShadows.map((effect) => ({ ...defaults.dropShadow, ...effect })) } : {}),
    ...(Array.isArray(styles.bevelEmbosses) ? { bevelEmbosses: styles.bevelEmbosses.map((effect) => ({ ...defaults.bevelEmboss, ...effect })) } : {}),
    ...(Array.isArray(styles.gradientOverlays) ? { gradientOverlays: styles.gradientOverlays.map((effect) => ({ ...defaults.gradientOverlay, ...effect })) } : {}),
    ...(Array.isArray(styles.innerShadows) ? { innerShadows: styles.innerShadows.map((effect) => ({ ...defaults.innerShadow, ...effect })) } : {}),
  };
}

function normalizeStrokeStack(value: unknown, legacyStroke: LayerStyleStroke): LayerStyleStroke[] {
  if (!Array.isArray(value)) return legacyStroke.enabled ? [{ ...legacyStroke }] : [];
  return value.filter((item) => typeof item === 'object' && item !== null).map((item) => {
    const raw = item as Partial<LayerStyleStroke>;
    return {
      enabled: raw.enabled === true,
      color: boundedColor(raw.color, legacyStroke.color),
      size: boundedNumber(raw.size, legacyStroke.size, 1, 256),
      opacity: boundedNumber(raw.opacity, legacyStroke.opacity, 0, 1),
    };
  });
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function boundedColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)) return fallback;
  return value;
}

function readEffectEnabled(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'enabled' in value && (value as { enabled?: unknown }).enabled === true;
}

export function normalizeLayerStyles(value: unknown): LayerStyles | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const raw = value as Partial<Record<keyof LayerStyles, unknown>>;
  return {
    stroke: normalizeStrokeStyle(raw.stroke),
    outerGlow: normalizeOuterGlowStyle(raw.outerGlow),
    dropShadow: normalizeDropShadowStyle(raw.dropShadow),
    bevelEmboss: normalizeBevelStyle(raw.bevelEmboss),
    gradientOverlay: normalizeGradientOverlay(raw.gradientOverlay),
    innerShadow: normalizeInnerShadow(raw.innerShadow),
    ...(Array.isArray(raw.strokes) ? { strokes: normalizeStrokeStack(raw.strokes, normalizeStrokeStyle(raw.stroke)) } : {}),
    ...(Array.isArray(raw.outerGlows) ? { outerGlows: raw.outerGlows.map(normalizeOuterGlowStyle) } : {}),
    ...(Array.isArray(raw.dropShadows) ? { dropShadows: raw.dropShadows.map(normalizeDropShadowStyle) } : {}),
    ...(Array.isArray(raw.bevelEmbosses) ? { bevelEmbosses: raw.bevelEmbosses.map(normalizeBevelStyle) } : {}),
    ...(Array.isArray(raw.gradientOverlays) ? { gradientOverlays: raw.gradientOverlays.map(normalizeGradientOverlay) } : {}),
    ...(Array.isArray(raw.innerShadows) ? { innerShadows: raw.innerShadows.map(normalizeInnerShadow) } : {}),
  };
}

function normalizeStrokeStyle(value: unknown): LayerStyleStroke {
  const raw = asStyleRecord(value);
  const defaults = createDefaultLayerStyles().stroke;
  return { enabled: readEffectEnabled(raw), color: boundedColor(raw.color, defaults.color), size: boundedNumber(raw.size, defaults.size, 1, 64), opacity: boundedNumber(raw.opacity, defaults.opacity, 0, 1) };
}

function normalizeOuterGlowStyle(value: unknown): LayerStyleOuterGlow {
  const raw = asStyleRecord(value);
  const defaults = createDefaultLayerStyles().outerGlow;
  return { enabled: readEffectEnabled(raw), color: boundedColor(raw.color, defaults.color), size: boundedNumber(raw.size, defaults.size, 1, 64), opacity: boundedNumber(raw.opacity, defaults.opacity, 0, 1) };
}

function normalizeDropShadowStyle(value: unknown): LayerStyleDropShadow {
  const raw = asStyleRecord(value);
  const defaults = createDefaultLayerStyles().dropShadow;
  return { enabled: readEffectEnabled(raw), color: boundedColor(raw.color, defaults.color), size: boundedNumber(raw.size, defaults.size, 0, 64), distance: boundedNumber(raw.distance, defaults.distance, 0, 128), angle: boundedNumber(raw.angle, defaults.angle, -180, 180), opacity: boundedNumber(raw.opacity, defaults.opacity, 0, 1) };
}

function normalizeBevelStyle(value: unknown): LayerStyleBevelEmboss {
  const raw = asStyleRecord(value);
  const defaults = createDefaultLayerStyles().bevelEmboss;
  return { enabled: readEffectEnabled(raw), size: boundedNumber(raw.size, defaults.size, 1, 32), depth: boundedNumber(raw.depth, defaults.depth, 1, 10), angle: boundedNumber(raw.angle, defaults.angle, -180, 180), altitude: boundedNumber(raw.altitude, defaults.altitude, 0, 90), highlightColor: boundedColor(raw.highlightColor, defaults.highlightColor), shadowColor: boundedColor(raw.shadowColor, defaults.shadowColor), opacity: boundedNumber(raw.opacity, defaults.opacity, 0, 1) };
}

function normalizeGradientOverlay(value: unknown): LayerStyleGradientOverlay {
  const raw = asStyleRecord(value); const defaults = createDefaultLayerStyles().gradientOverlay;
  return { enabled: readEffectEnabled(raw), startColor: boundedColor(raw.startColor, defaults.startColor), endColor: boundedColor(raw.endColor, defaults.endColor), angle: boundedNumber(raw.angle, defaults.angle, -180, 180), opacity: boundedNumber(raw.opacity, defaults.opacity, 0, 1) };
}

function normalizeInnerShadow(value: unknown): LayerStyleInnerShadow {
  const raw = asStyleRecord(value); const defaults = createDefaultLayerStyles().innerShadow;
  return { enabled: readEffectEnabled(raw), color: boundedColor(raw.color, defaults.color), size: boundedNumber(raw.size, defaults.size, 0, 64), distance: boundedNumber(raw.distance, defaults.distance, 0, 128), angle: boundedNumber(raw.angle, defaults.angle, -180, 180), opacity: boundedNumber(raw.opacity, defaults.opacity, 0, 1) };
}

function asStyleRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  return value as Record<string, unknown>;
}
export const FILTER_KINDS = [
  'grayscale', 'invert', 'sepia', 'blur', 'brightness', 'contrast', 'saturation', 'hue-rotate',
  'posterize', 'threshold', 'pixelate', 'solarize', 'noise', 'vignette', 'duotone', 'sharpen', 'edge-detect',
] as const;
export type FilterKind = typeof FILTER_KINDS[number];

const FILTER_KIND_SET: ReadonlySet<string> = new Set(FILTER_KINDS);

export function isFilterKind(value: unknown): value is FilterKind {
  return typeof value === 'string' && FILTER_KIND_SET.has(value);
}
export type VectorKind =
  | 'rectangle' | 'rounded-rectangle' | 'ellipse' | 'line'
  | 'polygon' | 'polyline' | 'bezier' | 'freehand'
  | 'star' | 'spiral' | 'text';

export interface MaskBase {
  id: string;
  enabled: boolean;
}

export interface TransformMask extends MaskBase {
  type: 'transform';
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  shearX: number;
  shearY: number;
}

export interface ColorizeStroke {
  color: string;
  radius: number;
  points: VectorPoint[];
}

export interface ColorizeMask extends MaskBase {
  type: 'colorize';
  editStrokes: boolean;
  showOutput: boolean;
  gapClose: number;
  threshold: number;
  limitToLayerBounds: boolean;
  transparentColors: string[];
  strokes: ColorizeStroke[];
}

export interface FilterMask extends MaskBase {
  type: 'filter';
  filters: Array<{ kind: FilterKind; strength: number }>;
}

/** Editable layer effects stored as a first-class mask. */
export interface LayerStylesMask extends MaskBase {
  type: 'styles';
  styles: LayerStyles;
}

export type LayerMask = TransformMask | ColorizeMask | FilterMask | LayerStylesMask;

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

export interface ComicClipBounds { x: number; y: number; width: number; height: number }

export interface LayerManifest {
  id: string;
  type: LayerType;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number; // [0..1]
  blendMode: BlendMode;
  /** Editable, non-destructive layer effects; omitted in legacy 0.1.x documents. */
  layerStyles?: LayerStyles;
  /** Solo capas con superficie RGBA (pintura, relleno, archivo y vector). */
  pixelData?: { path: string; codec: 'deflate'; format: 'rgba8' };
  /** Datos de una capa de relleno de color. */
  fillColor?: string;
  /** Ajuste no destructivo aplicado a lo que hay debajo de esta capa. */
  filterKind?: FilterKind;
  filterStrength?: number; // [0..1]
  /** Metadatos de objetos vectoriales; la previsualización actual también se rasteriza. */
  vectorShapes?: VectorShape[];
  /** Límites de dibujo para una capa de viñeta de cómic. */
  comicClipBounds?: ComicClipBounds;
  /** Datos editables de una capa de texto; pixelData es su previsualización rasterizada. */
  textContent?: string;
  textX?: number;
  textY?: number;
  textFontFamily?: string;
  textFontSize?: number;
  textColor?: string;
  textStyle?: TextLayerStyle;
  textAlign?: TextLayerAlign;
  textLineHeight?: number;
  textLetterSpacing?: number;
  textStrokeColor?: string;
  textStrokeWidth?: number;
  textBackgroundColor?: string;
  /** Máscaras no destructivas asociadas a esta capa. Opcional para conservar compatibilidad. */
  masks?: LayerMask[];
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
  type === 'paint' || type === 'raster' || type === 'fill' || type === 'file' || type === 'vector' || type === 'text';
