// App.ts — Ensambla todo: motor Wasm + renderer (WebGPU/WebGL2) + documento + guardado + UI.
// Todo corre en el hilo principal por ahora (mover el motor a un Worker es un paso posterior).
// Opciones de herramienta por contexto; el panel avanzado cambia según la herramienta activa.

import { WasmRuntimeManager, type EngineClient, type TiledLayer } from '@nvts/wasm-bindings';
import { createRenderer, type RendererBackend } from '@nvts/renderer';
import { applyBrushStamp, blendImageData, colorizePixels, createFilterCanvasPools, expandFilterTile, forEachFilterTile, readFilterTilePixels, renderFilteredImage, type FilterCanvasPools, type FilterTile, type StampOperation } from '@nvts/image-processing';
import { containsEnabledMask, containsLayerType, findTopRasterLayer, DocumentController, StrokeSession, refresh, runEdit, type EngineCtx, type LayerNode } from '@nvts/document-model';
import { cloneVectorShape, cloneVectorShapes, FILTER_KINDS, getLayerMaskLabel, isPixelLayerType, type BlendMode, type ColorizeStroke, type FilterKind, type LayerMask, type LayerType, type VectorShape, type TextLayerStyle, type TextLayerAlign } from '@nvts/shared';
import { ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE, renderAdvancedToolOptionsPanel } from './panels/AdvancedToolOptionsPanel';
import { AppManager } from './managers/AppManager';
import { ComicProjectManager } from './managers/ComicProjectManager';
import { DocumentLifecycleManager } from './managers/DocumentLifecycleManager';
import { ToolManager, type ToolId } from './managers/ToolManager';
import { UIManager } from './managers/UIManager';
import { WorkspaceManager } from './managers/WorkspaceManager';
import { HISTORY_PANEL_TEMPLATE, renderHistoryPanel } from './panels/HistoryPanel';
import { LAYERS_PANEL_TEMPLATE, renderLayersPanel, wireLayersPanel } from './panels/LayersPanel';
import { renderLayerMaskEditor } from './panels/LayerMaskEditor';
import { COMIC_MANAGER_PANEL_TEMPLATE, renderComicManagerPanel } from './panels/ComicManagerPanel';
import type { ComicConfig, ComicPageEntry } from './features/comics/types';
import { STORYBOARD_PANEL_TEMPLATE } from './panels/StoryboardPanel';
import { ANIMATION_TIMELINE_PANEL_TEMPLATE } from './panels/AnimationTimelinePanel';
import { LAYER_EFFECTS_PANEL_TEMPLATE, wireLayerEffectsPanel, type LayerEffectsPanelController } from './panels/LayerEffectsPanel';
import { FILTER_PANEL_TEMPLATE, wireFilterPanel, type FilterPanelController } from './panels/FilterPanel';
import { FILTER_LABELS } from './panels/FilterCatalog';
import { VECTOR_EDITOR_PANEL_TEMPLATE, wireVectorEditorPanel, renderVectorEditorPanel } from './panels/VectorEditorPanel';
import { PLUGINS_PANEL_TEMPLATE, wirePlugins, type PluginApi } from './panels/PluginsPanel';
import { PREFERENCES_PANEL_TEMPLATE, readPreferences, wirePreferences, type AppPreferences } from './panels/PreferencesPanel';
import { LOGO_URL, MAIN_MENU } from './components/ShellTemplates';
import { exportVectorShapeToSvg, renderVectorShape } from '@nvts/vector';
import { createDockLayoutManager, type DockLayoutController } from './managers/DockLayoutManager';
import { openFromDisk, packNvtsPhoto, saveToDisk, unpackNvtsPhoto, rememberRecentProject, supportsFileSystemAccess, rememberLinkedFile, getLinkedFile } from '@nvts/storage';
import type { WorkspaceDefinition, WorkspaceId } from './workspaces';

type Tool = ToolId;
type ToolSettings = { size: number; opacity: number; hardness: number; spacing: number; smoothing: number; tolerance: number; contiguous: boolean; sampleMerged: boolean; shapeFill: boolean; lineCap: CanvasLineCap; lineJoin: CanvasLineJoin };
type FillOperation = {
  width: number;
  height: number;
  original: Uint8Array;
  reference: Uint8Array;
  seedX: number;
  seedY: number;
  seedColor: readonly [number, number, number, number];
  tolerance: number;
  color: readonly [number, number, number];
  opacity: number;
  contiguous: boolean;
};
type FillResult = {
  pixels: Uint8Array;
  filled: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};
type WorkspacePanelElements = {
  advanced: HTMLElement;
  history: HTMLElement;
  layers: HTMLElement;
  comic: HTMLElement;
  storyboard: HTMLElement;
  timeline: HTMLElement;
  dock: HTMLElement;
};
type PixelRegion = { left: number; top: number; width: number; height: number };
type LayerContextAction = [string, () => void];
type LayerBehavior = {
  edit(layer: LayerNode): void;
  contextActions(layer: LayerNode): LayerContextAction[];
};
interface TextToolSettings { fontFamily: string; fontSize: number; style: TextLayerStyle; color: string; align: TextLayerAlign; lineHeight: number; letterSpacing: number; strokeColor: string; strokeWidth: number; backgroundColor: string }

const COMIC_CONFIG_STORAGE_KEY = 'nvts-photomania-comic-config-v1';

