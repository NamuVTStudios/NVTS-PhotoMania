// NvtsPhotoIO.ts — Guardar/abrir archivos .nvtsphoto (ZIP) con fflate + File System Access API.
// Desacoplado del motor: al guardar recibe una función que lee los píxeles de cada capa
// (DocumentController.readPixels) y al abrir devuelve los blobs para que el controlador los cargue.
// Dependencias: `pnpm add fflate` y `pnpm add -D @types/wicg-file-system-access`.
// Nota: zipSync/unzipSync son síncronos; con imágenes grandes conviene moverlos a un Worker.

import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import { NVTS_FORMAT, NVTS_VERSION, isPixelLayerType, type LayerManifest, type NvtsManifest, type LayerType } from '@nvts/shared';
import type { DocumentState, LayerNode, UnpackedDocument } from '@nvts/document-model';

const MAX_ENTRY_BYTES = 1 << 30; // 1 GiB por entrada: defensa básica contra "zip bombs"
type UnzippedFiles = ReturnType<typeof unzipSync>;
type LayerUnpackContext = { files: UnzippedFiles; expectedPixelBytes: number; pixels: Map<string, Uint8Array> };
const PICKER_TYPES = [{
  description: 'NVTS Photomania',
  accept: { 'application/x-nvtsphoto': ['.nvtsphoto' as const] },
}];

/** Devuelve los píxeles RGBA8 (ancho*alto*4) de una capa raster, o null si está vacía. */
export type PixelReader = (layer: LayerNode) => Uint8Array | null;

/* ───────────── 1. SERIALIZAR ───────────── */

function createLayerManifest(layer: LayerNode): LayerManifest {
  return {
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
    ...(layer.textContent !== undefined ? { textContent: layer.textContent } : {}),
    ...(layer.textX !== undefined ? { textX: layer.textX } : {}),
    ...(layer.textY !== undefined ? { textY: layer.textY } : {}),
    ...(layer.textFontFamily ? { textFontFamily: layer.textFontFamily } : {}),
    ...(layer.textFontSize !== undefined ? { textFontSize: layer.textFontSize } : {}),
    ...(layer.textColor ? { textColor: layer.textColor } : {}),
    ...(layer.textStyle ? { textStyle: layer.textStyle } : {}),
    ...(layer.textAlign ? { textAlign: layer.textAlign } : {}),
    ...(layer.textLineHeight !== undefined ? { textLineHeight: layer.textLineHeight } : {}),
    ...(layer.textLetterSpacing !== undefined ? { textLetterSpacing: layer.textLetterSpacing } : {}),
    ...(layer.textStrokeColor ? { textStrokeColor: layer.textStrokeColor } : {}),
    ...(layer.textStrokeWidth !== undefined ? { textStrokeWidth: layer.textStrokeWidth } : {}),
    ...(layer.textBackgroundColor ? { textBackgroundColor: layer.textBackgroundColor } : {}),
  };
}

function attachLayerPixels(layer: LayerNode, manifest: LayerManifest, blobs: Zippable, read: PixelReader): void {
  if (!isPixelLayerType(layer.type)) return;
  const pixels = read(layer);
  if (!pixels) return;
  const path = `layers/${layer.id}/pixels.rgba`;
  blobs[path] = [pixels, { level: 1 }];
  manifest.pixelData = { path, codec: 'deflate', format: 'rgba8' };
}

