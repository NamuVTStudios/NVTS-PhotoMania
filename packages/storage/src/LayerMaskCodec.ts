import { isFilterKind, type LayerMask } from '@nvts/shared';

export function parseLayerMasks(value: unknown, layerName: string): LayerMask[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`Máscaras inválidas en "${layerName}"`);
  return value.map((candidate) => parseLayerMask(candidate, layerName));
}

function parseLayerMask(value: unknown, layerName: string): LayerMask {
  if (!value || typeof value !== 'object') throw new Error(`Máscara inválida en "${layerName}"`);
  const mask = value as Partial<LayerMask>;
  if (typeof mask.id !== 'string' || typeof mask.enabled !== 'boolean') throw new Error(`Metadatos de máscara inválidos en "${layerName}"`);
  if (mask.type === 'transform') return parseTransformMask(mask, layerName);
  if (mask.type === 'colorize') return parseColorizeMask(mask, layerName);
  if (mask.type === 'filter') return parseFilterMask(mask, layerName);
  throw new Error(`Tipo de máscara no soportado en "${layerName}"`);
}

function parseTransformMask(mask: Partial<LayerMask>, layerName: string): Extract<LayerMask, { type: 'transform' }> {
  const transform = mask as Partial<Extract<LayerMask, { type: 'transform' }>>;
  const values = [transform.offsetX, transform.offsetY, transform.scaleX, transform.scaleY, transform.rotation, transform.shearX, transform.shearY];
  if (!values.every(Number.isFinite) || transform.scaleX === 0 || transform.scaleY === 0) throw new Error(`Transformación inválida en "${layerName}"`);
  return { ...transform, type: 'transform', id: mask.id!, enabled: mask.enabled! } as Extract<LayerMask, { type: 'transform' }>;
}

function parseColorizeMask(mask: Partial<LayerMask>, layerName: string): Extract<LayerMask, { type: 'colorize' }> {
  const colorize = mask as Partial<Extract<LayerMask, { type: 'colorize' }>>;
  if (!Array.isArray(colorize.strokes) || !colorize.strokes.every(isValidColorizeStroke) || !Array.isArray(colorize.transparentColors)) {
    throw new Error(`Datos de colorización inválidos en "${layerName}"`);
  }
  if (![colorize.gapClose, colorize.threshold].every(Number.isFinite) || typeof colorize.editStrokes !== 'boolean' || typeof colorize.showOutput !== 'boolean') {
    throw new Error(`Opciones de colorización inválidas en "${layerName}"`);
  }
  if (typeof colorize.limitToLayerBounds !== 'boolean') throw new Error(`Límites de colorización inválidos en "${layerName}"`);
  return { ...colorize, type: 'colorize', id: mask.id!, enabled: mask.enabled! } as Extract<LayerMask, { type: 'colorize' }>;
}

function parseFilterMask(mask: Partial<LayerMask>, layerName: string): Extract<LayerMask, { type: 'filter' }> {
  const filterMask = mask as Partial<Extract<LayerMask, { type: 'filter' }>>;
  if (!Array.isArray(filterMask.filters) || !filterMask.filters.every(isValidFilter)) {
    throw new Error(`Filtros de máscara inválidos en "${layerName}"`);
  }
  return { ...filterMask, type: 'filter', id: mask.id!, enabled: mask.enabled! } as Extract<LayerMask, { type: 'filter' }>;
}

function isValidColorizeStroke(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const stroke = value as { color?: unknown; radius?: unknown; points?: unknown };
  return typeof stroke.color === 'string' && Number.isFinite(stroke.radius) && Number(stroke.radius) > 0
    && Array.isArray(stroke.points) && stroke.points.every(isValidColorizePoint);
}

function isValidColorizePoint(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const point = value as { x?: unknown; y?: unknown };
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isValidFilter(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const filter = value as { kind?: unknown; strength?: unknown };
  return isFilterKind(filter.kind) && Number.isFinite(filter.strength)
    && Number(filter.strength) >= 0 && Number(filter.strength) <= 1;
}
