// NvtsPhotoIO.ts — Guardar/abrir archivos .nvtsphoto (ZIP) con fflate + File System Access API.
// Desacoplado del motor: al guardar recibe una función que lee los píxeles de cada capa
// (DocumentController.readPixels) y al abrir devuelve los blobs para que el controlador los cargue.
// Dependencias: `pnpm add fflate` y `pnpm add -D @types/wicg-file-system-access`.
// Nota: zipSync/unzipSync son síncronos; con imágenes grandes conviene moverlos a un Worker.

import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import { NVTS_FORMAT, NVTS_VERSION, isPixelLayerType, type LayerManifest, type NvtsManifest, type LayerType } from '@nvts/shared';
import type { DocumentState, LayerNode, UnpackedDocument } from '@nvts/document-model';

const MAX_ENTRY_BYTES = 1 << 30; // 1 GiB por entrada: defensa básica contra "zip bombs"
const PICKER_TYPES = [{
  description: 'NVTS Photomania',
  accept: { 'application/x-nvtsphoto': ['.nvtsphoto' as const] },
}];

/** Devuelve los píxeles RGBA8 (ancho*alto*4) de una capa raster, o null si está vacía. */
export type PixelReader = (layer: LayerNode) => Uint8Array | null;

/* ───────────── 1. SERIALIZAR ───────────── */

function layerToManifest(layer: LayerNode, blobs: Zippable, read: PixelReader): LayerManifest {
  const m: LayerManifest = {
    id: layer.id, type: layer.type, name: layer.name, visible: layer.visible,
    locked: layer.locked, opacity: layer.opacity, blendMode: layer.blendMode,
    ...(layer.fillColor ? { fillColor: layer.fillColor } : {}),
    ...(layer.filterKind ? { filterKind: layer.filterKind } : {}),
    ...(layer.filterStrength !== undefined ? { filterStrength: layer.filterStrength } : {}),
    ...(layer.vectorShapes ? { vectorShapes: layer.vectorShapes.map((shape) => ({ ...shape, points: shape.points?.map((point) => ({ ...point })) })) } : {}),
    ...(layer.sourceName ? { sourceName: layer.sourceName } : {}),
    ...(layer.sourceLinkId ? { sourceLinkId: layer.sourceLinkId } : {}),
    ...(layer.sourceLastModified !== undefined ? { sourceLastModified: layer.sourceLastModified } : {}),
    ...(layer.sourceFileSize !== undefined ? { sourceFileSize: layer.sourceFileSize } : {}),
  };
  if (isPixelLayerType(layer.type)) {
    const px = read(layer);
    if (px) {
      const path = `layers/${layer.id}/pixels.rgba`;
      blobs[path] = [px, { level: 1 }];
      m.pixelData = { path, codec: 'deflate', format: 'rgba8' };
    }
  }
  if (layer.type === 'group') m.children = layer.children.map((c) => layerToManifest(c, blobs, read));
  return m;
}

/** Empaqueta el documento completo en un ZIP (.nvtsphoto). */
export function packNvtsPhoto(doc: DocumentState, read: PixelReader): Uint8Array {
  const blobs: Zippable = {};
  const manifest: NvtsManifest = {
    format: NVTS_FORMAT,
    version: NVTS_VERSION,
    generator: 'NVTS Photomania 0.1.0',
    document: { id: doc.id, name: doc.name, width: doc.width, height: doc.height, colorSpace: 'sRGB', bitDepth: 8 },
    layers: doc.layers.map((l) => layerToManifest(l, blobs, read)),
    extensions: {},
  };
  return zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), ...blobs });
}

/* ───────────── 2. DESERIALIZAR ───────────── */

function validate(m: NvtsManifest): void {
  if (m?.format !== NVTS_FORMAT) throw new Error('No es un archivo .nvtsphoto');
  if (m.version.split('.')[0] !== NVTS_VERSION.split('.')[0]) {
    throw new Error(`Versión ${m.version} no soportada (actual ${NVTS_VERSION})`);
  }
  const { width: w, height: h } = m.document;
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 16384 || h > 16384) {
    throw new Error('Dimensiones de documento inválidas');
  }
}

