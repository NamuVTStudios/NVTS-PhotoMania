import type { LayerManifest, LayerType, NvtsManifest } from '@nvts/shared';

type ManifestRecord = Record<string, unknown>;
type FormatVersion = { major: number; minor: number; patch: number; source: string };

const SUPPORTED_LAYER_TYPES = new Set<LayerType>([
  'paint', 'filter', 'fill', 'file', 'vector', 'text', 'group', 'raster',
]);

function isRecord(value: unknown): value is ManifestRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseFormatVersion(value: unknown): FormatVersion {
  if (typeof value !== 'string') throw new Error('Versión de formato inválida');
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`Versión de formato inválida: ${value}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    source: value,
  };
}

function normalizeLayerManifest(value: unknown): LayerManifest {
  if (!isRecord(value)) throw new Error('Estructura de capa inválida en el manifiesto');
  const rawType = value.type;
  if (typeof rawType !== 'string' || !SUPPORTED_LAYER_TYPES.has(rawType as LayerType)) {
    throw new Error(`Tipo de capa no soportado: ${String(rawType)}`);
  }
  if (value.children !== undefined && !Array.isArray(value.children)) {
    throw new Error(`Subcapas inválidas en "${String(value.name ?? 'Capa')}"`);
  }
  const layer = value as unknown as LayerManifest;
  return {
    ...layer,
    type: rawType === 'raster' ? 'paint' : rawType as LayerType,
    ...(Array.isArray(value.children)
      ? { children: value.children.map(normalizeLayerManifest) }
      : {}),
  };
}

/**
 * Normaliza manifiestos compatibles antes de construir el documento.
 * La serie 0.1.x mantiene el mismo esquema; una nueva serie minor/major
 * requiere una migración explícita en lugar de aceptar datos desconocidos.
 */
export function migrateNvtsPhotoManifest(
  value: unknown,
  expectedFormat: string,
  currentVersion: string,
): NvtsManifest {
  if (!isRecord(value) || value.format !== expectedFormat) {
    throw new Error('No es un archivo .nvtsphoto');
  }

  const version = parseFormatVersion(value.version);
  const current = parseFormatVersion(currentVersion);
  if (version.major !== current.major || version.minor !== current.minor) {
    throw new Error(
      `Versión ${version.source} no soportada (actual ${currentVersion}); se admite ${current.major}.${current.minor}.x`,
    );
  }

  if (!isRecord(value.document)) throw new Error('Metadatos de documento inválidos');
  const width = value.document.width;
  const height = value.document.height;
  if (typeof width !== 'number' || typeof height !== 'number'
    || !Number.isInteger(width) || !Number.isInteger(height)
    || width < 1 || height < 1 || width > 16384 || height > 16384) {
    throw new Error('Dimensiones de documento inválidas');
  }
  if (!Array.isArray(value.layers)) throw new Error('Lista de capas inválida en el manifiesto');

  return {
    ...value,
    generator: typeof value.generator === 'string' ? value.generator : 'NVTS PhotoMania (archivo compatible)',
    document: value.document as NvtsManifest['document'],
    layers: value.layers.map(normalizeLayerManifest),
    extensions: isRecord(value.extensions) ? value.extensions : {},
  } as NvtsManifest;
}
