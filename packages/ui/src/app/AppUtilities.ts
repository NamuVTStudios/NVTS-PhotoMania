// Shared utility functions used by the editor feature modules.
import { type LayerNode } from '@nvts/document-model';
import type { ComicConfig, ComicPageEntry } from '../features/comics/types';

export const COMIC_CONFIG_STORAGE_KEY = 'nvts-photomania-comic-config-v1';

export function safeComicFolderName(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/[<>:\"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 120);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}

export function safeComicFileName(value: string, fallback = 'comic-page.nvtsphoto'): string {
  let name = value.trim().replace(/[<>:\"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 200);
  if (!name) name = fallback.replace(/\.nvtsphoto$/i, '');
  if (!/\.nvtsphoto$/i.test(name)) name += '.nvtsphoto';
  return name;
}

export function defaultComicConfig(): ComicConfig {
  return {
    format: 'nvts-comic-config', version: 1, projectName: 'Mi cómic', projectDirectoryName: '', projectLocation: '',
    pagesDirectoryName: 'páginas', exportDirectoryName: 'exportación', title: 'Mi cómic', author: '', readingDirection: 'ltr',
    pageWidth: 1650, pageHeight: 2550, dpi: 300, bleedMm: 3, marginMm: 15, gutterMm: 5,
    facingPages: true, pages: [], updatedAt: Date.now(),
  };
}

export function validComicDimension(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 16384) return fallback;
  return Math.round(number);
}

export function normalizeComicPage(rawPage: unknown, index: number, base: ComicConfig): ComicPageEntry {
  const page = rawPage && typeof rawPage === 'object' ? rawPage as Partial<ComicPageEntry> : {};
  const number = validComicDimension(page.number, index + 1);
  return {
    id: typeof page.id === 'string' && page.id ? page.id : crypto.randomUUID(),
    number,
    name: typeof page.name === 'string' && page.name.trim() ? page.name.trim().slice(0, 160) : `Página ${number}`,
    fileName: typeof page.fileName === 'string' ? page.fileName.slice(0, 240) : `comic-page-${String(number).padStart(3, '0')}.nvtsphoto`,
    width: Math.min(8192, validComicDimension(page.width, base.pageWidth)),
    height: Math.min(8192, validComicDimension(page.height, base.pageHeight)),
    notes: typeof page.notes === 'string' ? page.notes.slice(0, 4000) : '',
  };
}

export function normalizeComicPages(rawPages: unknown[], base: ComicConfig): ComicPageEntry[] {
  return rawPages.slice(0, 1000).map((page, index) => normalizeComicPage(page, index, base));
}

export function normalizeComicConfig(input: unknown): ComicConfig {
  if (!input || typeof input !== 'object') throw new Error('El archivo no contiene una configuración de cómic válida.');
  const value = input as Partial<ComicConfig>;
  if (value.format !== 'nvts-comic-config' || value.version !== 1 || !Array.isArray(value.pages)) {
    throw new Error('El archivo debe ser una configuración NVTS de cómic (comicConfig.json, versión 1).');
  }
  const base = defaultComicConfig();
  const pages = normalizeComicPages(value.pages, base);
  return {
    ...base,
    projectName: typeof value.projectName === 'string' && value.projectName.trim() ? value.projectName.trim().slice(0, 160) : base.projectName,
    projectDirectoryName: typeof value.projectDirectoryName === 'string' ? safeComicFolderName(value.projectDirectoryName, '') : '',
    projectLocation: typeof value.projectLocation === 'string' ? value.projectLocation.slice(0, 320) : '',
    pagesDirectoryName: typeof value.pagesDirectoryName === 'string' ? safeComicFolderName(value.pagesDirectoryName, 'páginas') : base.pagesDirectoryName,
    exportDirectoryName: typeof value.exportDirectoryName === 'string' ? safeComicFolderName(value.exportDirectoryName, 'exportación') : base.exportDirectoryName,
    title: typeof value.title === 'string' && value.title.trim() ? value.title.trim().slice(0, 160) : base.title,
    author: typeof value.author === 'string' ? value.author.slice(0, 160) : '',
    readingDirection: value.readingDirection === 'rtl' ? 'rtl' : 'ltr',
    pageWidth: Math.min(8192, validComicDimension(value.pageWidth, base.pageWidth)), pageHeight: Math.min(8192, validComicDimension(value.pageHeight, base.pageHeight)),
    dpi: validComicDimension(value.dpi, base.dpi),
    bleedMm: Number.isFinite(Number(value.bleedMm)) ? Math.max(0, Math.min(100, Number(value.bleedMm))) : base.bleedMm,
    marginMm: Number.isFinite(Number(value.marginMm)) ? Math.max(0, Math.min(500, Number(value.marginMm))) : base.marginMm,
    gutterMm: Number.isFinite(Number(value.gutterMm)) ? Math.max(0, Math.min(500, Number(value.gutterMm))) : base.gutterMm,
    facingPages: value.facingPages !== false, pages, updatedAt: Date.now(),
  };
}

export function readComicConfig(): ComicConfig {
  try {
    const raw = localStorage.getItem(COMIC_CONFIG_STORAGE_KEY);
    return raw ? normalizeComicConfig(JSON.parse(raw)) : defaultComicConfig();
  } catch { return defaultComicConfig(); }
}

export const COMIC_HANDLE_DB = 'nvts-photomania-comic-project-handles-v1';

export const COMIC_HANDLE_STORE = 'handles';

export type DirectoryPickerWindow = Window & { showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> };

export function openComicHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB no está disponible en este navegador.')); return; }
    const request = indexedDB.open(COMIC_HANDLE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(COMIC_HANDLE_STORE)) request.result.createObjectStore(COMIC_HANDLE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir el almacenamiento del proyecto de cómic.'));
  });
}

export async function storeComicProjectDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openComicHandleDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(COMIC_HANDLE_STORE, 'readwrite');
    tx.objectStore(COMIC_HANDLE_STORE).put(handle, 'project-root');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo recordar la carpeta del proyecto.'));
    tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar la referencia a la carpeta.'));
  }).finally(() => db.close());
}

export async function readStoredComicProjectDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openComicHandleDatabase();
  try {
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(COMIC_HANDLE_STORE, 'readonly');
      const request = tx.objectStore(COMIC_HANDLE_STORE).get('project-root');
      request.onsuccess = () => resolve((request.result as FileSystemDirectoryHandle | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('No se pudo recuperar la carpeta del proyecto.'));
    });
  } finally { db.close(); }
}

export function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function writeFileHandleBytes(handle: FileSystemFileHandle, data: BlobPart): Promise<void> {
  const writable = await handle.createWritable();
  try { await writable.write(data); await writable.close(); }
  catch (error) { await writable.abort(); throw error; }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

export function documentNameFromFile(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() ?? fileName;
  return leaf.replace(/\.(nvtsphoto|png|jpe?g|webp|gif|bmp|tiff?)$/i, '').trim() || 'Sin título';
}

export const CANVAS_BLEND_OPERATIONS: Record<LayerNode['blendMode'], GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
};