/** Lee un .nvtsphoto: devuelve la estructura y los blobs de píxeles (no toca el motor). */
export function unpackNvtsPhoto(bytes: Uint8Array): UnpackedDocument {
  const files = unzipSync(bytes, { filter: (f) => f.originalSize <= MAX_ENTRY_BYTES });
  const raw = files['manifest.json'];
  if (!raw) throw new Error('Falta manifest.json');

  const manifest = JSON.parse(strFromU8(raw)) as NvtsManifest;
  validate(manifest);
  const { width, height } = manifest.document;
  const expected = width * height * 4;
  const pixels = new Map<string, Uint8Array>();

  const build = (m: LayerManifest): LayerNode => {
    const node: LayerNode = {
      id: String(m.id), engineId: 0, type: (m.type === 'raster' ? 'paint' : m.type) as LayerType,
      name: String(m.name ?? 'Capa'), visible: !!m.visible, locked: !!m.locked,
      opacity: Math.min(1, Math.max(0, Number(m.opacity) || 0)),
      blendMode: m.blendMode ?? 'normal',
      fillColor: m.fillColor, filterKind: m.filterKind,
      filterStrength: typeof m.filterStrength === 'number' ? Math.min(1, Math.max(0, m.filterStrength)) : undefined,
      vectorShapes: Array.isArray(m.vectorShapes) ? m.vectorShapes.map((shape) => ({ ...shape, points: shape.points?.map((point) => ({ ...point })) })) : undefined,
      sourceName: m.sourceName, sourceLinkId: m.sourceLinkId, sourceLastModified: m.sourceLastModified, sourceFileSize: m.sourceFileSize, children: [],
    };
    if (m.pixelData) {
      const data = files[m.pixelData.path]; // solo búsqueda por clave: nunca se escribe a disco
      if (!data) throw new Error(`Falta el blob de píxeles de "${m.name}"`);
      if (data.byteLength !== expected) throw new Error(`Tamaño de píxeles inválido en "${m.name}"`);
      pixels.set(node.id, data);
    }
    if (node.type === 'group') node.children = (m.children ?? []).map(build);
    return node;
  };

  const doc: DocumentState = {
    id: manifest.document.id, name: manifest.document.name, width, height,
    layers: manifest.layers.map(build),
  };
  return { doc, pixels };
}

/* ───────────── 3. DISCO (File System Access API + fallback) ───────────── */

export const supportsFileSystemAccess = () => 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
const hasFSA = supportsFileSystemAccess;
const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

/**
 * Guarda el documento. Pasa el handle devuelto la 1ª vez para "Guardar" sin diálogo;
 * omítelo para "Guardar como". Devuelve null si el usuario cancela o si se usó la descarga clásica.
 */
export async function saveToDisk(
  doc: DocumentState,
  read: PixelReader,
  existing?: FileSystemFileHandle,
): Promise<FileSystemFileHandle | null> {
  if (!hasFSA()) { // Firefox/Safari: descarga clásica
    const data = packNvtsPhoto(doc, read);
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/x-nvtsphoto' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${doc.name}.nvtsphoto` });
    a.click();
    URL.revokeObjectURL(url);
    return null;
  }

  let handle = existing;
  if (!handle) {
    try {
      handle = await window.showSaveFilePicker({ suggestedName: `${doc.name}.nvtsphoto`, types: PICKER_TYPES });
    } catch (e) { if (isAbort(e)) return null; throw e; }
  }

  // El nombre del documento y el manifest deben coincidir con el archivo real elegido.
  const diskName = handle.name.replace(/\.nvtsphoto$/i, '').trim();
  if (diskName) doc.name = diskName;
  const data = packNvtsPhoto(doc, read);
  const writable = await handle.createWritable(); // escribe en temporal; close() lo confirma de forma atómica
  try {
    await writable.write(data as BlobPart);
    await writable.close();
  } catch (e) { await writable.abort(); throw e; }
  return handle;
}

/** Abre un .nvtsphoto del disco. Devuelve null si el usuario cancela. */
export async function openFromDisk(): Promise<(UnpackedDocument & { handle: FileSystemFileHandle | null; bytes: Uint8Array; fileName: string }) | null> {
  let handle: FileSystemFileHandle | null = null;
  let file: File;

  if (hasFSA()) {
    try {
      [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
    } catch (e) { if (isAbort(e)) return null; throw e; }
    file = await handle.getFile();
  } else { // Fallback con <input type="file">
    const picked = await new Promise<File | null>((resolve) => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.nvtsphoto' });
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.oncancel = () => resolve(null);
      input.click();
    });
    if (!picked) return null;
    file = picked;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const unpacked = unpackNvtsPhoto(bytes);
  // El nombre del archivo en el sistema tiene prioridad sobre el nombre antiguo del manifest.
  const fileName = file.name.replace(/\.nvtsphoto$/i, '').trim();
  if (fileName) unpacked.doc.name = fileName;
  return { ...unpacked, handle, bytes, fileName: file.name };
}