function layerToManifest(layer: LayerNode, blobs: Zippable, read: PixelReader): LayerManifest {
  const manifest = createLayerManifest(layer);
  attachLayerPixels(layer, manifest, blobs, read);
  if (layer.type === 'group') manifest.children = layer.children.map((child) => layerToManifest(child, blobs, read));
  return manifest;
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

function createLayerFromManifest(manifest: LayerManifest): LayerNode {
  return {
    id: String(manifest.id), engineId: 0, type: (manifest.type === 'raster' ? 'paint' : manifest.type) as LayerType,
    name: String(manifest.name ?? 'Capa'), visible: !!manifest.visible, locked: !!manifest.locked,
    opacity: Math.min(1, Math.max(0, Number(manifest.opacity) || 0)),
    blendMode: manifest.blendMode ?? 'normal',
    fillColor: manifest.fillColor,
    filterKind: manifest.filterKind,
    filterStrength: typeof manifest.filterStrength === 'number' ? Math.min(1, Math.max(0, manifest.filterStrength)) : undefined,
    vectorShapes: Array.isArray(manifest.vectorShapes)
      ? manifest.vectorShapes.map((shape) => ({ ...shape, points: shape.points?.map((point) => ({ ...point })) }))
      : undefined,
    sourceName: manifest.sourceName, sourceLinkId: manifest.sourceLinkId,
    sourceLastModified: manifest.sourceLastModified, sourceFileSize: manifest.sourceFileSize,
    textContent: manifest.textContent, textX: manifest.textX, textY: manifest.textY,
    textFontFamily: manifest.textFontFamily, textFontSize: manifest.textFontSize, textColor: manifest.textColor,
    textStyle: manifest.textStyle, textAlign: manifest.textAlign, textLineHeight: manifest.textLineHeight,
    textLetterSpacing: manifest.textLetterSpacing, textStrokeColor: manifest.textStrokeColor,
    textStrokeWidth: manifest.textStrokeWidth, textBackgroundColor: manifest.textBackgroundColor,
    children: [],
  };
}

function attachUnpackedLayerPixels(layer: LayerNode, manifest: LayerManifest, context: LayerUnpackContext): void {
  if (!manifest.pixelData) return;
  const data = context.files[manifest.pixelData.path];
  if (!data) throw new Error(`Falta el blob de píxeles de "${manifest.name}"`);
  if (data.byteLength !== context.expectedPixelBytes) throw new Error(`Tamaño de píxeles inválido en "${manifest.name}"`);
  context.pixels.set(layer.id, data);
}

function buildUnpackedLayer(manifest: LayerManifest, context: LayerUnpackContext): LayerNode {
  const node = createLayerFromManifest(manifest);
  attachUnpackedLayerPixels(node, manifest, context);
  if (node.type === 'group') {
    node.children = (manifest.children ?? []).map((child) => buildUnpackedLayer(child, context));
  }
  return node;
}

/** Lee un .nvtsphoto: devuelve la estructura y los blobs de píxeles (no toca el motor). */
export function unpackNvtsPhoto(bytes: Uint8Array): UnpackedDocument {
  const files = unzipSync(bytes, { filter: (file) => file.originalSize <= MAX_ENTRY_BYTES });
  const manifest = readAndValidateManifest(files);
  const { width, height } = manifest.document;
  const pixels = new Map<string, Uint8Array>();
  const context: LayerUnpackContext = { files, expectedPixelBytes: width * height * 4, pixels };
  const layers = manifest.layers.map((layer) => buildUnpackedLayer(layer, context));
  const doc: DocumentState = {
    id: manifest.document.id,
    name: manifest.document.name,
    width,
    height,
    layers,
  };
  return { doc, pixels };
}

function readAndValidateManifest(files: UnzippedFiles): NvtsManifest {
  const raw = files['manifest.json'];
  if (!raw) throw new Error('Falta manifest.json');
  const manifest = JSON.parse(strFromU8(raw)) as NvtsManifest;
  validate(manifest);
  return manifest;
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
  if (!hasFSA()) {
    downloadDocument(doc, read);
    return null;
  }
  const handle = existing ?? await chooseSaveHandle(doc);
  if (!handle) return null;
  await writeDocumentToHandle(doc, read, handle);
  return handle;
}

function downloadDocument(doc: DocumentState, read: PixelReader): void {
  const data = packNvtsPhoto(doc, read);
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/x-nvtsphoto' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `${doc.name}.nvtsphoto` });
  link.click();
  URL.revokeObjectURL(url);
}

async function chooseSaveHandle(doc: DocumentState): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker({ suggestedName: `${doc.name}.nvtsphoto`, types: PICKER_TYPES });
  } catch (error) {
    return handlePickerFailure(error);
  }
}

function handlePickerFailure(error: unknown): null {
  if (isAbort(error)) return null;
  throw error;
}

async function writeDocumentToHandle(doc: DocumentState, read: PixelReader, handle: FileSystemFileHandle): Promise<void> {
  updateDocumentNameFromHandle(doc, handle);
  const data = packNvtsPhoto(doc, read);
  const writable = await handle.createWritable();
  try {
    await writable.write(data as BlobPart);
    await writable.close();
  } catch (error) {
    await writable.abort();
    throw error;
  }
}

function updateDocumentNameFromHandle(doc: DocumentState, handle: FileSystemFileHandle): void {
  const diskName = handle.name.replace(/\.nvtsphoto$/i, '').trim();
  if (diskName) doc.name = diskName;
}

/** Abre un .nvtsphoto del disco. Devuelve null si el usuario cancela. */
export async function openFromDisk(): Promise<(UnpackedDocument & { handle: FileSystemFileHandle | null; bytes: Uint8Array; fileName: string }) | null> {
  const picked = await chooseNvtsFile();
  if (!picked) return null;
  const bytes = new Uint8Array(await picked.file.arrayBuffer());
  const unpacked = unpackNvtsPhoto(bytes);
  updateDocumentNameFromFile(unpacked.doc, picked.file);
  return { ...unpacked, handle: picked.handle, bytes, fileName: picked.file.name };
}

async function chooseNvtsFile(): Promise<{ handle: FileSystemFileHandle | null; file: File } | null> {
  if (!hasFSA()) {
    const file = await chooseNvtsFileWithInput();
    return file ? { handle: null, file } : null;
  }
  try {
    const [handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false });
    return { handle, file: await handle.getFile() };
  } catch (error) {
    return handlePickerFailure(error);
  }
}

function chooseNvtsFileWithInput(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.nvtsphoto' });
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

function updateDocumentNameFromFile(doc: DocumentState, file: File): void {
  const fileName = file.name.replace(/\.nvtsphoto$/i, '').trim();
  if (fileName) doc.name = fileName;
}