function safeComicFolderName(value: string, fallback: string): string {
  const cleaned = value.trim().replace(/[<>:\"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 120);
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned : fallback;
}
function safeComicFileName(value: string, fallback = 'comic-page.nvtsphoto'): string {
  let name = value.trim().replace(/[<>:\"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '').slice(0, 200);
  if (!name) name = fallback.replace(/\.nvtsphoto$/i, '');
  if (!/\.nvtsphoto$/i.test(name)) name += '.nvtsphoto';
  return name;
}
function defaultComicConfig(): ComicConfig {
  return {
    format: 'nvts-comic-config', version: 1, projectName: 'Mi cómic', projectDirectoryName: '', projectLocation: '',
    pagesDirectoryName: 'páginas', exportDirectoryName: 'exportación', title: 'Mi cómic', author: '', readingDirection: 'ltr',
    pageWidth: 1650, pageHeight: 2550, dpi: 300, bleedMm: 3, marginMm: 15, gutterMm: 5,
    facingPages: true, pages: [], updatedAt: Date.now(),
  };
}
function validComicDimension(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1 || number > 16384) return fallback;
  return Math.round(number);
}

function normalizeComicPage(rawPage: unknown, index: number, base: ComicConfig): ComicPageEntry {
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

function normalizeComicPages(rawPages: unknown[], base: ComicConfig): ComicPageEntry[] {
  return rawPages.slice(0, 1000).map((page, index) => normalizeComicPage(page, index, base));
}

function normalizeComicConfig(input: unknown): ComicConfig {
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
function readComicConfig(): ComicConfig {
  try {
    const raw = localStorage.getItem(COMIC_CONFIG_STORAGE_KEY);
    return raw ? normalizeComicConfig(JSON.parse(raw)) : defaultComicConfig();
  } catch { return defaultComicConfig(); }
}

const COMIC_HANDLE_DB = 'nvts-photomania-comic-project-handles-v1';
const COMIC_HANDLE_STORE = 'handles';
type DirectoryPickerWindow = Window & { showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> };

function openComicHandleDatabase(): Promise<IDBDatabase> {
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
async function storeComicProjectDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openComicHandleDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(COMIC_HANDLE_STORE, 'readwrite');
    tx.objectStore(COMIC_HANDLE_STORE).put(handle, 'project-root');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('No se pudo recordar la carpeta del proyecto.'));
    tx.onabort = () => reject(tx.error ?? new Error('No se pudo guardar la referencia a la carpeta.'));
  }).finally(() => db.close());
}
async function readStoredComicProjectDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
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
function copyBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function writeFileHandleBytes(handle: FileSystemFileHandle, data: BlobPart): Promise<void> {
  const writable = await handle.createWritable();
  try { await writable.write(data); await writable.close(); }
  catch (error) { await writable.abort(); throw error; }
}
function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

const FILTER_TILE_PADDING_BY_KIND: Partial<Record<FilterKind, number>> = {
  blur: 36,
  pixelate: 32,
  sharpen: 1,
  'edge-detect': 1,
};

function getFilterKindTilePadding(kind: FilterKind): number {
  return FILTER_TILE_PADDING_BY_KIND[kind] ?? 0;
}

function documentNameFromFile(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() ?? fileName;
  return leaf.replace(/\.(nvtsphoto|png|jpe?g|webp|gif|bmp|tiff?)$/i, '').trim() || 'Sin título';
}

const CANVAS_BLEND_OPERATIONS: Record<LayerNode['blendMode'], GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
};

const TEMPLATE = `
<header class="topbar">
  <div class="brand"><img class="app-logo" src="${LOGO_URL}" alt="NVTS PhotoMania"/><strong>PhotoMania</strong></div>
  ${MAIN_MENU}
  <div class="doc-title">Sin título <small id="doc-size">1280 × 720</small></div>
</header>
<div class="tool-options"><strong id="tool-current-label">Pincel</strong><div id="toolbar" class="toolbar"></div><span id="status" role="status"></span></div>
<main class="workspace">
  <aside class="tools-rail" aria-label="Herramientas">
    <button id="rail-hand" aria-label="Mover lienzo" title="Mover lienzo (H / barra espaciadora)"><span class="tool-icon tool-icon--hand" aria-hidden="true"></span></button>
    <button id="rail-brush" class="selected" aria-label="Pincel" title="Pincel (B)"><span class="tool-icon tool-icon--brush" aria-hidden="true"></span></button>
    <button id="rail-eraser" aria-label="Borrador" title="Borrador (E)"><span class="tool-icon tool-icon--eraser" aria-hidden="true"></span></button>
    <button id="rail-line" aria-label="Línea" title="Línea (L)"><span class="tool-icon tool-icon--line" aria-hidden="true"></span></button>
    <button id="rail-rectangle" aria-label="Rectángulo" title="Rectángulo (R)"><span class="tool-icon tool-icon--rectangle" aria-hidden="true"></span></button>
    <button id="rail-ellipse" aria-label="Elipse" title="Elipse (O)"><span class="tool-icon tool-icon--ellipse" aria-hidden="true"></span></button>
    <button id="rail-fill" aria-label="Bote de pintura" title="Relleno (G)"><span class="tool-icon tool-icon--fill" aria-hidden="true"></span></button>
    <button id="rail-eyedropper" aria-label="Cuentagotas" title="Cuentagotas (I)"><span class="tool-icon tool-icon--eyedropper" aria-hidden="true"></span></button>
    <button id="rail-text" aria-label="Texto" title="Texto (T)"><span class="tool-icon tool-icon--text" aria-hidden="true"></span></button>
    <button id="rail-vector-select" aria-label="Seleccionar objeto vectorial" title="Seleccionar objeto vectorial (V)"><span class="tool-icon tool-icon--vector-select" aria-hidden="true"></span></button>
    <div class="swatches"><span id="foreground-swatch"></span><span></span></div>
  </aside>
  <section class="canvas-area"><div class="canvas-label"><span id="canvas-name">Sin título</span><span id="canvas-meta">1280 × 720 px · RGB/8</span></div><div class="canvas-stage"><canvas id="canvas"></canvas><canvas id="tool-preview" aria-hidden="true"></canvas></div><div class="zoom-controls"><button id="zoom-out" title="Alejar" aria-label="Alejar"><span class="tool-icon tool-icon--zoom-out" aria-hidden="true"></span></button><span id="zoom-value">Ajustar</span><button id="zoom-in" title="Acercar" aria-label="Acercar"><span class="tool-icon tool-icon--zoom-in" aria-hidden="true"></span></button><button id="zoom-fit" title="Ajustar al lienzo"><span class="tool-icon tool-icon--zoom-fit" aria-hidden="true"></span><span>Ajustar</span></button></div></section>
  <aside class="right-dock">
${ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE}
${HISTORY_PANEL_TEMPLATE}
${LAYERS_PANEL_TEMPLATE}
${COMIC_MANAGER_PANEL_TEMPLATE}
${STORYBOARD_PANEL_TEMPLATE}
${ANIMATION_TIMELINE_PANEL_TEMPLATE}
${LAYER_EFFECTS_PANEL_TEMPLATE}
${FILTER_PANEL_TEMPLATE}
  </aside>
  <aside class="animation-timeline-dock" aria-label="Panel inferior de animación"></aside>
</main>
${VECTOR_EDITOR_PANEL_TEMPLATE}`;

export class App {
  private ctl!: DocumentController;
  private ctx!: EngineCtx;
  private fileHandle: FileSystemFileHandle | null = null;
  private readonly workspaceManager = new WorkspaceManager();
  private workspace: WorkspaceId = this.workspaceManager.getCurrent();
  private readonly documentLifecycle = new DocumentLifecycleManager();
  private dockLayout: DockLayoutController | null = null;
  private comicConfig: ComicConfig = readComicConfig();
  private readonly comicProjectManager = new ComicProjectManager(() => this.comicConfig, this.comicConfig.pages[0]?.id ?? null);
  private get comicActivePageId(): string | null { return this.comicProjectManager.activePageId; }
  private set comicActivePageId(pageId: string | null) { this.comicProjectManager.setActivePage(pageId); }
  private comicParentDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private comicProjectDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private comicPagesDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private comicExportDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private comicConfigWriteChain: Promise<void> = Promise.resolve();
  private activeId = '';
  private activeMaskId = '';
  private readonly toolManager = new ToolManager('brush');
  private get tool(): Tool { return this.toolManager.activeTool; }
  private set tool(tool: Tool) { this.toolManager.setActiveTool(tool); }
  private textSettings: TextToolSettings = { fontFamily: 'Arial', fontSize: 64, style: 'normal', color: '#e03030', align: 'left', lineHeight: 1.2, letterSpacing: 0, strokeColor: '#000000', strokeWidth: 0, backgroundColor: 'transparent' };
  private vectorDirectSelectedId: string | null = null;
  private vectorGesture: { layerId: string; shapeId: string; mode: 'move' | 'resize'; startPoint: { x: number; y: number }; original: VectorShape; latest: VectorShape; moved: boolean } | null = null;
  private brush: ToolSettings & { rgb: [number, number, number] } = { rgb: [224, 48, 48], size: 24, opacity: 100, hardness: 80, spacing: 15, smoothing: 0, tolerance: 24, contiguous: true, sampleMerged: false, shapeFill: false, lineCap: 'round', lineJoin: 'round' };
  private stroke: StrokeSession | null = null;
  private strokeLayer: ReturnType<DocumentController['layerPixels']> = null;
  private strokeTool: Tool | null = null;
  private colorizeStroke: ColorizeStroke | null = null;
  private colorizeStrokeLayerId: string | null = null;
  private colorizeStrokeMaskId: string | null = null;
  private readonly colorizeOutputCache = new Map<string, Uint8Array>();
  private last: { x: number; y: number } | null = null;
  private shapeStart: { x: number; y: number; clientX: number; clientY: number } | null = null;
  private isPanning = false;
  private spaceDown = false;
  private panStart: { clientX: number; clientY: number; x: number; y: number } | null = null;
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private raf = 0;
  private recentSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private filterEditLayerId: string | null = null;
  private filterMaskEditLayerId: string | null = null;
  private filterMaskEditId: string | null = null;
  private filterMaskFilterIndex = 0;
  private previousEditorDockWidth: string | null = null;
  private filterPanel: FilterPanelController | null = null;
  private layerEffectsPanel: LayerEffectsPanelController | null = null;
  private vectorEditLayerId: string | null = null;
  private vectorDraft: VectorShape[] = [];
  private vectorSelectedId: string | null = null;
  private layerContextMenu: HTMLElement | null = null;
  private layerContextDismiss: ((event: PointerEvent) => void) | null = null;
  private readonly layerBehaviors = this.createLayerBehaviorRegistry();

  private constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: EngineClient,
    private readonly renderer: RendererBackend,
  ) { }

  static async start(root: HTMLElement, wasmBase = '/wasm/'): Promise<void> {
    const appManager = new AppManager();
    await appManager.start(root, wasmBase, (projectRoot, baseUrl, name, width, height, file) =>
      App.launchProject(projectRoot, baseUrl, name, width, height, file),
    );
  }

  private static async launchProject(
    root: HTMLElement,
    wasmBase: string,
    name: string,
    width: number,
    height: number,
    file?: File,
  ): Promise<void> {
    try {
      const uiManager = new UIManager();
      const canvas = uiManager.mountEditorShell(root, TEMPLATE, PREFERENCES_PANEL_TEMPLATE, PLUGINS_PANEL_TEMPLATE);
      const [engine, renderer] = await Promise.all([
        WasmRuntimeManager.getInstance().getEngine(wasmBase),
        createRenderer(canvas),
      ]);
      const app = new App(root, canvas, engine, renderer);
      uiManager.bindSharedPanels(root);
      App.bindEditorPreferences(root, app);
      app.bind();
      app.newDocument(width, height, file ? documentNameFromFile(file.name) : name);
      await app.openInitialFile(file, name);
    } catch (error) {
      App.showLaunchError(root, error, wasmBase);
    }
  }

  private static bindEditorPreferences(root: HTMLElement, app: App): void {
    wirePreferences(root, async (next, previous) => {
      if (!previous.rememberRecentProjects && next.rememberRecentProjects) {
        app.queueRecentSnapshot();
      }
    });
  }

  private static showLaunchError(root: HTMLElement, error: unknown, wasmBase: string): void {
    new UIManager().renderLaunchError(root, error, () => { void App.start(root, wasmBase); });
  }

  private async openInitialFile(file: File | undefined, fallbackName: string): Promise<void> {
    if (!file) return;
    if (/\.nvtsphoto$/i.test(file.name)) {
      await this.openNativeProjectFile(file, fallbackName);
      return;
    }
    await this.importImage(file);
    this.queueRecentSnapshot();
  }

  private async openNativeProjectFile(file: File, fallbackName: string): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const unpacked = unpackNvtsPhoto(bytes);
    unpacked.doc.name = documentNameFromFile(file.name) || fallbackName;
    this.setDocument(this.documentLifecycle.fromUnpacked(this.engine.module, unpacked));
    await this.refreshLinkedFileLayers(false);
    await this.rememberOpenedProject();
  }

  private async rememberOpenedProject(): Promise<void> {
    if (!readPreferences().rememberRecentProjects) return;
    const bytes = packNvtsPhoto(this.ctl.doc, (layer) => this.ctl.readPixels(layer));
    await rememberRecentProject(this.ctl.doc, bytes).catch((error) => {
      console.warn('No se pudo guardar la copia reciente:', error);
    });
  }

  private async importImage(file: File): Promise<void> {
    const pixels = await this.imageFileToDocumentPixels(file);
    this.ctl.addFileLayer(documentNameFromFile(file.name) || 'Imagen importada', pixels, file.name, undefined, file.lastModified, file.size);
    this.activeId = this.ctl.doc.layers.at(-1)?.id ?? this.activeId;
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
  }

  // ───────────── Documento ─────────────

  private newDocument(w: number, h: number, name = 'Sin título'): void {
    const ctl = this.documentLifecycle.createBlank(this.engine.module, w, h, name);
    this.fileHandle = null;
    this.setDocument(ctl);
  }

  private setDocument(ctl: DocumentController): void {
    this.ctl = this.documentLifecycle.replace(this.ctl, ctl);
    this.activeId = this.topRaster()?.id ?? '';
    this.prepareRendererForDocument(ctl.doc.width, ctl.doc.height);
    this.clearRendererForDocument(ctl.doc.width, ctl.doc.height);
    this.ctx = this.createEngineContext(ctl);
    this.refreshAfterDocumentReplacement();
  }

  private prepareRendererForDocument(width: number, height: number): void {
    this.renderer.ensureSize(width, height);
  }

  private clearRendererForDocument(width: number, height: number): void {
    const tileSize = this.engine.module.TILE_SIZE;
    const transparentTile = new Uint8Array(tileSize * tileSize * 4);
    for (let y = 0; y < height; y += tileSize) this.clearRendererRow(width, tileSize, transparentTile, y);
  }

  private clearRendererRow(width: number, tileSize: number, transparentTile: Uint8Array, y: number): void {
    for (let x = 0; x < width; x += tileSize) {
      const tileWidth = Math.min(tileSize, width - x);
      const tileHeight = Math.min(tileSize, this.ctl.doc.height - y);
      this.renderer.writeRegion(x, y, tileWidth, tileHeight, transparentTile, tileSize * 4);
    }
  }

  private createEngineContext(ctl: DocumentController): EngineCtx {
    const module = this.engine.module;
    const tileSize = module.TILE_SIZE;
    const { width, height } = ctl.doc;
    return {
      mod: module,
      comp: ctl.comp,
      history: ctl.history,
      uploadTile: (tileX, tileY, pixels) => this.uploadDocumentTile(width, height, tileSize, tileX, tileY, pixels),
      render: () => this.renderer.render(),
      scheduleRefresh: () => this.scheduleRefresh(),
      onPixelHistory: (label) => {
        ctl.recordPixelAction(label);
        this.updateHistoryUI();
      },
    };
  }

  private uploadDocumentTile(
    documentWidth: number,
    documentHeight: number,
    tileSize: number,
    tileX: number,
    tileY: number,
    pixels: Uint8Array,
  ): void {
    const x = tileX * tileSize;
    const y = tileY * tileSize;
    const width = Math.min(tileSize, documentWidth - x);
    const height = Math.min(tileSize, documentHeight - y);
    if (width <= 0 || height <= 0) return;
    this.renderer.writeRegion(x, y, width, height, pixels, tileSize * 4);
  }

  private refreshAfterDocumentReplacement(): void {
    this.ctl.comp.invalidateAll();
    this.syncUI();
    this.scheduleRefresh();
  }

  private topRaster(nodes: LayerNode[] = this.ctl.doc.layers): LayerNode | undefined {
    return findTopRasterLayer(nodes);
  }
  // Durante el arranque bind() construye la barra antes de crear el documento.
  // En ese momento todavía no existe ctl; una herramienta puede consultar la capa activa.
  private active(): LayerNode | undefined { return this.ctl ? this.ctl.find(this.activeId) : undefined; }

  // ───────────── Refresco ─────────────

  private scheduleRefresh(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.renderFrame(); });
  }

  private getFilterTilePadding(nodes: LayerNode[] = this.ctl.doc.layers): number {
    let padding = 0;
    for (const node of nodes) {
      if (node.type === 'filter') padding = Math.max(padding, getFilterKindTilePadding(node.filterKind ?? 'grayscale'));
      if (node.children.length > 0) padding = Math.max(padding, this.getFilterTilePadding(node.children));
    }
    return padding;
  }

  /** Renderizador alternativo por tiles para que las capas de filtro afecten, de forma no destructiva,
   * solo al contenido que está debajo de ellas. Sin capas de filtro seguimos usando el compositor Wasm. */
  private renderFrame(): void {
    const layers = this.ctl.doc.layers;
    const hasNonDestructiveEffects = containsLayerType(layers, 'filter')
      || containsEnabledMask(layers, 'filter')
      || containsEnabledMask(layers, 'transform')
      || containsEnabledMask(layers, 'colorize');
    if (hasNonDestructiveEffects) this.renderWithFilterLayers();
    else refresh(this.ctx);
  }

  private canvasBlend(mode: LayerNode['blendMode']): GlobalCompositeOperation {
    return CANVAS_BLEND_OPERATIONS[mode];
  }

  private renderWithFilterLayers(): void {
    this.colorizeOutputCache.clear();
    const { width, height } = this.ctl.doc;
    const tileSize = this.engine.module.TILE_SIZE || 256;
    const padding = this.getFilterTilePadding();
    const pools = createFilterCanvasPools();
    forEachFilterTile(width, height, tileSize, (tile) => this.renderFilterTile(tile, pools, padding));
    this.renderer.render();
  }

  private renderFilterTile(tile: FilterTile, pools: FilterCanvasPools, padding: number): void {
    const expanded = expandFilterTile(tile, padding, this.ctl.doc.width, this.ctl.doc.height);
    const output = this.composeFilterLayers(this.ctl.doc.layers, 0, expanded, pools);
    const ctx = output.getContext('2d', { willReadFrequently: true })!;
    this.renderer.writeRegion(
      tile.x, tile.y, tile.width, tile.height,
      readFilterTilePixels(ctx, tile, expanded),
      tile.width * 4,
    );
  }

  private getFilterCanvas(pool: HTMLCanvasElement[], depth: number, width: number, height: number): HTMLCanvasElement {
    let canvas = pool[depth];
    if (!canvas) {
      canvas = document.createElement('canvas');
      pool[depth] = canvas;
    }
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = 'none';
      ctx.clearRect(0, 0, width, height);
    }
    return canvas;
  }

  private composeFilterLayers(nodes: LayerNode[], depth: number, tile: FilterTile, pools: FilterCanvasPools): HTMLCanvasElement {
    const target = this.getFilterCanvas(pools.target, depth, tile.width, tile.height);
    const targetCtx = target.getContext('2d', { willReadFrequently: true })!;
    targetCtx.clearRect(0, 0, tile.width, tile.height);
    for (const node of nodes) this.composeFilterNode(node, target, targetCtx, depth, tile, pools);
    return target;
  }

  private composeFilterNode(
    node: LayerNode,
    target: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
    depth: number,
    tile: FilterTile,
    pools: FilterCanvasPools,
  ): void {
    if (!node.visible || node.opacity <= 0) return;
    if (node.type === 'filter') {
      this.applyFilterLayer(node, target, targetCtx, depth, tile, pools);
      return;
    }
    if (node.type === 'group') {
      this.compositeFilterGroup(node, targetCtx, depth, tile, pools);
      return;
    }
    if (isPixelLayerType(node.type)) this.compositeFilterRaster(node, targetCtx, depth, tile, pools);
  }

  private applyFilterLayer(
    node: LayerNode,
    target: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
    depth: number,
    tile: FilterTile,
    pools: FilterCanvasPools,
  ): void {
    const source = this.getFilterCanvas(pools.filterSource, depth, tile.width, tile.height);
    const filtered = this.getFilterCanvas(pools.filterResult, depth, tile.width, tile.height);
    const pixels = this.createFilterImages(node, target, source, filtered, tile);
    const blended = blendImageData(pixels.original, pixels.filtered, node.opacity);
    this.replaceFilterPixels(targetCtx, blended, tile);
  }

  private createFilterImages(
    node: LayerNode,
    target: HTMLCanvasElement,
    source: HTMLCanvasElement,
    filtered: HTMLCanvasElement,
    tile: FilterTile,
  ): { original: ImageData; filtered: ImageData } {
    const sourceCtx = source.getContext('2d', { willReadFrequently: true })!;
    const filteredCtx = filtered.getContext('2d', { willReadFrequently: true })!;
    sourceCtx.drawImage(target, 0, 0);
    const kind = node.filterKind ?? 'grayscale';
    const strength = node.filterStrength ?? 1;
    const filteredImage = renderFilteredImage(source, filteredCtx, kind, strength, {
      x: tile.x, y: tile.y, width: tile.width, height: tile.height,
      fullWidth: this.ctl.doc.width, fullHeight: this.ctl.doc.height,
    });
    return {
      original: sourceCtx.getImageData(0, 0, tile.width, tile.height),
      filtered: filteredImage,
    };
  }

  private replaceFilterPixels(targetCtx: CanvasRenderingContext2D, image: ImageData, tile: FilterTile): void {
    targetCtx.clearRect(0, 0, tile.width, tile.height);
    targetCtx.putImageData(image, 0, 0);
  }

  private compositeFilterGroup(
    node: LayerNode,
    targetCtx: CanvasRenderingContext2D,
    depth: number,
    tile: FilterTile,
    pools: FilterCanvasPools,
  ): void {
    const groupCanvas = this.composeFilterLayers(node.children, depth + 1, tile, pools);
    targetCtx.save();
    targetCtx.globalAlpha = node.opacity;
    targetCtx.globalCompositeOperation = this.canvasBlend(node.blendMode);
    targetCtx.drawImage(groupCanvas, 0, 0);
    targetCtx.restore();
  }

  private compositeFilterRaster(
    node: LayerNode,
    targetCtx: CanvasRenderingContext2D,
    depth: number,
    tile: FilterTile,
    pools: FilterCanvasPools,
  ): void {
    const backing = this.ctl.layerPixels(node);
    if (!backing) return;
    const rgba = new Uint8Array(tile.width * tile.height * 4);
    if (!backing.readRectToJS(tile.x, tile.y, tile.width, tile.height, rgba)) return;
    const transformed = this.applyTransformMasksToTile(node, backing, tile, rgba);
    const layerCanvas = this.getFilterCanvas(pools.layer, depth, tile.width, tile.height);
    const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true })!;
    const image = layerCtx.createImageData(tile.width, tile.height);
    image.data.set(transformed);
    this.applyColorizeMasksToTile(node, image, tile);
    this.applyFilterMasksToTile(node, image, tile, depth, pools);
    layerCtx.putImageData(image, 0, 0);
    targetCtx.save();
    targetCtx.globalAlpha = node.opacity;
    targetCtx.globalCompositeOperation = this.canvasBlend(node.blendMode);
    targetCtx.drawImage(layerCanvas, 0, 0);
    targetCtx.restore();
  }

  private applyColorizeMasksToTile(node: LayerNode, image: ImageData, tile: FilterTile): void {
    const masks = node.masks?.filter((mask): mask is Extract<LayerMask, { type: 'colorize' }> => mask.enabled && mask.type === 'colorize') ?? [];
    for (const mask of masks) {
      const pixels = this.getColorizeOutput(node, mask);
      if (!pixels) continue;
      for (let row = 0; row < tile.height; row++) {
        const start = ((tile.y + row) * this.ctl.doc.width + tile.x) * 4;
        image.data.set(pixels.subarray(start, start + tile.width * 4), row * tile.width * 4);
      }
    }
  }

  private getColorizeOutput(node: LayerNode, mask: Extract<LayerMask, { type: 'colorize' }>): Uint8Array | null {
    const cacheKey = `${node.id}:${mask.id}`;
    const cached = this.colorizeOutputCache.get(cacheKey);
    if (cached) return cached;
    const original = this.ctl.readPixels(node);
    if (!original) return null;
    const transformed = this.applyTransformMasksToFullLayer(node, original, this.ctl.doc.width, this.ctl.doc.height);
    if (this.ctl.doc.width * this.ctl.doc.height > 4_000_000) {
      this.q<HTMLElement>('#status').textContent = 'La colorización está limitada a documentos de hasta 4 millones de píxeles.';
      this.colorizeOutputCache.set(cacheKey, transformed);
      return transformed;
    }
    const result = mask.showOutput ? colorizePixels(transformed, this.ctl.doc.width, this.ctl.doc.height, mask) : transformed;
    const output = mask.editStrokes ? this.drawColorizeStrokes(result, mask) : result;
    this.colorizeOutputCache.set(cacheKey, output);
    return output;
  }

  private drawColorizeStrokes(source: Uint8Array, mask: Extract<LayerMask, { type: 'colorize' }>): Uint8Array {
    const { width, height } = this.ctl.doc;
    const canvas = this.createPixelCanvas(width, height, source);
    const context = canvas.getContext('2d')!;
    context.globalAlpha = 0.7;
    for (const stroke of mask.strokes) {
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      context.lineWidth = stroke.radius * 2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      if (stroke.points.length === 1) {
        context.beginPath();
        context.arc(stroke.points[0].x, stroke.points[0].y, stroke.radius, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      context.beginPath();
      context.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
      context.stroke();
    }
    return this.readSamplingCanvas(canvas, width, height);
  }

  private applyTransformMasksToTile(node: LayerNode, backing: TiledLayer, tile: FilterTile, rgba: Uint8Array): Uint8Array {
    const masks = node.masks?.filter((mask): mask is Extract<LayerMask, { type: 'transform' }> => mask.enabled && mask.type === 'transform') ?? [];
    if (!masks.length) return rgba;
    const matrix = this.combineTransformMasks(masks);
    if (matrix.isIdentity) return rgba;
    const bounds = this.inverseTransformBounds(matrix, tile);
    const pixels = new Uint8Array(bounds.width * bounds.height * 4);
    if (bounds.width && bounds.height) backing.readRectToJS(bounds.x, bounds.y, bounds.width, bounds.height, pixels);
    const source = this.createSamplingCanvas(bounds.width || 1, bounds.height || 1);
    const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
    if (bounds.width && bounds.height) sourceContext.putImageData(new ImageData(new Uint8ClampedArray(pixels), bounds.width, bounds.height), 0, 0);
    const output = this.createSamplingCanvas(tile.width, tile.height);
    const outputContext = output.getContext('2d', { willReadFrequently: true })!;
    outputContext.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e - tile.x, matrix.f - tile.y);
    if (bounds.width && bounds.height) outputContext.drawImage(source, bounds.x, bounds.y);
    return new Uint8Array(outputContext.getImageData(0, 0, tile.width, tile.height).data);
  }

  private combineTransformMasks(masks: Array<Extract<LayerMask, { type: 'transform' }>>): DOMMatrix {
    const { width, height } = this.ctl.doc;
    return masks.reduce((result, mask) => {
      const transform = new DOMMatrix()
        .translate(width / 2 + mask.offsetX, height / 2 + mask.offsetY)
        .rotate(mask.rotation)
        .skewX(mask.shearX)
        .skewY(mask.shearY)
        .scale(mask.scaleX, mask.scaleY)
        .translate(-width / 2, -height / 2);
      return result.multiply(transform);
    }, new DOMMatrix());
  }

  private inverseTransformBounds(matrix: DOMMatrix, tile: FilterTile): { x: number; y: number; width: number; height: number } {
    const inverse = matrix.inverse();
    const points = [
      new DOMPoint(tile.x, tile.y), new DOMPoint(tile.x + tile.width, tile.y),
      new DOMPoint(tile.x, tile.y + tile.height), new DOMPoint(tile.x + tile.width, tile.y + tile.height),
    ].map((point) => inverse.transformPoint(point));
    const { width, height } = this.ctl.doc;
    const x = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
    const y = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
    const right = Math.min(width, Math.ceil(Math.max(...points.map((point) => point.x))));
    const bottom = Math.min(height, Math.ceil(Math.max(...points.map((point) => point.y))));
    return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
  }

  private applyFilterMasksToTile(
    node: LayerNode,
    image: ImageData,
    tile: FilterTile,
    depth: number,
    pools: FilterCanvasPools,
  ): void {
    const masks = node.masks?.filter((mask): mask is Extract<LayerMask, { type: 'filter' }> => mask.enabled && mask.type === 'filter') ?? [];
    for (const mask of masks) this.applyFilterStackToTile(mask, image, tile, depth, pools);
  }

  private applyFilterStackToTile(
    mask: Extract<LayerMask, { type: 'filter' }>,
    image: ImageData,
    tile: FilterTile,
    depth: number,
    pools: FilterCanvasPools,
  ): void {
    for (const filter of mask.filters) {
      const source = this.getFilterCanvas(pools.filterSource, depth, tile.width, tile.height);
      const output = this.getFilterCanvas(pools.filterResult, depth, tile.width, tile.height);
      const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
      const outputContext = output.getContext('2d', { willReadFrequently: true })!;
      sourceContext.putImageData(image, 0, 0);
      const filtered = renderFilteredImage(source, outputContext, filter.kind, filter.strength, {
        x: tile.x, y: tile.y, width: tile.width, height: tile.height,
        fullWidth: this.ctl.doc.width, fullHeight: this.ctl.doc.height,
      });
      image.data.set(filtered.data);
    }
  }

  private applyWorkspace(workspace: WorkspaceId, announce = true): void {
    const selectedWorkspace = this.resolveWorkspace(workspace);
    this.dockLayout?.saveCurrentWorkspace();
    this.workspace = selectedWorkspace;
    this.workspaceManager.setCurrent(selectedWorkspace);
    const panels = this.getWorkspacePanelElements();
    if (!panels) return;
    const preset = this.workspaceManager.getDefinition(selectedWorkspace);
    this.applyWorkspacePanelPreset(selectedWorkspace, preset, panels);
    this.dockLayout?.applyWorkspace(selectedWorkspace);
    this.refreshWorkspaceMenuChecks(selectedWorkspace);
    this.refreshPanelMenuChecks(panels);
    this.updateWorkspacePanelToggleState(panels);
    if (announce) this.announceWorkspace(selectedWorkspace);
  }

  private resolveWorkspace(workspace: WorkspaceId): WorkspaceId {
    return this.workspaceManager.isWorkspaceId(workspace) ? workspace : 'general';
  }

  private getWorkspacePanelElements(): WorkspacePanelElements | null {
    const panel = <T extends HTMLElement = HTMLElement>(selector: string): T | null => this.root.querySelector<T>(selector);
    const advanced = panel('.advanced-tool-panel');
    const history = panel('.history-panel');
    const layers = panel('.layers-panel');
    const comic = panel('.comic-manager-panel');
    const storyboard = panel('.storyboard-panel');
    const timeline = panel('.animation-timeline-panel');
    const dock = panel('.right-dock');
    if (!advanced || !history || !layers || !comic || !storyboard || !timeline || !dock) return null;
    return { advanced, history, layers, comic, storyboard, timeline, dock };
  }

  private applyWorkspacePanelPreset(
    workspace: WorkspaceId,
    preset: WorkspaceDefinition,
    panels: WorkspacePanelElements,
  ): void {
    panels.advanced.hidden = !preset.visible.advanced;
    panels.history.hidden = !preset.visible.history;
    panels.layers.hidden = !preset.visible.layers;
    panels.comic.hidden = !preset.visible.comic;
    panels.storyboard.hidden = !preset.visible.storyboard;
    panels.timeline.hidden = !preset.visible.timeline;
    const panelById: Record<string, HTMLElement> = {
      advanced: panels.advanced, history: panels.history, layers: panels.layers,
      comic: panels.comic, storyboard: panels.storyboard, timeline: panels.timeline,
    };
    preset.order.forEach((id, index) => {
      const panel = panelById[id];
      if (!panel) return;
      const slot = panel.closest<HTMLElement>('.dock-panel-slot');
      if (slot) slot.style.order = String(index);
      else panel.style.order = String(index);
    });
    panels.dock.dataset.workspace = workspace;
    panels.dock.classList.remove('panels-hidden');
    const noVisiblePanels = !preset.visible.advanced && !preset.visible.history && !preset.visible.layers
      && !preset.visible.comic && !preset.visible.storyboard && !preset.visible.timeline;
    panels.dock.classList.toggle('panels-empty', noVisiblePanels);
  }

  private refreshWorkspaceMenuChecks(workspace: WorkspaceId): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
      const selected = button.dataset.workspace === workspace;
      button.setAttribute('aria-checked', String(selected));
      const check = button.querySelector<HTMLElement>('.menu-check');
      if (check) check.textContent = selected ? '✓' : '';
    });
  }

  private refreshPanelMenuChecks(panels: WorkspacePanelElements): void {
    const viewDropdown = this.root.querySelector<HTMLElement>('#view-menu-dropdown');
    const panelsDropdown = this.root.querySelector<HTMLElement>('#panels-menu-dropdown');
    if (!viewDropdown || !panelsDropdown) return;
    this.getWorkspacePanelMenuEntries(panels).forEach(([selector, panel]) => {
      const button = this.root.querySelector<HTMLButtonElement>(selector);
      if (!button) return;
      const visible = !panel.hidden;
      button.setAttribute('aria-checked', String(visible));
      const check = button.querySelector<HTMLElement>('.menu-check');
      if (check) check.textContent = visible ? '✓' : '';
    });
  }

  private getWorkspacePanelMenuEntries(panels: WorkspacePanelElements): Array<[string, HTMLElement]> {
    return [
      ['#toggle-panel-advanced', panels.advanced],
      ['#toggle-panel-history', panels.history],
      ['#toggle-panel-layers', panels.layers],
      ['#toggle-panel-comic', panels.comic],
      ['#toggle-panel-storyboard', panels.storyboard],
      ['#toggle-panel-timeline', panels.timeline],
    ];
  }

  private updateWorkspacePanelToggleState(panels: WorkspacePanelElements): void {
    const workspaceElement = this.root.querySelector<HTMLElement>('.workspace');
    const allPanelsVisible = !panels.dock.classList.contains('panels-hidden')
      && !workspaceElement?.classList.contains('panels-hidden');
    this.root.querySelector<HTMLButtonElement>('#toggle-panels')?.setAttribute('aria-pressed', String(allPanelsVisible));
    const panelsWithMenuEntries = this.getWorkspacePanelMenuEntries(panels);
    panels.dock.classList.toggle('panels-empty', panelsWithMenuEntries.every(([, panel]) => {
      return panel.hidden || !panel.closest('.dock-panel-slot');
    }));
  }

  private announceWorkspace(workspace: WorkspaceId): void {
    const label = this.workspaceManager.getLabel(workspace) || 'General';
    const status = this.root.querySelector<HTMLElement>('#status');
    if (status) status.textContent = `Espacio de trabajo: ${label}`;
  }

  private readComicFields(): void {
    const get = (id: string) => this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
    const projectName = get('comic-project-name') as HTMLInputElement | null;
    const title = get('comic-title') as HTMLInputElement | null;
    const author = get('comic-author') as HTMLInputElement | null;
    const direction = get('comic-direction') as HTMLSelectElement | null;
    const width = get('comic-page-width') as HTMLInputElement | null;
    const height = get('comic-page-height') as HTMLInputElement | null;
    const dpi = get('comic-dpi') as HTMLInputElement | null;
    const bleed = get('comic-bleed') as HTMLInputElement | null;
    const margin = get('comic-margin') as HTMLInputElement | null;
    const gutter = get('comic-gutter') as HTMLInputElement | null;
    const facing = this.root.querySelector<HTMLInputElement>('#comic-facing-pages');
    const bounded = (value: string | undefined, fallback: number, min: number, max: number) => {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
    };
    this.comicConfig.projectName = (projectName?.value.trim() || 'Mi cómic').slice(0, 160);
    if (!this.comicProjectDirectoryHandle && this.comicParentDirectoryHandle) {
      this.comicConfig.projectLocation = `${this.comicParentDirectoryHandle.name}/${safeComicFolderName(this.comicConfig.projectName, 'Mi cómic')}`;
    }
    this.comicConfig.title = (title?.value.trim() || 'Mi cómic').slice(0, 160);
    this.comicConfig.author = (author?.value ?? '').slice(0, 160);
    this.comicConfig.readingDirection = direction?.value === 'rtl' ? 'rtl' : 'ltr';
    this.comicConfig.pageWidth = Math.round(bounded(width?.value, this.comicConfig.pageWidth, 1, 8192));
    this.comicConfig.pageHeight = Math.round(bounded(height?.value, this.comicConfig.pageHeight, 1, 8192));
    this.comicConfig.dpi = Math.round(bounded(dpi?.value, this.comicConfig.dpi, 72, 1200));
    this.comicConfig.bleedMm = bounded(bleed?.value, this.comicConfig.bleedMm, 0, 100);
    this.comicConfig.marginMm = bounded(margin?.value, this.comicConfig.marginMm, 0, 500);
    this.comicConfig.gutterMm = bounded(gutter?.value, this.comicConfig.gutterMm, 0, 500);
    this.comicConfig.facingPages = facing?.checked ?? this.comicConfig.facingPages;
    this.comicConfig.updatedAt = Date.now();
  }

  private persistComicConfig(message = 'Configuración guardada en este navegador.'): void {
    this.comicConfig.updatedAt = Date.now();
    this.persistComicConfigLocally(message);
    this.queueComicConfigDiskWrite();
  }

  private persistComicConfigLocally(message: string): void {
    try {
      localStorage.setItem(COMIC_CONFIG_STORAGE_KEY, JSON.stringify(this.comicConfig));
      this.setComicConfigStatus(message);
    } catch (error) {
      this.setComicConfigStatus('No se pudo guardar localmente');
      console.warn('No se pudo guardar la configuración de cómic:', error);
    }
  }

  private queueComicConfigDiskWrite(): void {
    if (!this.comicProjectDirectoryHandle) return;
    const snapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
    this.comicConfigWriteChain = this.comicConfigWriteChain
      .then(() => this.writeQueuedComicConfig(snapshot))
      .catch((error: unknown) => this.reportComicConfigWriteFailure(error));
  }

  private async writeQueuedComicConfig(snapshot: string): Promise<void> {
    const written = await this.writeComicConfigSnapshot(snapshot, false, false);
    if (written) return;
    this.setComicConfigStatus('Cambios guardados localmente; falta permiso para actualizar comicConfig.json en disco.');
  }

  private reportComicConfigWriteFailure(error: unknown): void {
    const message = error instanceof Error
      ? `Error guardando comicConfig.json: ${error.message}`
      : 'Error guardando comicConfig.json';
    this.setComicConfigStatus(message);
    console.warn('No se pudo actualizar comicConfig.json en disco:', error);
  }

  private setComicConfigStatus(message: string): void {
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (status) status.textContent = message;
  }

  private async writeComicConfigSnapshot(snapshot: string, requestPermission: boolean, updateStatus: boolean): Promise<boolean> {
    const root = this.comicProjectDirectoryHandle;
    if (!root) return false;
    let permission = await root.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && requestPermission) permission = await root.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      this.reportComicConfigPermissionRequired(updateStatus);
      return false;
    }
    const configFile = await root.getFileHandle('comicConfig.json', { create: true });
    await writeFileHandleBytes(configFile, new Blob([snapshot], { type: 'application/json;charset=utf-8' }));
    this.reportComicConfigSaved(root, updateStatus);
    return true;
  }

  private reportComicConfigPermissionRequired(updateStatus: boolean): void {
    if (!updateStatus) return;
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (status) status.textContent = 'Se requiere volver a autorizar la carpeta del proyecto.';
  }

  private reportComicConfigSaved(root: FileSystemDirectoryHandle, updateStatus: boolean): void {
    if (!updateStatus) return;
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (status) status.textContent = `Guardado: ${root.name}/comicConfig.json`;
  }

  private async writeComicConfigToProject(requestPermission = false): Promise<boolean> {
    await this.comicConfigWriteChain;
    const snapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
    const written = await this.writeComicConfigSnapshot(snapshot, requestPermission, true);
    if (written) await this.rememberComicProjectHandle();
    return written;
  }

  private async rememberComicProjectHandle(): Promise<void> {
    try { await storeComicProjectDirectoryHandle(this.comicProjectDirectoryHandle!); }
    catch (error) { console.warn('No se pudo recordar el proyecto de cómic:', error); }
  }

  private async activateComicProjectDirectory(root: FileSystemDirectoryHandle, loadFromDisk: boolean, requestPermission: boolean): Promise<void> {
    let permission = await root.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && requestPermission) permission = await root.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('El navegador no concedió permiso de lectura y escritura para la carpeta elegida.');
    this.comicProjectDirectoryHandle = root;
    if (loadFromDisk) await this.loadComicConfigFromDirectory(root);
    this.comicConfig.projectDirectoryName = root.name;
    if (!this.comicConfig.projectName.trim()) this.comicConfig.projectName = root.name;
    if (!this.comicConfig.projectLocation) this.comicConfig.projectLocation = root.name;
    this.comicPagesDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.pagesDirectoryName || 'páginas', { create: true });
    this.comicExportDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.exportDirectoryName || 'exportación', { create: true });
    await storeComicProjectDirectoryHandle(root).catch((error) => console.warn('No se pudo recordar la carpeta del proyecto:', error));
    this.renderComicManager();
    this.persistComicConfig(`Proyecto vinculado: ${root.name}`);
    await this.writeComicConfigToProject(false);
  }

  private async loadComicConfigFromDirectory(root: FileSystemDirectoryHandle): Promise<void> {
    try {
      const configHandle = await root.getFileHandle('comicConfig.json');
      const configFile = await configHandle.getFile();
      this.comicConfig = normalizeComicConfig(JSON.parse(await configFile.text()) as unknown);
      this.comicActivePageId = this.comicConfig.pages[0]?.id ?? null;
    } catch (error) {
      this.ignoreMissingComicConfig(error);
    }
  }

  private ignoreMissingComicConfig(error: unknown): void {
    if (!isNotFoundError(error)) throw error;
  }

  private async restoreComicProjectDirectory(): Promise<void> {
    try { await this.restoreStoredComicProjectDirectory(); }
    catch (error) { console.warn('No se pudo reconectar el directorio del proyecto de cómic:', error); }
  }

  private async restoreStoredComicProjectDirectory(): Promise<void> {
    const root = await readStoredComicProjectDirectoryHandle();
    if (!root) return;
    this.comicProjectDirectoryHandle = root;
    const permission = await root.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted') {
      await this.activateComicProjectDirectory(root, true, false);
      return;
    }
    this.showComicProjectPermissionPending(root);
  }

  private showComicProjectPermissionPending(root: FileSystemDirectoryHandle): void {
    const location = this.root.querySelector<HTMLInputElement>('#comic-project-location');
    if (location) location.value = `Proyecto recordado: ${root.name} (permiso pendiente)`;
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (status) status.textContent = 'Carpeta recordada. Usá “Vincular proyecto existente…” para volver a autorizarla.';
  }

  private async chooseComicParentDirectory(): Promise<void> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) throw new Error('Este navegador no permite elegir carpetas. Usá una versión reciente de Chrome o Edge en localhost o HTTPS.');
    this.comicParentDirectoryHandle = await picker.call(window, { mode: 'readwrite' });
    this.readComicFields();
    const folderName = safeComicFolderName(this.comicConfig.projectName, 'Mi cómic');
    this.comicConfig.projectLocation = `${this.comicParentDirectoryHandle.name}/${folderName}`;
    this.renderComicManager();
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (status) status.textContent = `Ubicación elegida: ${this.comicParentDirectoryHandle.name}. Creá la estructura para continuar.`;
  }

  private async createComicProjectStructure(): Promise<void> {
    this.readComicFields();
    const parent = await this.getComicParentDirectory();
    const projectFolderName = safeComicFolderName(this.comicConfig.projectName, 'Mi cómic');
    const root = await this.resolveNewComicProjectRoot(parent, projectFolderName);
    if (!root) return;
    await this.initializeNewComicProject(parent, root, projectFolderName);
  }

  private async getComicParentDirectory(): Promise<FileSystemDirectoryHandle> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) throw new Error('Este navegador no permite crear carpetas desde la aplicación. Usá Chrome o Edge actualizado en localhost o HTTPS.');
    if (!this.comicParentDirectoryHandle) {
      this.comicParentDirectoryHandle = await picker.call(window, { mode: 'readwrite' });
    }
    return this.comicParentDirectoryHandle;
  }

  private async resolveNewComicProjectRoot(
    parent: FileSystemDirectoryHandle,
    projectFolderName: string,
  ): Promise<FileSystemDirectoryHandle | null> {
    let root: FileSystemDirectoryHandle;
    try {
      root = await parent.getDirectoryHandle(projectFolderName);
    } catch (error) {
      return this.createMissingComicProjectRoot(parent, projectFolderName, error);
    }
    if (!await this.comicProjectHasConfig(root)) return root;
    const shouldOpen = confirm(`Ya existe el proyecto “${projectFolderName}” con comicConfig.json. ¿Querés abrir ese proyecto y cargar su configuración?`);
    if (!shouldOpen) return null;
    await this.activateComicProjectDirectory(root, true, true);
    return null;
  }

  private createMissingComicProjectRoot(
    parent: FileSystemDirectoryHandle,
    projectFolderName: string,
    error: unknown,
  ): Promise<FileSystemDirectoryHandle> {
    if (!isNotFoundError(error)) throw error;
    return parent.getDirectoryHandle(projectFolderName, { create: true });
  }

  private async comicProjectHasConfig(root: FileSystemDirectoryHandle): Promise<boolean> {
    try {
      await root.getFileHandle('comicConfig.json');
      return true;
    } catch (error) {
      return this.configMissingOrThrow(error);
    }
  }

  private configMissingOrThrow(error: unknown): false {
    if (isNotFoundError(error)) return false;
    throw error;
  }

  private async initializeNewComicProject(
    parent: FileSystemDirectoryHandle,
    root: FileSystemDirectoryHandle,
    projectFolderName: string,
  ): Promise<void> {
    this.applyNewComicProjectConfig(parent, projectFolderName, root);
    await this.createComicProjectDirectories(root);
    await storeComicProjectDirectoryHandle(root).catch((error) => console.warn('No se pudo recordar el proyecto de cómic:', error));
    this.renderComicManager();
    this.persistComicConfig(`Estructura creada: ${parent.name}/${projectFolderName}`);
    const written = await this.writeComicConfigToProject(true);
    this.showComicProjectCreationStatus(projectFolderName, written);
  }

  private applyNewComicProjectConfig(
    parent: FileSystemDirectoryHandle,
    projectFolderName: string,
    root: FileSystemDirectoryHandle,
  ): void {
    this.comicConfig.projectName = projectFolderName;
    this.comicConfig.projectDirectoryName = projectFolderName;
    this.comicConfig.projectLocation = `${parent.name}/${projectFolderName}`;
    this.comicConfig.pagesDirectoryName = 'páginas';
    this.comicConfig.exportDirectoryName = 'exportación';
    this.comicProjectDirectoryHandle = root;
  }

  private async createComicProjectDirectories(root: FileSystemDirectoryHandle): Promise<void> {
    this.comicPagesDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.pagesDirectoryName, { create: true });
    this.comicExportDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.exportDirectoryName, { create: true });
  }

  private showComicProjectCreationStatus(projectFolderName: string, written: boolean): void {
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (!status) return;
    status.textContent = written
      ? `Proyecto creado: ${projectFolderName} · comicConfig.json, páginas/ y exportación/ listos.`
      : 'Se crearon las carpetas, pero no se pudo escribir comicConfig.json. Volvé a vincular el proyecto.';
  }

  private async linkExistingComicProject(): Promise<void> {
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) throw new Error('Este navegador no permite elegir carpetas. Usá una versión reciente de Chrome o Edge.');
    const root = await picker.call(window, { mode: 'readwrite' });
    await this.activateComicProjectDirectory(root, true, true);
  }

  private async exportComicProjectCopy(): Promise<void> {
    const root = this.requireComicProjectDirectory();
    this.readComicFields();
    this.persistComicConfig('Preparando copia de exportación…');
    await this.ensureComicConfigWritten();
    const exportDirectory = await this.getComicExportDirectory(root);
    await this.writeComicExportConfig(exportDirectory);
    const exportPages = await exportDirectory.getDirectoryHandle(this.comicConfig.pagesDirectoryName || 'páginas', { create: true });
    const counts = await this.copyComicPagesToExport(exportPages);
    this.showComicExportStatus(root.name, counts.copied, counts.missing);
  }

  private requireComicProjectDirectory(): FileSystemDirectoryHandle {
    if (!this.comicProjectDirectoryHandle) {
      throw new Error('Primero elegí una carpeta base y creá la estructura del proyecto.');
    }
    return this.comicProjectDirectoryHandle;
  }

  private async ensureComicConfigWritten(): Promise<void> {
    const written = await this.writeComicConfigToProject(true);
    if (!written) {
      throw new Error('No se pudo escribir comicConfig.json. Volvé a vincular la carpeta del proyecto e intentá nuevamente.');
    }
  }

  private async getComicExportDirectory(root: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle> {
    if (!this.comicPagesDirectoryHandle) {
      this.comicPagesDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.pagesDirectoryName || 'páginas', { create: true });
    }
    if (this.comicExportDirectoryHandle) return this.comicExportDirectoryHandle;
    this.comicExportDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.exportDirectoryName || 'exportación', { create: true });
    return this.comicExportDirectoryHandle;
  }

  private async writeComicExportConfig(exportDirectory: FileSystemDirectoryHandle): Promise<void> {
    const snapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
    const configFile = await exportDirectory.getFileHandle('comicConfig.json', { create: true });
    await writeFileHandleBytes(configFile, new Blob([snapshot], { type: 'application/json;charset=utf-8' }));
  }

  private async copyComicPagesToExport(
    exportPages: FileSystemDirectoryHandle,
  ): Promise<{ copied: number; missing: number }> {
    let copied = 0;
    let missing = 0;
    const sourceDirectory = this.comicPagesDirectoryHandle;
    if (!sourceDirectory) return { copied, missing };
    for (const page of this.comicConfig.pages) {
      const result = await this.copyComicPageToExport(sourceDirectory, exportPages, page);
      copied += Number(result === 'copied');
      missing += Number(result === 'missing');
    }
    return { copied, missing };
  }

  private async copyComicPageToExport(
    sourceDirectory: FileSystemDirectoryHandle,
    exportDirectory: FileSystemDirectoryHandle,
    page: ComicPageEntry,
  ): Promise<'copied' | 'missing'> {
    const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
    try {
      const sourceHandle = await sourceDirectory.getFileHandle(fileName);
      const sourceFile = await sourceHandle.getFile();
      return this.copyNonEmptyComicPage(sourceFile, exportDirectory, fileName);
    } catch (error) {
      return this.missingComicPageOrThrow(error);
    }
  }

  private async copyNonEmptyComicPage(
    sourceFile: File,
    exportDirectory: FileSystemDirectoryHandle,
    fileName: string,
  ): Promise<'copied' | 'missing'> {
    if (!sourceFile.size) return 'missing';
    const targetHandle = await exportDirectory.getFileHandle(fileName, { create: true });
    await writeFileHandleBytes(targetHandle, sourceFile);
    return 'copied';
  }

  private missingComicPageOrThrow(error: unknown): 'missing' {
    if (isNotFoundError(error)) return 'missing';
    throw error;
  }

  private showComicExportStatus(projectName: string, copied: number, missing: number): void {
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (!status) return;
    status.textContent = `Copia exportada a ${projectName}/exportación: comicConfig.json y ${copied} página(s)${missing ? `; ${missing} sin guardar se omitieron` : ''}.`;
  }

  private async prepareComicPageFile(page: ComicPageEntry): Promise<FileSystemFileHandle | null> {
    const directory = this.comicPagesDirectoryHandle;
    if (!directory) return null;
    const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
    const existingFile = await this.findExistingComicPage(directory, fileName);
    if (existingFile && existingFile.size && !this.confirmOverwriteComicPage(fileName)) return null;
    return directory.getFileHandle(fileName, { create: true });
  }

  private async findExistingComicPage(directory: FileSystemDirectoryHandle, fileName: string): Promise<File | null> {
    try {
      const existing = await directory.getFileHandle(fileName);
      return await existing.getFile();
    } catch (error) {
      return this.ignoreMissingComicPage(error);
    }
  }

  private ignoreMissingComicPage(error: unknown): null {
    if (isNotFoundError(error)) return null;
    throw error;
  }

  private confirmOverwriteComicPage(fileName: string): boolean {
    return confirm(`Ya existe “${fileName}” en la carpeta de páginas. El próximo guardado lo sobrescribirá. ¿Continuar?`);
  }

  private renderComicManager(): void {
    const config = this.comicConfig;
    const projectLocationDisplay = this.comicProjectDirectoryHandle
      ? (config.projectLocation || this.comicProjectDirectoryHandle.name)
      : this.comicParentDirectoryHandle
        ? `${this.comicParentDirectoryHandle.name}/${safeComicFolderName(config.projectName, 'Mi cómic')} (pendiente de crear)`
        : (config.projectLocation || 'Elegí una carpeta base para crear el proyecto');
    renderComicManagerPanel(this.root, config, this.comicActivePageId, projectLocationDisplay, {
      onSelectPage: (pageId) => { this.comicActivePageId = pageId; this.renderComicManager(); },
      onRenamePage: (page, nextName) => { if (!this.comicProjectManager.renamePage(page.id, nextName)) return; this.persistComicConfig(); this.renderComicManager(); },
    });
  }

  private wireComicManager(): void {
    this.initializeComicManager();
    this.bindComicConfigInputs();
    this.bindComicPresetSelector();
    this.bindComicProjectActions();
    this.bindComicPageActions();
    this.bindComicConfigTransferActions();
  }

  private initializeComicManager(): void {
    try {
      this.comicConfig = readComicConfig();
    } catch {
      this.comicConfig = defaultComicConfig();
    }
    this.comicActivePageId = this.comicConfig.pages[0]?.id ?? null;
    this.renderComicManager();
    void this.restoreComicProjectDirectory();
  }

  private bindComicConfigInputs(): void {
    const inputIds = [
      'comic-project-name', 'comic-title', 'comic-author', 'comic-direction',
      'comic-page-width', 'comic-page-height', 'comic-dpi', 'comic-bleed',
      'comic-margin', 'comic-gutter', 'comic-facing-pages',
    ];
    inputIds.forEach((id) => {
      const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
      input?.addEventListener('change', () => this.handleComicConfigInputChange());
    });
  }

  private handleComicConfigInputChange(): void {
    this.readComicFields();
    this.persistComicConfig();
    this.renderComicManager();
  }

  private bindComicPresetSelector(): void {
    this.q<HTMLSelectElement>('#comic-preset').addEventListener('change', () => {
      const preset = this.q<HTMLSelectElement>('#comic-preset').value;
      const presets: Record<string, { width: number; height: number; direction?: 'ltr' | 'rtl'; facing?: boolean }> = {
        us: { width: 1650, height: 2550, direction: 'ltr', facing: true },
        european: { width: 2100, height: 2970, direction: 'ltr', facing: true },
        manga: { width: 1650, height: 2400, direction: 'rtl', facing: true },
        manhwa: { width: 1600, height: 2560, direction: 'ltr', facing: false },
      };
      const selected = presets[preset];
      if (!selected) return;
      this.comicConfig.pageWidth = selected.width;
      this.comicConfig.pageHeight = selected.height;
      if (selected.direction) this.comicConfig.readingDirection = selected.direction;
      if (selected.facing !== undefined) this.comicConfig.facingPages = selected.facing;
      this.renderComicManager();
      this.persistComicConfig('Formato actualizado y guardado localmente.');
    });
  }

  private bindComicProjectActions(): void {
    this.bindComicAsyncAction('#comic-select-location', () => this.chooseComicParentDirectory());
    this.bindComicAsyncAction('#comic-create-project', () => this.createComicProjectStructure());
    this.bindComicAsyncAction('#comic-link-project', () => this.linkExistingComicProject());
    this.bindComicAsyncAction('#comic-export-project', () => this.exportComicProjectCopy());
  }

  private bindComicAsyncAction(selector: string, action: () => Promise<unknown>): void {
    this.q<HTMLButtonElement>(selector).addEventListener('click', () => {
      void action().catch((error: unknown) => this.setComicManagerError(error));
    });
  }

  private setComicManagerError(error: unknown): void {
    const status = this.q<HTMLElement>('#comic-config-status');
    status.textContent = error instanceof Error ? error.message : String(error);
  }

  private bindComicPageActions(): void {
    this.bindAddComicPageAction();
    this.bindDuplicateComicPageAction();
    this.bindDeleteComicPageAction();
    this.bindComicPageOrderActions();
    this.bindComicPageCanvasActions();
    this.bindComicPageFileActions();
  }

  private bindAddComicPageAction(): void {
    this.q<HTMLButtonElement>('#comic-add-page').addEventListener('click', () => this.addComicPage());
  }

  private addComicPage(): void {
    this.readComicFields();
    this.comicProjectManager.addPage();
    this.persistComicConfig('Página añadida. Configuración guardada localmente.');
    this.renderComicManager();
  }

  private bindDuplicateComicPageAction(): void {
    this.q<HTMLButtonElement>('#comic-duplicate-page').addEventListener('click', () => this.duplicateActiveComicPage());
  }

  private duplicateActiveComicPage(): void {
    if (!this.comicProjectManager.duplicateActivePage()) return;
    this.persistComicConfig('Página duplicada.');
    this.renderComicManager();
  }

  private bindDeleteComicPageAction(): void {
    this.q<HTMLButtonElement>('#comic-delete-page').addEventListener('click', () => this.deleteActiveComicPage());
  }

  private deleteActiveComicPage(): void {
    const page = this.comicProjectManager.getActivePage();
    if (!page) return;
    const message = `¿Eliminar «${page.name}» de la configuración? No se borrará ningún archivo del disco.`;
    if (!confirm(message)) return;
    if (!this.comicProjectManager.deleteActivePage()) return;
    this.persistComicConfig('Página eliminada de la configuración.');
    this.renderComicManager();
  }


  private bindComicPageOrderActions(): void {
    this.q<HTMLButtonElement>('#comic-page-up').addEventListener('click', () => this.moveActiveComicPage(-1));
    this.q<HTMLButtonElement>('#comic-page-down').addEventListener('click', () => this.moveActiveComicPage(1));
  }

  private moveActiveComicPage(delta: number): void {
    if (!this.comicProjectManager.moveActivePage(delta)) return;
    this.persistComicConfig('Orden de páginas actualizado.');
    this.renderComicManager();
  }

  private bindComicPageCanvasActions(): void {
    this.q<HTMLButtonElement>('#comic-create-canvas').addEventListener('click', () => {
      void this.createComicCanvasForActivePage().catch((error: unknown) => this.setComicManagerError(error));
    });
  }

  private async createComicCanvasForActivePage(): Promise<void> {
    const page = this.getActiveComicPage();
    if (!page) return;
    const message = `Se reemplazará el documento abierto por un lienzo de ${page.width} × ${page.height} px para «${page.name}». Guardá primero el documento actual si querés conservarlo. ¿Continuar?`;
    if (!confirm(message)) return;
    this.readComicFields();
    const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
    const pageHandle = await this.prepareComicPageFile({ ...page, fileName });
    if (this.comicPagesDirectoryHandle && !pageHandle) return;
    this.installComicPageCanvas(page, fileName, pageHandle);
  }

  private getActiveComicPage(): ComicPageEntry | undefined {
    return this.comicProjectManager.getActivePage();
  }

  private installComicPageCanvas(page: ComicPageEntry, fileName: string, pageHandle: FileSystemFileHandle | null): void {
    const safeTitle = this.comicConfig.title.trim() || 'Cómic';
    this.newDocument(page.width, page.height, `${safeTitle} - ${page.name}`);
    this.fileHandle = pageHandle;
    page.fileName = fileName;
    page.width = this.ctl.doc.width;
    page.height = this.ctl.doc.height;
    const status = this.comicPagesDirectoryHandle
      ? `Lienzo creado para «${page.name}». Guardar escribirá directamente en páginas/${fileName}.`
      : `Lienzo creado para «${page.name}». Configurá una carpeta de proyecto para guardar páginas automáticamente.`;
    this.persistComicConfig(status);
    this.renderComicManager();
    this.applyWorkspace('comics', false);
  }

  private bindComicPageFileActions(): void {
    const input = this.q<HTMLInputElement>('#comic-page-open-input');
    this.q<HTMLButtonElement>('#comic-page-open-file').addEventListener('click', () => input.click());
    input.addEventListener('change', () => this.handleComicPageFileSelection(input));
  }

  private handleComicPageFileSelection(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (!file) return;
    const page = this.getActiveComicPage();
    if (!page) {
      input.value = '';
      return;
    }
    const message = `Abrir «${file.name}» como «${page.name}» reemplazará el documento actual. Guardá primero lo que necesites conservar. ¿Continuar?`;
    if (!confirm(message)) {
      input.value = '';
      return;
    }
    void this.loadComicPageFile(file, page).catch((error: unknown) => this.setComicManagerError(error)).finally(() => {
      input.value = '';
    });
  }

  private async loadComicPageFile(file: File, page: ComicPageEntry): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const unpacked = unpackNvtsPhoto(bytes);
    unpacked.doc.name = documentNameFromFile(file.name);
    this.fileHandle = null;
    this.setDocument(this.documentLifecycle.fromUnpacked(this.engine.module, unpacked));
    await this.refreshLinkedFileLayers(false);
    await this.saveComicPageCopyIfLinked(page, file, bytes);
    page.width = this.ctl.doc.width;
    page.height = this.ctl.doc.height;
    this.persistComicPageLoadStatus(page, file.name);
    this.renderComicManager();
    this.applyWorkspace('comics', false);
  }

  private async saveComicPageCopyIfLinked(page: ComicPageEntry, file: File, bytes: Uint8Array): Promise<void> {
    page.fileName = safeComicFileName(
      this.comicPagesDirectoryHandle ? page.fileName : file.name,
      `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`,
    );
    if (!this.comicPagesDirectoryHandle) return;
    const target = await this.comicPagesDirectoryHandle.getFileHandle(page.fileName, { create: true });
    await writeFileHandleBytes(target, copyBytesToArrayBuffer(bytes));
    this.fileHandle = target;
  }

  private persistComicPageLoadStatus(page: ComicPageEntry, originalFileName: string): void {
    const message = this.comicPagesDirectoryHandle
      ? `Página «${page.name}» copiada a páginas/${page.fileName}. Guardar actualizará esa copia.`
      : `Página «${page.name}» cargada desde ${originalFileName}. Configurá una carpeta de proyecto para guardarla allí.`;
    this.persistComicConfig(message);
  }

  private bindComicConfigTransferActions(): void {
    this.q<HTMLButtonElement>('#comic-config-export').addEventListener('click', () => {
      void this.exportComicConfig().catch((error: unknown) => this.setComicManagerError(error));
    });
    const input = this.q<HTMLInputElement>('#comic-config-file');
    this.q<HTMLButtonElement>('#comic-config-import').addEventListener('click', () => input.click());
    input.addEventListener('change', () => this.importComicConfigFile(input));
  }

  private async exportComicConfig(): Promise<void> {
    this.readComicFields();
    this.persistComicConfig('Guardando comicConfig.json…');
    const written = this.comicProjectDirectoryHandle
      ? await this.writeComicConfigToProject(true)
      : false;
    if (!written) this.downloadComicConfig();
  }

  private downloadComicConfig(): void {
    const data = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'comicConfig.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this.q<HTMLElement>('#comic-config-status').textContent = 'Descargando copia de comicConfig.json';
  }

  private importComicConfigFile(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((raw) => this.applyImportedComicConfig(raw, file.name))
      .catch((error: unknown) => this.setComicManagerError(error))
      .finally(() => { input.value = ''; });
  }

  private applyImportedComicConfig(raw: string, fileName: string): void {
    const parsed = normalizeComicConfig(JSON.parse(raw) as unknown);
    this.comicConfig = parsed;
    this.comicActivePageId = parsed.pages[0]?.id ?? null;
    this.renderComicManager();
    this.persistComicConfig(`Configuración importada desde ${fileName}.`);
  }

  private syncUI(): void {
    this.syncDocumentHeader();
    this.renderLayers();
    this.syncToolbarProps();
    this.updateHistoryUI();
    this.q('#status').textContent =
      `${this.renderer.kind === 'webgpu' ? 'WebGPU' : 'WebGL2'} · ${this.ctl.doc.width}×${this.ctl.doc.height}`;
  }

  private syncDocumentHeader(): void {
    const { name, width, height } = this.ctl.doc;
    const title = this.root.querySelector<HTMLElement>('.doc-title');
    if (title?.firstChild) title.firstChild.textContent = `${name} `;
    const canvasName = this.root.querySelector<HTMLElement>('#canvas-name');
    if (canvasName) canvasName.textContent = name;
    const size = this.root.querySelector<HTMLElement>('#doc-size');
    if (size) size.textContent = `${width} × ${height}`;
    const meta = this.root.querySelector<HTMLElement>('#canvas-meta');
    if (meta) meta.textContent = `${width} × ${height} px · RGB/8`;
  }

  private updateHistoryUI(): void {
    const list = this.root.querySelector<HTMLElement>('#history-list');
    const count = this.root.querySelector<HTMLElement>('#history-count');
    if (!list || !count) return;
    renderHistoryPanel(list, count, this.ctl.historyEntries.slice(0, 30));
    this.queueRecentSnapshot();
  }

  /** Guarda una copia reciente tras dejar de editar un documento pequeño/mediano durante un instante. */
  private queueRecentSnapshot(): void {
    if (!this.ctl || !readPreferences().rememberRecentProjects) return;
    if (this.recentSaveTimer !== null) clearTimeout(this.recentSaveTimer);
    const doc = this.ctl.doc;
    let rasterLayers = 0;
    const countRaster = (nodes: LayerNode[]) => nodes.forEach((node) => { if (isPixelLayerType(node.type)) rasterLayers++; countRaster(node.children); });
    countRaster(doc.layers);
    // Evita copiar potencialmente cientos de MiB en cada pausa de edición; esos proyectos se guardan al pulsar Guardar.
    if (doc.width * doc.height * Math.max(1, rasterLayers) * 4 > 64 * 1024 * 1024) return;
    this.recentSaveTimer = setTimeout(() => {
      this.recentSaveTimer = null;
      const current = this.ctl;
      if (!readPreferences().rememberRecentProjects) return;
      try {
        const bytes = packNvtsPhoto(current.doc, (layer) => current.readPixels(layer));
        void rememberRecentProject(current.doc, bytes).catch((error) => console.warn('No se pudo actualizar el proyecto reciente:', error));
      } catch (error) {
        console.warn('No se pudo preparar la copia reciente:', error);
      }
    }, 1200);
  }

  /** Mantiene sincronizadas las propiedades de capa; los controles superiores son solo de herramienta. */
  private syncToolbarProps(): void {
    const layer = this.ctl ? this.active() : undefined;
    this.syncLayerControlValues(layer);
    this.syncLayerActionAvailability(layer);
    this.syncToolAvailability(layer);
  }

  private syncLayerControlValues(layer: LayerNode | undefined): void {
    const opacity = this.root.querySelector<HTMLInputElement>('#layer-opacity');
    const blend = this.root.querySelector<HTMLSelectElement>('#dock-blend');
    if (layer && opacity) opacity.value = String(Math.round(layer.opacity * 100));
    if (layer && blend) blend.value = layer.blendMode;
    this.updateLayerTypeButtons(layer);
    if (this.tool === 'text' && layer?.type === 'text') this.syncTextLayerSettings(layer);
  }

  private updateLayerTypeButtons(layer: LayerNode | undefined): void {
    const fill = this.root.querySelector<HTMLButtonElement>('#l-fill-color');
    const filter = this.root.querySelector<HTMLButtonElement>('#l-filter-options');
    const vector = this.root.querySelector<HTMLButtonElement>('#l-vector-add');
    const text = this.root.querySelector<HTMLButtonElement>('#l-text-edit');
    if (fill) {
      fill.hidden = layer?.type !== 'fill';
      fill.textContent = layer?.type === 'fill' ? `Color ${layer.fillColor ?? '#ffffff'}…` : fill.textContent;
    }
    if (filter) filter.hidden = layer?.type !== 'filter';
    if (vector) vector.hidden = layer?.type !== 'vector';
    if (text) text.hidden = layer?.type !== 'text';
  }

  private syncTextLayerSettings(layer: LayerNode): void {
    if (layer.type !== 'text') return;
    this.textSettings = this.textSettingsFromLayer(layer);
    const settings = this.textSettings;
    const values: Array<[string, string]> = [
      ['#tool-text-font', settings.fontFamily],
      ['#tool-text-style', settings.style],
      ['#tool-text-size', String(settings.fontSize)],
      ['#tool-text-color', settings.color],
      ['#advanced-text-align', settings.align],
      ['#advanced-text-line-height', String(settings.lineHeight)],
      ['#advanced-text-letter-spacing', String(settings.letterSpacing)],
      ['#advanced-text-stroke-color', settings.strokeColor],
      ['#advanced-text-stroke-width', String(settings.strokeWidth)],
      ['#advanced-text-background', settings.backgroundColor],
    ];
    values.forEach(([selector, value]) => this.setInputValue(selector, value));
  }

  private setInputValue(selector: string, value: string): void {
    const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
    if (input) input.value = value;
  }

  private syncLayerActionAvailability(layer: LayerNode | undefined): void {
    const canUseVectorTool = layer?.type === 'vector'
      && !this.ctl.isEffectivelyLocked(layer.id)
      && this.ctl.isEffectivelyVisible(layer.id);
    const vectorTool = this.root.querySelector<HTMLButtonElement>('#rail-vector-select');
    if (vectorTool) vectorTool.disabled = !canUseVectorTool;
    const duplicate = this.root.querySelector<HTMLButtonElement>('#l-duplicate');
    const remove = this.root.querySelector<HTMLButtonElement>('#l-del');
    if (duplicate) duplicate.disabled = !layer;
    if (remove) remove.disabled = !layer;
  }

  private syncToolAvailability(layer: LayerNode | undefined): void {
    const canPaint = !!layer
      && (layer.type === 'paint' || layer.type === 'raster')
      && !this.ctl.isEffectivelyLocked(layer.id)
      && this.ctl.isEffectivelyVisible(layer.id);
    this.setToolButtonsDisabled(['#rail-brush', '#rail-eraser', '#rail-line', '#rail-rectangle', '#rail-ellipse', '#rail-fill'], !canPaint);
    this.setToolButtonsDisabled(['#advanced-brightness-down', '#advanced-brightness-up'], !canPaint);
    this.setToolButtonsDisabled(['#rail-eyedropper', '#rail-hand'], false);
    const swatch = this.root.querySelector<HTMLElement>('#foreground-swatch');
    if (swatch) swatch.style.background = this.foregroundHex();
  }

  private setToolButtonsDisabled(selectors: string[], disabled: boolean): void {
    selectors.forEach((selector) => {
      const button = this.root.querySelector<HTMLButtonElement>(selector);
      if (button) button.disabled = disabled;
    });
  }

  private foregroundHex(): string {
    return `#${this.brush.rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  }

  private setForegroundHex(hex: string): void {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    this.brush.rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
    const colorInput = this.root.querySelector<HTMLInputElement>('#tool-color');
    if (colorInput) colorInput.value = hex;
    const swatch = this.root.querySelector<HTMLElement>('#foreground-swatch');
    if (swatch) swatch.style.background = hex;
  }

  private renderToolOptions(): void {
    this.prepareToolOptions();
    this.mountToolOptions(this.q<HTMLElement>('#toolbar'));
    this.refreshToolOptionsView();
  }

  private prepareToolOptions(): void {
    const selectedText = this.active();
    if (this.tool === 'text' && selectedText?.type === 'text') {
      this.textSettings = this.textSettingsFromLayer(selectedText);
    }
    const labels: Record<Tool, string> = {
      brush: 'Pincel', eraser: 'Borrador', eyedropper: 'Cuentagotas', line: 'Línea',
      rectangle: 'Rectángulo', ellipse: 'Elipse', fill: 'Relleno', hand: 'Mover lienzo',
      text: 'Texto', 'vector-select': 'Selección vectorial',
    };
    this.q<HTMLElement>('#tool-current-label').textContent = labels[this.tool];
  }

  private mountToolOptions(host: HTMLElement): void {
    host.innerHTML = this.createToolOptionsMarkup();
    this.bindToolOptionEvents(host);
  }

  private createToolOptionsMarkup(): string {
    const colorField = `<label class="tool-setting">Color <input id="tool-color" type="color" value="${this.foregroundHex()}" /></label>`;
    const sizeLabel = this.tool === 'line' || this.tool === 'rectangle' || this.tool === 'ellipse' ? 'Grosor' : 'Tamaño';
    const sizeField = `<label class="tool-setting">${sizeLabel} <input id="tool-size" type="range" min="1" max="256" value="${this.brush.size}" /><output id="tool-size-value">${this.brush.size}px</output></label>`;
    const opacityField = `<label class="tool-setting">Opacidad <input id="tool-opacity" type="range" min="1" max="100" value="${this.brush.opacity}" /><output id="tool-opacity-value">${this.brush.opacity}%</output></label>`;
    const fontOptions = ['Arial','Inter','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS','Courier New','monospace','serif','sans-serif']
      .map((name) => `<option value="${name}" ${this.textSettings.fontFamily === name ? 'selected' : ''}>${name}</option>`)
      .join('');
    if (this.tool === 'brush') return `${colorField}${sizeField}${opacityField}`;
    if (this.tool === 'eraser') return `${sizeField}${opacityField}`;
    if (this.tool === 'line') return `${colorField}${sizeField}${opacityField}`;
    if (this.tool === 'rectangle' || this.tool === 'ellipse') {
      return `${colorField}${sizeField}${opacityField}<label class="tool-setting tool-check"><input id="tool-shape-fill" type="checkbox" ${this.brush.shapeFill ? 'checked' : ''}/> Rellenar figura</label>`;
    }
    if (this.tool === 'fill') {
      return `${colorField}<label class="tool-setting">Tolerancia <input id="tool-tolerance" type="range" min="0" max="255" value="${this.brush.tolerance}"/><output id="tool-tolerance-value">${this.brush.tolerance}</output></label><label class="tool-setting">Opacidad <input id="tool-opacity" type="range" min="1" max="100" value="${this.brush.opacity}"/><output id="tool-opacity-value">${this.brush.opacity}%</output></label>`;
    }
    if (this.tool === 'text') return this.createTextToolMarkup(fontOptions);
    if (this.tool === 'eyedropper') return '<span class="tool-help">Hacé clic en el lienzo para tomar un color.</span>';
    if (this.tool === 'vector-select') return '<span class="tool-help">Seleccioná un objeto vectorial; arrastralo para moverlo o usá el control inferior derecho para cambiar su tamaño.</span>';
    return '<span class="tool-help">Arrastrá el lienzo para desplazarte. Usá − / + o la rueda con Ctrl para cambiar el zoom.</span>';
  }

  private createTextToolMarkup(fontOptions: string): string {
    const settings = this.textSettings;
    const styles: Array<[TextLayerStyle, string]> = [
      ['normal', 'Normal'], ['bold', 'Negrita'], ['italic', 'Cursiva'], ['bold-italic', 'Negrita cursiva'],
    ];
    const styleOptions = styles.map(([value, label]) =>
      `<option value="${value}" ${settings.style === value ? 'selected' : ''}>${label}</option>`).join('');
    return `<label class="tool-setting">Fuente <select id="tool-text-font">${fontOptions}</select></label><label class="tool-setting">Estilo <select id="tool-text-style">${styleOptions}</select></label><label class="tool-setting">Tamaño <input id="tool-text-size" type="number" min="1" max="1000" value="${settings.fontSize}"/></label><label class="tool-setting">Color <input id="tool-text-color" type="color" value="${settings.color}"/></label>`;
  }

  private bindToolOptionEvents(host: HTMLElement): void {
    this.bindBrushToolControls(host);
    this.bindFillToolControls(host);
    this.bindTextToolControls(host);
  }

  private bindBrushToolControls(host: HTMLElement): void {
    const color = host.querySelector<HTMLInputElement>('#tool-color');
    if (color) color.oninput = () => this.setForegroundHex(color.value);
    const size = host.querySelector<HTMLInputElement>('#tool-size');
    if (size) size.oninput = () => {
      this.brush.size = Number(size.value);
      this.updateToolOutput(host, '#tool-size-value', `${this.brush.size}px`);
    };
    const opacity = host.querySelector<HTMLInputElement>('#tool-opacity');
    if (opacity) opacity.oninput = () => {
      this.brush.opacity = Number(opacity.value);
      this.updateToolOutput(host, '#tool-opacity-value', `${this.brush.opacity}%`);
    };
  }

  private bindFillToolControls(host: HTMLElement): void {
    const shapeFill = host.querySelector<HTMLInputElement>('#tool-shape-fill');
    if (shapeFill) shapeFill.onchange = () => { this.brush.shapeFill = shapeFill.checked; };
    const tolerance = host.querySelector<HTMLInputElement>('#tool-tolerance');
    if (tolerance) tolerance.oninput = () => {
      this.brush.tolerance = Number(tolerance.value);
      this.updateToolOutput(host, '#tool-tolerance-value', tolerance.value);
    };
  }

  private bindTextToolControls(host: HTMLElement): void {
    const font = host.querySelector<HTMLSelectElement>('#tool-text-font');
    if (font) font.onchange = () => {
      this.textSettings.fontFamily = font.value;
      this.applyTextSettingsToSelectedLayer();
    };
    const style = host.querySelector<HTMLSelectElement>('#tool-text-style');
    if (style) style.onchange = () => {
      this.textSettings.style = style.value as TextLayerStyle;
      this.applyTextSettingsToSelectedLayer();
    };
    const fontSize = host.querySelector<HTMLInputElement>('#tool-text-size');
    if (fontSize) fontSize.onchange = () => {
      this.textSettings.fontSize = Math.max(1, Math.min(1000, Number(fontSize.value) || 64));
      fontSize.value = String(this.textSettings.fontSize);
      this.applyTextSettingsToSelectedLayer();
    };
    const textColor = host.querySelector<HTMLInputElement>('#tool-text-color');
    if (textColor) textColor.onchange = () => {
      this.textSettings.color = textColor.value;
      this.applyTextSettingsToSelectedLayer();
    };
  }

  private updateToolOutput(host: HTMLElement, selector: string, value: string): void {
    const output = host.querySelector<HTMLOutputElement>(selector);
    if (output) output.value = value;
  }

  private refreshToolOptionsView(): void {
    this.updateSelectedToolButton();
    this.updateToolCursor();
    this.syncToolbarProps();
  }

  private updateSelectedToolButton(): void {
    const toolButtons: Record<Tool, string> = {
      hand: '#rail-hand', brush: '#rail-brush', eraser: '#rail-eraser', line: '#rail-line',
      rectangle: '#rail-rectangle', ellipse: '#rail-ellipse', fill: '#rail-fill',
      eyedropper: '#rail-eyedropper', text: '#rail-text', 'vector-select': '#rail-vector-select',
    };
    Object.values(toolButtons).forEach((selector) => this.root.querySelector<HTMLElement>(selector)?.classList.remove('selected'));
    this.root.querySelector<HTMLElement>(toolButtons[this.tool])?.classList.add('selected');
  }

  private updateToolCursor(): void {
    const cursors: Record<Tool, string> = {
      hand: 'grab', eyedropper: 'copy', text: 'text', 'vector-select': 'default',
      brush: 'crosshair', eraser: 'crosshair', line: 'crosshair', rectangle: 'crosshair',
      ellipse: 'crosshair', fill: 'crosshair',
    };
    this.canvas.style.cursor = cursors[this.tool];
  }

  private renderAdvancedToolOptions(): void {
    renderAdvancedToolOptionsPanel(
      this.q<HTMLElement>('#advanced-tool-options'),
      this.tool,
      this.brush,
      this.textSettings,
      {
        adjustActiveLayerBrightness: (delta) => this.adjustActiveLayerBrightness(delta),
        applyTextSettingsToSelectedLayer: () => this.applyTextSettingsToSelectedLayer(),
        editVectorLayer: () => { const layer = this.active(); if (layer?.type === 'vector') this.editVectorLayer(layer); },
      },
    );
  }

  private textSettingsFromLayer(layer: LayerNode): TextToolSettings {
    return {
      fontFamily: layer.textFontFamily ?? 'Arial', fontSize: layer.textFontSize ?? 64, style: layer.textStyle ?? 'normal', color: layer.textColor ?? '#e03030',
      align: layer.textAlign ?? 'left', lineHeight: layer.textLineHeight ?? 1.2, letterSpacing: layer.textLetterSpacing ?? 0,
      strokeColor: layer.textStrokeColor ?? '#000000', strokeWidth: layer.textStrokeWidth ?? 0, backgroundColor: layer.textBackgroundColor ?? 'transparent',
    };
  }

  private textLayerPatch(content: string, x: number, y: number, settings: TextToolSettings): Pick<LayerNode, 'textContent' | 'textX' | 'textY' | 'textFontFamily' | 'textFontSize' | 'textColor' | 'textStyle' | 'textAlign' | 'textLineHeight' | 'textLetterSpacing' | 'textStrokeColor' | 'textStrokeWidth' | 'textBackgroundColor'> {
    return { textContent: content, textX: x, textY: y, textFontFamily: settings.fontFamily, textFontSize: settings.fontSize, textColor: settings.color, textStyle: settings.style, textAlign: settings.align, textLineHeight: settings.lineHeight, textLetterSpacing: settings.letterSpacing, textStrokeColor: settings.strokeColor, textStrokeWidth: settings.strokeWidth, textBackgroundColor: settings.backgroundColor };
  }

  private rasterizeText(content: string, x: number, y: number, settings: TextToolSettings): Uint8Array {
    const canvas = this.createTextCanvas();
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No se pudo preparar el contenido de texto.');
    this.drawTextContent(ctx, content, x, y, settings);
    return new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  }

  private createTextCanvas(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.ctl.doc.width;
    canvas.height = this.ctl.doc.height;
    return canvas;
  }

  private drawTextContent(
    ctx: CanvasRenderingContext2D,
    content: string,
    x: number,
    y: number,
    settings: TextToolSettings,
  ): void {
    const layout = this.prepareTextLayout(ctx, content, settings);
    this.drawTextBackground(ctx, x, y, settings, layout);
    this.drawTextLines(ctx, layout.lines, x, y, settings, layout.lineHeight);
  }

  private prepareTextLayout(
    ctx: CanvasRenderingContext2D,
    content: string,
    settings: TextToolSettings,
  ): { lines: string[]; maxWidth: number; lineHeight: number; totalHeight: number } {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const fontWeight = settings.style === 'bold' || settings.style === 'bold-italic' ? 'bold' : 'normal';
    const fontStyle = settings.style === 'italic' || settings.style === 'bold-italic' ? 'italic' : 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${Math.max(1, settings.fontSize)}px "${settings.fontFamily.replace(/["\\]/g, '')}"`;
    ctx.textBaseline = 'top';
    ctx.textAlign = settings.align;
    const spacingCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in spacingCtx) spacingCtx.letterSpacing = `${settings.letterSpacing}px`;
    const lines = content.split('\n');
    const measuredWidths = lines.map((line) => ctx.measureText(line).width + Math.max(0, line.length - 1) * settings.letterSpacing);
    const maxWidth = Math.max(1, ...measuredWidths);
    const lineHeight = settings.fontSize * settings.lineHeight;
    return { lines, maxWidth, lineHeight, totalHeight: Math.max(settings.fontSize, lines.length * lineHeight) };
  }

  private drawTextBackground(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    settings: TextToolSettings,
    layout: { maxWidth: number; totalHeight: number },
  ): void {
    const background = settings.backgroundColor;
    if (!background || background === 'transparent') return;
    const rectX = settings.align === 'left' ? x : settings.align === 'center' ? x - layout.maxWidth / 2 : x - layout.maxWidth;
    ctx.fillStyle = background;
    ctx.fillRect(rectX - 6, y - 4, layout.maxWidth + 12, layout.totalHeight + 8);
  }

  private drawTextLines(
    ctx: CanvasRenderingContext2D,
    lines: string[],
    x: number,
    y: number,
    settings: TextToolSettings,
    lineHeight: number,
  ): void {
    ctx.lineJoin = 'round';
    ctx.lineWidth = settings.strokeWidth;
    ctx.strokeStyle = settings.strokeColor;
    ctx.fillStyle = settings.color;
    lines.forEach((line, index) => {
      const lineY = y + index * lineHeight;
      if (settings.strokeWidth > 0) ctx.strokeText(line, x, lineY);
      ctx.fillText(line, x, lineY);
    });
  }

  private async createTextAt(point: { x: number; y: number }, existing?: LayerNode): Promise<void> {
    if (existing && (existing.type !== 'text' || this.ctl.isEffectivelyLocked(existing.id))) return;
    const currentSettings = existing ? this.textSettingsFromLayer(existing) : { ...this.textSettings };
    const content = prompt(existing ? 'Editar texto de la capa' : 'Texto nuevo (podés usar saltos de línea)', existing?.textContent ?? 'Nuevo texto');
    if (content === null || !content.length) return;
    try {
      this.writeTextLayerContent(point, content, existing, currentSettings);
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = 'Texto actualizado en su propia capa editable.';
    } catch (error) { this.fail(error); }
  }

  private writeTextLayerContent(
    point: { x: number; y: number },
    content: string,
    existing: LayerNode | undefined,
    settings: TextToolSettings,
  ): void {
    if (existing) {
      const x = existing.textX ?? point.x;
      const y = existing.textY ?? point.y;
      const pixels = this.rasterizeText(content, x, y, settings);
      this.ctl.replaceTextContent(existing.id, this.textLayerPatch(content, x, y, settings), pixels);
      this.activeId = existing.id;
      return;
    }
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    const layer = this.ctl.addLayer('text', content.split('\n')[0].slice(0, 48) || 'Texto');
    this.activeId = layer.id;
    const pixels = this.rasterizeText(content, x, y, settings);
    this.ctl.replaceTextContent(layer.id, this.textLayerPatch(content, x, y, settings), pixels);
  }

  private applyTextSettingsToSelectedLayer(): void {
    const layer = this.active();
    if (!layer || layer.type !== 'text' || this.ctl.isEffectivelyLocked(layer.id) || !layer.textContent) return;
    try {
      const settings = { ...this.textSettings };
      const x = layer.textX ?? 0, y = layer.textY ?? 0;
      const pixels = this.rasterizeText(layer.textContent, x, y, settings);
      this.ctl.replaceTextContent(layer.id, this.textLayerPatch(layer.textContent, x, y, settings), pixels);
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    } catch (error) { this.fail(error); }
  }

  private adjustActiveLayerBrightness(delta: number): void {
    const layer = this.active();
    if (!layer || (layer.type !== 'paint' && layer.type !== 'raster') || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id)) {
      this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa de pintura visible y desbloqueada para ajustar el brillo.';
      return;
    }
    try {
      runEdit(this.ctx, layer.engineId, 'Brillo', (pixels) => pixels.applyBrightness(delta));
      this.ctl.comp.invalidateAll();
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = delta < 0 ? 'Brillo de la capa reducido.' : 'Brillo de la capa aumentado.';
    } catch (error) {
      this.q<HTMLElement>('#status').textContent = error instanceof Error ? error.message : String(error);
    }
  }

  private applyCanvasView(): void {
    this.canvas.style.transformOrigin = 'center center';
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    // Aumenta la resolución interna al hacer zoom, para que el lienzo no se vea borroso al ampliarlo.
    const renderScale = String(Math.min(4, Math.max(1, this.zoom)));
    const scaleChanged = this.canvas.dataset.renderScale !== renderScale;
    this.canvas.dataset.renderScale = renderScale;
    if (scaleChanged && this.ctl) this.renderer.render();
    const label = this.root.querySelector<HTMLElement>('#zoom-value');
    if (label) label.textContent = Math.abs(this.zoom - 1) < 0.005 ? 'Ajustar' : `${Math.round(this.zoom * 100)}%`;
    this.canvas.style.cursor = this.isPanning ? 'grabbing' : this.tool === 'hand' ? 'grab' : this.tool === 'eyedropper' ? 'copy' : 'crosshair';
  }

  private updatePreviewCanvasSize(): void {
    const preview = this.root.querySelector<HTMLCanvasElement>('#tool-preview');
    if (!preview) return;
    const rect = preview.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (preview.width !== width) preview.width = width;
    if (preview.height !== height) preview.height = height;
  }

  private clearToolPreview(): void {
    const preview = this.root.querySelector<HTMLCanvasElement>('#tool-preview');
    if (!preview) return;
    const ctx = preview.getContext('2d');
    if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, preview.width, preview.height); }
  }

  // ───────────── Panel de capas ─────────────

  private bindMaskControls(): void {
    const manager = this.q<HTMLElement>('.layer-mask-manager');
    manager.addEventListener('click', (event) => this.handleMaskClick(event));
    manager.addEventListener('change', (event) => this.handleMaskChange(event));
  }

  private addMaskToActiveLayer(type: LayerMask['type']): void {
    const layer = this.active();
    if (!layer) {
      this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa antes de añadir una máscara.';
      return;
    }
    const mask = this.ctl.addMask(layer.id, type);
    if (!mask) return;
    this.activeMaskId = mask.id;
    this.q<HTMLDetailsElement>('.layer-mask-manager').open = true;
    this.finishMaskEdit(`Se añadió máscara de ${getLayerMaskLabel(mask.type)}.`);
    if (mask.type === 'filter') this.openFilterMaskEditor(layer, mask.id);
  }

  private handleMaskClick(event: Event): void {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    const layer = this.active();
    if (!button || !layer) return;
    const deleteMask = button.dataset.deleteMask;
    if (deleteMask && this.ctl.removeMask(layer.id, deleteMask)) {
      this.activeMaskId = '';
      this.finishMaskEdit('Se eliminó la máscara.');
      return;
    }
    const removeFilter = button.dataset.removeMaskFilter;
    if (removeFilter) {
      const index = Number(button.dataset.filterIndex);
      this.updateMaskField(layer.id, removeFilter, (mask) => mask.type === 'filter'
        ? { ...mask, filters: mask.filters.filter((_, filterIndex) => filterIndex !== index) }
        : mask);
      return;
    }
    const clearColorize = button.dataset.clearColorize;
    if (clearColorize) {
      this.updateMaskField(layer.id, clearColorize, (mask) => mask.type === 'colorize' ? { ...mask, strokes: [] } : mask);
      return;
    }
    if (button.dataset.updateColorize) {
      this.colorizeOutputCache.clear();
      this.scheduleRefresh();
      return;
    }
    const addFilterMask = button.dataset.addMaskFilter;
    if (addFilterMask) this.updateMaskField(layer.id, addFilterMask, (mask) => mask.type === 'filter'
      ? { ...mask, filters: [...mask.filters, { kind: 'grayscale', strength: 1 }] }
      : mask);
  }

  private handleMaskChange(event: Event): void {
    const control = event.target as HTMLInputElement | HTMLSelectElement;
    const layer = this.active();
    if (!layer || !control.dataset.maskId) return;
    const maskId = control.dataset.maskId;
    if (control.dataset.maskField === 'enabled' && control instanceof HTMLInputElement) {
      this.updateMaskField(layer.id, maskId, (mask) => ({ ...mask, enabled: control.checked }));
      return;
    }
    if (control.dataset.filterIndex !== undefined) {
      this.updateFilterMaskControl(layer.id, maskId, Number(control.dataset.filterIndex), control);
      return;
    }
    if (control.dataset.maskField?.startsWith('transform.')) {
      this.updateTransformMaskControl(layer.id, maskId, control as HTMLInputElement);
      return;
    }
    if (control.dataset.maskField?.startsWith('colorize.')) this.updateColorizeMaskControl(layer.id, maskId, control as HTMLInputElement);
  }

  private updateMaskField(layerId: string, maskId: string, update: (mask: LayerMask) => LayerMask): void {
    if (this.ctl.updateMask(layerId, maskId, update)) this.finishMaskEdit('Se actualizaron las opciones de la máscara.');
  }

  private updateTransformMaskControl(layerId: string, maskId: string, control: HTMLInputElement): void {
    const property = control.dataset.maskField?.replace('transform.', '') as 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation' | 'shearX' | 'shearY';
    const value = Number(control.value);
    if (!Number.isFinite(value) || ((property === 'scaleX' || property === 'scaleY') && value === 0)) return;
    this.updateMaskField(layerId, maskId, (mask) => mask.type === 'transform' ? { ...mask, [property]: value } : mask);
  }

  private updateColorizeMaskControl(layerId: string, maskId: string, control: HTMLInputElement): void {
    const property = control.dataset.maskField?.replace('colorize.', '');
    this.updateMaskField(layerId, maskId, (mask) => {
      if (mask.type !== 'colorize') return mask;
      if (property === 'editStrokes') return { ...mask, editStrokes: control.checked };
      if (property === 'showOutput') return { ...mask, showOutput: control.checked };
      if (property === 'limitToLayerBounds') return { ...mask, limitToLayerBounds: control.checked };
      if (property === 'gapClose') return { ...mask, gapClose: Number(control.value) };
      if (property === 'threshold') return { ...mask, threshold: Number(control.value) / 100 };
      if (property === 'transparentColor') {
        const colors = new Set(mask.transparentColors);
        const color = control.dataset.maskColor ?? '';
        if (control.checked) colors.add(color);
        else colors.delete(color);
        return { ...mask, transparentColors: [...colors] };
      }
      return mask;
    });
  }

  private updateFilterMaskControl(layerId: string, maskId: string, index: number, control: HTMLInputElement | HTMLSelectElement): void {
    this.updateMaskField(layerId, maskId, (mask) => {
      if (mask.type !== 'filter' || !mask.filters[index]) return mask;
      const filter = { ...mask.filters[index] };
      if (control instanceof HTMLSelectElement) filter.kind = control.value as FilterKind;
      else filter.strength = Number(control.value) / 100;
      return { ...mask, filters: mask.filters.map((current, currentIndex) => currentIndex === index ? filter : current) };
    });
  }

  private finishMaskEdit(message: string): void {
    this.colorizeOutputCache.clear();
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
    this.q<HTMLElement>('#status').textContent = message;
  }

  private renderLayerMasks(): void {
    const container = this.root.querySelector<HTMLElement>('#layer-mask-list');
    if (!container) return;
    const layer = this.active();
    const mask = layer?.masks?.find((candidate) => candidate.id === this.activeMaskId);
    renderLayerMaskEditor(container, mask, { filterKinds: this.filterKinds(), filterLabel: (kind) => this.filterLabel(kind) });
  }

  private filterKinds(): FilterKind[] {
    return [...FILTER_KINDS];
  }

  private renderLayers(): void {
    renderLayersPanel(this.root, this.ctl.doc.layers, this.activeId, this.activeMaskId, {
      getTypeLabel: (type) => this.layerTypeLabel(type),
      getTypeIcon: (type) => this.layerTypeIcon(type),
      drawThumbnail: (canvas, layer) => this.drawLayerThumbnail(canvas, layer),
      onVisibilityChange: (layer, visible) => {
        this.ctl.setProps(layer.id, { visible });
        this.ctl.comp.invalidateAll(); this.renderLayers(); this.updateHistoryUI(); this.scheduleRefresh();
      },
      onRenameOrEdit: (layer) => this.editLayerByType(layer),
      onOpenEffects: (layer) => this.openLayerEffectsEditor(layer),
      onToggleLock: (layer) => {
        this.ctl.setProps(layer.id, { locked: !layer.locked });
        this.syncUI(); this.updateHistoryUI();
      },
      onSelect: (layer) => {
        this.activeId = layer.id;
        this.activeMaskId = '';
        this.syncUI();
      },
      onSelectMask: (layer, mask) => {
        this.activeId = layer.id;
        this.activeMaskId = mask.id;
        this.syncUI();
        if (mask.type === 'filter') this.openFilterMaskEditor(layer, mask.id);
        else {
          this.hideRightEditors();
          this.q<HTMLDetailsElement>('.layer-mask-manager').open = true;
        }
      },
      onToggleMask: (layer, mask, enabled) => {
        this.ctl.updateMask(layer.id, mask.id, (current) => ({ ...current, enabled }));
        this.finishMaskEdit(enabled ? 'Se activó la máscara.' : 'Se desactivó la máscara.');
      },
      onContextMenu: (layer, x, y) => { this.activeId = layer.id; this.activeMaskId = ''; this.syncUI(); this.showLayerContextMenu(x, y, layer); },
      getDeleteBlockReason: (layer) => this.ctl.getLayerDeletionBlockReason(layer.id),
    });
    this.renderLayerMasks();
  }

  private layerTypeLabel(type: LayerType): string {
    return ({ paint: 'Capa de pintura', raster: 'Capa de pintura', filter: 'Capa de filtro', fill: 'Capa de relleno', file: 'Capa de archivo', vector: 'Capa vectorial', text: 'Capa de texto', group: 'Grupo de capas' })[type];
  }

  private layerTypeIcon(type: LayerType): string {
    return ({ paint: 'paint-layer', raster: 'paint-layer', filter: 'filter-layer', fill: 'fill-layer', file: 'file-layer', vector: 'vector-layer', text: 'text-layer', group: 'group-layer' })[type];
  }

  private drawLayerThumbnail(canvas: HTMLCanvasElement, layer: LayerNode): void {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (this.drawSpecialLayerThumbnail(context, canvas, layer)) return;
    this.drawRasterLayerThumbnail(context, canvas, layer);
  }

  private drawSpecialLayerThumbnail(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: LayerNode): boolean {
    if (layer.type === 'filter') {
      context.fillStyle = '#fcebed';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#c92334';
      context.font = 'bold 19px system-ui';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('fx', canvas.width / 2, canvas.height / 2);
      return true;
    }
    if (layer.type === 'fill') {
      context.fillStyle = layer.fillColor ?? '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      return true;
    }
    if (layer.type === 'group') {
      context.fillStyle = '#9c9caa';
      context.font = '20px system-ui';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('▱', canvas.width / 2, canvas.height / 2);
      return true;
    }
    return false;
  }

  private drawRasterLayerThumbnail(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: LayerNode): void {
    // Lee filas del ancho original sin reservar otra copia RGBA de todo el documento.
    const image = context.createImageData(canvas.width, canvas.height);
    const docW = this.ctl.doc.width;
    const docH = this.ctl.doc.height;
    const rowBytes = new Uint8Array(docW * 4);
    let anyPixels = false;
    for (let y = 0; y < canvas.height; y++) {
      const srcY = Math.min(docH - 1, Math.floor((y / canvas.height) * docH));
      rowBytes.fill(0);
      anyPixels = this.ctl.readLayerRect(layer, 0, srcY, docW, 1, rowBytes) || anyPixels;
      this.copyThumbnailRow(image.data, rowBytes, y, canvas.width, docW);
    }
    if (anyPixels) context.putImageData(image, 0, 0);
  }

  private copyThumbnailRow(target: Uint8ClampedArray, source: Uint8Array, y: number, thumbnailWidth: number, sourceWidth: number): void {
    for (let x = 0; x < thumbnailWidth; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x / thumbnailWidth) * sourceWidth));
      const src = sourceX * 4;
      const dst = (y * thumbnailWidth + x) * 4;
      target[dst] = source[src];
      target[dst + 1] = source[src + 1];
      target[dst + 2] = source[src + 2];
      target[dst + 3] = source[src + 3];
    }
  }

  private showLayerContextMenu(x: number, y: number, layer: LayerNode): void {
    this.closeLayerContextMenu();
    const menu = this.createLayerContextMenu(x, y, layer);
    document.body.append(menu);
    this.layerContextMenu = menu;
    this.bindLayerContextMenuDismissal(menu);
  }

  private createLayerContextMenu(x: number, y: number, layer: LayerNode): HTMLDivElement {
    const menu = document.createElement('div');
    menu.className = 'layer-context-menu';
    menu.setAttribute('role', 'menu');
    menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - 225))}px`;
    menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - 270))}px`;
    this.getLayerContextActions(layer).forEach(([label, action]) => {
      menu.append(this.createLayerContextMenuItem(menu, layer, label, action));
    });
    return menu;
  }

  private getLayerContextActions(layer: LayerNode): LayerContextAction[] {
    const actions: Array<[string, () => void]> = this.getCommonLayerContextActions(layer);
    actions.push(...this.layerBehaviors[layer.type].contextActions(layer));
    actions.push(['Eliminar capa', () => this.deleteLayerFromContext(layer)]);
    return actions;
  }

  private getCommonLayerContextActions(layer: LayerNode): Array<[string, () => void]> {
    return [
      ['Renombrar…', () => this.renameLayer(layer)],
      ['Duplicar capa', () => this.duplicateLayerFromContext(layer)],
      ['Subir capa', () => this.moveLayerById(layer.id, +1)],
      ['Bajar capa', () => this.moveLayerById(layer.id, -1)],
      ['Mover a grupo…', () => this.moveLayerIntoGroup(layer)],
    ];
  }

  private appendFileLayerContextActions(actions: Array<[string, () => void]>, layer: LayerNode): void {
    const linkLabel = layer.sourceLinkId ? 'Vínculo externo configurado' : 'Sin vínculo externo';
    actions.push([`${linkLabel}: ${layer.sourceName ?? layer.name}`, () => {}]);
    actions.push(['Actualizar desde archivo vinculado', () => { void this.refreshLinkedFileLayer(layer, true); }]);
    actions.push(['Vincular / reemplazar archivo fuente…', () => { void this.replaceFileLayer(layer); }]);
    if (!layer.sourceLinkId) return;
    actions.push(['Quitar vínculo externo', () => {
      this.ctl.setProps(layer.id, { sourceLinkId: undefined, sourceLastModified: undefined, sourceFileSize: undefined });
      this.syncUI();
      this.updateHistoryUI();
    }]);
  }

  private createLayerContextMenuItem(
    menu: HTMLElement,
    layer: LayerNode,
    label: string,
    action: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('role', 'menuitem');
    this.applyLayerContextItemAvailability(button, layer, label);
    button.onclick = () => {
      if (button.disabled) return;
      this.closeLayerContextMenu(menu);
      action();
    };
    return button;
  }

  private applyLayerContextItemAvailability(button: HTMLButtonElement, layer: LayerNode, label: string): void {
    if (label !== 'Eliminar capa') return;
    const reason = this.ctl.getLayerDeletionBlockReason(layer.id);
    button.disabled = Boolean(reason);
    if (reason) button.title = reason;
  }

  private bindLayerContextMenuDismissal(menu: HTMLElement): void {
    this.layerContextDismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || menu.contains(event.target)) return;
      this.closeLayerContextMenu(menu);
    };
    document.addEventListener('pointerdown', this.layerContextDismiss);
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeLayerContextMenu(menu);
    });
  }

  private closeLayerContextMenu(menu = this.layerContextMenu): void {
    menu?.remove();
    if (this.layerContextDismiss) {
      document.removeEventListener('pointerdown', this.layerContextDismiss);
      this.layerContextDismiss = null;
    }
    if (!menu || this.layerContextMenu === menu) this.layerContextMenu = null;
  }

  private duplicateLayerFromContext(layer: LayerNode): void {
    const clone = this.ctl.duplicateLayer(layer.id);
    if (clone) this.activeId = clone.id;
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
  }

  private deleteLayerFromContext(layer: LayerNode): void {
    if (!this.ctl.removeLayer(layer.id)) return;
    this.activeId = this.topRaster()?.id ?? this.ctl.doc.layers.at(-1)?.id ?? '';
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
  }

  private moveLayerIntoGroup(layer: LayerNode): void {
    const groups: LayerNode[] = [];
    const walk = (nodes: LayerNode[]) => nodes.forEach((node) => {
      if (node.type === 'group' && node.id !== layer.id && !this.isDescendantOf(layer, node.id)) groups.push(node);
      walk(node.children);
    });
    walk(this.ctl.doc.layers);
    const options = ['0 · Raíz', ...groups.map((group, index) => `${index + 1} · ${group.name}`)];
    const choice = prompt(`Mover «${layer.name}» a dónde?\n${options.join('\n')}`, '0');
    if (choice === null) return;
    const raw = choice.trim().split(/[· ]/)[0];
    const index = Number(raw);
    if (!Number.isInteger(index) || index < 0 || index > groups.length) { alert('Elegí un número de la lista.'); return; }
    const parentId = index === 0 ? null : groups[index - 1].id;
    if (this.ctl.moveLayerToParent(layer.id, parentId)) {
      this.activeId = layer.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    }
  }

  private isDescendantOf(layer: LayerNode, ancestorId: string): boolean {
    return layer.children.some((child) => child.id === ancestorId || this.isDescendantOf(child, ancestorId));
  }

  private renameLayer(layer: LayerNode): void {
    const name = prompt('Nombre de la capa', layer.name)?.trim();
    if (!name || name === layer.name) return;
    this.ctl.setProps(layer.id, { name }); this.syncUI(); this.updateHistoryUI();
  }

  private editLayerByType(layer: LayerNode): void {
    this.activeId = layer.id;
    this.layerBehaviors[layer.type].edit(layer);
  }

  private editTextLayer(layer: LayerNode): void {
    this.activeId = layer.id;
    void this.createTextAt({ x: layer.textX ?? 0, y: layer.textY ?? 0 }, layer);
  }

  private createLayerBehaviorRegistry(): Record<LayerType, LayerBehavior> {
    const noContextActions = (): LayerContextAction[] => [];
    const renameLayer = (layer: LayerNode) => this.renameLayer(layer);
    return {
      paint: { edit: renameLayer, contextActions: noContextActions },
      raster: { edit: renameLayer, contextActions: noContextActions },
      group: { edit: renameLayer, contextActions: noContextActions },
      file: {
        edit: renameLayer,
        contextActions: (layer) => {
          const actions: LayerContextAction[] = [];
          this.appendFileLayerContextActions(actions, layer);
          return actions;
        },
      },
      filter: {
        edit: (layer) => { this.syncUI(); this.openFilterEditor(layer); },
        contextActions: (layer) => [['Configurar filtro…', () => this.openFilterEditor(layer)]],
      },
      fill: {
        edit: (layer) => this.changeFillColor(layer),
        contextActions: (layer) => [['Cambiar color de relleno…', () => this.changeFillColor(layer)]],
      },
      vector: {
        edit: (layer) => this.editVectorLayer(layer),
        contextActions: (layer) => [['Editar objetos vectoriales…', () => this.editVectorLayer(layer)]],
      },
      text: {
        edit: (layer) => this.editTextLayer(layer),
        contextActions: (layer) => [['Editar texto…', () => this.editTextLayer(layer)]],
      },
    };
  }

  private openLayerEffectsEditor(layer: LayerNode): void {
    this.activeId = layer.id;
    this.activeMaskId = '';
    this.syncUI();
    this.layerEffectsPanel?.configureLayers(this.ctl.doc.layers, layer.id);
    this.showRightEditor('effects-panel');
  }

  private showRightEditor(panelId: 'effects-panel' | 'filters-panel'): void {
    this.expandRightDockForEditor();
    this.filterPanel?.hide();
    this.layerEffectsPanel?.hide();
    if (panelId === 'filters-panel') this.filterPanel?.show();
    if (panelId === 'effects-panel') this.layerEffectsPanel?.show();
    this.setRightEditorVisibility(true);
  }

  private hideRightEditors(): void {
    this.layerEffectsPanel?.hide();
    this.filterPanel?.hide();
    this.setRightEditorVisibility(false);
    this.restoreRightDockWidth();
    this.dockLayout?.refreshVisibility();
  }

  private setRightEditorVisibility(visible: boolean): void {
    const workspace = this.q<HTMLElement>('.workspace');
    const dock = this.q<HTMLElement>('.right-dock');
    workspace.classList.toggle('right-editor-open', visible);
    dock.classList.toggle('right-editor-open', visible);
    if (!visible) {
      workspace.style.removeProperty('grid-template-columns');
      dock.style.removeProperty('display');
      return;
    }
    workspace.style.setProperty(
      'grid-template-columns',
      '54px minmax(0, 1fr) 6px var(--right-dock-width, 280px)',
      'important',
    );
    dock.style.setProperty('display', 'flex', 'important');
  }

  private expandRightDockForEditor(): void {
    const workspace = this.q<HTMLElement>('.workspace');
    if (this.previousEditorDockWidth === null) this.previousEditorDockWidth = workspace.style.getPropertyValue('--right-dock-width');
    workspace.style.setProperty('--right-dock-width', 'clamp(420px, 44vw, 820px)');
  }

  private restoreRightDockWidth(): void {
    if (this.previousEditorDockWidth === null) return;
    const workspace = this.q<HTMLElement>('.workspace');
    if (this.previousEditorDockWidth) workspace.style.setProperty('--right-dock-width', this.previousEditorDockWidth);
    else workspace.style.removeProperty('--right-dock-width');
    this.previousEditorDockWidth = null;
  }

  private changeFillColor(layer: LayerNode): void {
    if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
    const color = prompt('Color de relleno (hexadecimal)', layer.fillColor ?? '#ffffff')?.trim();
    if (!color) return;
    if (!/^#?[0-9a-f]{6}$/i.test(color)) { alert('Usá un color hexadecimal de 6 dígitos, por ejemplo #e03030.'); return; }
    this.ctl.setProps(layer.id, { fillColor: color.startsWith('#') ? color : `#${color}` });
    this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
  }

  private openFilterEditor(layer: LayerNode): void {
    if (this.ctl.isEffectivelyLocked(layer.id)) {
      alert('La capa o su grupo está bloqueado.');
      return;
    }
    this.activeId = layer.id;
    this.filterEditLayerId = layer.id;
    this.filterMaskEditLayerId = null;
    this.filterMaskEditId = null;
    this.prepareFilterEditor(
      layer.name,
      layer.filterKind ?? 'grayscale',
      layer.filterStrength ?? 1,
      'Este ajuste es no destructivo y afecta a las capas inferiores. Podés cambiarlo más tarde.',
      'Capa de filtro editable',
    );
    this.showRightEditor('filters-panel');
  }

  private openFilterMaskEditor(layer: LayerNode, maskId: string): void {
    const mask = layer.masks?.find((candidate) => candidate.id === maskId && candidate.type === 'filter');
    if (!mask || mask.type !== 'filter') return;
    this.filterEditLayerId = null;
    this.filterMaskEditLayerId = layer.id;
    this.filterMaskEditId = mask.id;
    this.filterMaskFilterIndex = 0;
    const filter = mask.filters[this.filterMaskFilterIndex];
    this.prepareFilterEditor(
      layer.name,
      filter?.kind ?? 'grayscale',
      filter?.strength ?? 1,
      'La máscara conserva el efecto en la capa y permite editarlo cuando quieras.',
      'Máscara de filtro no destructiva',
    );
    this.showRightEditor('filters-panel');
  }

  private prepareFilterEditor(layerName: string, kind: FilterKind, strength: number, hint: string, mode: string): void {
    this.filterPanel?.configure({ layerName, kind, strength, hint, mode });
  }

  private filterLabel(kind: FilterKind): string {
    return FILTER_LABELS[kind];
  }

  private openDestructiveFilterPanel(): void {
    const layer = this.active();
    if (layer?.type === 'filter') { this.openFilterEditor(layer); return; }
    if (!layer || !isPixelLayerType(layer.type) || this.ctl.isEffectivelyLocked(layer.id)) {
      alert('Seleccioná una capa de píxeles desbloqueada o creá una capa de filtro para aplicar un ajuste no destructivo.');
      return;
    }
    this.filterEditLayerId = null;
    this.filterMaskEditLayerId = null;
    this.filterMaskEditId = null;
    this.prepareFilterEditor(
      layer.name, 'grayscale', 1,
      'Este filtro se aplicará directamente a los píxeles de la capa seleccionada y se podrá deshacer.',
      'Filtro destructivo sobre la capa',
    );
    this.showRightEditor('filters-panel');
  }

  private applyFilterDialog(): void {
    const selection = this.getActiveFilterSelection();
    if (!selection) return;
    if (this.filterMaskEditLayerId && this.filterMaskEditId) {
      this.applyFilterMaskSelection(selection.kind, selection.strength);
      return;
    }
    if (this.updateExistingFilterLayer(selection.layer, selection.kind, selection.strength)) return;
    if (!this.canApplyDestructiveFilter(selection.layer)) {
      this.closeFilterDialog();
      return;
    }
    this.applyDestructiveFilter(selection.layer, selection.kind, selection.strength);
  }

  private applyFilterMaskSelection(kind: FilterKind, strength: number): void {
    const layerId = this.filterMaskEditLayerId;
    const maskId = this.filterMaskEditId;
    const index = this.filterMaskFilterIndex;
    if (!layerId || !maskId) return;
    this.ctl.updateMask(layerId, maskId, (mask) => {
      if (mask.type !== 'filter') return mask;
      const filters = [...mask.filters];
      filters[index] = { kind, strength };
      return { ...mask, filters };
    });
    this.filterMaskEditLayerId = null;
    this.filterMaskEditId = null;
    this.closeFilterDialog();
    this.finishMaskEdit('Se actualizó el filtro de la máscara.');
  }

  private getActiveFilterSelection(): { layer: LayerNode; kind: FilterKind; strength: number } | null {
    const layer = this.active();
    const selection = this.filterPanel?.getSelection();
    if (!layer || !selection) return null;
    return { layer, ...selection };
  }

  private updateExistingFilterLayer(layer: LayerNode, kind: FilterKind, strength: number): boolean {
    if (!this.filterEditLayerId || layer.id !== this.filterEditLayerId || layer.type !== 'filter') return false;
    this.ctl.setProps(layer.id, { filterKind: kind, filterStrength: strength });
    this.closeFilterDialog();
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
    this.filterEditLayerId = null;
    return true;
  }

  private canApplyDestructiveFilter(layer: LayerNode): boolean {
    return isPixelLayerType(layer.type) && !this.ctl.isEffectivelyLocked(layer.id);
  }

  private applyDestructiveFilter(layer: LayerNode, kind: FilterKind, strength: number): void {
    try {
      const transformed = this.createFilteredPixelData(layer, kind, strength);
      runEdit(this.ctx, layer.engineId, `Filtro: ${this.filterLabel(kind)}`, (surface) => {
        if (!surface.writeRectFromJS(0, 0, this.ctl.doc.width, this.ctl.doc.height, transformed)) {
          throw new Error('No se pudo escribir el resultado del filtro.');
        }
      });
      this.closeFilterDialog();
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    } catch (error) {
      this.fail(error);
    }
  }

  private createFilteredPixelData(layer: LayerNode, kind: FilterKind, strength: number): Uint8Array {
    const { width, height } = this.ctl.doc;
    const original = this.ctl.readPixels(layer) ?? new Uint8Array(width * height * 4);
    const source = this.createPixelCanvas(width, height, original);
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const outputContext = output.getContext('2d', { willReadFrequently: true });
    if (!outputContext) throw new Error('El navegador no pudo preparar el filtro.');
    const filtered = renderFilteredImage(source, outputContext, kind, strength, {
      x: 0, y: 0, width, height, fullWidth: width, fullHeight: height,
    });
    return new Uint8Array(filtered.data);
  }

  private createPixelCanvas(width: number, height: number, pixels: Uint8Array): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('El navegador no pudo preparar el filtro.');
    const imageData = context.createImageData(width, height);
    imageData.data.set(pixels);
    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  private closeFilterDialog(): void {
    this.filterEditLayerId = null;
    this.filterMaskEditLayerId = null;
    this.filterMaskEditId = null;
    this.hideRightEditors();
  }

  private async createLayerOfType(type: LayerType): Promise<void> {
    this.q<HTMLElement>('#layer-create-menu').hidden = true;
    if (type === 'file') { await this.createFileLayer(); return; }
    if (type === 'text') { await this.createTextAt({ x: Math.round(this.ctl.doc.width * 0.25), y: Math.round(this.ctl.doc.height * 0.25) }); return; }
    if (type === 'fill') await this.createFillLayer();
    else this.createStandardLayer(type);
    this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
  }

  private async createFillLayer(): Promise<void> {
    const color = prompt('Color inicial de la capa de relleno', '#ffffff');
    if (!color) return;
    if (!/^#?[0-9a-f]{6}$/i.test(color.trim())) { alert('Color inválido; usá por ejemplo #ffffff.'); return; }
    const node = this.ctl.addLayer('fill', 'Relleno', undefined, -1, { fillColor: color.startsWith('#') ? color : `#${color}` });
    this.activeId = node.id;
  }

  private createStandardLayer(type: LayerType): void {
    const name = ({ paint: `Pintura ${this.ctl.doc.layers.length}`, filter: 'Filtro', vector: 'Vectorial', text: 'Texto', group: 'Grupo', raster: 'Capa', fill: 'Relleno', file: 'Archivo' } as Record<LayerType, string>)[type];
    const node = this.ctl.addLayer(type, name);
    this.activeId = node.id;
    if (type === 'vector') this.editVectorLayer(node);
  }

  private async createFileLayer(): Promise<void> {
    const source = await this.pickImageSource();
    if (!source) return;
    try { await this.createFileLayerFromSource(source); }
    catch (error) { this.fail(error); }
  }

  private async createFileLayerFromSource(source: { file: File; handle: FileSystemFileHandle | null }): Promise<void> {
    const pixels = await this.imageFileToDocumentPixels(source.file);
    const candidateLinkId = source.handle ? crypto.randomUUID() : undefined;
    const remembered = Boolean(candidateLinkId && source.handle && await this.rememberLinkedFileSafely(candidateLinkId, source.handle));
    const sourceLinkId = remembered ? candidateLinkId : undefined;
    const node = this.ctl.addFileLayer(
      documentNameFromFile(source.file.name) || 'Archivo', pixels, source.file.name, sourceLinkId,
      source.file.lastModified, source.file.size,
    );
    this.activeId = node.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    this.q<HTMLElement>('#status').textContent = sourceLinkId
      ? `Capa de archivo vinculada: ${source.file.name}`
      : `Capa de archivo importada: ${source.file.name} (sin vínculo externo en este navegador)`;
  }

  private async rememberLinkedFileSafely(linkId: string, handle: FileSystemFileHandle): Promise<boolean> {
    try { await rememberLinkedFile(linkId, handle); return true; }
    catch (error) { console.warn('No se pudo conservar el vínculo en este navegador:', error); return false; }
  }

  private async pickImageSource(): Promise<{ file: File; handle: FileSystemFileHandle | null } | null> {
    if (typeof window.showOpenFilePicker !== 'function') {
      const file = await this.pickImageFile();
      return file ? { file, handle: null } : null;
    }
    return this.pickImageSourceFromPicker();
  }

  private async pickImageSourceFromPicker(): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'Archivos de imagen', accept: {
          'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'],
          'image/gif': ['.gif'], 'image/bmp': ['.bmp'], 'image/tiff': ['.tif', '.tiff'], 'image/svg+xml': ['.svg'],
        } }],
      });
      return this.readPickedImage(handle);
    } catch (error) {
      return this.handleImagePickerError(error);
    }
  }

  private async readPickedImage(handle: FileSystemFileHandle | undefined): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
    if (!handle) return null;
    const file = await handle.getFile();
    return this.validatePickedImage(file, handle);
  }

  private validatePickedImage(file: File, handle: FileSystemFileHandle): { file: File; handle: FileSystemFileHandle } {
    if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|tiff?|svg)$/i.test(file.name)) {
      throw new Error('El archivo seleccionado no parece ser una imagen compatible.');
    }
    return { file, handle };
  }

  private handleImagePickerError(error: unknown): null {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }

  private async imageFileToDocumentPixels(file: File): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(file);
    try {
      const { width, height } = this.ctl.doc;
      const temp = document.createElement('canvas'); temp.width = width; temp.height = height;
      const ctx = temp.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('No se pudo preparar la imagen para la capa de archivo.');
      // Centra la imagen y solo la reduce si excede el tamaño del lienzo; conserva su proporción.
      const scale = Math.min(1, width / bitmap.width, height / bitmap.height);
      const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
      const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
      const x = Math.round((width - drawWidth) / 2), y = Math.round((height - drawHeight) / 2);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(bitmap, x, y, drawWidth, drawHeight);
      return new Uint8Array(ctx.getImageData(0, 0, width, height).data);
    } finally {
      bitmap.close();
    }
  }

  private async refreshLinkedFileLayer(layer: LayerNode, askForPermission: boolean): Promise<void> {
    if (layer.type !== 'file') return;
    if (this.ctl.isEffectivelyLocked(layer.id)) {
      alert('La capa o su grupo está bloqueado.');
      return;
    }
    if (!layer.sourceLinkId) {
      await this.replaceFileLayerIfRequested(layer, askForPermission);
      return;
    }
    await this.refreshExistingLinkedFileLayer(layer, layer.sourceLinkId, askForPermission);
  }

  private async replaceFileLayerIfRequested(layer: LayerNode, askForPermission: boolean): Promise<void> {
    if (!askForPermission) return;
    await this.replaceFileLayer(layer);
  }

  private async refreshExistingLinkedFileLayer(layer: LayerNode, linkId: string, askForPermission: boolean): Promise<void> {
    try { await this.refreshAndApplyExistingLinkedFile(layer, linkId, askForPermission); }
    catch (error) { this.reportLinkedFileRefreshError(error, layer, askForPermission); }
  }

  private async refreshAndApplyExistingLinkedFile(layer: LayerNode, linkId: string, askForPermission: boolean): Promise<void> {
    const file = await this.getPermittedLinkedSourceFile(linkId, askForPermission);
    if (!file || this.isLinkedFileUnchanged(layer, file, askForPermission)) return;
    await this.applyLinkedFileUpdate(layer, file, linkId);
  }

  private async getPermittedLinkedSourceFile(linkId: string, askForPermission: boolean): Promise<File | null> {
    const handle = await getLinkedFile(linkId);
    if (!handle) return this.reportMissingLinkedFile(askForPermission);
    let permission = await handle.queryPermission({ mode: 'read' });
    if (permission !== 'granted' && askForPermission) permission = await handle.requestPermission({ mode: 'read' });
    if (permission !== 'granted') return this.reportLinkedFilePermissionDenied(askForPermission);
    return handle.getFile();
  }

  private reportMissingLinkedFile(askForPermission: boolean): null {
    if (askForPermission) alert('No se encontró el vínculo en este navegador. Usá «Vincular / reemplazar archivo fuente…» para volver a vincularlo. La imagen guardada en el proyecto sigue disponible.');
    return null;
  }

  private reportLinkedFilePermissionDenied(askForPermission: boolean): null {
    if (askForPermission) alert('El navegador no concedió permiso para leer el archivo vinculado.');
    return null;
  }

  private isLinkedFileUnchanged(layer: LayerNode, file: File, askForPermission: boolean): boolean {
    return !askForPermission && file.lastModified === layer.sourceLastModified && file.size === layer.sourceFileSize;
  }

  private async applyLinkedFileUpdate(layer: LayerNode, file: File, linkId: string): Promise<void> {
    const pixels = await this.imageFileToDocumentPixels(file);
    const updated = this.ctl.replaceFileLayerContent(layer.id, pixels, file.name, linkId, file.lastModified, file.size);
    if (!updated) return;
    this.activeId = layer.id;
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
    this.q<HTMLElement>('#status').textContent = `Imagen vinculada actualizada: ${file.name}`;
  }

  private reportLinkedFileRefreshError(error: unknown, layer: LayerNode, askForPermission: boolean): void {
    if (askForPermission) {
      this.fail(error);
      return;
    }
    console.warn(`No se pudo actualizar la capa vinculada «${layer.name}»:`, error);
  }

  private async refreshLinkedFileLayers(askForPermission = false): Promise<void> {
    await this.walkLinkedFileLayerTree(this.ctl.doc.layers, askForPermission);
  }

  private async walkLinkedFileLayerTree(nodes: LayerNode[], askForPermission: boolean): Promise<void> {
    for (const layer of nodes) await this.refreshLinkedFileLayerTreeNode(layer, askForPermission);
  }

  private async refreshLinkedFileLayerTreeNode(layer: LayerNode, askForPermission: boolean): Promise<void> {
    if (layer.type === 'file' && layer.sourceLinkId) await this.refreshLinkedFileLayer(layer, askForPermission);
    if (layer.children.length) await this.walkLinkedFileLayerTree(layer.children, askForPermission);
  }

  private pickImageFile(): Promise<File | null> {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
    return new Promise((resolve) => {
      input.onchange = () => resolve(input.files?.[0] ?? null);
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  }

  private async replaceFileLayer(layer: LayerNode): Promise<void> {
    if (layer.type !== 'file') return;
    if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
    const source = await this.pickImageSource();
    if (!source) return;
    try { await this.replaceFileLayerFromSource(layer, source); }
    catch (error) { this.fail(error); }
  }

  private async replaceFileLayerFromSource(
    layer: LayerNode,
    source: { file: File; handle: FileSystemFileHandle | null },
  ): Promise<void> {
    const pixels = await this.imageFileToDocumentPixels(source.file);
    const candidateLinkId = source.handle ? crypto.randomUUID() : undefined;
    const remembered = Boolean(candidateLinkId && source.handle && await this.rememberLinkedFileSafely(candidateLinkId, source.handle));
    const nextLinkId = remembered ? candidateLinkId : undefined;
    const updated = this.ctl.replaceFileLayerContent(layer.id, pixels, source.file.name, nextLinkId, source.file.lastModified, source.file.size);
    if (!updated) return;
    this.activeId = layer.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    this.q<HTMLElement>('#status').textContent = nextLinkId
      ? `Vínculo externo actualizado: ${source.file.name}`
      : `Imagen reemplazada (sin vínculo externo): ${source.file.name}`;
  }

  private editVectorLayer(layer: LayerNode): void {
    if (layer.type !== 'vector') return;
    if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
    this.activeId = layer.id;
    this.vectorEditLayerId = layer.id;
    this.vectorDraft = cloneVectorShapes(layer.vectorShapes);
    this.vectorSelectedId = this.vectorDraft[0]?.id ?? null;
    this.q<HTMLElement>('#vector-layer-name').textContent = layer.name;
    this.renderVectorEditor();
    this.q<HTMLElement>('#vector-panel').hidden = false;
  }

  private vectorKindLabel(kind: VectorShape['kind']): string {
    return ({
      rectangle: 'Rectángulo', 'rounded-rectangle': 'Rectángulo redondeado', ellipse: 'Elipse', line: 'Línea',
      polygon: 'Polígono', polyline: 'Polilínea', bezier: 'Curva Bézier', freehand: 'Trazo libre',
      star: 'Estrella', spiral: 'Espiral', text: 'Texto artístico',
    } as const)[kind];
  }

  private renderVectorEditor(): void {
    renderVectorEditorPanel(
      this.root,
      this.vectorDraft,
      this.vectorSelectedId,
      (kind) => this.vectorKindLabel(kind),
      (id) => { this.vectorSelectedId = id; this.renderVectorEditor(); },
    );
  }

  private addVectorShape(kind: VectorShape['kind']): void {
    if (!this.vectorEditLayerId) return;
    const x = Math.round(this.ctl.doc.width * 0.25), y = Math.round(this.ctl.doc.height * 0.25);
    const width = Math.max(24, Math.round(this.ctl.doc.width * 0.25)), height = Math.max(24, Math.round(this.ctl.doc.height * 0.25));
    let points: VectorShape['points'];
    if (kind === 'polygon') points = [{ x: x + width / 2, y }, { x: x + width, y: y + height }, { x, y: y + height }];
    else if (kind === 'polyline' || kind === 'freehand') points = [
      { x, y: y + height * .75 }, { x: x + width * .22, y: y + height * .12 }, { x: x + width * .45, y: y + height * .82 },
      { x: x + width * .69, y: y + height * .22 }, { x: x + width, y: y + height * .58 },
    ];
    else if (kind === 'bezier') points = [
      { x, y: y + height, outX: x + width * .25, outY: y },
      { x: x + width, y, inX: x + width * .75, inY: y + height },
    ];
    const shape: VectorShape = {
      id: crypto.randomUUID(), kind, x, y, width, height, color: '#e03030', fillColor: '#e03030', strokeColor: '#e03030',
      opacity: 1, strokeWidth: 4, fillEnabled: !['line','polyline','bezier','freehand','spiral'].includes(kind),
      strokeEnabled: true, strokeDash: 'solid', lineCap: 'round', lineJoin: 'round', cornerRadius: 20,
      points, starPoints: 5, rotation: 0, text: 'Texto vectorial', fontFamily: 'Arial', fontSize: 64,
      fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left',
    };
    this.vectorDraft.push(shape);
    this.vectorSelectedId = shape.id;
    this.renderVectorEditor();
  }

  private updateVectorShapeFromFields(): void {
    const shape = this.vectorDraft.find((item) => item.id === this.vectorSelectedId);
    if (!shape) return;
    this.updateVectorShapeGeometry(shape);
    this.updateVectorShapePaintStyle(shape);
    this.updateVectorShapeTextStyle(shape);
    this.updateVectorShapePoints(shape);
    this.updateVectorShapeSummary(shape);
  }

  private updateVectorShapeGeometry(shape: VectorShape): void {
    shape.kind = this.q<HTMLSelectElement>('#vector-kind').value as VectorShape['kind'];
    const read = (id: string, fallback: number) => this.readVectorNumber(id, fallback);
    shape.x = read('vector-x', shape.x);
    shape.y = read('vector-y', shape.y);
    shape.width = Math.max(1, read('vector-width', shape.width));
    shape.height = Math.max(1, read('vector-height', shape.height));
    shape.rotation = Math.max(-360, Math.min(360, read('vector-rotation', shape.rotation ?? 0)));
  }

  private updateVectorShapePaintStyle(shape: VectorShape): void {
    shape.color = this.q<HTMLInputElement>('#vector-color').value;
    shape.fillColor = shape.color;
    shape.strokeColor = this.q<HTMLInputElement>('#vector-stroke-color').value;
    shape.opacity = Math.max(0, Math.min(1, this.readVectorNumber('vector-opacity', shape.opacity * 100) / 100));
    shape.strokeWidth = Math.max(0, Math.min(500, this.readVectorNumber('vector-stroke', shape.strokeWidth)));
    shape.fillEnabled = this.q<HTMLSelectElement>('#vector-fill-enabled').value === 'yes';
    shape.strokeEnabled = this.q<HTMLSelectElement>('#vector-stroke-enabled').value === 'yes';
    shape.strokeDash = this.q<HTMLSelectElement>('#vector-dash').value as NonNullable<VectorShape['strokeDash']>;
    shape.lineCap = this.q<HTMLSelectElement>('#vector-line-cap').value as NonNullable<VectorShape['lineCap']>;
    shape.lineJoin = this.q<HTMLSelectElement>('#vector-line-join').value as NonNullable<VectorShape['lineJoin']>;
    shape.cornerRadius = Math.max(0, Math.min(500, this.readVectorNumber('vector-corner-radius', shape.cornerRadius ?? 20)));
    shape.starPoints = Math.max(3, Math.min(64, Math.round(this.readVectorNumber('vector-star-points', shape.starPoints ?? 5))));
  }

  private updateVectorShapeTextStyle(shape: VectorShape): void {
    shape.text = this.q<HTMLInputElement>('#vector-text').value;
    shape.fontFamily = this.q<HTMLSelectElement>('#vector-font-family').value;
    shape.fontSize = Math.max(1, Math.min(2000, this.readVectorNumber('vector-font-size', shape.fontSize ?? 64)));
    shape.fontStyle = this.q<HTMLSelectElement>('#vector-font-style').value as NonNullable<VectorShape['fontStyle']>;
    shape.fontWeight = this.q<HTMLSelectElement>('#vector-font-weight').value as NonNullable<VectorShape['fontWeight']>;
    shape.textAlign = this.q<HTMLSelectElement>('#vector-text-align').value as NonNullable<VectorShape['textAlign']>;
  }

  private updateVectorShapePoints(shape: VectorShape): void {
    const pointsValue = this.q<HTMLTextAreaElement>('#vector-points').value.trim();
    if (!pointsValue) {
      shape.points = undefined;
      return;
    }
    try { shape.points = this.parseVectorShapePoints(pointsValue); }
    catch (error) { this.reportVectorShapePointsError(error); }
  }

  private parseVectorShapePoints(value: string): NonNullable<VectorShape['points']> {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((point) => !point || typeof point.x !== 'number' || typeof point.y !== 'number')) {
      throw new Error('Los nodos deben ser una lista JSON de puntos con coordenadas x e y.');
    }
    return parsed as NonNullable<VectorShape['points']>;
  }

  private reportVectorShapePointsError(error: unknown): void {
    this.q<HTMLElement>('#status').textContent = error instanceof Error
      ? `Nodos vectoriales: ${error.message}`
      : 'El JSON de nodos no es válido.';
  }

  private updateVectorShapeSummary(shape: VectorShape): void {
    this.q<HTMLElement>('#vector-opacity-value').textContent = `${Math.round(shape.opacity * 100)}%`;
    const index = this.vectorDraft.indexOf(shape);
    const listButton = this.q<HTMLElement>('#vector-shape-list').children[index] as HTMLButtonElement | undefined;
    if (listButton) listButton.textContent = `${this.vectorKindLabel(shape.kind)} · ${Math.round(shape.x)}, ${Math.round(shape.y)}`;
  }

  private readVectorNumber(id: string, fallback: number): number {
    const parsed = Number(this.q<HTMLInputElement>(`#${id}`).value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private duplicateSelectedVectorShape(): void {
    const index = this.vectorDraft.findIndex((shape) => shape.id === this.vectorSelectedId);
    if (index < 0) return;
    const original = this.vectorDraft[index];
    const clone = cloneVectorShape(original);
    clone.id = crypto.randomUUID();
    clone.x += 12;
    clone.y += 12;
    this.vectorDraft.splice(index + 1, 0, clone); this.vectorSelectedId = clone.id; this.renderVectorEditor();
  }

  private moveSelectedVectorShape(delta: number): void {
    const index = this.vectorDraft.findIndex((shape) => shape.id === this.vectorSelectedId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= this.vectorDraft.length) return;
    const [shape] = this.vectorDraft.splice(index, 1); this.vectorDraft.splice(target, 0, shape); this.renderVectorEditor();
  }

  private deleteSelectedVectorShape(): void {
    const index = this.vectorDraft.findIndex((shape) => shape.id === this.vectorSelectedId);
    if (index < 0) return;
    this.vectorDraft.splice(index, 1);
    this.vectorSelectedId = this.vectorDraft[Math.min(index, this.vectorDraft.length - 1)]?.id ?? null;
    this.renderVectorEditor();
  }

  private applyVectorEditor(): void {
    const layer = this.vectorEditLayerId ? this.ctl.find(this.vectorEditLayerId) : undefined;
    if (!layer || layer.type !== 'vector') { this.q<HTMLElement>('#vector-panel').hidden = true; return; }
    this.updateVectorShapeFromFields();
    this.commitVectorShapes(layer, cloneVectorShapes(this.vectorDraft));
    this.q<HTMLElement>('#vector-panel').hidden = true;
    this.vectorEditLayerId = null; this.vectorSelectedId = null; this.vectorDraft = [];
  }

  private cancelVectorEditor(): void {
    this.q<HTMLElement>('#vector-panel').hidden = true;
    this.vectorEditLayerId = null; this.vectorSelectedId = null; this.vectorDraft = [];
  }

  private commitVectorShapes(layer: LayerNode, shapes: VectorShape[]): void {
    const canvas = document.createElement('canvas'); canvas.width = this.ctl.doc.width; canvas.height = this.ctl.doc.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { alert('No se pudo preparar la capa vectorial.'); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const shape of shapes) renderVectorShape(ctx, shape);
    this.ctl.replaceVectorContent(layer.id, shapes, new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
    this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
  }

  private exportVectorLayerSvg(): void {
    const layer = this.getVectorLayerForExport();
    if (!layer) return;
    this.downloadVectorLayerSvg(layer, this.createVectorLayerSvg());
  }

  private getVectorLayerForExport(): LayerNode | undefined {
    const layer = this.vectorEditLayerId ? this.ctl.find(this.vectorEditLayerId) : undefined;
    return layer?.type === 'vector' ? layer : undefined;
  }

  private createVectorLayerSvg(): string {
    const width = this.ctl.doc.width;
    const height = this.ctl.doc.height;
    const shapes = this.vectorDraft.map(exportVectorShapeToSvg).join('\n  ');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  ${shapes}\n</svg>`;
  }

  private downloadVectorLayerSvg(layer: LayerNode, svg: string): void {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${layer.name.replace(/[\\/:*?"<>|]/g, '_') || 'Capa-vectorial'}.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private moveLayerById(id: string, delta: number): void {
    this.activeId = id;
    if (this.ctl.moveLayer(id, delta)) { this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh(); }
  }

  // ───────────── Eventos ─────────────

  private bind(): void {
    this.bindPluginAndLayerPanels();
    this.wireComicManager();
    this.initializeToolPanels();
    this.bindMenuDropdowns();
    this.bindWorkspaceSelector();
    this.bindPanelVisibilityMenu();
    this.bindToolAndViewControls();
    this.bindEditorPanels();
    this.bindFileToolbar();
    this.bindMaskControls();
    this.bindCanvasEvents();
    this.bindKeyboardShortcuts();
  }

  private bindPluginAndLayerPanels(): void {
    wirePlugins(this.root, () => this.createPluginApiContext());
    wireLayersPanel(this.root, {
      createLayer: (type) => { void this.createLayerOfType(type); },
      createMask: (type) => this.addMaskToActiveLayer(type),
      deleteActiveLayer: () => this.deleteActiveLayer(),
      duplicateActiveLayer: () => this.duplicateActiveLayer(),
      moveActiveLayer: (delta) => this.moveActive(delta),
      changeFillColor: () => {
        const layer = this.active();
        if (layer?.type === 'fill') this.changeFillColor(layer);
      },
      configureFilter: () => {
        const layer = this.active();
        if (layer?.type === 'filter') this.openFilterEditor(layer);
      },
      editVectorLayer: () => {
        const layer = this.active();
        if (layer?.type === 'vector') this.editVectorLayer(layer);
      },
      editTextLayer: () => {
        const layer = this.active();
        if (layer?.type === 'text') void this.createTextAt({ x: layer.textX ?? 0, y: layer.textY ?? 0 }, layer);
      },
      setOpacity: (opacity) => this.setActiveLayerOpacity(opacity),
      setBlendMode: (blendMode) => this.setActiveLayerBlendMode(blendMode),
    });
  }

  private deleteActiveLayer(): void {
    if (this.stroke) return;
    const layer = this.active();
    if (!layer) return;
    const reason = this.ctl.getLayerDeletionBlockReason(layer.id);
    if (reason) {
      this.syncUI();
      this.reportLayerDeletionBlockReason(reason);
      return;
    }
    if (!this.ctl.removeLayer(layer.id)) return;
    this.activeId = this.topRaster()?.id ?? this.ctl.doc.layers.at(-1)?.id ?? '';
    this.refreshAfterLayerStructureChange();
  }

  private reportLayerDeletionBlockReason(reason: string): void {
    const status = this.root.querySelector<HTMLElement>('#status');
    if (status) status.textContent = reason;
  }

  private duplicateActiveLayer(): void {
    if (this.stroke || !this.active()) return;
    const copy = this.ctl.duplicateLayer(this.activeId);
    if (copy) this.activeId = copy.id;
    this.refreshAfterLayerPropertyChange();
  }

  private setActiveLayerOpacity(opacity: number): void {
    const layer = this.active();
    if (!layer) return;
    this.ctl.setProps(layer.id, { opacity });
    this.refreshAfterLayerPropertyChange();
  }

  private setActiveLayerBlendMode(blendMode: LayerNode['blendMode']): void {
    const layer = this.active();
    if (!layer) return;
    this.ctl.setProps(layer.id, { blendMode });
    this.refreshAfterLayerPropertyChange();
  }

  private refreshAfterLayerStructureChange(): void {
    this.ctl.comp.invalidateAll();
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
  }

  private refreshAfterLayerPropertyChange(): void {
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
  }

  private initializeToolPanels(): void {
    this.renderToolOptions();
    this.renderAdvancedToolOptions();
    this.applyCanvasView();
    this.updatePreviewCanvasSize();
  }

  private getMenuEntries() {
    return [
      { button: this.q<HTMLButtonElement>('#menu-file'), dropdown: this.q<HTMLElement>('#file-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-edit'), dropdown: this.q<HTMLElement>('#edit-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-view'), dropdown: this.q<HTMLElement>('#view-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-workspace'), dropdown: this.q<HTMLElement>('#workspace-menu-dropdown') },
    ];
  }

  private closeMenu(menu: { button: HTMLButtonElement; dropdown: HTMLElement }): void {
    menu.dropdown.hidden = true;
    menu.button.setAttribute('aria-expanded', 'false');
  }

  private bindMenuDropdowns(): void {
    const menus = this.getMenuEntries();
    for (const menu of menus) {
      menu.button.addEventListener('click', (event) => {
        event.stopPropagation();
        const shouldOpen = menu.dropdown.hidden;
        menus.forEach((entry) => this.closeMenu(entry));
        menu.dropdown.hidden = !shouldOpen;
        menu.button.setAttribute('aria-expanded', String(shouldOpen));
      });
      menu.dropdown.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button[role^="menuitem"]')) this.closeMenu(menu);
      });
      menu.dropdown.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        this.closeMenu(menu);
        menu.button.focus();
      });
    }
    document.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      menus.forEach((menu) => {
        if (!menu.dropdown.contains(target) && !menu.button.contains(target)) this.closeMenu(menu);
      });
    });
  }

  private bindWorkspaceSelector(): void {
    const workspaceMenu = this.getMenuEntries()[3];
    const dropdown = workspaceMenu.dropdown;
    const refresh = () => {
      dropdown.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
        const selected = button.dataset.workspace === this.workspace;
        button.setAttribute('aria-checked', String(selected));
        const check = button.querySelector<HTMLElement>('.menu-check');
        if (check) check.textContent = selected ? '✓' : '';
      });
    };
    dropdown.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const candidate = button.dataset.workspace as WorkspaceId;
        if (!this.workspaceManager.isWorkspaceId(candidate)) return;
        this.applyWorkspace(candidate);
        this.closeMenu(workspaceMenu);
        refresh();
      });
    });
    refresh();
  }

  private getPanelVisibilityEntries() {
    return [
      { button: this.q<HTMLButtonElement>('#toggle-panel-advanced'), panel: this.q<HTMLElement>('.advanced-tool-panel') },
      { button: this.q<HTMLButtonElement>('#toggle-panel-history'), panel: this.q<HTMLElement>('.history-panel') },
      { button: this.q<HTMLButtonElement>('#toggle-panel-layers'), panel: this.q<HTMLElement>('.layers-panel') },
      { button: this.q<HTMLButtonElement>('#toggle-panel-comic'), panel: this.q<HTMLElement>('.comic-manager-panel') },
      { button: this.q<HTMLButtonElement>('#toggle-panel-storyboard'), panel: this.q<HTMLElement>('.storyboard-panel') },
      { button: this.q<HTMLButtonElement>('#toggle-panel-timeline'), panel: this.q<HTMLElement>('.animation-timeline-panel') },
    ];
  }

  private bindPanelVisibilityMenu(): void {
    const viewMenu = this.getMenuEntries()[2];
    const panelsDropdown = this.q<HTMLElement>('#panels-menu-dropdown');
    const panelsMenuButton = this.q<HTMLButtonElement>('#menu-panels');
    this.bindPanelDropdownEvents(viewMenu, panelsDropdown, panelsMenuButton);
    this.bindPanelVisibilityItems(viewMenu, panelsDropdown, panelsMenuButton);
    this.q<HTMLButtonElement>('#toggle-panels').onclick = () => this.toggleAllPanels(panelsDropdown, panelsMenuButton, viewMenu);
    this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
    this.applyWorkspace(this.workspace, false);
    this.dockLayout = createDockLayoutManager(this.root, this.workspace);
    this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
  }

  private bindPanelDropdownEvents(
    viewMenu: { button: HTMLButtonElement; dropdown: HTMLElement },
    panelsDropdown: HTMLElement,
    panelsMenuButton: HTMLButtonElement,
  ): void {
    viewMenu.button.addEventListener('click', () => {
      if (!viewMenu.dropdown.hidden) return;
      panelsDropdown.hidden = true;
      panelsMenuButton.setAttribute('aria-expanded', 'false');
    });
    panelsMenuButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      panelsDropdown.hidden = !panelsDropdown.hidden;
      this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
    });
    panelsDropdown.addEventListener('click', (event) => event.stopPropagation());
    panelsDropdown.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      panelsDropdown.hidden = true;
      this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
      panelsMenuButton.focus();
    });
  }

  private bindPanelVisibilityItems(
    viewMenu: { button: HTMLButtonElement; dropdown: HTMLElement },
    panelsDropdown: HTMLElement,
    panelsMenuButton: HTMLButtonElement,
  ): void {
    this.getPanelVisibilityEntries().forEach((entry) => {
      entry.button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        entry.panel.hidden = !entry.panel.hidden;
        panelsDropdown.hidden = true;
        this.closeMenu(viewMenu);
        this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
        this.dockLayout?.refreshVisibility();
      });
    });
  }

  private updatePanelVisibilityMenu(panelsDropdown: HTMLElement, panelsMenuButton: HTMLButtonElement): void {
    const entries = this.getPanelVisibilityEntries();
    entries.forEach((entry) => {
      const visible = !entry.panel.hidden;
      entry.button.setAttribute('aria-checked', String(visible));
      const check = entry.button.querySelector<HTMLElement>('.menu-check');
      if (check) check.textContent = visible ? '✓' : '';
    });
    const dock = this.q<HTMLElement>('.right-dock');
    dock.classList.toggle('panels-empty', entries.every((entry) => entry.panel.hidden || !entry.panel.closest('.dock-panel-slot')));
    const workspace = this.q<HTMLElement>('.workspace');
    const allHidden = dock.classList.contains('panels-hidden') || workspace.classList.contains('panels-hidden');
    this.q<HTMLButtonElement>('#toggle-panels').setAttribute('aria-pressed', String(!allHidden));
    panelsMenuButton.setAttribute('aria-expanded', String(!panelsDropdown.hidden));
  }

  private toggleAllPanels(panelsDropdown?: HTMLElement, panelsMenuButton?: HTMLButtonElement, viewMenu?: { button: HTMLButtonElement; dropdown: HTMLElement }): void {
    const entries = this.getPanelVisibilityEntries();
    const dock = this.q<HTMLElement>('.right-dock');
    const workspace = this.q<HTMLElement>('.workspace');
    const everyPanelHidden = entries.every((entry) => entry.panel.hidden);
    const dockWasHidden = dock.classList.contains('panels-hidden') || workspace.classList.contains('panels-hidden');
    if (dockWasHidden) {
      dock.classList.remove('panels-hidden');
      workspace.classList.remove('panels-hidden');
      this.revealPanelsWhenAllHidden(entries, everyPanelHidden);
    } else if (everyPanelHidden) {
      entries.forEach((entry) => { entry.panel.hidden = false; });
    } else {
      dock.classList.add('panels-hidden');
      workspace.classList.add('panels-hidden');
    }
    if (panelsDropdown) panelsDropdown.hidden = true;
    if (viewMenu) this.closeMenu(viewMenu);
    if (panelsMenuButton && panelsDropdown) this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
    else {
      const dropdown = this.q<HTMLElement>('#panels-menu-dropdown');
      const button = this.q<HTMLButtonElement>('#menu-panels');
      this.updatePanelVisibilityMenu(dropdown, button);
    }
    this.dockLayout?.refreshVisibility();
  }

  private bindToolAndViewControls(): void {
    this.bindToolButtons();
    this.bindZoomButtons();
    this.bindClosePanelControls();
  }

  private bindToolButtons(): void {
    const on = (id: string, fn: () => void) => { this.q(id).onclick = fn; };
    on('#menu-filter', () => this.openDestructiveFilterPanel());
    const layerMenuButton = this.q<HTMLButtonElement>('#menu-layer');
    layerMenuButton.title = 'Doble clic izquierdo para abrir estilos de capa';
    layerMenuButton.onclick = () => undefined;
    layerMenuButton.ondblclick = (event) => {
      if (event.button !== 0) return;
      const layer = this.active();
      if (layer) this.openLayerEffectsEditor(layer);
    };
    on('#rail-hand', () => this.setTool('hand'));
    on('#rail-brush', () => this.setTool('brush'));
    on('#rail-eraser', () => this.setTool('eraser'));
    on('#rail-eyedropper', () => this.setTool('eyedropper'));
    on('#rail-line', () => this.setTool('line'));
    on('#rail-text', () => this.setTool('text'));
    on('#rail-vector-select', () => this.setTool('vector-select'));
    on('#rail-rectangle', () => this.setTool('rectangle'));
    on('#rail-ellipse', () => this.setTool('ellipse'));
    on('#rail-fill', () => this.setTool('fill'));
  }

  private bindZoomButtons(): void {
    this.q<HTMLButtonElement>('#zoom-out').onclick = () => {
      this.zoom = Math.max(0.25, Math.round((this.zoom / 1.2) * 1000) / 1000);
      this.applyCanvasView();
    };
    this.q<HTMLButtonElement>('#zoom-in').onclick = () => {
      this.zoom = Math.min(8, Math.round((this.zoom * 1.2) * 1000) / 1000);
      this.applyCanvasView();
    };
    this.q<HTMLButtonElement>('#zoom-fit').onclick = () => {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      this.applyCanvasView();
    };
  }

  private bindClosePanelControls(): void {
    this.root.querySelectorAll<HTMLElement>('[data-close]').forEach((element) => {
      element.addEventListener('click', () => {
        const target = element.dataset.close;
        if (!target) return;
        if (target === 'filters-panel') this.closeFilterDialog();
        else if (target === 'effects-panel') this.hideRightEditors();
        else this.q<HTMLElement>('#' + target).hidden = true;
      });
    });
  }

  private bindEditorPanels(): void {
    this.filterPanel = wireFilterPanel(this.root, {
      labelForFilter: (kind) => this.filterLabel(kind),
      applyFilter: () => this.applyFilterDialog(),
    });
    this.layerEffectsPanel = wireLayerEffectsPanel(this.root, (layerId) => {
      const layer = this.ctl.find(layerId);
      if (layer) this.openLayerEffectsEditor(layer);
    }, () => this.hideRightEditors());
    wireVectorEditorPanel(this.root, {
      addShape: (kind) => this.addVectorShape(kind),
      deleteShape: () => this.deleteSelectedVectorShape(),
      duplicateShape: () => this.duplicateSelectedVectorShape(),
      moveShape: (delta) => this.moveSelectedVectorShape(delta),
      exportSvg: () => this.exportVectorLayerSvg(),
      apply: () => this.applyVectorEditor(),
      cancel: () => this.cancelVectorEditor(),
      clear: () => this.clearVectorEditor(),
      updateFromFields: () => this.updateVectorShapeFromFields(),
    });
  }

  private clearVectorEditor(): void {
    if (!confirm('¿Vaciar todos los objetos de esta capa vectorial?')) return;
    this.vectorDraft = [];
    this.vectorSelectedId = null;
    this.renderVectorEditor();
  }

  private bindFileToolbar(): void {
    this.q('#b-new').onclick = () => this.promptNew();
    this.q('#b-open').onclick = () => { void this.open(); };
    this.q('#b-import-image').onclick = () => { void this.createFileLayer(); };
    this.q('#b-save').onclick = () => { void this.save(false); };
    this.q('#b-save-as').onclick = () => { void this.save(true); };
    this.q('#b-export-png').onclick = () => { void this.exportVisibleImage('image/png'); };
    this.q('#b-export-jpeg').onclick = () => { void this.exportVisibleImage('image/jpeg'); };
  }

  private async exportVisibleImage(mimeType: 'image/png' | 'image/jpeg'): Promise<void> {
    try {
      if (this.stroke) return;
      const { width, height, name } = this.ctl.doc;
      const composition = this.createSamplingCanvas(width, height);
      this.composeSamplingLayers(this.ctl.doc.layers, composition, width, height, (layer) => this.ctl.readPixels(layer));
      const output = mimeType === 'image/jpeg' ? this.flattenOnWhite(composition, width, height) : composition;
      const blob = await this.encodeCanvas(output, mimeType);
      this.downloadRaster(blob, name, mimeType);
      this.q<HTMLElement>('#status').textContent = `Exportado como ${mimeType === 'image/png' ? 'PNG' : 'JPEG'} · ${width}×${height}`;
    } catch (error) {
      this.fail(error);
    }
  }

  private flattenOnWhite(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
    const output = this.createSamplingCanvas(width, height);
    const context = output.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la exportación JPEG.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0);
    return output;
  }

  private encodeCanvas(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`El navegador no pudo codificar la imagen como ${mimeType}.`));
      }, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined);
    });
  }

  private downloadRaster(blob: Blob, documentName: string, mimeType: 'image/png' | 'image/jpeg'): void {
    const extension = mimeType === 'image/png' ? 'png' : 'jpg';
    const safeName = documentName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'PhotoMania';
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: `${safeName}.${extension}` });
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private bindCanvasEvents(): void {
    const canvas = this.canvas;
    canvas.addEventListener('pointerdown', (event) => this.down(event));
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.up(event));
    canvas.addEventListener('pointercancel', (event) => this.up(event));
    canvas.addEventListener('contextmenu', (event) => {
      if (this.tool !== 'eyedropper') event.preventDefault();
    });
    const stage = this.root.querySelector<HTMLElement>('.canvas-stage')!;
    stage.addEventListener('wheel', (event) => this.handleCanvasWheel(event), { passive: false });
    new ResizeObserver(() => {
      this.updatePreviewCanvasSize();
      this.scheduleRefresh();
    }).observe(stage);
  }

  private handleCanvasWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      this.zoom = Math.max(0.25, Math.min(8, this.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
      this.applyCanvasView();
      return;
    }
    if (!this.spaceDown && !event.shiftKey) return;
    event.preventDefault();
    this.panX -= event.deltaX;
    this.panY -= event.deltaY;
    this.applyCanvasView();
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (event) => this.handleKeyDown(event));
    window.addEventListener('keyup', (event) => {
      if (event.code === 'Space') this.spaceDown = false;
    });
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement | null;
    const typing = this.isTypingTarget(target);
    const insideMenuOrDialog = !!target?.closest('.menus, .preferences-overlay, .editor-panel');
    if (this.shouldTogglePanelsFromKey(event, mod, typing, insideMenuOrDialog)) {
      event.preventDefault();
      this.toggleAllPanels();
      return;
    }
    if (event.code === 'Space' && !typing) {
      event.preventDefault();
      this.spaceDown = true;
      return;
    }
    if (this.handleDocumentShortcut(event, mod, key)) return;
    this.handleToolShortcut(key, mod, typing);
  }

  private isTypingTarget(target: HTMLElement | null): boolean {
    return !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  }

  private shouldTogglePanelsFromKey(event: KeyboardEvent, mod: boolean, typing: boolean, insideMenuOrDialog: boolean): boolean {
    return event.key === 'Tab' && !event.shiftKey && !mod && !event.altKey && !typing && !insideMenuOrDialog;
  }

  private revealPanelsWhenAllHidden(entries: ReturnType<App['getPanelVisibilityEntries']>, everyPanelHidden: boolean): void {
    if (everyPanelHidden) entries.forEach((entry) => { entry.panel.hidden = false; });
  }

  private handleDocumentShortcut(event: KeyboardEvent, mod: boolean, key: string): boolean {
    if (!mod) return false;
    if (key === 'z') {
      event.preventDefault();
      event.shiftKey ? this.doRedo() : this.doUndo();
      return true;
    }
    if (key === 'y') { event.preventDefault(); this.doRedo(); return true; }
    if (key === 's') { event.preventDefault(); void this.save(event.shiftKey); return true; }
    if (key === 'o') { event.preventDefault(); void this.open(); return true; }
    if (key === 'n') { event.preventDefault(); this.promptNew(); return true; }
    return false;
  }

  private handleToolShortcut(key: string, mod: boolean, typing: boolean): void {
    if (mod || typing) return;
    const tools: Record<string, Tool> = {
      b: 'brush', e: 'eraser', i: 'eyedropper', l: 'line', r: 'rectangle',
      o: 'ellipse', g: 'fill', h: 'hand', t: 'text', v: 'vector-select',
    };
    const tool = tools[key];
    if (tool) this.setTool(tool);
  }

  private createPluginApiContext(): Partial<PluginApi> {
    const collectLayers = (nodes: LayerNode[]): LayerNode[] => nodes.flatMap((node) => [node, ...collectLayers(node.children)]);
    return {
      getDocumentInfo: () => this.ctl ? ({ name: this.ctl.doc.name, width: this.ctl.doc.width, height: this.ctl.doc.height, activeLayerId: this.activeId || null }) : null,
      getLayers: () => this.ctl ? collectLayers(this.ctl.doc.layers).map((layer) => ({ id: layer.id, name: layer.name, type: layer.type, visible: layer.visible, locked: layer.locked, opacity: layer.opacity })) : [],
      createLayer: (type, name) => {
        if (!this.ctl) return null;
        try {
          const node = this.ctl.addLayer(type, name);
          this.activeId = node.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
          return { id: node.id, name: node.name, type: node.type };
        } catch (error) { this.fail(error); return null; }
      },
      renameLayer: (id, name) => {
        if (!this.ctl || !name.trim()) return false;
        const done = this.ctl.setProps(id, { name: name.trim().slice(0, 120) });
        if (done) { this.syncUI(); this.updateHistoryUI(); }
        return done;
      },
      setLayerProperties: (id, properties) => {
        if (!this.ctl) return false;
        const patch = { ...properties };
        if (patch.opacity !== undefined) patch.opacity = Math.max(0, Math.min(1, patch.opacity));
        const done = this.ctl.setProps(id, patch);
        if (done) { this.ctl.comp.invalidateAll(); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh(); }
        return done;
      },
    };
  }

  private beginVectorGesture(point: { x: number; y: number }, event: PointerEvent): void {
    const layer = this.active();
    if (!layer || layer.type !== 'vector') { this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa vectorial.'; return; }
    if (this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id)) { this.q<HTMLElement>('#status').textContent = 'La capa vectorial está bloqueada u oculta.'; return; }
    const shapes = layer.vectorShapes ?? [];
    const hit = [...shapes].reverse().find((shape) => {
      const x1 = Math.min(shape.x, shape.x + shape.width), x2 = Math.max(shape.x, shape.x + shape.width);
      const y1 = Math.min(shape.y, shape.y + shape.height), y2 = Math.max(shape.y, shape.y + shape.height);
      const pad = Math.max(5, shape.strokeWidth / 2);
      return point.x >= x1 - pad && point.x <= x2 + pad && point.y >= y1 - pad && point.y <= y2 + pad;
    });
    if (!hit) {
      this.vectorDirectSelectedId = null; this.clearToolPreview();
      this.q<HTMLElement>('#status').textContent = shapes.length ? 'No se encontró un objeto en esa posición.' : 'La capa está vacía. Usá “Editar vectores…” para agregar formas.';
      return;
    }
    const copy = cloneVectorShape(hit);
    const handle = Math.abs(point.x - (hit.x + hit.width)) <= 12 && Math.abs(point.y - (hit.y + hit.height)) <= 12;
    this.vectorDirectSelectedId = hit.id;
    this.vectorGesture = { layerId: layer.id, shapeId: hit.id, mode: handle ? 'resize' : 'move', startPoint: point, original: copy, latest: cloneVectorShape(copy), moved: false };
    this.canvas.setPointerCapture(event.pointerId);
    this.drawVectorSelectionOverlay(copy);
    this.q<HTMLElement>('#status').textContent = `${this.vectorKindLabel(hit.kind)} seleccionado · ${handle ? 'redimensionar' : 'arrastrar para mover'}`;
  }

  private transformVectorShape(original: VectorShape, dx: number, dy: number, mode: 'move' | 'resize'): VectorShape {
    const clone = cloneVectorShape(original);
    if (mode === 'move') {
      clone.x = original.x + dx; clone.y = original.y + dy;
      clone.points = this.moveVectorPoints(clone.points, dx, dy);
      return clone;
    }
    const nextWidth = Math.max(1, original.width + dx), nextHeight = Math.max(1, original.height + dy);
    const sx = nextWidth / Math.max(1, original.width), sy = nextHeight / Math.max(1, original.height);
    clone.width = nextWidth; clone.height = nextHeight;
    clone.points = this.resizeVectorPoints(clone.points, original, sx, sy);
    if (clone.kind === 'text') clone.fontSize = Math.max(1, (original.fontSize ?? 64) * Math.min(sx, sy));
    return clone;
  }

  private moveVectorPoints(
    points: VectorShape['points'],
    dx: number,
    dy: number,
  ): VectorShape['points'] {
    return points?.map((point) => ({
      ...point, x: point.x + dx, y: point.y + dy,
      ...(point.inX !== undefined ? { inX: point.inX + dx } : {}), ...(point.inY !== undefined ? { inY: point.inY + dy } : {}),
      ...(point.outX !== undefined ? { outX: point.outX + dx } : {}), ...(point.outY !== undefined ? { outY: point.outY + dy } : {}),
    }));
  }

  private resizeVectorPoints(
    points: VectorShape['points'],
    original: VectorShape,
    sx: number,
    sy: number,
  ): VectorShape['points'] {
    return points?.map((point) => ({
      ...point, x: original.x + (point.x - original.x) * sx, y: original.y + (point.y - original.y) * sy,
      ...(point.inX !== undefined ? { inX: original.x + (point.inX - original.x) * sx } : {}), ...(point.inY !== undefined ? { inY: original.y + (point.inY - original.y) * sy } : {}),
      ...(point.outX !== undefined ? { outX: original.x + (point.outX - original.x) * sx } : {}), ...(point.outY !== undefined ? { outY: original.y + (point.outY - original.y) * sy } : {}),
    }));
  }

  private updateVectorGesture(point: { x: number; y: number }): void {
    const gesture = this.vectorGesture; if (!gesture) return;
    const dx = point.x - gesture.startPoint.x, dy = point.y - gesture.startPoint.y;
    gesture.moved = gesture.moved || Math.hypot(dx, dy) > 1;
    gesture.latest = this.transformVectorShape(gesture.original, dx, dy, gesture.mode);
    this.drawVectorSelectionOverlay(gesture.latest);
  }

  private finishVectorGesture(point: { x: number; y: number }): void {
    const gesture = this.vectorGesture; if (!gesture) return;
    this.updateVectorGesture(point);
    this.vectorGesture = null;
    const layer = this.ctl.find(gesture.layerId);
    if (layer?.type === 'vector' && gesture.moved) {
      const shapes = cloneVectorShapes(layer.vectorShapes).map((shape) => shape.id === gesture.shapeId ? gesture.latest : shape);
      this.commitVectorShapes(layer, shapes);
    }
    this.vectorDirectSelectedId = gesture.shapeId;
    this.drawVectorSelectionOverlay(gesture.latest);
  }

  private drawVectorSelectionOverlay(shape: VectorShape): void {
    this.updatePreviewCanvasSize();
    const preview = this.q<HTMLCanvasElement>('#tool-preview'); const ctx = preview.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, preview.width, preview.height);
    const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const stageRect = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const x = canvasRect.left - stageRect.left + shape.x / this.ctl.doc.width * canvasRect.width;
    const y = canvasRect.top - stageRect.top + shape.y / this.ctl.doc.height * canvasRect.height;
    const w = shape.width / this.ctl.doc.width * canvasRect.width, h = shape.height / this.ctl.doc.height * canvasRect.height;
    ctx.save(); ctx.strokeStyle = '#c92334'; ctx.lineWidth = 1.25; ctx.setLineDash([5, 3]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c92334'; ctx.lineWidth = 1.25;
    const points = [[x,y],[x+w,y],[x,y+h],[x+w,y+h]];
    points.forEach(([px,py]) => { ctx.fillRect(px - 3.5, py - 3.5, 7, 7); ctx.strokeRect(px - 3.5, py - 3.5, 7, 7); });
    ctx.restore();
  }

  private moveActive(delta: number): void {
    if (this.stroke || !this.active()) return;
    if (this.ctl.moveLayer(this.activeId, delta)) {
      this.ctl.comp.invalidateAll();
      this.renderLayers();
      this.scheduleRefresh(); this.updateHistoryUI();
    }
  }

  private setTool(t: Tool): void {
    if (this.stroke || this.isPanning) return;
    const layer = this.active();
    const needsPaintTarget = !['hand', 'eyedropper', 'text', 'vector-select'].includes(t);
    if (t === 'vector-select' && (!layer || layer.type !== 'vector' || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id))) {
      this.reportVectorToolUnavailable();
      return;
    }
    if (needsPaintTarget && (!layer || (layer.type !== 'paint' && layer.type !== 'raster') || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id))) {
      this.reportPaintToolUnavailable(layer);
      return;
    }
    this.tool = t;
    this.vectorGesture = null; this.vectorDirectSelectedId = null;
    this.renderToolOptions();
    this.renderAdvancedToolOptions();
    this.applyCanvasView();
    this.clearToolPreview();
  }

  private reportVectorToolUnavailable(): void {
    const status = this.root.querySelector<HTMLElement>('#status');
    if (status) status.textContent = 'Seleccioná una capa vectorial visible y desbloqueada para editar sus objetos directamente.';
  }

  private reportPaintToolUnavailable(layer: LayerNode | undefined): void {
    const status = this.root.querySelector<HTMLElement>('#status');
    if (!status) return;
    status.textContent = !layer ? 'Creá o seleccioná una capa de pintura para usar esta herramienta'
      : layer.locked || this.ctl.isEffectivelyLocked(layer.id) ? 'La capa está bloqueada'
      : !this.ctl.isEffectivelyVisible(layer.id) ? 'La capa está oculta'
      : `${this.layerTypeLabel(layer.type)}: seleccioná una capa de pintura para dibujar`;
  }

  private promptNew(): void {
    const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/.exec(prompt('Tamaño (ancho x alto)', '1280x720') ?? '');
    if (!m) return;
    const [w, h] = [Number(m[1]), Number(m[2])];
    if (w > 8192 || h > 8192) { alert('Máximo 8192×8192.'); return; }
    this.newDocument(w, h, 'Sin título');
  }

  // ───────────── Herramientas de dibujo y navegación ─────────────

  /** Convierte coordenadas de pantalla a coordenadas del documento, teniendo en cuenta zoom y pan. */
  private toDocAt(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const { width: dw, height: dh } = this.ctl.doc;
    const scale = Math.min(r.width / dw, r.height / dh);
    return {
      x: (clientX - r.left - (r.width - dw * scale) / 2) / scale,
      y: (clientY - r.top - (r.height - dh * scale) / 2) / scale,
    };
  }

  private toDoc(e: PointerEvent): { x: number; y: number } { return this.toDocAt(e.clientX, e.clientY); }

  private onDocument(p: { x: number; y: number }): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.ctl.doc.width && p.y < this.ctl.doc.height;
  }

  /** Borde suave configurado por dureza/opacidad; todas las escrituras quedan dentro de la acción del trazo. */
  private stamp(x: number, y: number): void {
    const layer = this.strokeLayer;
    if (!layer || !this.stroke) return;
    const operation = this.createStampOperation(x, y);
    if (!operation) return;
    const pixels = this.readStampPixels(layer, operation.region);
    const changed = applyBrushStamp(pixels, operation);
    if (changed && layer.writeRectFromJS(
      operation.region.left, operation.region.top, operation.region.width, operation.region.height, pixels,
    )) this.scheduleRefresh();
  }

  private createStampOperation(x: number, y: number): StampOperation | null {
    const region = this.getStampRegion(x, y);
    if (!region) return null;
    const radius = Math.max(0.5, this.brush.size / 2);
    const hardEdge = radius * (this.brush.hardness / 100);
    return {
      region,
      centerX: x,
      centerY: y,
      radius,
      hardEdge,
      fadeWidth: Math.max(0.5, radius + 0.5 - hardEdge),
      erase: this.strokeTool === 'eraser',
      color: [this.brush.rgb[0], this.brush.rgb[1], this.brush.rgb[2]],
      opacity: this.brush.opacity / 100,
    };
  }

  private getStampRegion(x: number, y: number): PixelRegion | null {
    const { width, height } = this.ctl.doc;
    const radius = Math.max(0.5, this.brush.size / 2);
    const left = Math.max(0, Math.floor(x - radius - 1));
    const top = Math.max(0, Math.floor(y - radius - 1));
    const right = Math.min(width, Math.ceil(x + radius + 1));
    const bottom = Math.min(height, Math.ceil(y + radius + 1));
    const region = { left, top, width: right - left, height: bottom - top };
    return region.width > 0 && region.height > 0 ? region : null;
  }

  private readStampPixels(layer: NonNullable<App['strokeLayer']>, region: PixelRegion): Uint8Array {
    const pixels = new Uint8Array(region.width * region.height * 4);
    layer.readRectToJS(region.left, region.top, region.width, region.height, pixels);
    return pixels;
  }

  private commitShape(start: { x: number; y: number }, end: { x: number; y: number }, tool: Tool): void {
    const layer = this.strokeLayer;
    if (!layer) return;
    const region = this.getShapeRegion(start, end);
    if (!region) return;
    const source = this.renderShapePixels(start, end, tool, region);
    if (!source) return;
    const target = this.blendShapePixels(layer, region, source);
    if (target) layer.writeRectFromJS(region.left, region.top, region.width, region.height, target);
  }

  private getShapeRegion(start: { x: number; y: number }, end: { x: number; y: number }): PixelRegion | null {
    const padding = Math.ceil(this.brush.size / 2) + 2;
    const left = Math.max(0, Math.floor(Math.min(start.x, end.x) - padding));
    const top = Math.max(0, Math.floor(Math.min(start.y, end.y) - padding));
    const right = Math.min(this.ctl.doc.width, Math.ceil(Math.max(start.x, end.x) + padding));
    const bottom = Math.min(this.ctl.doc.height, Math.ceil(Math.max(start.y, end.y) + padding));
    const region = { left, top, width: right - left, height: bottom - top };
    return region.width > 0 && region.height > 0 ? region : null;
  }

  private renderShapePixels(
    start: { x: number; y: number },
    end: { x: number; y: number },
    tool: Tool,
    region: PixelRegion,
  ): Uint8ClampedArray | null {
    const scratch = document.createElement('canvas');
    scratch.width = region.width;
    scratch.height = region.height;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    this.drawShapeSource(ctx, start, end, tool, region);
    ctx.globalAlpha = 1;
    return ctx.getImageData(0, 0, region.width, region.height).data;
  }

  private drawShapeSource(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    tool: Tool,
    region: PixelRegion,
  ): void {
    ctx.clearRect(0, 0, region.width, region.height);
    ctx.globalAlpha = this.brush.opacity / 100;
    ctx.strokeStyle = this.foregroundHex();
    ctx.fillStyle = this.foregroundHex();
    ctx.lineWidth = this.brush.size;
    ctx.lineCap = this.brush.lineCap;
    ctx.lineJoin = this.brush.lineJoin;
    const x1 = start.x - region.left;
    const y1 = start.y - region.top;
    const x2 = end.x - region.left;
    const y2 = end.y - region.top;
    if (tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      return;
    }
    if (tool === 'rectangle') {
      this.drawRectangleSource(ctx, x1, y1, x2, y2);
      return;
    }
    if (tool === 'ellipse') this.drawEllipseSource(ctx, x1, y1, x2, y2);
  }

  private drawRectangleSource(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    if (this.brush.shapeFill) ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
  }

  private drawEllipseSource(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
    if (this.brush.shapeFill) ctx.fill();
    ctx.stroke();
  }

  private blendShapePixels(
    layer: NonNullable<App['strokeLayer']>,
    region: PixelRegion,
    source: Uint8ClampedArray,
  ): Uint8Array | null {
    const target = new Uint8Array(region.width * region.height * 4);
    layer.readRectToJS(region.left, region.top, region.width, region.height, target);
    let changed = false;
    for (let offset = 0; offset < target.length; offset += 4) {
      changed = this.blendShapePixel(source, target, offset) || changed;
    }
    return changed ? target : null;
  }

  private blendShapePixel(source: Uint8ClampedArray, target: Uint8Array, offset: number): boolean {
    const sourceAlpha = source[offset + 3] / 255;
    if (sourceAlpha <= 0) return false;
    const destinationAlpha = target[offset + 3] / 255;
    const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
    const oldWeight = destinationAlpha * (1 - sourceAlpha);
    target[offset] = Math.round((source[offset] * sourceAlpha + target[offset] * oldWeight) / outputAlpha);
    target[offset + 1] = Math.round((source[offset + 1] * sourceAlpha + target[offset + 1] * oldWeight) / outputAlpha);
    target[offset + 2] = Math.round((source[offset + 2] * sourceAlpha + target[offset + 2] * oldWeight) / outputAlpha);
    target[offset + 3] = Math.round(outputAlpha * 255);
    return true;
  }

  private down(event: PointerEvent): void {
    if (this.stroke || this.isPanning) return;
    if (this.tryBeginPanning(event)) return;
    if (event.button !== 0) return;
    const point = this.toDoc(event);
    if (!this.onDocument(point)) return;
    if (this.handleImmediateTool(point, event)) return;
    const activeLayer = this.active();
    if (activeLayer && isPixelLayerType(activeLayer.type)
      && this.ctl.isEffectivelyVisible(activeLayer.id)
      && !this.ctl.isEffectivelyLocked(activeLayer.id)
      && this.beginColorizeStroke(event, point, activeLayer)) return;
    const layer = this.getEditablePaintLayer();
    if (!layer) return;
    if (this.tool === 'fill') {
      this.fillAt(point, layer);
      return;
    }
    this.beginPaintStroke(event, point, layer);
  }

  private tryBeginPanning(event: PointerEvent): boolean {
    const shouldPan = event.button === 1 || this.spaceDown || this.tool === 'hand';
    if (!shouldPan) return false;
    event.preventDefault();
    this.canvas.setPointerCapture(event.pointerId);
    this.isPanning = true;
    this.panStart = { clientX: event.clientX, clientY: event.clientY, x: this.panX, y: this.panY };
    this.canvas.style.cursor = 'grabbing';
    return true;
  }

  private handleImmediateTool(point: { x: number; y: number }, event: PointerEvent): boolean {
    if (this.tool === 'eyedropper') {
      this.pickColorAt(Math.floor(point.x), Math.floor(point.y));
      return true;
    }
    if (this.tool === 'text') {
      void this.createTextAt({ x: Math.round(point.x), y: Math.round(point.y) });
      return true;
    }
    if (this.tool === 'vector-select') {
      this.beginVectorGesture(point, event);
      return true;
    }
    return false;
  }

  private getEditablePaintLayer(): LayerNode | null {
    const layer = this.active();
    if (!layer) return null;
    if (layer.type !== 'paint' && layer.type !== 'raster') {
      this.q<HTMLElement>('#status').textContent = `${this.layerTypeLabel(layer.type)}: elegí una capa de pintura para editar píxeles`;
      return null;
    }
    const locked = this.ctl.isEffectivelyLocked(layer.id);
    const visible = this.ctl.isEffectivelyVisible(layer.id);
    if (!visible || locked) {
      this.q<HTMLElement>('#status').textContent = locked
        ? 'La capa o su grupo está bloqueado'
        : 'La capa o su grupo está oculto';
      return null;
    }
    return layer;
  }

  private beginPaintStroke(event: PointerEvent, point: { x: number; y: number }, layer: LayerNode): void {
    this.canvas.setPointerCapture(event.pointerId);
    this.stroke = new StrokeSession(this.ctx, layer.engineId);
    this.strokeLayer = this.ctl.layerPixels(layer);
    this.strokeTool = this.tool;
    this.last = point;
    if (this.tool === 'brush' || this.tool === 'eraser') {
      this.stamp(point.x, point.y);
      return;
    }
    if (this.tool !== 'line' && this.tool !== 'rectangle' && this.tool !== 'ellipse') return;
    this.shapeStart = { ...point, clientX: event.clientX, clientY: event.clientY };
    this.drawToolPreview(event);
  }

  private beginColorizeStroke(event: PointerEvent, point: { x: number; y: number }, layer: LayerNode): boolean {
    if (this.tool !== 'brush') return false;
    const mask = layer.masks?.find((candidate) => candidate.type === 'colorize' && candidate.enabled && candidate.editStrokes);
    if (!mask || mask.type !== 'colorize') return false;
    this.canvas.setPointerCapture(event.pointerId);
    this.colorizeStroke = { color: this.foregroundHex(), radius: Math.max(1, this.brush.size / 2), points: [{ ...point }] };
    this.colorizeStrokeLayerId = layer.id;
    this.colorizeStrokeMaskId = mask.id;
    this.last = point;
    this.q<HTMLElement>('#status').textContent = 'Pintando una marca de colorización.';
    return true;
  }

  private extendColorizeStroke(point: { x: number; y: number }, finalPoint: boolean): void {
    if (!this.colorizeStroke || !this.last) return;
    const step = Math.max(1, this.colorizeStroke.radius * (this.brush.spacing / 100));
    const dx = point.x - this.last.x;
    const dy = point.y - this.last.y;
    const distance = Math.hypot(dx, dy);
    if (distance < step && !finalPoint) return;
    const count = Math.max(1, Math.floor(distance / step));
    for (let index = 1; index <= count; index++) {
      this.colorizeStroke.points.push({ x: this.last.x + dx * index / count, y: this.last.y + dy * index / count });
    }
    this.last = point;
  }

  private finishColorizeStroke(): void {
    const stroke = this.colorizeStroke;
    const layerId = this.colorizeStrokeLayerId;
    const maskId = this.colorizeStrokeMaskId;
    this.colorizeStroke = null;
    this.colorizeStrokeLayerId = null;
    this.colorizeStrokeMaskId = null;
    this.last = null;
    if (stroke && layerId && maskId) {
      this.ctl.updateMask(layerId, maskId, (mask) => mask.type === 'colorize'
        ? { ...mask, strokes: [...mask.strokes, stroke] }
        : mask);
    }
    this.colorizeOutputCache.clear();
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
  }

  private onPointerMove(e: PointerEvent, finalPoint = false): void {
    if (this.vectorGesture) { this.updateVectorGesture(this.toDoc(e)); return; }
    if (this.isPanning && this.panStart) {
      this.panX = this.panStart.x + e.clientX - this.panStart.clientX;
      this.panY = this.panStart.y + e.clientY - this.panStart.clientY;
      this.applyCanvasView();
      return;
    }
    if (this.colorizeStroke) {
      this.extendColorizeStroke(this.toDoc(e), finalPoint);
      return;
    }
    if (!this.stroke || !this.last || !this.strokeTool) return;
    if (this.strokeTool === 'line' || this.strokeTool === 'rectangle' || this.strokeTool === 'ellipse') {
      this.drawToolPreview(e);
      return;
    }
    if (this.strokeTool !== 'brush' && this.strokeTool !== 'eraser') return;
    let p = this.toDoc(e);
    if (!finalPoint && this.brush.smoothing > 0) {
      const blend = 1 - (this.brush.smoothing / 100) * 0.75;
      p = { x: this.last.x + (p.x - this.last.x) * blend, y: this.last.y + (p.y - this.last.y) * blend };
    }
    const step = Math.max(0.5, this.brush.size * (this.brush.spacing / 100));
    const dx = p.x - this.last.x, dy = p.y - this.last.y, dist = Math.hypot(dx, dy);
    if (dist < step && !finalPoint) return;
    const n = Math.max(1, Math.floor(dist / step));
    if (dist > 0) {
      this.stampInterpolatedSegment(this.last, dx, dy, n);
      this.last = p;
    }
  }

  private stampInterpolatedSegment(start: { x: number; y: number }, dx: number, dy: number, steps: number): void {
    for (let index = 1; index <= steps; index++) {
      this.stamp(start.x + (dx * index) / steps, start.y + (dy * index) / steps);
    }
  }

  private drawToolPreview(e: PointerEvent): void {
    if (!this.shapeStart) return;
    this.updatePreviewCanvasSize();
    const preview = this.q<HTMLCanvasElement>('#tool-preview');
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, preview.width, preview.height);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const stage = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
    const x1 = this.shapeStart.clientX - stage.left, y1 = this.shapeStart.clientY - stage.top;
    const x2 = e.clientX - stage.left, y2 = e.clientY - stage.top;
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / this.ctl.doc.width, rect.height / this.ctl.doc.height);
    ctx.globalAlpha = this.brush.opacity / 100;
    ctx.strokeStyle = this.foregroundHex(); ctx.fillStyle = this.foregroundHex();
    ctx.lineWidth = Math.max(1, this.brush.size * scale); ctx.lineCap = this.brush.lineCap; ctx.lineJoin = this.brush.lineJoin;
    if (this.strokeTool === 'line') { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    else if (this.strokeTool === 'rectangle') {
      const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
      this.brush.shapeFill ? ctx.fillRect(x, y, w, h) : undefined;
      ctx.strokeRect(x, y, w, h);
    } else if (this.strokeTool === 'ellipse') {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
      this.brush.shapeFill ? ctx.fill() : undefined; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private up(e?: PointerEvent): void {
    if (this.vectorGesture) { this.finishVectorGesture(e ? this.toDoc(e) : this.vectorGesture.startPoint); return; }
    if (this.isPanning) {
      this.isPanning = false; this.panStart = null; this.applyCanvasView();
      return;
    }
    if (this.colorizeStroke) {
      this.finishColorizeStroke();
      return;
    }
    if (!this.stroke) { this.clearToolPreview(); return; }
    const tool = this.strokeTool;
    try {
      this.commitPointerUpAction(e, tool);
      const label: Record<Tool, string> = { brush: 'Pincel', eraser: 'Borrador', eyedropper: 'Cuentagotas', line: 'Línea', rectangle: 'Rectángulo', ellipse: 'Elipse', fill: 'Relleno', hand: 'Mover lienzo', text: 'Texto', 'vector-select': 'Selección vectorial' };
      this.stroke.end(label[tool ?? 'brush']);
    } catch (error) {
      this.stroke.cancel();
      this.q<HTMLElement>('#status').textContent = error instanceof Error ? error.message : String(error);
    } finally {
      this.stroke = null; this.strokeLayer = null; this.strokeTool = null; this.last = null; this.shapeStart = null;
      this.clearToolPreview(); this.updateHistoryUI(); this.scheduleRefresh();
    }
  }

  private fillAt(point: { x: number; y: number }, node: LayerNode): void {
    const limitMessage = this.fillLimitMessage();
    if (limitMessage) {
      this.q<HTMLElement>('#status').textContent = limitMessage;
      return;
    }
    const operation = this.createFillOperation(point, node);
    if (!operation) return;
    const result = this.executeFillOperation(operation);
    if (result.filled === 0) {
      this.q<HTMLElement>('#status').textContent = 'No se encontraron píxeles dentro de la tolerancia.';
      return;
    }
    this.commitFillResult(node, operation, result);
    this.q<HTMLElement>('#status').textContent = `Relleno aplicado · ${result.filled.toLocaleString()} píxeles`;
    this.updateHistoryUI();
    if (containsLayerType(this.ctl.doc.layers, 'filter')) this.scheduleRefresh();
  }

  private fillLimitMessage(): string | null {
    const total = this.ctl.doc.width * this.ctl.doc.height;
    if (total > 8_000_000) {
      return 'El relleno está limitado a 8 millones de píxeles para proteger la memoria. Reducí el tamaño o usá un documento más pequeño.';
    }
    if (this.brush.sampleMerged && total > 4_000_000) {
      return 'El muestreo de todas las capas en el bote de pintura admite hasta 4 millones de píxeles por operación.';
    }
    return null;
  }

  private createFillOperation(point: { x: number; y: number }, node: LayerNode): FillOperation | null {
    if (!this.ctl.layerPixels(node)) return null;
    const { width, height } = this.ctl.doc;
    const original = this.ctl.readPixels(node) ?? new Uint8Array(width * height * 4);
    const reference = this.brush.sampleMerged ? this.compositePixelsForSampling() : original;
    if (!reference) return null;
    const seedX = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
    const seedY = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
    const seed = (seedY * width + seedX) * 4;
    const seedColor: [number, number, number, number] = [
      reference[seed], reference[seed + 1], reference[seed + 2], reference[seed + 3],
    ];
    const color: [number, number, number] = [this.brush.rgb[0], this.brush.rgb[1], this.brush.rgb[2]];
    return {
      width, height, original, reference, seedX, seedY, seedColor,
      tolerance: this.brush.tolerance, color,
      opacity: this.brush.opacity / 100, contiguous: this.brush.contiguous,
    };
  }

  private executeFillOperation(operation: FillOperation): FillResult {
    const result: FillResult = {
      pixels: new Uint8Array(operation.original), filled: 0,
      minX: operation.width, minY: operation.height, maxX: -1, maxY: -1,
    };
    if (operation.contiguous) this.fillContiguousPixels(operation, result);
    else this.fillAllMatchingPixels(operation, result);
    return result;
  }

  private fillMatches(operation: FillOperation, offset: number): boolean {
    const reference = operation.reference;
    const seed = operation.seedColor;
    const difference = Math.max(
      Math.abs(reference[offset] - seed[0]),
      Math.abs(reference[offset + 1] - seed[1]),
      Math.abs(reference[offset + 2] - seed[2]),
      Math.abs(reference[offset + 3] - seed[3]),
    );
    return difference <= operation.tolerance;
  }

  private fillAllMatchingPixels(operation: FillOperation, result: FillResult): void {
    const total = operation.width * operation.height;
    for (let pixel = 0; pixel < total; pixel++) this.fillMatchingPixel(operation, result, pixel);
  }

  private fillMatchingPixel(operation: FillOperation, result: FillResult, pixel: number): void {
    if (!this.fillMatches(operation, pixel * 4)) return;
    this.paintFillPixel(operation, result, pixel);
  }

  private fillContiguousPixels(operation: FillOperation, result: FillResult): void {
    const { width, height } = operation;
    const total = width * height;
    const stack = new Uint32Array(total);
    const seen = new Uint8Array(total);
    let top = 0;
    const seedPixel = operation.seedY * width + operation.seedX;
    stack[top++] = seedPixel;
    seen[seedPixel] = 1;
    while (top > 0) top = this.processNextFillPixel(operation, result, stack, seen, top, width, height);
  }

  private processNextFillPixel(
    operation: FillOperation,
    result: FillResult,
    stack: Uint32Array,
    seen: Uint8Array,
    top: number,
    width: number,
    height: number,
  ): number {
    const pixel = stack[--top];
    if (!this.fillMatches(operation, pixel * 4)) return top;
    this.paintFillPixel(operation, result, pixel);
    return this.pushUnseenFillNeighbors(pixel, width, height, stack, seen, top);
  }

  private pushUnseenFillNeighbors(
    pixel: number,
    width: number,
    height: number,
    stack: Uint32Array,
    seen: Uint8Array,
    top: number,
  ): number {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const push = (next: number): void => {
      if (seen[next]) return;
      seen[next] = 1;
      stack[top++] = next;
    };
    if (x > 0) push(pixel - 1);
    if (x + 1 < width) push(pixel + 1);
    if (y > 0) push(pixel - width);
    if (y + 1 < height) push(pixel + width);
    return top;
  }

  private paintFillPixel(operation: FillOperation, result: FillResult, pixel: number): void {
    const offset = pixel * 4;
    const data = result.pixels;
    const sourceAlpha = operation.opacity;
    const oldAlpha = data[offset + 3] / 255;
    const outputAlpha = sourceAlpha + oldAlpha * (1 - sourceAlpha);
    if (outputAlpha > 0) {
      const oldWeight = oldAlpha * (1 - sourceAlpha);
      data[offset] = Math.round((operation.color[0] * sourceAlpha + data[offset] * oldWeight) / outputAlpha);
      data[offset + 1] = Math.round((operation.color[1] * sourceAlpha + data[offset + 1] * oldWeight) / outputAlpha);
      data[offset + 2] = Math.round((operation.color[2] * sourceAlpha + data[offset + 2] * oldWeight) / outputAlpha);
      data[offset + 3] = Math.round(outputAlpha * 255);
    }
    result.filled++;
    this.expandFillBounds(result, pixel, operation.width);
  }

  private expandFillBounds(result: FillResult, pixel: number, width: number): void {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    result.minX = Math.min(result.minX, x);
    result.minY = Math.min(result.minY, y);
    result.maxX = Math.max(result.maxX, x);
    result.maxY = Math.max(result.maxY, y);
  }

  private commitFillResult(node: LayerNode, operation: FillOperation, result: FillResult): void {
    const regionWidth = result.maxX - result.minX + 1;
    const regionHeight = result.maxY - result.minY + 1;
    const region = this.extractFillRegion(operation, result, regionWidth, regionHeight);
    runEdit(this.ctx, node.engineId, 'Bote de pintura', (layer) => {
      layer.writeRectFromJS(result.minX, result.minY, regionWidth, regionHeight, region);
    });
  }

  private extractFillRegion(
    operation: FillOperation,
    result: FillResult,
    regionWidth: number,
    regionHeight: number,
  ): Uint8Array {
    const region = new Uint8Array(regionWidth * regionHeight * 4);
    for (let row = 0; row < regionHeight; row++) {
      const sourceStart = ((result.minY + row) * operation.width + result.minX) * 4;
      region.set(result.pixels.subarray(sourceStart, sourceStart + regionWidth * 4), row * regionWidth * 4);
    }
    return region;
  }

  /** Renderiza la composición visible completa para el bote de pintura, con un límite de tamaño previo. */
  private compositePixelsForSampling(): Uint8Array | null {
    const { width, height } = this.ctl.doc;
    const canvas = this.createSamplingCanvas(width, height);
    if (!canvas.getContext('2d', { willReadFrequently: true })) return null;
    this.composeSamplingLayers(this.ctl.doc.layers, canvas, width, height, (layer) => this.ctl.readPixels(layer));
    return this.readSamplingCanvas(canvas, width, height);
  }

  private createSamplingCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  private readSamplingCanvas(canvas: HTMLCanvasElement, width: number, height: number): Uint8Array {
    const image = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height);
    return new Uint8Array(image.data.buffer.slice(image.data.byteOffset, image.data.byteOffset + image.data.byteLength));
  }

  private composeSamplingLayers(
    nodes: LayerNode[],
    target: HTMLCanvasElement,
    width: number,
    height: number,
    readLayerPixels: (layer: LayerNode) => Uint8Array | null,
  ): void {
    const targetCtx = target.getContext('2d', { willReadFrequently: true })!;
    const scratch = this.createSamplingCanvas(width, height);
    const scratchCtx = scratch.getContext('2d', { willReadFrequently: true })!;
    targetCtx.clearRect(0, 0, width, height);
    for (const layer of nodes) this.composeSamplingLayer(layer, target, targetCtx, scratch, scratchCtx, width, height, readLayerPixels);
  }

  private composeSamplingLayer(
    layer: LayerNode,
    target: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
    scratch: HTMLCanvasElement,
    scratchCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    readLayerPixels: (layer: LayerNode) => Uint8Array | null,
  ): void {
    if (!layer.visible || layer.opacity <= 0) return;
    if (layer.type === 'filter') {
      this.applySamplingFilter(layer, target, targetCtx, width, height);
      return;
    }
    if (layer.type === 'group') {
      this.compositeSamplingGroup(layer, targetCtx, width, height, readLayerPixels);
      return;
    }
    if (!isPixelLayerType(layer.type)) return;
    const pixels = readLayerPixels(layer);
    if (pixels) this.compositeSamplingRaster(layer, pixels, targetCtx, scratch, scratchCtx, width, height);
  }

  private applySamplingFilter(
    layer: LayerNode,
    target: HTMLCanvasElement,
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const images = this.createSamplingFilterImages(layer, target, width, height);
    this.blendSamplingFilterIntoTarget(targetCtx, images.original, images.filtered, layer.opacity, width, height);
  }

  private createSamplingFilterImages(
    layer: LayerNode,
    target: HTMLCanvasElement,
    width: number,
    height: number,
  ): { original: ImageData; filtered: ImageData } {
    const original = this.createSamplingCanvas(width, height);
    original.getContext('2d')!.drawImage(target, 0, 0);
    const filtered = this.createSamplingCanvas(width, height);
    const filteredCtx = filtered.getContext('2d')!;
    const kind = layer.filterKind ?? 'grayscale';
    const strength = layer.filterStrength ?? 1;
    const filteredImage = renderFilteredImage(original, filteredCtx, kind, strength, {
      x: 0, y: 0, width, height, fullWidth: width, fullHeight: height,
    });
    return {
      original: original.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height),
      filtered: filteredImage,
    };
  }

  private blendSamplingFilterIntoTarget(
    targetCtx: CanvasRenderingContext2D,
    original: ImageData,
    filtered: ImageData,
    opacity: number,
    width: number,
    height: number,
  ): void {
    blendImageData(original, filtered, opacity);
    targetCtx.clearRect(0, 0, width, height);
    targetCtx.putImageData(original, 0, 0);
  }

  private compositeSamplingGroup(
    layer: LayerNode,
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    readLayerPixels: (layer: LayerNode) => Uint8Array | null,
  ): void {
    const group = this.createSamplingCanvas(width, height);
    this.composeSamplingLayers(layer.children, group, width, height, readLayerPixels);
    targetCtx.save();
    targetCtx.globalAlpha = layer.opacity;
    targetCtx.globalCompositeOperation = this.canvasBlend(layer.blendMode);
    targetCtx.drawImage(group, 0, 0);
    targetCtx.restore();
  }

  private compositeSamplingRaster(
    layer: LayerNode,
    pixels: Uint8Array,
    targetCtx: CanvasRenderingContext2D,
    scratch: HTMLCanvasElement,
    scratchCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    const transformedPixels = this.applyTransformMasksToFullLayer(layer, pixels, width, height);
    const colorizedPixels = this.applyColorizeMasksToFullLayer(layer, transformedPixels);
    const filteredPixels = this.applyFilterMasksToFullLayer(layer, colorizedPixels, width, height);
    const image = new ImageData(new Uint8ClampedArray(filteredPixels), width, height);
    scratchCtx.clearRect(0, 0, width, height);
    scratchCtx.putImageData(image, 0, 0);
    targetCtx.save();
    targetCtx.globalAlpha = layer.opacity;
    targetCtx.globalCompositeOperation = this.canvasBlend(layer.blendMode);
    targetCtx.drawImage(scratch, 0, 0);
    targetCtx.restore();
  }

  private applyTransformMasksToFullLayer(layer: LayerNode, pixels: Uint8Array, width: number, height: number): Uint8Array {
    const masks = layer.masks?.filter((mask): mask is Extract<LayerMask, { type: 'transform' }> => mask.enabled && mask.type === 'transform') ?? [];
    if (!masks.length) return pixels;
    const input = this.createPixelCanvas(width, height, pixels);
    const output = this.createSamplingCanvas(width, height);
    const context = output.getContext('2d', { willReadFrequently: true })!;
    const matrix = this.combineTransformMasks(masks);
    context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    context.drawImage(input, 0, 0);
    return this.readSamplingCanvas(output, width, height);
  }

  private applyFilterMasksToFullLayer(layer: LayerNode, pixels: Uint8Array, width: number, height: number): Uint8Array {
    const masks = layer.masks?.filter((mask): mask is Extract<LayerMask, { type: 'filter' }> => mask.enabled && mask.type === 'filter') ?? [];
    if (!masks.length) return pixels;
    let current = new Uint8Array(pixels);
    for (const mask of masks) current = new Uint8Array(this.applyFilterStackToPixels(mask, current, width, height));
    return current;
  }

  private applyColorizeMasksToFullLayer(layer: LayerNode, fallback: Uint8Array): Uint8Array {
    const masks = layer.masks?.filter((mask): mask is Extract<LayerMask, { type: 'colorize' }> => mask.enabled && mask.type === 'colorize') ?? [];
    let current = fallback;
    for (const mask of masks) current = this.getColorizeOutput(layer, mask) ?? current;
    return current;
  }

  private applyFilterStackToPixels(
    mask: Extract<LayerMask, { type: 'filter' }>,
    pixels: Uint8Array,
    width: number,
    height: number,
  ): Uint8Array {
    let current = new ImageData(new Uint8ClampedArray(pixels), width, height);
    for (const filter of mask.filters) {
      const source = this.createSamplingCanvas(width, height);
      const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
      sourceContext.putImageData(current, 0, 0);
      const output = this.createSamplingCanvas(width, height);
      const outputContext = output.getContext('2d', { willReadFrequently: true })!;
      const result = renderFilteredImage(source, outputContext, filter.kind, filter.strength, {
        x: 0, y: 0, width, height, fullWidth: width, fullHeight: height,
      });
      current = result;
    }
    return new Uint8Array(current.data);
  }

  private pickColorAt(x: number, y: number): void {
    const layer = this.active();
    if (!layer) return;
    let rgba: Uint8Array | null = null;
    if (this.brush.sampleMerged) {
      const one = this.compositeSamplePixel(x, y); rgba = one;
    } else {
      rgba = this.readActiveLayerPixel(layer, x, y);
    }
    if (!rgba) { this.q<HTMLElement>('#status').textContent = 'No se pudo tomar el color de esta capa.'; return; }
    this.brush.rgb = [rgba[0], rgba[1], rgba[2]];
    this.renderToolOptions(); this.syncToolbarProps();
    this.q<HTMLElement>('#status').textContent = `Color seleccionado ${this.foregroundHex()}`;
  }

  private readActiveLayerPixel(layer: LayerNode, x: number, y: number): Uint8Array | null {
    const pixels = this.ctl.layerPixels(layer);
    if (!pixels) return null;
    const value = new Uint8Array(4);
    pixels.readRectToJS(x, y, 1, 1, value);
    return value;
  }

  private compositeSamplePixel(x: number, y: number): Uint8Array {
    const target = this.createSamplingCanvas(1, 1);
    this.composeSamplingLayers(this.ctl.doc.layers, target, 1, 1, (layer) => this.readSamplingLayerPixel(layer, x, y));
    return new Uint8Array(target.getContext('2d')!.getImageData(0, 0, 1, 1).data);
  }

  private readSamplingLayerPixel(layer: LayerNode, x: number, y: number): Uint8Array | null {
    const surface = this.ctl.layerPixels(layer);
    if (!surface) return null;
    const data = new Uint8Array(4);
    surface.readRectToJS(x, y, 1, 1, data);
    return data;
  }

  // ───────────── Undo / archivos ─────────────

  private doUndo(): void {
    if (this.stroke) return;
    this.handleHistoryResult(this.ctl.undo());
    this.updateHistoryUI();
  }

  private doRedo(): void {
    if (this.stroke) return;
    this.handleHistoryResult(this.ctl.redo());
    this.updateHistoryUI();
  }

  private handleHistoryResult(kind: 'pixels' | 'structure' | null): void {
    if (kind === 'pixels') this.renderFrame();
    else if (kind === 'structure') this.refreshAfterStructuralHistory();
  }

  private refreshAfterStructuralHistory(): void {
    if (!this.ctl.find(this.activeId)) this.activeId = this.topRaster()?.id ?? '';
    this.syncUI(); this.scheduleRefresh();
  }

  private async save(asNew: boolean): Promise<void> {
    if (this.stroke) return;
    try { await this.saveDocument(asNew); }
    catch (error) { this.fail(error); }
  }

  private async saveDocument(asNew: boolean): Promise<void> {
    const doc = this.ctl.doc;
    const read = (layer: LayerNode) => this.ctl.readPixels(layer);
    const handle = await saveToDisk(doc, read, asNew ? undefined : this.fileHandle ?? undefined);
    if (supportsFileSystemAccess() && !handle) return;
    if (handle) this.fileHandle = handle;
    this.syncDocumentHeader();
    const bytes = packNvtsPhoto(doc, read);
    if (readPreferences().rememberRecentProjects) await this.rememberSavedProject(doc, bytes);
    this.q<HTMLElement>('#status').textContent = `Guardado · ${doc.width}×${doc.height}`;
  }

  private async rememberSavedProject(doc: DocumentController['doc'], bytes: Uint8Array): Promise<void> {
    await rememberRecentProject(doc, bytes).catch((error) => console.warn('El archivo se guardó, pero no se pudo actualizar Proyectos recientes:', error));
  }

  private async open(): Promise<void> {
    if (this.stroke) return;
    try { await this.openDocument(); }
    catch (error) { this.fail(error); }
  }

  private async openDocument(): Promise<void> {
    const result = await openFromDisk();
    if (!result) return;
    this.fileHandle = result.handle;
    this.applyOpenedFileName(result);
    this.setDocument(this.documentLifecycle.fromUnpacked(this.engine.module, result));
    await this.refreshLinkedFileLayers(false);
    if (readPreferences().rememberRecentProjects) {
      const doc = this.ctl.doc;
      const bytes = packNvtsPhoto(doc, (layer) => this.ctl.readPixels(layer));
      await rememberRecentProject(doc, bytes).catch((error) => console.warn('No se pudo actualizar Proyectos recientes:', error));
    }
  }

  private applyOpenedFileName(result: Awaited<ReturnType<typeof openFromDisk>> & {}): void {
    if (result.fileName) result.doc.name = documentNameFromFile(result.fileName);
  }

  private commitPointerUpAction(e: PointerEvent | undefined, tool: Tool | null): void {
    if (e && (tool === 'brush' || tool === 'eraser')) {
      this.onPointerMove(e, true);
      return;
    }
    if (e && this.shapeStart && (tool === 'line' || tool === 'rectangle' || tool === 'ellipse')) {
      this.commitShape(this.shapeStart, this.toDoc(e), tool);
    }
  }

  private fail(e: unknown): void {
    console.error(e);
    alert(e instanceof Error ? e.message : String(e));
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector<T>(sel)!;
  }
}
