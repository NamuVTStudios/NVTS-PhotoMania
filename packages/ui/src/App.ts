// App.ts — Ensambla todo: motor Wasm + renderer (WebGPU/WebGL2) + documento + guardado + UI.
// Todo corre en el hilo principal por ahora (mover el motor a un Worker es un paso posterior).
// Opciones de herramienta por contexto; el panel avanzado cambia según la herramienta activa.

import { EngineClient } from '@nvts/wasm-bindings';
import { createRenderer, type RendererBackend } from '@nvts/renderer';
import {
  DocumentController, blendModeToManifest, StrokeSession, refresh, runEdit,
  type EngineCtx, type LayerNode,
} from '@nvts/document-model';
import { isPixelLayerType, type BlendMode, type FilterKind, type LayerType, type VectorShape, type TextLayerStyle, type TextLayerAlign } from '@nvts/shared';
import { ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE, renderAdvancedToolOptionsPanel } from './panels/AdvancedToolOptionsPanel';
import { HISTORY_PANEL_TEMPLATE, renderHistoryPanel } from './panels/HistoryPanel';
import { LAYERS_PANEL_TEMPLATE, renderLayersPanel, wireLayersPanel } from './panels/LayersPanel';
import { COMIC_MANAGER_PANEL_TEMPLATE, renderComicManagerPanel, type ComicConfig, type ComicPageEntry } from './panels/ComicManagerPanel';
import { LAYER_EFFECTS_PANEL_TEMPLATE, wireLayerEffectsPanel } from './panels/LayerEffectsPanel';
import { FILTER_PANEL_TEMPLATE, wireFilterPanel } from './panels/FilterPanel';
import { VECTOR_EDITOR_PANEL_TEMPLATE, wireVectorEditorPanel, renderVectorEditorPanel } from './panels/VectorEditorPanel';
import { PLUGINS_PANEL_TEMPLATE, wirePlugins, type PluginApi } from './panels/PluginsPanel';
import { PREFERENCES_PANEL_TEMPLATE, initializePreferences, readPreferences, wirePreferences, type AppPreferences } from './panels/PreferencesPanel';
import { openFromDisk, packNvtsPhoto, saveToDisk, unpackNvtsPhoto, listRecentProjects, loadRecentProject, rememberRecentProject, removeRecentProject, supportsFileSystemAccess, rememberLinkedFile, getLinkedFile, type RecentProjectInfo } from '@nvts/storage';

type Tool = 'brush' | 'eraser' | 'eyedropper' | 'line' | 'rectangle' | 'ellipse' | 'fill' | 'hand' | 'text' | 'vector-select';
type ToolSettings = { size: number; opacity: number; hardness: number; spacing: number; smoothing: number; tolerance: number; contiguous: boolean; sampleMerged: boolean; shapeFill: boolean; lineCap: CanvasLineCap; lineJoin: CanvasLineJoin };
const LOGO_URL = `${import.meta.env.BASE_URL}branding/photomania-icon.svg`;

interface TextToolSettings { fontFamily: string; fontSize: number; style: TextLayerStyle; color: string; align: TextLayerAlign; lineHeight: number; letterSpacing: number; strokeColor: string; strokeWidth: number; backgroundColor: string }

type WorkspaceId = 'general' | 'digital-illustration' | 'vector-illustration' | 'image-manipulation' | 'comics';
const WORKSPACE_STORAGE_KEY = 'nvts-photomania-workspace-v1';
const WORKSPACES: Array<{ id: WorkspaceId; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'digital-illustration', label: 'Ilustración digital' },
  { id: 'vector-illustration', label: 'Ilustración vectorial' },
  { id: 'image-manipulation', label: 'Manipulación de imágenes' },
  { id: 'comics', label: 'Cómics' },
];

const COMIC_CONFIG_STORAGE_KEY = 'nvts-photomania-comic-config-v1';

function readWorkspace(): WorkspaceId {
  try {
    const value = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return WORKSPACES.some((workspace) => workspace.id === value) ? value as WorkspaceId : 'general';
  } catch { return 'general'; }
}
function writeWorkspace(workspace: WorkspaceId): void {
  try { localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace); }
  catch (error) { console.warn('No se pudo guardar el espacio de trabajo:', error); }
}
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
function normalizeComicConfig(input: unknown): ComicConfig {
  if (!input || typeof input !== 'object') throw new Error('El archivo no contiene una configuración de cómic válida.');
  const value = input as Partial<ComicConfig>;
  if (value.format !== 'nvts-comic-config' || value.version !== 1 || !Array.isArray(value.pages)) {
    throw new Error('El archivo debe ser una configuración NVTS de cómic (comicConfig.json, versión 1).');
  }
  const validDimension = (num: unknown, fallback: number) => Number.isFinite(Number(num)) && Number(num) >= 1 && Number(num) <= 16384 ? Math.round(Number(num)) : fallback;
  const base = defaultComicConfig();
  const pages: ComicPageEntry[] = value.pages.slice(0, 1000).map((rawPage, index) => {
    const page = rawPage && typeof rawPage === 'object' ? rawPage as Partial<ComicPageEntry> : {};
    const number = validDimension(page.number, index + 1);
    return {
      id: typeof page.id === 'string' && page.id ? page.id : crypto.randomUUID(),
      number, name: typeof page.name === 'string' && page.name.trim() ? page.name.trim().slice(0, 160) : `Página ${number}`,
      fileName: typeof page.fileName === 'string' ? page.fileName.slice(0, 240) : `comic-page-${String(number).padStart(3, '0')}.nvtsphoto`,
      width: Math.min(8192, validDimension(page.width, base.pageWidth)), height: Math.min(8192, validDimension(page.height, base.pageHeight)),
      notes: typeof page.notes === 'string' ? page.notes.slice(0, 4000) : '',
    };
  });
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
    pageWidth: Math.min(8192, validDimension(value.pageWidth, base.pageWidth)), pageHeight: Math.min(8192, validDimension(value.pageHeight, base.pageHeight)),
    dpi: validDimension(value.dpi, base.dpi),
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
async function writeFileHandleBytes(handle: FileSystemFileHandle, data: BlobPart): Promise<void> {
  const writable = await handle.createWritable();
  try { await writable.write(data); await writable.close(); }
  catch (error) { await writable.abort(); throw error; }
}
function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}

function documentNameFromFile(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() ?? fileName;
  return leaf.replace(/\.(nvtsphoto|png|jpe?g|webp|gif|bmp|tiff?)$/i, '').trim() || 'Sin título';
}

const MAIN_MENU = `<nav class="menus" aria-label="Menú principal">
    <div class="menu-wrap">
      <button id="menu-file" aria-haspopup="menu" aria-expanded="false" aria-controls="file-menu-dropdown">Archivo ▾</button>
      <div id="file-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Archivo" hidden>
        <button id="b-new" class="menu-item" role="menuitem" type="button"><span>Nuevo proyecto</span><kbd>Ctrl+N</kbd></button>
        <button id="b-open" class="menu-item" role="menuitem" type="button"><span>Abrir archivo…</span><kbd>Ctrl+O</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <button id="b-save" class="menu-item" role="menuitem" type="button"><span>Guardar</span><kbd>Ctrl+S</kbd></button>
        <button id="b-save-as" class="menu-item" role="menuitem" type="button"><span>Guardar como…</span><kbd>Ctrl+Shift+S</kbd></button>
      </div>
    </div>
    <div class="menu-wrap">
      <button id="menu-edit" aria-haspopup="menu" aria-expanded="false" aria-controls="edit-menu-dropdown">Editar ▾</button>
      <div id="edit-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Editar" hidden>
        <button id="b-preferences" class="menu-item" role="menuitem" type="button"><span>Preferencias…</span><kbd></kbd></button>
      </div>
    </div>
    <button id="menu-image">Imagen</button><button id="menu-layer">Capa</button><button id="menu-select">Seleccionar</button><button id="menu-filter">Filtro</button>
    <div class="menu-wrap view-menu-wrap">
      <button id="menu-view" aria-haspopup="menu" aria-expanded="false" aria-controls="view-menu-dropdown">Ver ▾</button>
      <div id="view-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Ver" hidden>
        <button id="toggle-panels" class="menu-item" role="menuitem" type="button"><span>Mostrar paneles</span><kbd>Tab</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <div class="menu-subwrap">
          <button id="menu-panels" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="panels-menu-dropdown"><span>Paneles</span><span class="submenu-arrow">›</span></button>
          <div id="panels-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Paneles" hidden>
            <button id="toggle-panel-advanced" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button"><span>Opciones avanzadas de herramienta</span><span class="menu-check">✓</span></button>
            <button id="toggle-panel-history" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button"><span>Historial</span><span class="menu-check">✓</span></button>
            <button id="toggle-panel-layers" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button"><span>Capas</span><span class="menu-check">✓</span></button>
            <button id="toggle-panel-comic" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button"><span>Gestor de cómics</span><span class="menu-check"></span></button>
          </div>
        </div>
        <div class="menu-subwrap">
          <button id="menu-plugins" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="plugins-menu-dropdown"><span>Plugins</span><span class="submenu-arrow">›</span></button>
          <div id="plugins-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Plugins" hidden>
            <button id="plugins-manage" class="menu-item" role="menuitem" type="button"><span>Administrar plugins…</span></button>
            <button id="plugins-install-menu" class="menu-item" role="menuitem" type="button"><span>Instalar plugin (.js)…</span></button>
            <div class="menu-divider" role="separator"></div>
            <div id="plugin-actions" class="plugin-actions"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="menu-wrap workspace-menu-wrap">
      <button id="menu-workspace" aria-haspopup="menu" aria-expanded="false" aria-controls="workspace-menu-dropdown">Espacio de trabajo ▾</button>
      <div id="workspace-menu-dropdown" class="file-menu-dropdown workspace-menu-dropdown" role="menu" aria-label="Espacios de trabajo" hidden>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="true" data-workspace="general" type="button"><span>General</span><span class="menu-check">✓</span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="digital-illustration" type="button"><span>Ilustración digital</span><span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="vector-illustration" type="button"><span>Ilustración vectorial</span><span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="image-manipulation" type="button"><span>Manipulación de imágenes</span><span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="comics" type="button"><span>Cómics</span><span class="menu-check"></span></button>
      </div>
    </div>
    <button id="menu-help">Ayuda</button>
  </nav>`;

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
  </aside>
</main>
${LAYER_EFFECTS_PANEL_TEMPLATE}${FILTER_PANEL_TEMPLATE}${VECTOR_EDITOR_PANEL_TEMPLATE}`;

type TemplateDef = { id:string; title:string; category:string; width:number; height:number; icon:string; preview:string };
const TEMPLATES: TemplateDef[] = [
  {id:'instagram-post',title:'Instagram Post',category:'Redes sociales',width:1080,height:1080,icon:'◎',preview:'square'},
  {id:'instagram-story',title:'Instagram Story',category:'Redes sociales',width:1080,height:1920,icon:'▯',preview:'portrait'},
  {id:'youtube-thumb',title:'Miniatura YouTube',category:'Redes sociales',width:1280,height:720,icon:'▶',preview:'landscape'},
  {id:'full-hd',title:'Full HD',category:'Pantallas',width:1920,height:1080,icon:'▱',preview:'landscape'},
  {id:'4k-uhd',title:'4K UHD',category:'Pantallas',width:3840,height:2160,icon:'▱',preview:'landscape'},
  {id:'a4',title:'A4 (300 ppp)',category:'Impresión',width:2480,height:3508,icon:'▤',preview:'portrait'},
  {id:'comic-us',title:'Cómic USA',category:'Cómic e ilustración',width:1650,height:2550,icon:'▤',preview:'portrait'},
  {id:'comic-eu',title:'Cómic europeo',category:'Cómic e ilustración',width:2100,height:2970,icon:'▤',preview:'portrait'},
  {id:'manga',title:'Manga',category:'Cómic e ilustración',width:1600,height:2400,icon:'▤',preview:'portrait'},
  {id:'manhwa',title:'Manhwa / Webtoon',category:'Cómic e ilustración',width:800,height:1280,icon:'▥',preview:'portrait'},
  {id:'facebook-post',title:'Facebook Post',category:'Redes sociales',width:1200,height:630,icon:'f',preview:'landscape'},
  {id:'facebook-story',title:'Facebook Story',category:'Redes sociales',width:1080,height:1920,icon:'▯',preview:'portrait'},
  {id:'tiktok-post',title:'TikTok Post',category:'Redes sociales',width:1080,height:1350,icon:'♪',preview:'portrait'},
  {id:'tiktok-story',title:'TikTok Story',category:'Redes sociales',width:1080,height:1920,icon:'♪',preview:'portrait'},
  {id:'animation-web',title:'Animación web',category:'Animación 2D',width:1280,height:720,icon:'▷',preview:'landscape'},
  {id:'animation-2d',title:'Animación 2D',category:'Animación 2D',width:1920,height:1080,icon:'◉',preview:'landscape'},
  {id:'texture-uv',title:'Textura UV (cuadrada)',category:'Texturas',width:2048,height:2048,icon:'▦',preview:'square'},
  {id:'texture-uv-4k',title:'Textura UV 4K',category:'Texturas',width:4096,height:4096,icon:'▦',preview:'square'},
  {id:'texture-2d',title:'Textura 2D / Tileable',category:'Texturas',width:1024,height:1024,icon:'▦',preview:'square'},
  {id:'texture-2d-wide',title:'Textura 2D panorámica',category:'Texturas',width:2048,height:1024,icon:'▦',preview:'landscape'},
];
const HOME_TEMPLATE = `
<div class="home-shell">
  <header class="home-topbar"><button class="home-back" title="Volver al selector" aria-label="Volver al selector">←</button><div class="home-mini-brand"><img src="${LOGO_URL}" alt=""/><strong>PhotoMania</strong></div><span class="home-top-divider"></span>${MAIN_MENU}</header>
  <main class="home-card">
    <header class="home-brand"><img src="${LOGO_URL}" alt="Logo de NVTS PhotoMania"/><div><h1>Photo<span>Mania</span></h1><p>Crea algo increíble. Diseñá, editá y da vida a tus ideas.</p></div></header>
    <div class="home-layout">
      <aside class="home-sidebar">
        <button data-home-nav="new" class="active"><span>♧</span>Nuevo proyecto</button>
        <button data-home-nav="open"><span>▱</span>Abrir archivo</button>
        <button data-home-nav="recent"><span>◷</span>Proyectos recientes <small id="home-recent-count">0</small></button>
        <div class="home-sidebar-divider"></div><span class="home-side-caption">Importar desde…</span>
        <button data-home-open="device"><span>▣</span>Tu dispositivo</button>
        <button class="home-disabled" title="Integración futura"><span>△</span>Google Drive <em>Próximamente</em></button>
        <button class="home-disabled" title="Integración futura"><span>❖</span>Dropbox <em>Próximamente</em></button>
        <button id="home-paste-hint" class="home-drop-hint">Arrastrá un archivo o pegá una imagen (Ctrl+V)</button>
      </aside>
      <section class="home-main">
        <section data-home-view="new" class="home-view">
          <div class="home-section-head"><h2 id="home-section-title">Nuevo proyecto</h2><span>Elegí una plantilla para empezar</span></div>
          <div class="home-template-toolbar"><label for="home-category">Categoría</label><select id="home-category"><option>Todas</option><option>Redes sociales</option><option>Pantallas</option><option>Impresión</option><option>Cómic e ilustración</option><option>Animación 2D</option><option>Texturas</option></select></div>
          <div id="home-template-grid" class="home-template-grid"></div>
          <div class="home-create-settings"><label class="home-field home-name-field">Nombre del proyecto<input id="home-project-name" maxlength="120" value="Sin título" /></label><div class="home-dimensions"><label class="home-field">Ancho<input id="home-width" type="number" min="1" max="8192" value="1920" /></label><label class="home-lock"><input id="home-lock" type="checkbox" checked aria-label="Mantener proporción"/><span>🔒</span></label><label class="home-field">Alto<input id="home-height" type="number" min="1" max="8192" value="1080" /></label><span class="home-px">px</span><button id="home-create" class="home-primary">Crear proyecto <span>→</span></button></div>
          </div>
        </section>
        <section data-home-view="open" class="home-view" hidden>
          <div class="home-section-head"><h2>Abrir archivo</h2><span>Continuá trabajando en una imagen</span></div>
          <div id="home-dropzone" class="home-dropzone"><div class="home-download-icon">↓</div><h3>Arrastrá una imagen o <span>seleccioná un archivo</span></h3><p>También podés examinar tu dispositivo</p><button id="home-browse" class="home-secondary">▱ &nbsp; Examinar archivos</button><div class="home-filetypes"><span>.nvtsphoto</span><span>.png</span><span>.jpg</span><span>.webp</span><span>.gif</span></div><input id="home-file-input" type="file" accept="image/*,.nvtsphoto" hidden /></div>
        </section>
        <section data-home-view="recent" class="home-view" hidden><div class="home-section-head"><h2>Proyectos recientes</h2><span>Seguí donde lo dejaste</span></div><div id="home-recents" class="home-recent-grid"></div></section>
        <p id="home-status" class="home-status" role="status"></p>
      </section>
    </div>
  </main>
</div>`;

export class App {
  private ctl!: DocumentController;
  private ctx!: EngineCtx;
  private fileHandle: FileSystemFileHandle | null = null;
  private workspace: WorkspaceId = readWorkspace();
  private comicConfig: ComicConfig = readComicConfig();
  private comicActivePageId: string | null = this.comicConfig.pages[0]?.id ?? null;
  private comicParentDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private comicProjectDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private comicPagesDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private comicExportDirectoryHandle: FileSystemDirectoryHandle | null = null;
  private comicConfigWriteChain: Promise<void> = Promise.resolve();
  private activeId = '';
  private tool: Tool = 'brush';
  private textSettings: TextToolSettings = { fontFamily: 'Arial', fontSize: 64, style: 'normal', color: '#e03030', align: 'left', lineHeight: 1.2, letterSpacing: 0, strokeColor: '#000000', strokeWidth: 0, backgroundColor: 'transparent' };
  private vectorDirectSelectedId: string | null = null;
  private vectorGesture: { layerId: string; shapeId: string; mode: 'move' | 'resize'; startPoint: { x: number; y: number }; original: VectorShape; latest: VectorShape; moved: boolean } | null = null;
  private brush: ToolSettings & { rgb: [number, number, number] } = { rgb: [224, 48, 48], size: 24, opacity: 100, hardness: 80, spacing: 15, smoothing: 0, tolerance: 24, contiguous: true, sampleMerged: false, shapeFill: false, lineCap: 'round', lineJoin: 'round' };
  private stroke: StrokeSession | null = null;
  private strokeLayer: ReturnType<DocumentController['layerPixels']> = null;
  private strokeTool: Tool | null = null;
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
  private vectorEditLayerId: string | null = null;
  private vectorDraft: VectorShape[] = [];
  private vectorSelectedId: string | null = null;
  private layerContextMenu: HTMLElement | null = null;

  private constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: EngineClient,
    private readonly renderer: RendererBackend,
  ) { }

  static async start(root: HTMLElement, wasmBase = '/wasm/'): Promise<void> {
    // La pantalla de bienvenida no inicializa el motor Wasm hasta que el usuario abre/crea un documento.
    await initializePreferences();
    root.innerHTML = HOME_TEMPLATE;
    root.insertAdjacentHTML('beforeend', PREFERENCES_PANEL_TEMPLATE);
    root.insertAdjacentHTML('beforeend', PLUGINS_PANEL_TEMPLATE);
    let openPreferences: () => void = () => {};
    let selected = TEMPLATES.find((t) => t.id === 'full-hd')!;
    let width = selected.width;
    let height = selected.height;
    const nameInput = root.querySelector<HTMLInputElement>('#home-project-name')!;
    const widthInput = root.querySelector<HTMLInputElement>('#home-width')!;
    const heightInput = root.querySelector<HTMLInputElement>('#home-height')!;
    const lock = root.querySelector<HTMLInputElement>('#home-lock')!;
    const gallery = root.querySelector<HTMLElement>('#home-template-grid')!;
    const category = root.querySelector<HTMLSelectElement>('#home-category')!;
    const title = root.querySelector<HTMLElement>('#home-section-title')!;
    const homeStatus = root.querySelector<HTMLElement>('#home-status')!;
    let recentItems: RecentProjectInfo[] = [];
    let removeRecentId: string | null = null;
    const recentContextMenu = document.createElement('div');
    recentContextMenu.className = 'recent-context-menu';
    recentContextMenu.hidden = true;
    recentContextMenu.setAttribute('role', 'menu');
    const removeRecentButton = document.createElement('button');
    removeRecentButton.type = 'button';
    removeRecentButton.textContent = 'Eliminar de recientes';
    removeRecentButton.setAttribute('role', 'menuitem');
    recentContextMenu.append(removeRecentButton);
    root.append(recentContextMenu);
    const closeRecentContextMenu = () => { recentContextMenu.hidden = true; removeRecentId = null; };
    removeRecentButton.onclick = () => {
      const id = removeRecentId;
      closeRecentContextMenu();
      if (!id) return;
      void (async () => {
        try {
          await removeRecentProject(id);
          recentItems = recentItems.filter((item) => item.id !== id);
          renderRecent();
        } catch (error) {
          homeStatus.textContent = error instanceof Error ? error.message : String(error);
        }
      })();
    };
    root.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Node && !recentContextMenu.contains(event.target)) closeRecentContextMenu();
    });
    root.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeRecentContextMenu(); });

    const refreshRecent = async () => {
      if (!readPreferences().rememberRecentProjects) recentItems = [];
      else {
        try { recentItems = await listRecentProjects(); }
        catch (error) { console.warn('No se pudieron cargar los proyectos recientes:', error); recentItems = []; }
      }
      renderRecent();
    };
    const renderRecent = () => {
      const host = root.querySelector<HTMLElement>('#home-recents')!;
      host.replaceChildren();
      root.querySelector<HTMLElement>('#home-recent-count')!.textContent = String(recentItems.length);
      if (!readPreferences().rememberRecentProjects) {
        host.innerHTML = '<div class="home-empty"><span>◷</span><strong>Proyectos recientes desactivados</strong><p>Podés activarlos desde Preferencias cuando quieras guardar una lista local.</p><button type="button" class="home-secondary" id="enable-recent-preference">Abrir preferencias</button></div>';
        host.querySelector<HTMLButtonElement>('#enable-recent-preference')!.onclick = () => openPreferences();
        return;
      }
      if (!recentItems.length) {
        host.innerHTML = '<div class="home-empty"><span>◷</span><strong>Todavía no hay proyectos recientes</strong><p>Los proyectos guardados en este navegador aparecerán acá.</p></div>';
        return;
      }
      for (const item of recentItems) {
        const button = document.createElement('button'); button.className = 'recent-card'; button.type = 'button';
        const preview = document.createElement('span'); preview.className = 'recent-preview';
        const paper = document.createElement('span'); paper.className = 'recent-paper'; paper.style.aspectRatio = `${item.width} / ${item.height}`; preview.append(paper);
        const label = document.createElement('strong'); label.textContent = item.name;
        const meta = document.createElement('small'); meta.textContent = `${item.width} × ${item.height} px · ${new Date(item.updatedAt).toLocaleDateString()}`;
        button.append(preview, label, meta);
        button.oncontextmenu = (event) => {
          event.preventDefault();
          event.stopPropagation();
          removeRecentId = item.id;
          recentContextMenu.hidden = false;
          const menuWidth = 210, menuHeight = 48;
          recentContextMenu.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8))}px`;
          recentContextMenu.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))}px`;
          removeRecentButton.focus();
        };
        button.onclick = () => {
          button.disabled = true;
          void (async () => {
            try {
              const bytes = await loadRecentProject(item.id);
              if (!bytes) throw new Error('No se encontró la copia local de este proyecto.');
              const fileBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
              const file = new File([fileBytes], `${item.name || 'Proyecto'}.nvtsphoto`, { type: 'application/x-nvtsphoto' });
              await launch(item.name, item.width, item.height, file);
            } catch (error) {
              homeStatus.textContent = error instanceof Error ? error.message : String(error);
            } finally { button.disabled = false; }
          })();
        };
        host.append(button);
      }
    };
    openPreferences = wirePreferences(root, async () => { await refreshRecent(); });
    wirePlugins(root);
    const renderTemplates = () => {
      const cat = category.value;
      const items = TEMPLATES.filter((t) => cat === 'Todas' || t.category === cat);
      gallery.replaceChildren();
      for (const item of items) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'template-card' + (selected.id === item.id ? ' selected' : '');
        button.setAttribute('aria-pressed', String(selected.id === item.id));
        const preview = document.createElement('span'); preview.className = `template-preview preview-${item.preview}`;
        preview.innerHTML = `<span class="preview-paper"></span>`;
        const icon = document.createElement('span'); icon.className = 'template-icon'; icon.textContent = item.icon;
        const name = document.createElement('strong'); name.textContent = item.title;
        const dims = document.createElement('small'); dims.textContent = `${item.width} × ${item.height} px`;
        button.append(preview, icon, name, dims);
        button.onclick = () => { selected = item; width = item.width; height = item.height; widthInput.value = String(width); heightInput.value = String(height); renderTemplates(); };
        gallery.append(button);
      }
    };
    const showSection = (section: 'new'|'open'|'recent') => {
      root.querySelectorAll<HTMLElement>('[data-home-view]').forEach((el) => el.hidden = el.dataset.homeView !== section);
      root.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((el) => el.classList.toggle('active', el.dataset.homeNav === section));
      const labels = { new:'Nuevo proyecto', open:'Abrir archivo', recent:'Proyectos recientes' };
      title.textContent = labels[section];
      if (section === 'recent') renderRecent();
    };
    const launch = async (name: string, w: number, h: number, file?: File) => {
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 8192 || h > 8192) { homeStatus.textContent = 'Usá dimensiones entre 1 y 8192 píxeles.'; return; }
      homeStatus.textContent = 'Iniciando PhotoMania…';
      try {
        root.innerHTML = TEMPLATE;
        root.insertAdjacentHTML('beforeend', PREFERENCES_PANEL_TEMPLATE);
        root.insertAdjacentHTML('beforeend', PLUGINS_PANEL_TEMPLATE);
        let appInstance: App | null = null;
        wirePreferences(root, async (next, previous) => {
          if (!previous.rememberRecentProjects && next.rememberRecentProjects) appInstance?.queueRecentSnapshot();
        });
        const canvas = root.querySelector<HTMLCanvasElement>('#canvas')!;
        const [engine, renderer] = await Promise.all([EngineClient.create(wasmBase), createRenderer(canvas)]);
        const app = new App(root, canvas, engine, renderer);
        appInstance = app;
        const projectName = file ? documentNameFromFile(file.name) : name;
        app.bind(); app.newDocument(w, h, projectName);
        if (file && /\.nvtsphoto$/i.test(file.name)) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const unpacked = unpackNvtsPhoto(bytes);
          unpacked.doc.name = documentNameFromFile(file.name) || name;
          app.setDocument(DocumentController.fromUnpacked(engine.module, unpacked));
          await app.refreshLinkedFileLayers(false);
          if (readPreferences().rememberRecentProjects) {
            await rememberRecentProject(app.ctl.doc, packNvtsPhoto(app.ctl.doc, (layer) => app.ctl.readPixels(layer))).catch((error) => console.warn('No se pudo guardar la copia reciente:', error));
          }
        } else if (file) {
          await app.importImage(file);
          app.queueRecentSnapshot();
        }
      } catch (e) {
        root.innerHTML = `<main class="home-fatal"><h1>No se pudo iniciar PhotoMania</h1><p id="home-error"></p><button id="home-back">Volver al inicio</button></main>`;
        root.querySelector('#home-error')!.textContent = e instanceof Error ? e.message : String(e);
        root.querySelector('#home-back')!.addEventListener('click', () => void App.start(root, wasmBase));
        console.error(e);
      }
    };
    root.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((el) => el.addEventListener('click', () => showSection(el.dataset.homeNav as 'new'|'open'|'recent')));
    // La misma barra de menús está disponible tanto en la pantalla de inicio como en el editor.
    const homeMenus = [
      { button: root.querySelector<HTMLButtonElement>('#menu-file')!, dropdown: root.querySelector<HTMLElement>('#file-menu-dropdown')! },
      { button: root.querySelector<HTMLButtonElement>('#menu-edit')!, dropdown: root.querySelector<HTMLElement>('#edit-menu-dropdown')! },
      { button: root.querySelector<HTMLButtonElement>('#menu-workspace')!, dropdown: root.querySelector<HTMLElement>('#workspace-menu-dropdown')! },
    ];
    const closeHomeMenu = (menu: typeof homeMenus[number]) => { menu.dropdown.hidden = true; menu.button.setAttribute('aria-expanded', 'false'); };
    for (const menu of homeMenus) {
      menu.button.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = menu.dropdown.hidden;
        homeMenus.forEach(closeHomeMenu);
        menu.dropdown.hidden = !willOpen;
        menu.button.setAttribute('aria-expanded', String(willOpen));
      });
      menu.dropdown.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button[role^="menuitem"]')) closeHomeMenu(menu);
      });
      menu.dropdown.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { closeHomeMenu(menu); menu.button.focus(); }
      });
    }
    document.addEventListener('pointerdown', (event) => {
      if (!(event.target instanceof Node)) return;
      homeMenus.forEach((menu) => {
        if (!menu.dropdown.contains(event.target as Node) && !menu.button.contains(event.target as Node)) closeHomeMenu(menu);
      });
    });
    const refreshHomeWorkspaceMenu = () => root.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
      const active = button.dataset.workspace === readWorkspace();
      button.setAttribute('aria-checked', String(active));
      const check = button.querySelector<HTMLElement>('.menu-check'); if (check) check.textContent = active ? '✓' : '';
    });
    root.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => button.addEventListener('click', () => {
      const candidate = button.dataset.workspace as WorkspaceId;
      if (!WORKSPACES.some((entry) => entry.id === candidate)) return;
      writeWorkspace(candidate); refreshHomeWorkspaceMenu();
      homeStatus.textContent = `Espacio de trabajo «${WORKSPACES.find((entry) => entry.id === candidate)?.label ?? candidate}» seleccionado. Se aplicará al abrir un documento.`;
    }));
    refreshHomeWorkspaceMenu();
    root.querySelector<HTMLButtonElement>('#b-new')!.onclick = () => showSection('new');
    root.querySelector<HTMLButtonElement>('#b-open')!.onclick = () => { showSection('open'); root.querySelector<HTMLInputElement>('#home-file-input')!.click(); };
    root.querySelector<HTMLButtonElement>('#b-save')!.disabled = true;
    root.querySelector<HTMLButtonElement>('#b-save-as')!.disabled = true;
    ['#menu-image', '#menu-layer', '#menu-select', '#menu-filter', '#menu-view', '#menu-help'].forEach((selector) => {
      root.querySelector<HTMLButtonElement>(selector)!.onclick = () => { homeStatus.textContent = 'Esta opción estará disponible después de crear o abrir un documento.'; };
    });
    root.querySelector('.home-back')!.addEventListener('click', () => showSection('new'));
    root.querySelectorAll<HTMLElement>('[data-home-open]').forEach((el) => el.addEventListener('click', () => showSection('open')));
    category.onchange = renderTemplates;
    lock.onchange = () => { if (lock.checked) { const ratio = width / height; height = Math.max(1, Math.round(Number(widthInput.value) / ratio)); heightInput.value = String(height); } };
    widthInput.oninput = () => { width = Number(widthInput.value); if (lock.checked && width > 0 && height > 0) { height = Math.round(width / (selected.width / selected.height)); heightInput.value = String(height); } };
    heightInput.oninput = () => { height = Number(heightInput.value); if (lock.checked && height > 0) { width = Math.round(height * selected.width / selected.height); widthInput.value = String(width); } };
    root.querySelector('#home-create')!.addEventListener('click', () => {
      const name = nameInput.value.trim() || 'Sin título';
      void launch(name, Number(widthInput.value), Number(heightInput.value));
    });
    const fileInput = root.querySelector<HTMLInputElement>('#home-file-input')!;
    root.querySelector('#home-browse')!.addEventListener('click', () => fileInput.click());
    fileInput.onchange = () => { const file = fileInput.files?.[0]; if (!file) return; const isProject = /\.nvtsphoto$/i.test(file.name); if (isProject) { void launch(file.name.replace(/\.[^.]+$/, '') || 'Proyecto', 1280, 720, file); return; } const image = new Image(); const url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); void launch(file.name.replace(/\.[^.]+$/, '') || 'Imagen importada', image.naturalWidth, image.naturalHeight, file); }; image.onerror = () => { URL.revokeObjectURL(url); homeStatus.textContent = 'No se pudo leer ese archivo como imagen.'; }; image.src = url; };
    const drop = root.querySelector<HTMLElement>('#home-dropzone')!;
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('dragging'); };
    drop.ondragleave = () => drop.classList.remove('dragging');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('dragging'); const file = e.dataTransfer?.files[0]; if (!file) return; if (/\.nvtsphoto$/i.test(file.name)) { void launch(file.name.replace(/\.[^.]+$/, '') || 'Proyecto', 1280, 720, file); return; } const url = URL.createObjectURL(file); const img = new Image(); img.onload = () => { URL.revokeObjectURL(url); void launch(file.name.replace(/\.[^.]+$/, '') || 'Imagen importada', img.naturalWidth, img.naturalHeight, file); }; img.onerror = () => { URL.revokeObjectURL(url); homeStatus.textContent = 'Ese archivo no parece ser una imagen compatible. Los proyectos compatibles son .nvtsphoto.'; }; img.src = url; };
    root.querySelector('#home-paste-hint')!.addEventListener('click', () => { homeStatus.textContent = 'Podés pegar una imagen con Ctrl+V después de abrir el editor.'; });
    renderTemplates(); void refreshRecent(); showSection('new');
  }

  private async importImage(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas'); canvas.width = this.ctl.doc.width; canvas.height = this.ctl.doc.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No se pudo preparar la imagen para importarla.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const layer = this.ctl.doc.layers.find((l) => l.name === 'Capa 1' && (l.type === 'paint' || l.type === 'raster'));
    if (layer) this.ctl.layerPixels(layer)!.loadFromRGBA(new Uint8Array(pixels.data));
    this.ctl.comp.invalidateAll(); this.scheduleRefresh();
  }

  // ───────────── Documento ─────────────

  private newDocument(w: number, h: number, name = 'Sin título'): void {
    const ctl = DocumentController.create(this.engine.module, w, h, name);
    const bg = ctl.addRaster('Fondo');
    ctl.layerPixels(bg)!.loadFromRGBA(new Uint8Array(w * h * 4).fill(255)); // fondo blanco
    ctl.addRaster('Capa 1');
    ctl.clearHistory(); // las capas iniciales forman parte del documento, no son acciones del usuario
    this.fileHandle = null;
    this.setDocument(ctl);
  }

  private setDocument(ctl: DocumentController): void {
    this.ctl?.dispose();
    this.ctl = ctl;
    this.activeId = this.topRaster()?.id ?? '';

    const mod = this.engine.module;
    const T = mod.TILE_SIZE;
    const { width: W, height: H } = ctl.doc;
    this.renderer.ensureSize(W, H);
    // Limpia la textura GPU: los tiles transparentes del documento nuevo nunca se suben.
    const zero = new Uint8Array(T * T * 4);
    for (let y = 0; y < H; y += T)
      for (let x = 0; x < W; x += T)
        this.renderer.writeRegion(x, y, Math.min(T, W - x), Math.min(T, H - y), zero, T * 4);

    this.ctx = {
      mod, comp: ctl.comp, history: ctl.history,
      uploadTile: (tx, ty, px) => {
        const x = tx * T, y = ty * T;
        const w = Math.min(T, W - x), h = Math.min(T, H - y);
        if (w > 0 && h > 0) this.renderer.writeRegion(x, y, w, h, px, T * 4); // stride del tile = T*4
      },
      render: () => this.renderer.render(),
      scheduleRefresh: () => this.scheduleRefresh(),
      onPixelHistory: (label) => { ctl.recordPixelAction(label); this.updateHistoryUI(); },
    };
    ctl.comp.invalidateAll();
    this.syncUI();
    this.scheduleRefresh();
  }

  private topRaster(nodes: LayerNode[] = this.ctl.doc.layers): LayerNode | undefined {
    for (const layer of [...nodes].reverse()) {
      const nestedPaint = layer.type === 'group' ? this.topRaster(layer.children) : undefined;
      if (nestedPaint) return nestedPaint;
      if (layer.type === 'paint' || layer.type === 'raster') return layer;
    }
    for (const layer of [...nodes].reverse()) {
      if (layer.type === 'group') {
        const nestedPixel = this.topRaster(layer.children);
        if (nestedPixel && isPixelLayerType(nestedPixel.type)) return nestedPixel;
      }
      if (isPixelLayerType(layer.type)) return layer;
    }
    return undefined;
  }
  // Durante el arranque bind() construye la barra antes de crear el documento.
  // En ese momento todavía no existe ctl; una herramienta puede consultar la capa activa.
  private active(): LayerNode | undefined { return this.ctl ? this.ctl.find(this.activeId) : undefined; }

  // ───────────── Refresco ─────────────

  private scheduleRefresh(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.renderFrame(); });
  }

  private hasFilterLayer(nodes: LayerNode[] = this.ctl.doc.layers): boolean {
    return nodes.some((node) => node.type === 'filter' || (node.children.length > 0 && this.hasFilterLayer(node.children)));
  }

  /** Renderizador alternativo por tiles para que las capas de filtro afecten, de forma no destructiva,
   * solo al contenido que está debajo de ellas. Sin capas de filtro seguimos usando el compositor Wasm. */
  private renderFrame(): void {
    if (this.hasFilterLayer()) this.renderWithFilterLayers();
    else refresh(this.ctx);
  }

  private filterCss(kind: FilterKind, strength: number): string {
    const amount = Math.max(0, Math.min(1, strength));
    switch (kind) {
      case 'grayscale': return `grayscale(${amount * 100}%)`;
      case 'invert': return `invert(${amount * 100}%)`;
      case 'sepia': return `sepia(${amount * 100}%)`;
      case 'blur': return `blur(${amount * 12}px)`;
      case 'brightness': return `brightness(${100 + amount * 100}%)`;
      case 'contrast': return `contrast(${100 + amount * 150}%)`;
    }
  }

  private canvasBlend(mode: LayerNode['blendMode']): GlobalCompositeOperation {
    switch (mode) {
      case 'multiply': return 'multiply';
      case 'screen': return 'screen';
      case 'overlay': return 'overlay';
      default: return 'source-over';
    }
  }

  private renderWithFilterLayers(): void {
    const { width, height } = this.ctl.doc;
    const tileSize = this.engine.module.TILE_SIZE || 256;
    const targetPool: HTMLCanvasElement[] = [];
    const layerPool: HTMLCanvasElement[] = [];
    const filterSourcePool: HTMLCanvasElement[] = [];
    const filterResultPool: HTMLCanvasElement[] = [];

    const getCanvas = (pool: HTMLCanvasElement[], depth: number, w: number, h: number): HTMLCanvasElement => {
      let canvas = pool[depth];
      if (!canvas) { canvas = document.createElement('canvas'); pool[depth] = canvas; }
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; ctx.clearRect(0, 0, w, h); }
      return canvas;
    };

    for (let y = 0; y < height; y += tileSize) {
      for (let x = 0; x < width; x += tileSize) {
        const w = Math.min(tileSize, width - x), h = Math.min(tileSize, height - y);
        const rootCanvas = getCanvas(targetPool, 0, w, h);
        const compose = (nodes: LayerNode[], depth: number): HTMLCanvasElement => {
          const target = depth === 0 ? rootCanvas : getCanvas(targetPool, depth, w, h);
          const targetCtx = target.getContext('2d', { willReadFrequently: true })!;
          targetCtx.clearRect(0, 0, w, h);
          for (const node of nodes) {
            if (!node.visible || node.opacity <= 0) continue;
            if (node.type === 'filter') {
              const strength = node.filterStrength ?? 1;
              const source = getCanvas(filterSourcePool, depth, w, h);
              const sourceCtx = source.getContext('2d', { willReadFrequently: true })!;
              sourceCtx.drawImage(target, 0, 0);
              const filtered = getCanvas(filterResultPool, depth, w, h);
              const filteredCtx = filtered.getContext('2d', { willReadFrequently: true })!;
              filteredCtx.filter = this.filterCss(node.filterKind ?? 'grayscale', strength);
              filteredCtx.drawImage(source, 0, 0);
              filteredCtx.filter = 'none';
              const originalImage = sourceCtx.getImageData(0, 0, w, h);
              const filteredImage = filteredCtx.getImageData(0, 0, w, h);
              for (let i = 0; i < originalImage.data.length; i++) {
                originalImage.data[i] = Math.round(originalImage.data[i] * (1 - node.opacity) + filteredImage.data[i] * node.opacity);
              }
              targetCtx.clearRect(0, 0, w, h);
              targetCtx.putImageData(originalImage, 0, 0);
              continue;
            }
            if (node.type === 'group') {
              const groupCanvas = compose(node.children, depth + 1);
              targetCtx.save();
              targetCtx.globalAlpha = node.opacity;
              targetCtx.globalCompositeOperation = this.canvasBlend(node.blendMode);
              targetCtx.drawImage(groupCanvas, 0, 0);
              targetCtx.restore();
              continue;
            }
            if (!isPixelLayerType(node.type)) continue;
            const backing = this.ctl.layerPixels(node);
            if (!backing) continue;
            const rgba = new Uint8Array(w * h * 4);
            if (!backing.readRectToJS(x, y, w, h, rgba)) continue;
            const layerCanvas = getCanvas(layerPool, depth, w, h);
            const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true })!;
            const image = layerCtx.createImageData(w, h);
            image.data.set(rgba);
            layerCtx.putImageData(image, 0, 0);
            targetCtx.save();
            targetCtx.globalAlpha = node.opacity;
            targetCtx.globalCompositeOperation = this.canvasBlend(node.blendMode);
            targetCtx.drawImage(layerCanvas, 0, 0);
            targetCtx.restore();
          }
          return target;
        };
        const output = compose(this.ctl.doc.layers, 0);
        const ctx = output.getContext('2d', { willReadFrequently: true })!;
        const image = ctx.getImageData(0, 0, w, h);
        this.renderer.writeRegion(x, y, w, h, new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength), w * 4);
      }
    }
    this.renderer.render();
  }

  private applyWorkspace(workspace: WorkspaceId, announce = true): void {
    if (!WORKSPACES.some((entry) => entry.id === workspace)) workspace = 'general';
    this.workspace = workspace;
    writeWorkspace(workspace);
    const panel = <T extends HTMLElement = HTMLElement>(selector: string): T | null => this.root.querySelector<T>(selector);
    const advanced = panel('.advanced-tool-panel');
    const history = panel('.history-panel');
    const layers = panel('.layers-panel');
    const comic = panel('.comic-manager-panel');
    const dock = panel('.right-dock');
    if (!advanced || !history || !layers || !comic || !dock) return;
    const presets: Record<WorkspaceId, { visible: { advanced: boolean; history: boolean; layers: boolean; comic: boolean }; order: string[] }> = {
      general: { visible: { advanced: true, history: true, layers: true, comic: false }, order: ['advanced', 'history', 'layers', 'comic'] },
      'digital-illustration': { visible: { advanced: true, history: true, layers: true, comic: false }, order: ['advanced', 'layers', 'history', 'comic'] },
      'vector-illustration': { visible: { advanced: true, history: true, layers: true, comic: false }, order: ['layers', 'advanced', 'history', 'comic'] },
      'image-manipulation': { visible: { advanced: true, history: true, layers: true, comic: false }, order: ['layers', 'history', 'advanced', 'comic'] },
      comics: { visible: { advanced: true, history: true, layers: true, comic: true }, order: ['comic', 'layers', 'history', 'advanced'] },
    };
    const preset = presets[workspace];
    advanced.hidden = !preset.visible.advanced;
    history.hidden = !preset.visible.history;
    layers.hidden = !preset.visible.layers;
    comic.hidden = !preset.visible.comic;
    const panels: Record<string, HTMLElement> = { advanced, history, layers, comic };
    preset.order.forEach((id, index) => { panels[id].style.order = String(index); });
    dock.dataset.workspace = workspace;
    dock.classList.remove('panels-hidden');
    dock.classList.toggle('panels-empty', !preset.visible.advanced && !preset.visible.history && !preset.visible.layers && !preset.visible.comic);
    this.root.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
      const selected = button.dataset.workspace === workspace;
      button.setAttribute('aria-checked', String(selected));
      const check = button.querySelector<HTMLElement>('.menu-check'); if (check) check.textContent = selected ? '✓' : '';
    });
    const viewDrop = panel('#view-menu-dropdown');
    const panelsDrop = panel('#panels-menu-dropdown');
    if (viewDrop && panelsDrop) {
      const entries = [
        ['#toggle-panel-advanced', advanced], ['#toggle-panel-history', history], ['#toggle-panel-layers', layers], ['#toggle-panel-comic', comic],
      ] as const;
      for (const [buttonSelector, panelElement] of entries) {
        const button = panel<HTMLButtonElement>(buttonSelector);
        if (!button) continue;
        button.setAttribute('aria-checked', String(!panelElement.hidden));
        const check = button.querySelector<HTMLElement>('.menu-check'); if (check) check.textContent = !panelElement.hidden ? '✓' : '';
      }
      const toggle = panel<HTMLButtonElement>('#toggle-panels');
      toggle?.setAttribute('aria-pressed', 'true');
    }
    if (announce) {
      const label = WORKSPACES.find((entry) => entry.id === workspace)?.label ?? 'General';
      const status = panel<HTMLElement>('#status');
      if (status) status.textContent = `Espacio de trabajo: ${label}`;
    }
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
    try {
      localStorage.setItem(COMIC_CONFIG_STORAGE_KEY, JSON.stringify(this.comicConfig));
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (status) status.textContent = message;
    } catch (error) {
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (status) status.textContent = 'No se pudo guardar localmente';
      console.warn('No se pudo guardar la configuración de cómic:', error);
    }
    if (this.comicProjectDirectoryHandle) {
      const snapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
      this.comicConfigWriteChain = this.comicConfigWriteChain
        .then(async () => {
          const written = await this.writeComicConfigSnapshot(snapshot, false, false);
          if (!written) {
            const status = this.root.querySelector<HTMLElement>('#comic-config-status');
            if (status) status.textContent = 'Cambios guardados localmente; falta permiso para actualizar comicConfig.json en disco.';
          }
        })
        .catch((error: unknown) => {
          const status = this.root.querySelector<HTMLElement>('#comic-config-status');
          if (status) status.textContent = error instanceof Error ? `Error guardando comicConfig.json: ${error.message}` : 'Error guardando comicConfig.json';
          console.warn('No se pudo actualizar comicConfig.json en disco:', error);
        });
    }
  }

  private async writeComicConfigSnapshot(snapshot: string, requestPermission: boolean, updateStatus: boolean): Promise<boolean> {
    const root = this.comicProjectDirectoryHandle;
    if (!root) return false;
    let permission = await root.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && requestPermission) permission = await root.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      if (updateStatus) {
        const status = this.root.querySelector<HTMLElement>('#comic-config-status');
        if (status) status.textContent = 'Se requiere volver a autorizar la carpeta del proyecto.';
      }
      return false;
    }
    const configFile = await root.getFileHandle('comicConfig.json', { create: true });
    await writeFileHandleBytes(configFile, new Blob([snapshot], { type: 'application/json;charset=utf-8' }));
    if (updateStatus) {
      const status = this.root.querySelector<HTMLElement>('#comic-config-status');
      if (status) status.textContent = `Guardado: ${root.name}/comicConfig.json`;
    }
    return true;
  }

  private async writeComicConfigToProject(requestPermission = false): Promise<boolean> {
    // Wait for any background autosave queued by persistComicConfig to finish before writing again.
    await this.comicConfigWriteChain;
    const snapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
    const written = await this.writeComicConfigSnapshot(snapshot, requestPermission, true);
    if (written) {
      try { await storeComicProjectDirectoryHandle(this.comicProjectDirectoryHandle!); }
      catch (error) { console.warn('No se pudo recordar el proyecto de cómic:', error); }
    }
    return written;
  }

  private async activateComicProjectDirectory(root: FileSystemDirectoryHandle, loadFromDisk: boolean, requestPermission: boolean): Promise<void> {
    let permission = await root.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted' && requestPermission) permission = await root.requestPermission({ mode: 'readwrite' });
    if (permission !== 'granted') throw new Error('El navegador no concedió permiso de lectura y escritura para la carpeta elegida.');
    this.comicProjectDirectoryHandle = root;
    if (loadFromDisk) {
      try {
        const configHandle = await root.getFileHandle('comicConfig.json');
        const configFile = await configHandle.getFile();
        this.comicConfig = normalizeComicConfig(JSON.parse(await configFile.text()) as unknown);
        this.comicActivePageId = this.comicConfig.pages[0]?.id ?? null;
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
    }
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

  private async restoreComicProjectDirectory(): Promise<void> {
    try {
      const root = await readStoredComicProjectDirectoryHandle();
      if (!root) return;
      this.comicProjectDirectoryHandle = root;
      const permission = await root.queryPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        await this.activateComicProjectDirectory(root, true, false);
      } else {
        const location = this.root.querySelector<HTMLInputElement>('#comic-project-location');
        if (location) location.value = `Proyecto recordado: ${root.name} (permiso pendiente)`;
        const status = this.root.querySelector<HTMLElement>('#comic-config-status');
        if (status) status.textContent = 'Carpeta recordada. Usá “Vincular proyecto existente…” para volver a autorizarla.';
      }
    } catch (error) {
      console.warn('No se pudo reconectar el directorio del proyecto de cómic:', error);
    }
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
    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) throw new Error('Este navegador no permite crear carpetas desde la aplicación. Usá Chrome o Edge actualizado en localhost o HTTPS.');
    if (!this.comicParentDirectoryHandle) this.comicParentDirectoryHandle = await picker.call(window, { mode: 'readwrite' });
    const parent = this.comicParentDirectoryHandle;
    const projectFolderName = safeComicFolderName(this.comicConfig.projectName, 'Mi cómic');
    let root: FileSystemDirectoryHandle;
    try {
      root = await parent.getDirectoryHandle(projectFolderName);
      let configExists = false;
      try { await root.getFileHandle('comicConfig.json'); configExists = true; }
      catch (error) { if (!isNotFoundError(error)) throw error; }
      if (configExists) {
        if (!confirm(`Ya existe el proyecto “${projectFolderName}” con comicConfig.json. ¿Querés abrir ese proyecto y cargar su configuración?`)) return;
        await this.activateComicProjectDirectory(root, true, true);
        return;
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      root = await parent.getDirectoryHandle(projectFolderName, { create: true });
    }
    // El permiso de la carpeta base ya fue concedido al elegirla desde el diálogo.
    this.comicConfig.projectName = projectFolderName;
    this.comicConfig.projectDirectoryName = projectFolderName;
    this.comicConfig.projectLocation = `${parent.name}/${projectFolderName}`;
    this.comicConfig.pagesDirectoryName = 'páginas';
    this.comicConfig.exportDirectoryName = 'exportación';
    this.comicProjectDirectoryHandle = root;
    this.comicPagesDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.pagesDirectoryName, { create: true });
    this.comicExportDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.exportDirectoryName, { create: true });
    await storeComicProjectDirectoryHandle(root).catch((error) => console.warn('No se pudo recordar la carpeta del proyecto:', error));
    this.renderComicManager();
    this.persistComicConfig(`Estructura creada: ${parent.name}/${projectFolderName}`);
    const written = await this.writeComicConfigToProject(true);
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (status) status.textContent = written
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
    if (!this.comicProjectDirectoryHandle) {
      throw new Error('Primero elegí una carpeta base y creá la estructura del proyecto.');
    }
    this.readComicFields();
    this.persistComicConfig('Preparando copia de exportación…');
    const configWritten = await this.writeComicConfigToProject(true);
    if (!configWritten) throw new Error('No se pudo escribir comicConfig.json. Volvé a vincular la carpeta del proyecto e intentá nuevamente.');
    const root = this.comicProjectDirectoryHandle;
    if (!this.comicPagesDirectoryHandle) this.comicPagesDirectoryHandle = await root.getDirectoryHandle(this.comicConfig.pagesDirectoryName || 'páginas', { create: true });
    let exportDirectory = this.comicExportDirectoryHandle;
    if (!exportDirectory) {
      exportDirectory = await root.getDirectoryHandle(this.comicConfig.exportDirectoryName || 'exportación', { create: true });
      this.comicExportDirectoryHandle = exportDirectory;
    }
    const configSnapshot = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
    const exportConfig = await exportDirectory.getFileHandle('comicConfig.json', { create: true });
    await writeFileHandleBytes(exportConfig, new Blob([configSnapshot], { type: 'application/json;charset=utf-8' }));
    const exportPages = await exportDirectory.getDirectoryHandle(this.comicConfig.pagesDirectoryName || 'páginas', { create: true });
    let copied = 0;
    let missing = 0;
    if (this.comicPagesDirectoryHandle) {
      for (const page of this.comicConfig.pages) {
        const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
        try {
          const sourceHandle = await this.comicPagesDirectoryHandle.getFileHandle(fileName);
          const sourceFile = await sourceHandle.getFile();
          if (!sourceFile.size) { missing++; continue; }
          const targetHandle = await exportPages.getFileHandle(fileName, { create: true });
          await writeFileHandleBytes(targetHandle, sourceFile);
          copied++;
        } catch (error) {
          if (isNotFoundError(error)) missing++;
          else throw error;
        }
      }
    }
    const status = this.root.querySelector<HTMLElement>('#comic-config-status');
    if (status) status.textContent = `Copia exportada a ${root.name}/exportación: comicConfig.json y ${copied} página(s)${missing ? `; ${missing} sin guardar se omitieron` : ''}.`;
  }

  private async prepareComicPageFile(page: ComicPageEntry): Promise<FileSystemFileHandle | null> {
    const directory = this.comicPagesDirectoryHandle;
    if (!directory) return null;
    const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
    try {
      const existing = await directory.getFileHandle(fileName);
      const file = await existing.getFile();
      if (file.size > 0 && !confirm(`Ya existe “${fileName}” en la carpeta de páginas. El próximo guardado lo sobrescribirá. ¿Continuar?`)) return null;
    } catch (error) { if (!isNotFoundError(error)) throw error; }
    return directory.getFileHandle(fileName, { create: true });
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
      onRenamePage: (page, nextName) => { page.name = nextName; this.persistComicConfig(); this.renderComicManager(); },
    });
  }

  private wireComicManager(): void {
    try { this.comicConfig = readComicConfig(); } catch { this.comicConfig = defaultComicConfig(); }
    this.comicActivePageId = this.comicConfig.pages[0]?.id ?? null;
    this.renderComicManager();
    void this.restoreComicProjectDirectory();
    const inputIds = ['comic-project-name', 'comic-title', 'comic-author', 'comic-direction', 'comic-page-width', 'comic-page-height', 'comic-dpi', 'comic-bleed', 'comic-margin', 'comic-gutter', 'comic-facing-pages'];
    inputIds.forEach((id) => {
      const selector = `#${id}`;
      const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
      input?.addEventListener('change', () => { this.readComicFields(); this.persistComicConfig(); this.renderComicManager(); });
    });
    this.q<HTMLButtonElement>('#comic-select-location').addEventListener('click', () => {
      void this.chooseComicParentDirectory().catch((error: unknown) => { const status = this.q<HTMLElement>('#comic-config-status'); status.textContent = error instanceof Error ? error.message : String(error); });
    });
    this.q<HTMLButtonElement>('#comic-create-project').addEventListener('click', () => {
      void this.createComicProjectStructure().catch((error: unknown) => { const status = this.q<HTMLElement>('#comic-config-status'); status.textContent = error instanceof Error ? error.message : String(error); });
    });
    this.q<HTMLButtonElement>('#comic-link-project').addEventListener('click', () => {
      void this.linkExistingComicProject().catch((error: unknown) => { const status = this.q<HTMLElement>('#comic-config-status'); status.textContent = error instanceof Error ? error.message : String(error); });
    });
    this.q<HTMLButtonElement>('#comic-export-project').addEventListener('click', () => {
      void this.exportComicProjectCopy().catch((error: unknown) => { const status = this.q<HTMLElement>('#comic-config-status'); status.textContent = error instanceof Error ? error.message : String(error); });
    });
    this.q<HTMLSelectElement>('#comic-preset').addEventListener('change', () => {
      const preset = this.q<HTMLSelectElement>('#comic-preset').value;
      const presets: Record<string, { width: number; height: number; direction?: 'ltr' | 'rtl'; facing?: boolean }> = {
        us: { width: 1650, height: 2550, direction: 'ltr', facing: true },
        european: { width: 2100, height: 2970, direction: 'ltr', facing: true },
        manga: { width: 1650, height: 2400, direction: 'rtl', facing: true },
        manhwa: { width: 1600, height: 2560, direction: 'ltr', facing: false },
      };
      const selected = presets[preset];
      if (selected) {
        this.comicConfig.pageWidth = selected.width; this.comicConfig.pageHeight = selected.height;
        if (selected.direction) this.comicConfig.readingDirection = selected.direction;
        if (selected.facing !== undefined) this.comicConfig.facingPages = selected.facing;
      }
      this.renderComicManager(); this.persistComicConfig('Formato actualizado y guardado localmente.');
    });
    this.q<HTMLButtonElement>('#comic-add-page').addEventListener('click', () => {
      this.readComicFields();
      const number = this.comicConfig.pages.length + 1;
      const page: ComicPageEntry = {
        id: crypto.randomUUID(), number, name: `Página ${number}`,
        fileName: `comic-page-${String(number).padStart(3, '0')}.nvtsphoto`,
        width: this.comicConfig.pageWidth, height: this.comicConfig.pageHeight, notes: '',
      };
      this.comicConfig.pages.push(page); this.comicActivePageId = page.id;
      this.persistComicConfig('Página añadida. Configuración guardada localmente.'); this.renderComicManager();
    });
    this.q<HTMLButtonElement>('#comic-duplicate-page').addEventListener('click', () => {
      const selected = this.comicConfig.pages.find((page) => page.id === this.comicActivePageId); if (!selected) return;
      const number = this.comicConfig.pages.length + 1;
      const copy: ComicPageEntry = { ...selected, id: crypto.randomUUID(), number, name: `${selected.name} (copia)`, fileName: `comic-page-${String(number).padStart(3, '0')}.nvtsphoto` };
      this.comicConfig.pages.splice(this.comicConfig.pages.indexOf(selected) + 1, 0, copy); this.comicActivePageId = copy.id;
      this.comicConfig.pages.forEach((page, index) => page.number = index + 1); this.persistComicConfig('Página duplicada.'); this.renderComicManager();
    });
    this.q<HTMLButtonElement>('#comic-delete-page').addEventListener('click', () => {
      const index = this.comicConfig.pages.findIndex((page) => page.id === this.comicActivePageId); if (index < 0) return;
      const page = this.comicConfig.pages[index]; if (!confirm(`¿Eliminar «${page.name}» de la configuración? No se borrará ningún archivo del disco.`)) return;
      this.comicConfig.pages.splice(index, 1); this.comicConfig.pages.forEach((entry, i) => entry.number = i + 1);
      this.comicActivePageId = this.comicConfig.pages[Math.min(index, this.comicConfig.pages.length - 1)]?.id ?? null;
      this.persistComicConfig('Página eliminada de la configuración.'); this.renderComicManager();
    });
    const move = (delta: number) => {
      const index = this.comicConfig.pages.findIndex((page) => page.id === this.comicActivePageId); const next = index + delta;
      if (index < 0 || next < 0 || next >= this.comicConfig.pages.length) return;
      [this.comicConfig.pages[index], this.comicConfig.pages[next]] = [this.comicConfig.pages[next], this.comicConfig.pages[index]];
      this.comicConfig.pages.forEach((page, i) => page.number = i + 1);
      this.persistComicConfig('Orden de páginas actualizado.'); this.renderComicManager();
    };
    this.q<HTMLButtonElement>('#comic-page-up').addEventListener('click', () => move(-1));
    this.q<HTMLButtonElement>('#comic-page-down').addEventListener('click', () => move(1));
    this.q<HTMLButtonElement>('#comic-create-canvas').addEventListener('click', () => {
      void (async () => {
        const page = this.comicConfig.pages.find((entry) => entry.id === this.comicActivePageId); if (!page) return;
        if (!confirm(`Se reemplazará el documento abierto por un lienzo de ${page.width} × ${page.height} px para «${page.name}». Guardá primero el documento actual si querés conservarlo. ¿Continuar?`)) return;
        this.readComicFields();
        const safeTitle = this.comicConfig.title.trim() || 'Cómic';
        const fileName = safeComicFileName(page.fileName, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
        const pageHandle = await this.prepareComicPageFile({ ...page, fileName });
        if (this.comicPagesDirectoryHandle && !pageHandle) return;
        this.newDocument(page.width, page.height, `${safeTitle} - ${page.name}`);
        this.fileHandle = pageHandle;
        page.fileName = fileName;
        page.width = this.ctl.doc.width; page.height = this.ctl.doc.height;
        this.persistComicConfig(this.comicPagesDirectoryHandle
          ? `Lienzo creado para «${page.name}». Guardar escribirá directamente en páginas/${fileName}.`
          : `Lienzo creado para «${page.name}». Configurá una carpeta de proyecto para guardar páginas automáticamente.`);
        this.renderComicManager();
        this.applyWorkspace('comics', false);
      })().catch((error: unknown) => { const status = this.q<HTMLElement>('#comic-config-status'); status.textContent = error instanceof Error ? error.message : String(error); });
    });
    const pageOpenInput = this.q<HTMLInputElement>('#comic-page-open-input');
    this.q<HTMLButtonElement>('#comic-page-open-file').addEventListener('click', () => pageOpenInput.click());
    pageOpenInput.addEventListener('change', () => {
      const file = pageOpenInput.files?.[0]; if (!file) return;
      const page = this.comicConfig.pages.find((entry) => entry.id === this.comicActivePageId);
      if (!page) { pageOpenInput.value = ''; return; }
      if (!confirm(`Abrir «${file.name}» como «${page.name}» reemplazará el documento actual. Guardá primero lo que necesites conservar. ¿Continuar?`)) { pageOpenInput.value = ''; return; }
      void (async () => {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const unpacked = unpackNvtsPhoto(bytes);
          unpacked.doc.name = documentNameFromFile(file.name);
          this.fileHandle = null;
          this.setDocument(DocumentController.fromUnpacked(this.engine.module, unpacked));
          await this.refreshLinkedFileLayers(false);
          page.fileName = safeComicFileName(this.comicPagesDirectoryHandle ? page.fileName : file.name, `comic-page-${String(page.number).padStart(3, '0')}.nvtsphoto`);
          if (this.comicPagesDirectoryHandle) {
            const target = await this.comicPagesDirectoryHandle.getFileHandle(page.fileName, { create: true });
            await writeFileHandleBytes(target, bytes);
            this.fileHandle = target;
          }
          page.width = this.ctl.doc.width; page.height = this.ctl.doc.height;
          this.persistComicConfig(this.comicPagesDirectoryHandle
            ? `Página «${page.name}» copiada a páginas/${page.fileName}. Guardar actualizará esa copia.`
            : `Página «${page.name}» cargada desde ${file.name}. Configurá una carpeta de proyecto para guardarla allí.`);
          this.renderComicManager(); this.applyWorkspace('comics', false);
        } catch (error) {
          const status = this.q<HTMLElement>('#comic-config-status');
          status.textContent = error instanceof Error ? error.message : String(error);
        } finally { pageOpenInput.value = ''; }
      })();
    });
    this.q<HTMLButtonElement>('#comic-config-export').addEventListener('click', () => {
      this.readComicFields();
      this.persistComicConfig('Guardando comicConfig.json…');
      void (async () => {
        if (this.comicProjectDirectoryHandle) {
          const written = await this.writeComicConfigToProject(true);
          if (written) return;
        }
        const data = JSON.stringify({ ...this.comicConfig, format: 'nvts-comic-config', version: 1 }, null, 2);
        const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = 'comicConfig.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        const status = this.q<HTMLElement>('#comic-config-status'); status.textContent = 'Descargando copia de comicConfig.json';
      })().catch((error: unknown) => { const status = this.q<HTMLElement>('#comic-config-status'); status.textContent = error instanceof Error ? error.message : String(error); });
    });
    const fileInput = this.q<HTMLInputElement>('#comic-config-file');
    this.q<HTMLButtonElement>('#comic-config-import').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]; if (!file) return;
      void file.text().then((raw) => {
        const parsed = normalizeComicConfig(JSON.parse(raw) as unknown);
        this.comicConfig = parsed; this.comicActivePageId = parsed.pages[0]?.id ?? null;
        this.renderComicManager(); this.persistComicConfig(`Configuración importada desde ${file.name}.`);
      }).catch((error: unknown) => {
        const status = this.q<HTMLElement>('#comic-config-status'); status.textContent = error instanceof Error ? error.message : String(error);
      }).finally(() => { fileInput.value = ''; });
    });
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
    const layerOpacity = this.root.querySelector<HTMLInputElement>('#layer-opacity');
    const dockBlend = this.root.querySelector<HTMLSelectElement>('#dock-blend');
    if (layer && layerOpacity) layerOpacity.value = String(Math.round(layer.opacity * 100));
    if (layer && dockBlend) dockBlend.value = layer.blendMode;
    const fillButton = this.root.querySelector<HTMLButtonElement>('#l-fill-color');
    const filterButton = this.root.querySelector<HTMLButtonElement>('#l-filter-options');
    const vectorButton = this.root.querySelector<HTMLButtonElement>('#l-vector-add');
    const textEditButton = this.root.querySelector<HTMLButtonElement>('#l-text-edit');
    if (fillButton) { fillButton.hidden = layer?.type !== 'fill'; if (layer?.type === 'fill') fillButton.textContent = `Color ${layer.fillColor ?? '#ffffff'}…`; }
    if (filterButton) filterButton.hidden = layer?.type !== 'filter';
    if (vectorButton) vectorButton.hidden = layer?.type !== 'vector';
    if (textEditButton) textEditButton.hidden = layer?.type !== 'text';
    if (this.tool === 'text' && layer?.type === 'text') {
      this.textSettings = this.textSettingsFromLayer(layer);
      const font = this.root.querySelector<HTMLSelectElement>('#tool-text-font'); if (font) font.value = this.textSettings.fontFamily;
      const style = this.root.querySelector<HTMLSelectElement>('#tool-text-style'); if (style) style.value = this.textSettings.style;
      const size = this.root.querySelector<HTMLInputElement>('#tool-text-size'); if (size) size.value = String(this.textSettings.fontSize);
      const color = this.root.querySelector<HTMLInputElement>('#tool-text-color'); if (color) color.value = this.textSettings.color;
      const align = this.root.querySelector<HTMLSelectElement>('#advanced-text-align'); if (align) align.value = this.textSettings.align;
      const lineHeight = this.root.querySelector<HTMLInputElement>('#advanced-text-line-height'); if (lineHeight) lineHeight.value = String(this.textSettings.lineHeight);
      const letterSpacing = this.root.querySelector<HTMLInputElement>('#advanced-text-letter-spacing'); if (letterSpacing) letterSpacing.value = String(this.textSettings.letterSpacing);
      const strokeColor = this.root.querySelector<HTMLInputElement>('#advanced-text-stroke-color'); if (strokeColor) strokeColor.value = this.textSettings.strokeColor;
      const strokeWidth = this.root.querySelector<HTMLInputElement>('#advanced-text-stroke-width'); if (strokeWidth) strokeWidth.value = String(this.textSettings.strokeWidth);
      const background = this.root.querySelector<HTMLSelectElement>('#advanced-text-background'); if (background) background.value = this.textSettings.backgroundColor;
    }
    const vectorTool = this.root.querySelector<HTMLButtonElement>('#rail-vector-select');
    if (vectorTool) vectorTool.disabled = layer?.type !== 'vector' || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id);
    const duplicate = this.root.querySelector<HTMLButtonElement>('#l-duplicate');
    const remove = this.root.querySelector<HTMLButtonElement>('#l-del');
    if (duplicate) duplicate.disabled = !layer;
    if (remove) remove.disabled = !layer;
    const canPaint = !!layer && (layer.type === 'paint' || layer.type === 'raster') && !this.ctl.isEffectivelyLocked(layer.id) && this.ctl.isEffectivelyVisible(layer.id);
    for (const selector of ['#rail-brush', '#rail-eraser', '#rail-line', '#rail-rectangle', '#rail-ellipse', '#rail-fill']) {
      const button = this.root.querySelector<HTMLButtonElement>(selector);
      if (button) button.disabled = !canPaint;
    }
    const eyedropper = this.root.querySelector<HTMLButtonElement>('#rail-eyedropper');
    const hand = this.root.querySelector<HTMLButtonElement>('#rail-hand');
    if (eyedropper) eyedropper.disabled = false;
    if (hand) hand.disabled = false;
    const brightnessDown = this.root.querySelector<HTMLButtonElement>('#advanced-brightness-down');
    const brightnessUp = this.root.querySelector<HTMLButtonElement>('#advanced-brightness-up');
    if (brightnessDown) brightnessDown.disabled = !canPaint;
    if (brightnessUp) brightnessUp.disabled = !canPaint;
    const swatch = this.root.querySelector<HTMLElement>('#foreground-swatch');
    if (swatch) swatch.style.background = this.foregroundHex();
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
    const selectedText = this.active();
    if (this.tool === 'text' && selectedText?.type === 'text') this.textSettings = this.textSettingsFromLayer(selectedText);
    const host = this.q<HTMLElement>('#toolbar');
    const labels: Record<Tool, string> = { brush: 'Pincel', eraser: 'Borrador', eyedropper: 'Cuentagotas', line: 'Línea', rectangle: 'Rectángulo', ellipse: 'Elipse', fill: 'Relleno', hand: 'Mover lienzo', text: 'Texto', 'vector-select': 'Selección vectorial' };
    this.q<HTMLElement>('#tool-current-label').textContent = labels[this.tool];
    const colorField = `<label class="tool-setting">Color <input id="tool-color" type="color" value="${this.foregroundHex()}" /></label>`;
    const sizeField = `<label class="tool-setting">${this.tool === 'line' || this.tool === 'rectangle' || this.tool === 'ellipse' ? 'Grosor' : 'Tamaño'} <input id="tool-size" type="range" min="1" max="256" value="${this.brush.size}" /><output id="tool-size-value">${this.brush.size}px</output></label>`;
    const opacityField = `<label class="tool-setting">Opacidad <input id="tool-opacity" type="range" min="1" max="100" value="${this.brush.opacity}" /><output id="tool-opacity-value">${this.brush.opacity}%</output></label>`;
    const fontOptions = ['Arial','Inter','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS','Courier New','monospace','serif','sans-serif'].map((name) => `<option value="${name}" ${this.textSettings.fontFamily === name ? 'selected' : ''}>${name}</option>`).join('');
    if (this.tool === 'brush') host.innerHTML = `${colorField}${sizeField}${opacityField}`;
    else if (this.tool === 'eraser') host.innerHTML = `${sizeField}${opacityField}`;
    else if (this.tool === 'line') host.innerHTML = `${colorField}${sizeField}${opacityField}`;
    else if (this.tool === 'rectangle' || this.tool === 'ellipse') host.innerHTML = `${colorField}${sizeField}${opacityField}<label class="tool-setting tool-check"><input id="tool-shape-fill" type="checkbox" ${this.brush.shapeFill ? 'checked' : ''}/> Rellenar figura</label>`;
    else if (this.tool === 'fill') host.innerHTML = `${colorField}<label class="tool-setting">Tolerancia <input id="tool-tolerance" type="range" min="0" max="255" value="${this.brush.tolerance}"/><output id="tool-tolerance-value">${this.brush.tolerance}</output></label><label class="tool-setting">Opacidad <input id="tool-opacity" type="range" min="1" max="100" value="${this.brush.opacity}"/><output id="tool-opacity-value">${this.brush.opacity}%</output></label>`;
    else if (this.tool === 'text') host.innerHTML = `<label class="tool-setting">Fuente <select id="tool-text-font">${fontOptions}</select></label><label class="tool-setting">Estilo <select id="tool-text-style"><option value="normal" ${this.textSettings.style==='normal'?'selected':''}>Normal</option><option value="bold" ${this.textSettings.style==='bold'?'selected':''}>Negrita</option><option value="italic" ${this.textSettings.style==='italic'?'selected':''}>Cursiva</option><option value="bold-italic" ${this.textSettings.style==='bold-italic'?'selected':''}>Negrita cursiva</option></select></label><label class="tool-setting">Tamaño <input id="tool-text-size" type="number" min="1" max="1000" value="${this.textSettings.fontSize}"/></label><label class="tool-setting">Color <input id="tool-text-color" type="color" value="${this.textSettings.color}"/></label>`;
    else if (this.tool === 'eyedropper') host.innerHTML = '<span class="tool-help">Hacé clic en el lienzo para tomar un color.</span>';
    else if (this.tool === 'vector-select') host.innerHTML = '<span class="tool-help">Seleccioná un objeto vectorial; arrastralo para moverlo o usá el control inferior derecho para cambiar su tamaño.</span>';
    else host.innerHTML = '<span class="tool-help">Arrastrá el lienzo para desplazarte. Usá − / + o la rueda con Ctrl para cambiar el zoom.</span>';

    const color = host.querySelector<HTMLInputElement>('#tool-color');
    if (color) color.oninput = () => this.setForegroundHex(color.value);
    const size = host.querySelector<HTMLInputElement>('#tool-size');
    if (size) size.oninput = () => { this.brush.size = Number(size.value); const output = host.querySelector<HTMLOutputElement>('#tool-size-value'); if (output) output.value = `${this.brush.size}px`; };
    const opacity = host.querySelector<HTMLInputElement>('#tool-opacity');
    if (opacity) opacity.oninput = () => { this.brush.opacity = Number(opacity.value); const output = host.querySelector<HTMLOutputElement>('#tool-opacity-value'); if (output) output.value = `${this.brush.opacity}%`; };
    const shapeFill = host.querySelector<HTMLInputElement>('#tool-shape-fill');
    if (shapeFill) shapeFill.onchange = () => { this.brush.shapeFill = shapeFill.checked; };
    const tolerance = host.querySelector<HTMLInputElement>('#tool-tolerance');
    if (tolerance) tolerance.oninput = () => { this.brush.tolerance = Number(tolerance.value); const output = host.querySelector<HTMLOutputElement>('#tool-tolerance-value'); if (output) output.value = tolerance.value; };
    const font = host.querySelector<HTMLSelectElement>('#tool-text-font');
    if (font) font.onchange = () => { this.textSettings.fontFamily = font.value; this.applyTextSettingsToSelectedLayer(); };
    const style = host.querySelector<HTMLSelectElement>('#tool-text-style');
    if (style) style.onchange = () => { this.textSettings.style = style.value as TextLayerStyle; this.applyTextSettingsToSelectedLayer(); };
    const fontSize = host.querySelector<HTMLInputElement>('#tool-text-size');
    if (fontSize) fontSize.onchange = () => { this.textSettings.fontSize = Math.max(1, Math.min(1000, Number(fontSize.value) || 64)); fontSize.value = String(this.textSettings.fontSize); this.applyTextSettingsToSelectedLayer(); };
    const textColor = host.querySelector<HTMLInputElement>('#tool-text-color');
    if (textColor) textColor.onchange = () => { this.textSettings.color = textColor.value; this.applyTextSettingsToSelectedLayer(); };

    const toolButtons: Record<Tool, string> = { hand: '#rail-hand', brush: '#rail-brush', eraser: '#rail-eraser', line: '#rail-line', rectangle: '#rail-rectangle', ellipse: '#rail-ellipse', fill: '#rail-fill', eyedropper: '#rail-eyedropper', text: '#rail-text', 'vector-select': '#rail-vector-select' };
    Object.values(toolButtons).forEach((selector) => this.root.querySelector<HTMLElement>(selector)?.classList.remove('selected'));
    this.root.querySelector<HTMLElement>(toolButtons[this.tool])?.classList.add('selected');
    this.canvas.style.cursor = this.tool === 'hand' ? 'grab' : this.tool === 'eyedropper' ? 'copy' : this.tool === 'text' ? 'text' : this.tool === 'vector-select' ? 'default' : 'crosshair';
    this.syncToolbarProps();
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
    const canvas = document.createElement('canvas'); canvas.width = this.ctl.doc.width; canvas.height = this.ctl.doc.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No se pudo preparar el contenido de texto.');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const fontWeight = settings.style === 'bold' || settings.style === 'bold-italic' ? 'bold' : 'normal';
    const fontStyle = settings.style === 'italic' || settings.style === 'bold-italic' ? 'italic' : 'normal';
    ctx.font = `${fontStyle} ${fontWeight} ${Math.max(1, settings.fontSize)}px "${settings.fontFamily.replace(/["\\]/g, '')}"`;
    ctx.textBaseline = 'top'; ctx.textAlign = settings.align;
    const spacingCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
    if ('letterSpacing' in spacingCtx) spacingCtx.letterSpacing = `${settings.letterSpacing}px`;
    const lines = content.split('\n');
    const measuredWidths = lines.map((line) => ctx.measureText(line).width + Math.max(0, line.length - 1) * settings.letterSpacing);
    const maxWidth = Math.max(1, ...measuredWidths);
    const lineHeight = settings.fontSize * settings.lineHeight;
    const totalHeight = Math.max(settings.fontSize, lines.length * lineHeight);
    const bg = settings.backgroundColor;
    if (bg && bg !== 'transparent') {
      const rectX = settings.align === 'left' ? x : settings.align === 'center' ? x - maxWidth / 2 : x - maxWidth;
      ctx.fillStyle = bg; ctx.fillRect(rectX - 6, y - 4, maxWidth + 12, totalHeight + 8);
    }
    ctx.lineJoin = 'round'; ctx.lineWidth = settings.strokeWidth; ctx.strokeStyle = settings.strokeColor; ctx.fillStyle = settings.color;
    lines.forEach((line, index) => {
      const lineY = y + index * lineHeight;
      if (settings.strokeWidth > 0) ctx.strokeText(line, x, lineY);
      ctx.fillText(line, x, lineY);
    });
    return new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  }

  private async createTextAt(point: { x: number; y: number }, existing?: LayerNode): Promise<void> {
    if (existing && (existing.type !== 'text' || this.ctl.isEffectivelyLocked(existing.id))) return;
    const currentSettings = existing ? this.textSettingsFromLayer(existing) : { ...this.textSettings };
    const content = prompt(existing ? 'Editar texto de la capa' : 'Texto nuevo (podés usar saltos de línea)', existing?.textContent ?? 'Nuevo texto');
    if (content === null || !content.length) return;
    try {
      if (existing) {
        const settings = currentSettings;
        const px = this.rasterizeText(content, existing.textX ?? point.x, existing.textY ?? point.y, settings);
        this.ctl.replaceTextContent(existing.id, this.textLayerPatch(content, existing.textX ?? point.x, existing.textY ?? point.y, settings), px);
        this.activeId = existing.id;
      } else {
        const layer = this.ctl.addLayer('text', content.split('\n')[0].slice(0, 48) || 'Texto');
        this.activeId = layer.id;
        const settings = { ...this.textSettings };
        const px = this.rasterizeText(content, Math.round(point.x), Math.round(point.y), settings);
        this.ctl.replaceTextContent(layer.id, this.textLayerPatch(content, Math.round(point.x), Math.round(point.y), settings), px);
      }
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = 'Texto actualizado en su propia capa editable.';
    } catch (error) { this.fail(error); }
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

  private renderLayers(): void {
    renderLayersPanel(this.root, this.ctl.doc.layers, this.activeId, {
      getTypeLabel: (type) => this.layerTypeLabel(type),
      getTypeIcon: (type) => this.layerTypeIcon(type),
      drawThumbnail: (canvas, layer) => this.drawLayerThumbnail(canvas, layer),
      onVisibilityChange: (layer, visible) => {
        this.ctl.setProps(layer.id, { visible });
        this.ctl.comp.invalidateAll(); this.renderLayers(); this.updateHistoryUI(); this.scheduleRefresh();
      },
      onRenameOrEdit: (layer) => this.editLayerByType(layer),
      onOpenEffects: (layer) => {
        this.activeId = layer.id; this.syncUI();
        this.q<HTMLElement>('#effects-layer-name').textContent = layer.name;
        this.q<HTMLElement>('#effects-panel').hidden = false;
      },
      onToggleLock: (layer) => {
        this.ctl.setProps(layer.id, { locked: !layer.locked });
        this.syncUI(); this.updateHistoryUI();
      },
      onSelect: (layer) => { this.activeId = layer.id; this.syncUI(); },
      onContextMenu: (layer, x, y) => { this.activeId = layer.id; this.syncUI(); this.showLayerContextMenu(x, y, layer); },
    });
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
    if (layer.type === 'filter') {
      context.fillStyle = '#fcebed'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#c92334'; context.font = 'bold 19px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('fx', canvas.width / 2, canvas.height / 2);
      return;
    }
    if (layer.type === 'fill') {
      context.fillStyle = layer.fillColor ?? '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); return;
    }
    if (layer.type === 'group') {
      context.fillStyle = '#9c9caa'; context.font = '20px system-ui'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText('▱', canvas.width / 2, canvas.height / 2); return;
    }
    // Lee solo 52 filas muestreadas a tamaño completo de ancho, no todo el lienzo RGBA.
    // Así una miniatura en un documento 4K no necesita reservar otros 64 MiB por capa.
    const image = context.createImageData(canvas.width, canvas.height);
    const docW = this.ctl.doc.width, docH = this.ctl.doc.height;
    const rowBytes = new Uint8Array(docW * 4);
    let anyPixels = false;
    for (let y = 0; y < canvas.height; y++) {
      const srcY = Math.min(docH - 1, Math.floor((y / canvas.height) * docH));
      rowBytes.fill(0);
      anyPixels = this.ctl.readLayerRect(layer, 0, srcY, docW, 1, rowBytes) || anyPixels;
      for (let x = 0; x < canvas.width; x++) {
        const srcX = Math.min(docW - 1, Math.floor((x / canvas.width) * docW));
        const src = srcX * 4, dst = (y * canvas.width + x) * 4;
        image.data[dst] = rowBytes[src]; image.data[dst + 1] = rowBytes[src + 1]; image.data[dst + 2] = rowBytes[src + 2]; image.data[dst + 3] = rowBytes[src + 3];
      }
    }
    if (anyPixels) context.putImageData(image, 0, 0);
  }

  private showLayerContextMenu(x: number, y: number, layer: LayerNode): void {
    this.layerContextMenu?.remove();
    const menu = document.createElement('div');
    menu.className = 'layer-context-menu'; menu.setAttribute('role', 'menu');
    menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - 225))}px`;
    menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - 270))}px`;
    const options: Array<[string, () => void]> = [
      ['Renombrar…', () => this.renameLayer(layer)],
      ['Duplicar capa', () => { const clone = this.ctl.duplicateLayer(layer.id); if (clone) this.activeId = clone.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh(); }],
      ['Subir capa', () => this.moveLayerById(layer.id, +1)],
      ['Bajar capa', () => this.moveLayerById(layer.id, -1)],
      ['Mover a grupo…', () => this.moveLayerIntoGroup(layer)],
    ];
    if (layer.type === 'fill') options.push(['Cambiar color de relleno…', () => this.changeFillColor(layer)]);
    if (layer.type === 'filter') options.push(['Configurar filtro…', () => this.openFilterEditor(layer)]);
    if (layer.type === 'vector') options.push(['Editar objetos vectoriales…', () => this.editVectorLayer(layer)]);
    if (layer.type === 'text') options.push(['Editar texto…', () => { this.activeId = layer.id; void this.createTextAt({ x: layer.textX ?? 0, y: layer.textY ?? 0 }, layer); }]);
    if (layer.type === 'file') {
      options.push([`${layer.sourceLinkId ? 'Vínculo externo configurado' : 'Sin vínculo externo'}: ${layer.sourceName ?? layer.name}`, () => {}]);
      options.push(['Actualizar desde archivo vinculado', () => { void this.refreshLinkedFileLayer(layer, true); }]);
      options.push(['Vincular / reemplazar archivo fuente…', () => { void this.replaceFileLayer(layer); }]);
      if (layer.sourceLinkId) options.push(['Quitar vínculo externo', () => {
        this.ctl.setProps(layer.id, { sourceLinkId: undefined, sourceLastModified: undefined, sourceFileSize: undefined });
        this.syncUI(); this.updateHistoryUI();
      }]);
    }
    options.push(['Eliminar capa', () => { if (this.ctl.removeLayer(layer.id)) { this.activeId = this.topRaster()?.id ?? ''; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh(); } }]);
    let dismiss: (event: PointerEvent) => void;
    for (const [label, action] of options) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('role', 'menuitem');
      button.onclick = () => {
        menu.remove(); document.removeEventListener('pointerdown', dismiss);
        if (this.layerContextMenu === menu) this.layerContextMenu = null;
        action();
      };
      menu.append(button);
    }
    document.body.append(menu); this.layerContextMenu = menu;
    dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target)) { menu.remove(); document.removeEventListener('pointerdown', dismiss); if (this.layerContextMenu === menu) this.layerContextMenu = null; }
    };
    document.addEventListener('pointerdown', dismiss);
    menu.addEventListener('keydown', (event) => { if (event.key === 'Escape') { menu.remove(); document.removeEventListener('pointerdown', dismiss); } });
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
    if (layer.type === 'filter') { this.syncUI(); this.openFilterEditor(layer); }
    else if (layer.type === 'fill') this.changeFillColor(layer);
    else if (layer.type === 'vector') this.editVectorLayer(layer);
    else if (layer.type === 'text') void this.createTextAt({ x: layer.textX ?? 0, y: layer.textY ?? 0 }, layer);
    else this.renameLayer(layer);
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
    if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
    this.activeId = layer.id; this.filterEditLayerId = layer.id;
    this.q<HTMLElement>('#filters-layer-name').textContent = layer.name;
    const kind = layer.filterKind ?? 'grayscale';
    this.q('#filters-panel').querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === kind));
    this.q<HTMLElement>('#filter-title').textContent = this.filterLabel(kind);
    this.q<HTMLInputElement>('#filter-radius').value = String(Math.round((layer.filterStrength ?? 1) * 100));
    this.q<HTMLElement>('#filter-radius-value').textContent = `${Math.round((layer.filterStrength ?? 1) * 100)}%`;
    this.q<HTMLElement>('#filter-hint').textContent = 'Este ajuste es no destructivo y afecta a las capas inferiores. Podés cambiarlo más tarde.';
    this.q<HTMLElement>('#filter-mode-hint').textContent = 'Capa de filtro editable';
    this.q<HTMLElement>('#filters-panel').hidden = false;
  }

  private filterLabel(kind: FilterKind): string {
    return ({ grayscale: 'Escala de grises', invert: 'Invertir colores', sepia: 'Sepia', blur: 'Desenfoque gaussiano', brightness: 'Brillo', contrast: 'Contraste' })[kind];
  }

  private openDestructiveFilterPanel(): void {
    const layer = this.active();
    if (layer?.type === 'filter') { this.openFilterEditor(layer); return; }
    if (!layer || !isPixelLayerType(layer.type) || this.ctl.isEffectivelyLocked(layer.id)) {
      alert('Seleccioná una capa de píxeles desbloqueada o creá una capa de filtro para aplicar un ajuste no destructivo.');
      return;
    }
    this.filterEditLayerId = null;
    this.q<HTMLElement>('#filters-layer-name').textContent = layer.name;
    this.q<HTMLElement>('#filter-hint').textContent = 'Este filtro se aplicará directamente a los píxeles de la capa seleccionada y se podrá deshacer.';
    this.q<HTMLElement>('#filter-mode-hint').textContent = 'Filtro destructivo sobre la capa';
    this.q('#filters-panel').querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'grayscale'));
    this.q<HTMLElement>('#filter-title').textContent = this.filterLabel('grayscale');
    this.q<HTMLInputElement>('#filter-radius').value = '100';
    this.q<HTMLElement>('#filter-radius-value').textContent = '100%';
    this.q<HTMLElement>('#filters-panel').hidden = false;
  }

  private applyFilterDialog(): void {
    const layer = this.active();
    const activeButton = this.q('#filters-panel').querySelector<HTMLButtonElement>('[data-filter].active');
    if (!layer || !activeButton) return;
    const kind = activeButton.dataset.filter as FilterKind;
    const strength = Math.max(0.01, Math.min(1, Number(this.q<HTMLInputElement>('#filter-radius').value) / 100));
    if (this.filterEditLayerId && layer.id === this.filterEditLayerId && layer.type === 'filter') {
      this.ctl.setProps(layer.id, { filterKind: kind, filterStrength: strength });
      this.q<HTMLElement>('#filters-panel').hidden = true;
      this.filterEditLayerId = null;
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      return;
    }
    if (!isPixelLayerType(layer.type) || this.ctl.isEffectivelyLocked(layer.id)) { this.q<HTMLElement>('#filters-panel').hidden = true; return; }
    try {
      const { width, height } = this.ctl.doc;
      const original = this.ctl.readPixels(layer) ?? new Uint8Array(width * height * 4);
      const source = document.createElement('canvas'); source.width = width; source.height = height;
      const sourceCtx = source.getContext('2d', { willReadFrequently: true });
      const output = document.createElement('canvas'); output.width = width; output.height = height;
      const outputCtx = output.getContext('2d', { willReadFrequently: true });
      if (!sourceCtx || !outputCtx) throw new Error('El navegador no pudo preparar el filtro.');
      const data = sourceCtx.createImageData(width, height); data.data.set(original); sourceCtx.putImageData(data, 0, 0);
      outputCtx.filter = this.filterCss(kind, strength); outputCtx.drawImage(source, 0, 0); outputCtx.filter = 'none';
      const transformed = new Uint8Array(outputCtx.getImageData(0, 0, width, height).data);
      runEdit(this.ctx, layer.engineId, `Filtro: ${this.filterLabel(kind)}`, (surface) => {
        if (!surface.writeRectFromJS(0, 0, width, height, transformed)) throw new Error('No se pudo escribir el resultado del filtro.');
      });
      this.q<HTMLElement>('#filters-panel').hidden = true;
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    } catch (error) { this.fail(error); }
  }

  private async createLayerOfType(type: LayerType): Promise<void> {
    this.q<HTMLElement>('#layer-create-menu').hidden = true;
    if (type === 'file') { await this.createFileLayer(); return; }
    if (type === 'text') { await this.createTextAt({ x: Math.round(this.ctl.doc.width * 0.25), y: Math.round(this.ctl.doc.height * 0.25) }); return; }
    if (type === 'fill') {
      const color = prompt('Color inicial de la capa de relleno', '#ffffff');
      if (!color) return;
      if (!/^#?[0-9a-f]{6}$/i.test(color.trim())) { alert('Color inválido; usá por ejemplo #ffffff.'); return; }
      const node = this.ctl.addLayer('fill', 'Relleno', undefined, -1, { fillColor: color.startsWith('#') ? color : `#${color}` });
      this.activeId = node.id;
    } else {
      const name = ({ paint: `Pintura ${this.ctl.doc.layers.length}`, filter: 'Filtro', vector: 'Vectorial', text: 'Texto', group: 'Grupo', raster: 'Capa', fill: 'Relleno', file: 'Archivo' } as Record<LayerType, string>)[type];
      const node = this.ctl.addLayer(type, name);
      this.activeId = node.id;
      if (type === 'vector') this.editVectorLayer(node);
    }
    this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
  }

  private async createFileLayer(): Promise<void> {
    const source = await this.pickImageSource();
    if (!source) return;
    try {
      const pixels = await this.imageFileToDocumentPixels(source.file);
      let sourceLinkId = source.handle ? crypto.randomUUID() : undefined;
      if (source.handle && sourceLinkId) {
        try { await rememberLinkedFile(sourceLinkId, source.handle); }
        catch (error) { console.warn('La imagen se importó, pero el navegador no pudo conservar el vínculo externo:', error); sourceLinkId = undefined; }
      }
      const node = this.ctl.addFileLayer(
        documentNameFromFile(source.file.name) || 'Archivo', pixels, source.file.name, sourceLinkId,
        source.file.lastModified, source.file.size,
      );
      this.activeId = node.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = sourceLinkId
        ? `Capa de archivo vinculada: ${source.file.name}`
        : `Capa de archivo importada: ${source.file.name} (sin vínculo externo en este navegador)`;
    } catch (error) { this.fail(error); }
  }

  private async pickImageSource(): Promise<{ file: File; handle: FileSystemFileHandle | null } | null> {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'Archivos de imagen', accept: {
            'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'],
            'image/gif': ['.gif'], 'image/bmp': ['.bmp'], 'image/tiff': ['.tif', '.tiff'], 'image/svg+xml': ['.svg'],
          } }],
        });
        if (!handle) return null;
        const file = await handle.getFile();
        if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|tiff?|svg)$/i.test(file.name)) {
          throw new Error('El archivo seleccionado no parece ser una imagen compatible.');
        }
        return { file, handle };
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return null;
        throw error;
      }
    }
    const file = await this.pickImageFile();
    return file ? { file, handle: null } : null;
  }

  private async imageFileToDocumentPixels(file: File): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(file);
    const { width, height } = this.ctl.doc;
    const temp = document.createElement('canvas'); temp.width = width; temp.height = height;
    const ctx = temp.getContext('2d', { willReadFrequently: true });
    if (!ctx) { bitmap.close(); throw new Error('No se pudo preparar la imagen para la capa de archivo.'); }
    // Centra la imagen y solo la reduce si excede el tamaño del lienzo; conserva su proporción.
    const scale = Math.min(1, width / bitmap.width, height / bitmap.height);
    const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
    const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
    const x = Math.round((width - drawWidth) / 2), y = Math.round((height - drawHeight) / 2);
    ctx.clearRect(0, 0, width, height); ctx.drawImage(bitmap, x, y, drawWidth, drawHeight); bitmap.close();
    return new Uint8Array(ctx.getImageData(0, 0, width, height).data);
  }

  private async refreshLinkedFileLayer(layer: LayerNode, askForPermission: boolean): Promise<void> {
    if (layer.type !== 'file') return;
    if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
    if (!layer.sourceLinkId) {
      if (askForPermission) await this.replaceFileLayer(layer);
      else return;
      return;
    }
    try {
      const handle = await getLinkedFile(layer.sourceLinkId);
      if (!handle) {
        if (askForPermission) alert('No se encontró el vínculo en este navegador. Usá «Vincular / reemplazar archivo fuente…» para volver a vincularlo. La imagen guardada en el proyecto sigue disponible.');
        return;
      }
      let permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted' && askForPermission) permission = await handle.requestPermission({ mode: 'read' });
      if (permission !== 'granted') {
        if (askForPermission) alert('El navegador no concedió permiso para leer el archivo vinculado.');
        return;
      }
      const file = await handle.getFile();
      // En la apertura automática solo actualizamos si los metadatos de la fuente cambiaron.
      if (!askForPermission && file.lastModified === layer.sourceLastModified && file.size === layer.sourceFileSize) return;
      const pixels = await this.imageFileToDocumentPixels(file);
      if (this.ctl.replaceFileLayerContent(layer.id, pixels, file.name, layer.sourceLinkId, file.lastModified, file.size)) {
        this.activeId = layer.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
        this.q<HTMLElement>('#status').textContent = `Imagen vinculada actualizada: ${file.name}`;
      }
    } catch (error) {
      if (askForPermission) this.fail(error);
      else console.warn(`No se pudo actualizar la capa vinculada «${layer.name}»:`, error);
    }
  }

  private async refreshLinkedFileLayers(askForPermission = false): Promise<void> {
    const walk = async (nodes: LayerNode[]): Promise<void> => {
      for (const layer of nodes) {
        if (layer.type === 'file' && layer.sourceLinkId) await this.refreshLinkedFileLayer(layer, askForPermission);
        if (layer.children.length) await walk(layer.children);
      }
    };
    await walk(this.ctl.doc.layers);
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
    try {
      const pixels = await this.imageFileToDocumentPixels(source.file);
      let nextLinkId = source.handle ? crypto.randomUUID() : undefined;
      if (source.handle && nextLinkId) {
        try { await rememberLinkedFile(nextLinkId, source.handle); }
        catch (error) { console.warn('No se pudo conservar el vínculo en este navegador:', error); nextLinkId = undefined; }
      }
      if (this.ctl.replaceFileLayerContent(layer.id, pixels, source.file.name, nextLinkId, source.file.lastModified, source.file.size)) {
        this.activeId = layer.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
        this.q<HTMLElement>('#status').textContent = nextLinkId
          ? `Vínculo externo actualizado: ${source.file.name}`
          : `Imagen reemplazada (sin vínculo externo): ${source.file.name}`;
      }
    } catch (error) { this.fail(error); }
  }

  private editVectorLayer(layer: LayerNode): void {
    if (layer.type !== 'vector') return;
    if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
    this.activeId = layer.id;
    this.vectorEditLayerId = layer.id;
    this.vectorDraft = (layer.vectorShapes ?? []).map((shape) => ({ ...shape, points: shape.points?.map((point) => ({ ...point })) }));
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
    const val = (id: string, fallback: number) => {
      const parsed = Number(this.q<HTMLInputElement>(`#${id}`).value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    shape.kind = this.q<HTMLSelectElement>('#vector-kind').value as VectorShape['kind'];
    shape.x = val('vector-x', shape.x); shape.y = val('vector-y', shape.y);
    shape.width = Math.max(1, val('vector-width', shape.width)); shape.height = Math.max(1, val('vector-height', shape.height));
    shape.rotation = Math.max(-360, Math.min(360, val('vector-rotation', shape.rotation ?? 0)));
    shape.color = this.q<HTMLInputElement>('#vector-color').value;
    shape.fillColor = shape.color;
    shape.strokeColor = this.q<HTMLInputElement>('#vector-stroke-color').value;
    shape.opacity = Math.max(0, Math.min(1, val('vector-opacity', shape.opacity * 100) / 100));
    shape.strokeWidth = Math.max(0, Math.min(500, val('vector-stroke', shape.strokeWidth)));
    shape.fillEnabled = this.q<HTMLSelectElement>('#vector-fill-enabled').value === 'yes';
    shape.strokeEnabled = this.q<HTMLSelectElement>('#vector-stroke-enabled').value === 'yes';
    shape.strokeDash = this.q<HTMLSelectElement>('#vector-dash').value as NonNullable<VectorShape['strokeDash']>;
    shape.lineCap = this.q<HTMLSelectElement>('#vector-line-cap').value as NonNullable<VectorShape['lineCap']>;
    shape.lineJoin = this.q<HTMLSelectElement>('#vector-line-join').value as NonNullable<VectorShape['lineJoin']>;
    shape.cornerRadius = Math.max(0, Math.min(500, val('vector-corner-radius', shape.cornerRadius ?? 20)));
    shape.starPoints = Math.max(3, Math.min(64, Math.round(val('vector-star-points', shape.starPoints ?? 5))));
    shape.text = this.q<HTMLInputElement>('#vector-text').value;
    shape.fontFamily = this.q<HTMLSelectElement>('#vector-font-family').value;
    shape.fontSize = Math.max(1, Math.min(2000, val('vector-font-size', shape.fontSize ?? 64)));
    shape.fontStyle = this.q<HTMLSelectElement>('#vector-font-style').value as NonNullable<VectorShape['fontStyle']>;
    shape.fontWeight = this.q<HTMLSelectElement>('#vector-font-weight').value as NonNullable<VectorShape['fontWeight']>;
    shape.textAlign = this.q<HTMLSelectElement>('#vector-text-align').value as NonNullable<VectorShape['textAlign']>;
    const pointsValue = this.q<HTMLTextAreaElement>('#vector-points').value.trim();
    if (pointsValue) {
      try {
        const parsed = JSON.parse(pointsValue) as unknown;
        if (!Array.isArray(parsed) || parsed.some((p) => !p || typeof p.x !== 'number' || typeof p.y !== 'number')) throw new Error('Los nodos deben ser una lista JSON de puntos con coordenadas x e y.');
        shape.points = parsed as NonNullable<VectorShape['points']>;
      } catch (error) {
        this.q<HTMLElement>('#status').textContent = error instanceof Error ? `Nodos vectoriales: ${error.message}` : 'El JSON de nodos no es válido.';
      }
    } else shape.points = undefined;
    this.q<HTMLElement>('#vector-opacity-value').textContent = `${Math.round(shape.opacity * 100)}%`;
    const index = this.vectorDraft.indexOf(shape);
    const listButton = this.q<HTMLElement>('#vector-shape-list').children[index] as HTMLButtonElement | undefined;
    if (listButton) listButton.textContent = `${this.vectorKindLabel(shape.kind)} · ${Math.round(shape.x)}, ${Math.round(shape.y)}`;
  }

  private duplicateSelectedVectorShape(): void {
    const index = this.vectorDraft.findIndex((shape) => shape.id === this.vectorSelectedId);
    if (index < 0) return;
    const original = this.vectorDraft[index];
    const clone: VectorShape = { ...original, id: crypto.randomUUID(), x: original.x + 12, y: original.y + 12, points: original.points?.map((point) => ({ ...point })) };
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
    this.commitVectorShapes(layer, this.vectorDraft.map((shape) => ({ ...shape, points: shape.points?.map((point) => ({ ...point })) })));
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
    for (const shape of shapes) this.drawVectorShape(ctx, shape);
    this.ctl.replaceVectorContent(layer.id, shapes, new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
    this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
  }

  private drawVectorShape(ctx: CanvasRenderingContext2D, shape: VectorShape): void {
    const fill = shape.fillColor ?? shape.color ?? '#e03030';
    const stroke = shape.strokeColor ?? shape.color ?? '#e03030';
    const defaultFill = !['line','polyline','bezier','freehand','spiral'].includes(shape.kind);
    const doFill = shape.fillEnabled ?? defaultFill;
    const doStroke = shape.strokeEnabled ?? ['line','polyline','bezier','freehand','spiral'].includes(shape.kind);
    const cx = shape.x + shape.width / 2, cy = shape.y + shape.height / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, shape.opacity));
    ctx.translate(cx, cy); ctx.rotate(((shape.rotation ?? 0) * Math.PI) / 180); ctx.translate(-cx, -cy);
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = Math.max(0, shape.strokeWidth);
    ctx.lineCap = shape.lineCap ?? 'round'; ctx.lineJoin = shape.lineJoin ?? 'round';
    ctx.setLineDash(shape.strokeDash === 'dash' ? [Math.max(4, shape.strokeWidth * 3), Math.max(3, shape.strokeWidth * 2)] : shape.strokeDash === 'dot' ? [1, Math.max(3, shape.strokeWidth * 2)] : []);
    const x = shape.x, y = shape.y, w = shape.width, h = shape.height;
    const closeAndPaint = (close = true) => { if (close) ctx.closePath(); if (doFill) ctx.fill(); if (doStroke && shape.strokeWidth > 0) ctx.stroke(); };
    const points = shape.points ?? [];
    switch (shape.kind) {
      case 'rectangle': ctx.beginPath(); ctx.rect(x, y, w, h); closeAndPaint(); break;
      case 'rounded-rectangle': {
        const r = Math.max(0, Math.min(shape.cornerRadius ?? 20, Math.abs(w) / 2, Math.abs(h) / 2));
        ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); closeAndPaint(); break;
      }
      case 'ellipse': ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2); closeAndPaint(); break;
      case 'line': ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); closeAndPaint(false); break;
      case 'polygon': case 'polyline': case 'freehand': case 'bezier': {
        const path = points.length ? points : [{ x, y }, { x: x + w, y: y + h }];
        ctx.beginPath(); ctx.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          const previous = path[i - 1], next = path[i];
          if (shape.kind === 'bezier' && (previous.outX !== undefined || next.inX !== undefined)) {
            ctx.bezierCurveTo(previous.outX ?? previous.x, previous.outY ?? previous.y, next.inX ?? next.x, next.inY ?? next.y, next.x, next.y);
          } else ctx.lineTo(next.x, next.y);
        }
        closeAndPaint(shape.kind === 'polygon'); break;
      }
      case 'star': {
        const spikes = Math.max(3, Math.min(64, Math.round(shape.starPoints ?? 5)));
        const outer = Math.min(Math.abs(w), Math.abs(h)) / 2, inner = outer * .44;
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const radius = i % 2 === 0 ? outer : inner; const angle = (Math.PI * i / spikes) - Math.PI / 2;
          const px = x + w / 2 + Math.cos(angle) * radius, py = y + h / 2 + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        closeAndPaint(); break;
      }
      case 'spiral': {
        const turns = 4.5, radius = Math.min(Math.abs(w), Math.abs(h)) / 2;
        ctx.beginPath();
        for (let i = 0; i <= 360; i++) {
          const t = i / 360, a = t * Math.PI * 2 * turns, r = radius * t;
          const px = x + w / 2 + Math.cos(a) * r, py = y + h / 2 + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        closeAndPaint(false); break;
      }
      case 'text': {
        ctx.font = `${shape.fontStyle ?? 'normal'} ${shape.fontWeight ?? 'normal'} ${Math.max(1, shape.fontSize ?? 64)}px ${shape.fontFamily ?? 'Arial'}`;
        ctx.textAlign = shape.textAlign ?? 'left'; ctx.textBaseline = 'top';
        if (doFill) ctx.fillText(shape.text ?? 'Texto vectorial', x, y, Math.max(1, w));
        if (doStroke && shape.strokeWidth > 0) ctx.strokeText(shape.text ?? 'Texto vectorial', x, y, Math.max(1, w));
        break;
      }
    }
    ctx.restore();
  }

  private exportVectorLayerSvg(): void {
    const layer = this.vectorEditLayerId ? this.ctl.find(this.vectorEditLayerId) : undefined;
    if (!layer || layer.type !== 'vector') return;
    const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const shapeToSvg = (shape: VectorShape): string => {
      const cx = shape.x + shape.width / 2, cy = shape.y + shape.height / 2;
      const transform = shape.rotation ? ` transform="rotate(${shape.rotation} ${cx} ${cy})"` : '';
      const fill = (shape.fillEnabled ?? !['line','polyline','bezier','freehand','spiral'].includes(shape.kind)) ? (shape.fillColor ?? shape.color) : 'none';
      const stroke = (shape.strokeEnabled ?? ['line','polyline','bezier','freehand','spiral'].includes(shape.kind)) && shape.strokeWidth > 0 ? (shape.strokeColor ?? shape.color) : 'none';
      const dash = shape.strokeDash === 'dash' ? ` stroke-dasharray="${Math.max(4, shape.strokeWidth * 3)} ${Math.max(3, shape.strokeWidth * 2)}"` : shape.strokeDash === 'dot' ? ` stroke-dasharray="1 ${Math.max(3, shape.strokeWidth * 2)}"` : '';
      const style = `fill="${esc(fill)}" stroke="${esc(stroke)}" stroke-width="${shape.strokeWidth}" stroke-linecap="${shape.lineCap ?? 'round'}" stroke-linejoin="${shape.lineJoin ?? 'round'}"${dash} opacity="${shape.opacity}"`;
      const x = shape.x, y = shape.y, w = shape.width, h = shape.height;
      const points = shape.points ?? [];
      if (shape.kind === 'rectangle') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${style}${transform}/>`;
      if (shape.kind === 'rounded-rectangle') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${shape.cornerRadius ?? 20}" ${style}${transform}/>`;
      if (shape.kind === 'ellipse') return `<ellipse cx="${cx}" cy="${cy}" rx="${Math.abs(w/2)}" ry="${Math.abs(h/2)}" ${style}${transform}/>`;
      if (shape.kind === 'line') return `<line x1="${x}" y1="${y}" x2="${x+w}" y2="${y+h}" ${style}${transform}/>`;
      if (shape.kind === 'star') {
        const count = Math.max(3, Math.min(64, shape.starPoints ?? 5)), outer = Math.min(Math.abs(w), Math.abs(h))/2, inner = outer*.44;
        const pointsString = Array.from({ length: count*2 }, (_, i) => { const r = i%2===0?outer:inner, a=Math.PI*i/count-Math.PI/2; return `${cx+Math.cos(a)*r},${cy+Math.sin(a)*r}`; }).join(' ');
        return `<polygon points="${pointsString}" ${style}${transform}/>`;
      }
      if (shape.kind === 'spiral') {
        const d = Array.from({ length: 361 }, (_, i) => { const t=i/360, a=t*Math.PI*9, r=Math.min(Math.abs(w),Math.abs(h))/2*t; return `${i?'L':'M'} ${cx+Math.cos(a)*r} ${cy+Math.sin(a)*r}`; }).join(' ');
        return `<path d="${d}" ${style.replace(/fill="[^"]*"/, 'fill="none"')}${transform}/>`;
      }
      if (shape.kind === 'text') return `<text x="${x}" y="${y+Math.max(1,shape.fontSize??64)}" font-family="${esc(shape.fontFamily??'Arial')}" font-size="${shape.fontSize??64}" font-weight="${shape.fontWeight??'normal'}" font-style="${shape.fontStyle??'normal'}" text-anchor="${shape.textAlign==='center'?'middle':shape.textAlign==='right'?'end':'start'}" ${style}${transform}>${esc(shape.text??'Texto vectorial')}</text>`;
      const path = points.length ? points : [{x,y},{x:x+w,y:y+h}];
      let d = `M ${path[0].x} ${path[0].y}`;
      for (let i=1;i<path.length;i++) {
        const prev=path[i-1], next=path[i];
        d += shape.kind==='bezier' && (prev.outX!==undefined || next.inX!==undefined)
          ? ` C ${prev.outX??prev.x} ${prev.outY??prev.y} ${next.inX??next.x} ${next.inY??next.y} ${next.x} ${next.y}`
          : ` L ${next.x} ${next.y}`;
      }
      if (shape.kind==='polygon') d+=' Z';
      return `<path d="${d}" ${style}${transform}/>`;
    };
    const shapes = this.vectorDraft.map(shapeToSvg).join('\n  ');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${this.ctl.doc.width}" height="${this.ctl.doc.height}" viewBox="0 0 ${this.ctl.doc.width} ${this.ctl.doc.height}">\n  ${shapes}\n</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `${layer.name.replace(/[\\/:*?"<>|]/g, '_') || 'Capa-vectorial'}.svg`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private moveLayerById(id: string, delta: number): void {
    this.activeId = id;
    if (this.ctl.moveLayer(id, delta)) { this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh(); }
  }

  // ───────────── Eventos ─────────────

  private bind(): void {
    wirePlugins(this.root, () => this.createPluginApiContext());
    wireLayersPanel(this.root, {
      createLayer: (type) => { void this.createLayerOfType(type); },
      deleteActiveLayer: () => {
        if (this.stroke || !this.active()) return;
        this.ctl.removeLayer(this.activeId);
        this.activeId = this.topRaster()?.id ?? '';
        this.ctl.comp.invalidateAll(); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      },
      duplicateActiveLayer: () => {
        if (this.stroke || !this.active()) return;
        const copy = this.ctl.duplicateLayer(this.activeId);
        if (copy) this.activeId = copy.id;
        this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      },
      moveActiveLayer: (delta) => this.moveActive(delta),
      changeFillColor: () => { const layer = this.active(); if (layer?.type === 'fill') this.changeFillColor(layer); },
      configureFilter: () => { const layer = this.active(); if (layer?.type === 'filter') this.openFilterEditor(layer); },
      editVectorLayer: () => { const layer = this.active(); if (layer?.type === 'vector') this.editVectorLayer(layer); },
      editTextLayer: () => { const layer = this.active(); if (layer?.type === 'text') void this.createTextAt({ x: layer.textX ?? 0, y: layer.textY ?? 0 }, layer); },
      setOpacity: (opacity) => {
        const layer = this.active(); if (!layer) return;
        this.ctl.setProps(layer.id, { opacity }); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      },
      setBlendMode: (blendMode) => {
        const layer = this.active(); if (!layer) return;
        this.ctl.setProps(layer.id, { blendMode }); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      },
    });
    this.wireComicManager();
    this.renderToolOptions();
    this.renderAdvancedToolOptions();
    this.applyCanvasView();
    this.updatePreviewCanvasSize();

    const on = (id: string, fn: () => void) => { this.q(id).onclick = fn; };
    const openPanel = (id: string) => { this.q<HTMLElement>('#' + id).hidden = false; };
    const menus = [
      { button: this.q<HTMLButtonElement>('#menu-file'), dropdown: this.q<HTMLElement>('#file-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-edit'), dropdown: this.q<HTMLElement>('#edit-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-view'), dropdown: this.q<HTMLElement>('#view-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-workspace'), dropdown: this.q<HTMLElement>('#workspace-menu-dropdown') },
    ];
    const closeMenu = (menu: typeof menus[number]) => {
      menu.dropdown.hidden = true;
      menu.button.setAttribute('aria-expanded', 'false');
    };
    for (const menu of menus) {
      menu.button.addEventListener('click', (e) => {
        e.stopPropagation();
        const shouldOpen = menu.dropdown.hidden;
        menus.forEach(closeMenu);
        menu.dropdown.hidden = !shouldOpen;
        menu.button.setAttribute('aria-expanded', String(shouldOpen));
      });
      menu.dropdown.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('button[role^="menuitem"]')) closeMenu(menu);
      });
      menu.dropdown.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeMenu(menu); menu.button.focus(); }
      });
    }
    document.addEventListener('pointerdown', (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      menus.forEach((menu) => {
        if (!menu.dropdown.contains(target) && !menu.button.contains(target)) closeMenu(menu);
      });
    });

    const workspaceMenu = menus[3];
    const refreshWorkspaceMenu = () => this.q<HTMLElement>('#workspace-menu-dropdown').querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
      const selected = button.dataset.workspace === this.workspace;
      button.setAttribute('aria-checked', String(selected));
      const check = button.querySelector<HTMLElement>('.menu-check'); if (check) check.textContent = selected ? '✓' : '';
    });
    this.q<HTMLElement>('#workspace-menu-dropdown').querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => button.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      const candidate = button.dataset.workspace as WorkspaceId;
      if (!WORKSPACES.some((entry) => entry.id === candidate)) return;
      this.applyWorkspace(candidate);
      closeMenu(workspaceMenu);
      refreshWorkspaceMenu();
    }));
    refreshWorkspaceMenu();

    const viewMenu = menus[2];
    const panelsDropdown = this.q<HTMLElement>('#panels-menu-dropdown');
    const panelsMenuButton = this.q<HTMLButtonElement>('#menu-panels');
    const panelEntries = [
      { button: this.q<HTMLButtonElement>('#toggle-panel-advanced'), panel: this.q<HTMLElement>('.advanced-tool-panel') },
      { button: this.q<HTMLButtonElement>('#toggle-panel-history'), panel: this.q<HTMLElement>('.history-panel') },
      { button: this.q<HTMLButtonElement>('#toggle-panel-layers'), panel: this.q<HTMLElement>('.layers-panel') },
      { button: this.q<HTMLButtonElement>('#toggle-panel-comic'), panel: this.q<HTMLElement>('.comic-manager-panel') },
    ];
    const updatePanelMenu = () => {
      for (const entry of panelEntries) {
        const visible = !entry.panel.hidden;
        entry.button.setAttribute('aria-checked', String(visible));
        const check = entry.button.querySelector<HTMLElement>('.menu-check');
        if (check) check.textContent = visible ? '✓' : '';
      }
      const dock = this.q<HTMLElement>('.right-dock');
      dock.classList.toggle('panels-empty', panelEntries.every((entry) => entry.panel.hidden));
      const allHidden = dock.classList.contains('panels-hidden');
      this.q<HTMLButtonElement>('#toggle-panels').setAttribute('aria-pressed', String(!allHidden));
      panelsMenuButton.setAttribute('aria-expanded', String(!panelsDropdown.hidden));
    };
    viewMenu.button.addEventListener('click', () => {
      if (viewMenu.dropdown.hidden) {
        panelsDropdown.hidden = true;
        panelsMenuButton.setAttribute('aria-expanded', 'false');
      }
    });
    panelsMenuButton.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      panelsDropdown.hidden = !panelsDropdown.hidden;
      updatePanelMenu();
    });
    panelsDropdown.addEventListener('click', (event) => event.stopPropagation());
    panelsDropdown.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { panelsDropdown.hidden = true; updatePanelMenu(); panelsMenuButton.focus(); }
    });
    panelEntries.forEach((entry) => {
      entry.button.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        entry.panel.hidden = !entry.panel.hidden;
        panelsDropdown.hidden = true;
        closeMenu(viewMenu);
        updatePanelMenu();
      });
    });
    const toggleAllPanels = () => {
      const dock = this.q<HTMLElement>('.right-dock');
      const everyPanelIndividuallyHidden = panelEntries.every((entry) => entry.panel.hidden);
      if (dock.classList.contains('panels-hidden')) {
        dock.classList.remove('panels-hidden');
        if (everyPanelIndividuallyHidden) panelEntries.forEach((entry) => { entry.panel.hidden = false; });
      } else if (everyPanelIndividuallyHidden) {
        panelEntries.forEach((entry) => { entry.panel.hidden = false; });
      } else {
        dock.classList.add('panels-hidden');
      }
      panelsDropdown.hidden = true;
      closeMenu(viewMenu);
      updatePanelMenu();
    };
    on('#toggle-panels', toggleAllPanels);
    updatePanelMenu();
    this.applyWorkspace(this.workspace, false);

    on('#menu-filter', () => this.openDestructiveFilterPanel());
    on('#menu-layer', () => openPanel('effects-panel'));
    on('#rail-hand', () => this.setTool('hand'));
    on('#rail-brush', () => this.setTool('brush')); on('#rail-eraser', () => this.setTool('eraser'));
    on('#rail-eyedropper', () => this.setTool('eyedropper')); on('#rail-line', () => this.setTool('line'));
    on('#rail-text', () => this.setTool('text')); on('#rail-vector-select', () => this.setTool('vector-select'));
    on('#rail-rectangle', () => this.setTool('rectangle')); on('#rail-ellipse', () => this.setTool('ellipse')); on('#rail-fill', () => this.setTool('fill'));
    on('#zoom-out', () => { this.zoom = Math.max(0.25, Math.round((this.zoom / 1.2) * 1000) / 1000); this.applyCanvasView(); });
    on('#zoom-in', () => { this.zoom = Math.min(8, Math.round((this.zoom * 1.2) * 1000) / 1000); this.applyCanvasView(); });
    on('#zoom-fit', () => { this.zoom = 1; this.panX = 0; this.panY = 0; this.applyCanvasView(); });
    this.root.querySelectorAll<HTMLElement>('[data-close]').forEach((el) => el.addEventListener('click', () => {
      const target = el.dataset.close; if (target) this.q<HTMLElement>('#' + target).hidden = true;
    }));
    wireFilterPanel(this.root, { labelForFilter: (kind) => this.filterLabel(kind), applyFilter: () => this.applyFilterDialog() });
    wireLayerEffectsPanel(this.root);
    wireVectorEditorPanel(this.root, {
      addShape: (kind) => this.addVectorShape(kind),
      deleteShape: () => this.deleteSelectedVectorShape(),
      duplicateShape: () => this.duplicateSelectedVectorShape(),
      moveShape: (delta) => this.moveSelectedVectorShape(delta),
      exportSvg: () => this.exportVectorLayerSvg(),
      apply: () => this.applyVectorEditor(),
      cancel: () => this.cancelVectorEditor(),
      clear: () => { if (confirm('¿Vaciar todos los objetos de esta capa vectorial?')) { this.vectorDraft = []; this.vectorSelectedId = null; this.renderVectorEditor(); } },
      updateFromFields: () => this.updateVectorShapeFromFields(),
    });

    on('#b-new', () => this.promptNew());
    on('#b-open', () => void this.open());
    on('#b-save', () => void this.save(false));
    on('#b-save-as', () => void this.save(true));

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e));
    c.addEventListener('contextmenu', (e) => { if (this.tool !== 'eyedropper') e.preventDefault(); });
    const stage = this.root.querySelector<HTMLElement>('.canvas-stage')!;
    stage.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoom = Math.max(0.25, Math.min(8, this.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); this.applyCanvasView(); }
      else if (this.spaceDown || e.shiftKey) { e.preventDefault(); this.panX -= e.deltaX; this.panY -= e.deltaY; this.applyCanvasView(); }
    }, { passive: false });
    new ResizeObserver(() => { this.updatePreviewCanvasSize(); this.scheduleRefresh(); }).observe(stage);

    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      const insideMenuOrDialog = !!target?.closest('.menus, .preferences-overlay, .editor-panel');
      if (e.key === 'Tab' && !e.shiftKey && !mod && !e.altKey && !typing && !insideMenuOrDialog) {
        e.preventDefault();
        toggleAllPanels();
        return;
      }
      if (e.code === 'Space' && !typing) { e.preventDefault(); this.spaceDown = true; return; }
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); }
      else if (mod && k === 'y') { e.preventDefault(); this.doRedo(); }
      else if (mod && k === 's') { e.preventDefault(); void this.save(e.shiftKey); }
      else if (mod && k === 'o') { e.preventDefault(); void this.open(); }
      else if (mod && k === 'n') { e.preventDefault(); this.promptNew(); }
      else if (!mod && !typing && k === 'b') this.setTool('brush');
      else if (!mod && !typing && k === 'e') this.setTool('eraser');
      else if (!mod && !typing && k === 'i') this.setTool('eyedropper');
      else if (!mod && !typing && k === 'l') this.setTool('line');
      else if (!mod && !typing && k === 'r') this.setTool('rectangle');
      else if (!mod && !typing && k === 'o') this.setTool('ellipse');
      else if (!mod && !typing && k === 'g') this.setTool('fill');
      else if (!mod && !typing && k === 'h') this.setTool('hand');
      else if (!mod && !typing && k === 't') this.setTool('text');
      else if (!mod && !typing && k === 'v') this.setTool('vector-select');
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') this.spaceDown = false; });
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
    const copy: VectorShape = { ...hit, points: hit.points?.map((p) => ({ ...p })) };
    const handle = Math.abs(point.x - (hit.x + hit.width)) <= 12 && Math.abs(point.y - (hit.y + hit.height)) <= 12;
    this.vectorDirectSelectedId = hit.id;
    this.vectorGesture = { layerId: layer.id, shapeId: hit.id, mode: handle ? 'resize' : 'move', startPoint: point, original: copy, latest: { ...copy, points: copy.points?.map((p) => ({ ...p })) }, moved: false };
    this.canvas.setPointerCapture(event.pointerId);
    this.drawVectorSelectionOverlay(copy);
    this.q<HTMLElement>('#status').textContent = `${this.vectorKindLabel(hit.kind)} seleccionado · ${handle ? 'redimensionar' : 'arrastrar para mover'}`;
  }

  private transformVectorShape(original: VectorShape, dx: number, dy: number, mode: 'move' | 'resize'): VectorShape {
    const clone: VectorShape = { ...original, points: original.points?.map((point) => ({ ...point })) };
    if (mode === 'move') {
      clone.x = original.x + dx; clone.y = original.y + dy;
      if (clone.points) clone.points = clone.points.map((point) => ({
        ...point, x: point.x + dx, y: point.y + dy,
        ...(point.inX !== undefined ? { inX: point.inX + dx } : {}), ...(point.inY !== undefined ? { inY: point.inY + dy } : {}),
        ...(point.outX !== undefined ? { outX: point.outX + dx } : {}), ...(point.outY !== undefined ? { outY: point.outY + dy } : {}),
      }));
      return clone;
    }
    const nextWidth = Math.max(1, original.width + dx), nextHeight = Math.max(1, original.height + dy);
    const sx = nextWidth / Math.max(1, original.width), sy = nextHeight / Math.max(1, original.height);
    clone.width = nextWidth; clone.height = nextHeight;
    if (clone.points) clone.points = clone.points.map((point) => ({
      ...point, x: original.x + (point.x - original.x) * sx, y: original.y + (point.y - original.y) * sy,
      ...(point.inX !== undefined ? { inX: original.x + (point.inX - original.x) * sx } : {}), ...(point.inY !== undefined ? { inY: original.y + (point.inY - original.y) * sy } : {}),
      ...(point.outX !== undefined ? { outX: original.x + (point.outX - original.x) * sx } : {}), ...(point.outY !== undefined ? { outY: original.y + (point.outY - original.y) * sy } : {}),
    }));
    if (clone.kind === 'text') clone.fontSize = Math.max(1, (original.fontSize ?? 64) * Math.min(sx, sy));
    return clone;
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
      const shapes = (layer.vectorShapes ?? []).map((shape) => shape.id === gesture.shapeId ? gesture.latest : { ...shape, points: shape.points?.map((p) => ({ ...p })) });
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
      const status = this.root.querySelector<HTMLElement>('#status'); if (status) status.textContent = 'Seleccioná una capa vectorial visible y desbloqueada para editar sus objetos directamente.';
      return;
    }
    if (needsPaintTarget && (!layer || (layer.type !== 'paint' && layer.type !== 'raster') || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id))) {
      const status = this.root.querySelector<HTMLElement>('#status');
      if (status) status.textContent = !layer ? 'Creá o seleccioná una capa de pintura para usar esta herramienta' : layer.locked || this.ctl.isEffectivelyLocked(layer.id) ? 'La capa está bloqueada' : !this.ctl.isEffectivelyVisible(layer.id) ? 'La capa está oculta' : `${this.layerTypeLabel(layer.type)}: seleccioná una capa de pintura para dibujar`;
      return;
    }
    this.tool = t;
    this.vectorGesture = null; this.vectorDirectSelectedId = null;
    this.renderToolOptions();
    this.renderAdvancedToolOptions();
    this.applyCanvasView();
    this.clearToolPreview();
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
    const { width, height } = this.ctl.doc;
    const radius = Math.max(0.5, this.brush.size / 2);
    const left = Math.max(0, Math.floor(x - radius - 1));
    const top = Math.max(0, Math.floor(y - radius - 1));
    const right = Math.min(width, Math.ceil(x + radius + 1));
    const bottom = Math.min(height, Math.ceil(y + radius + 1));
    const w = right - left, h = bottom - top;
    if (w <= 0 || h <= 0) return;
    const pixels = new Uint8Array(w * h * 4);
    layer.readRectToJS(left, top, w, h, pixels);
    const hardEdge = radius * (this.brush.hardness / 100);
    const fadeWidth = Math.max(0.5, radius + 0.5 - hardEdge);
    const erase = this.strokeTool === 'eraser';
    const [cr, cg, cb] = this.brush.rgb;
    const opacity = this.brush.opacity / 100;
    let changed = false;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const distance = Math.hypot(left + px + 0.5 - x, top + py + 0.5 - y);
        if (distance >= radius + 0.5) continue;
        let coverage = 1;
        if (distance > hardEdge) {
          const t = Math.max(0, Math.min(1, (radius + 0.5 - distance) / fadeWidth));
          coverage = t * t * (3 - 2 * t);
        }
        const srcA = coverage * opacity;
        if (srcA <= 0) continue;
        const i = (py * w + px) * 4;
        const oldA = pixels[i + 3] / 255;
        if (erase) {
          const nextA = oldA * (1 - srcA);
          if (nextA !== oldA) changed = true;
          pixels[i + 3] = Math.round(nextA * 255);
          if (nextA <= 0.0001) { pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0; }
        } else {
          const nextA = srcA + oldA * (1 - srcA);
          const oldWeight = oldA * (1 - srcA);
          if (nextA > 0) {
            pixels[i] = Math.round((cr * srcA + pixels[i] * oldWeight) / nextA);
            pixels[i + 1] = Math.round((cg * srcA + pixels[i + 1] * oldWeight) / nextA);
            pixels[i + 2] = Math.round((cb * srcA + pixels[i + 2] * oldWeight) / nextA);
            pixels[i + 3] = Math.round(nextA * 255);
            changed = true;
          }
        }
      }
    }
    if (changed && layer.writeRectFromJS(left, top, w, h, pixels)) this.scheduleRefresh();
  }

  private down(e: PointerEvent): void {
    if (this.stroke || this.isPanning) return;
    if (e.button === 1 || this.spaceDown || this.tool === 'hand') {
      if (e.button !== 0 && e.button !== 1 && !this.spaceDown && this.tool !== 'hand') return;
      e.preventDefault();
      this.canvas.setPointerCapture(e.pointerId);
      this.isPanning = true;
      this.panStart = { clientX: e.clientX, clientY: e.clientY, x: this.panX, y: this.panY };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button !== 0) return;
    const point = this.toDoc(e);
    if (!this.onDocument(point)) return;
    if (this.tool === 'eyedropper') { this.pickColorAt(Math.floor(point.x), Math.floor(point.y)); return; }
    if (this.tool === 'text') { void this.createTextAt({ x: Math.round(point.x), y: Math.round(point.y) }); return; }
    if (this.tool === 'vector-select') { this.beginVectorGesture(point, e); return; }
    const layer = this.active();
    if (!layer) return;
    if (layer.type !== 'paint' && layer.type !== 'raster') {
      this.q<HTMLElement>('#status').textContent = `${this.layerTypeLabel(layer.type)}: elegí una capa de pintura para editar píxeles`;
      return;
    }
    if (!this.ctl.isEffectivelyVisible(layer.id) || this.ctl.isEffectivelyLocked(layer.id)) {
      this.q<HTMLElement>('#status').textContent = this.ctl.isEffectivelyLocked(layer.id) ? 'La capa o su grupo está bloqueado' : 'La capa o su grupo está oculto';
      return;
    }
    if (this.tool === 'fill') { this.fillAt(point, layer); return; }
    this.canvas.setPointerCapture(e.pointerId);
    this.stroke = new StrokeSession(this.ctx, layer.engineId);
    this.strokeLayer = this.ctl.layerPixels(layer);
    this.strokeTool = this.tool;
    this.last = point;
    if (this.tool === 'brush' || this.tool === 'eraser') this.stamp(point.x, point.y);
    else if (this.tool === 'line' || this.tool === 'rectangle' || this.tool === 'ellipse') {
      this.shapeStart = { ...point, clientX: e.clientX, clientY: e.clientY };
      this.drawToolPreview(e);
    }
  }

  private onPointerMove(e: PointerEvent, finalPoint = false): void {
    if (this.vectorGesture) { this.updateVectorGesture(this.toDoc(e)); return; }
    if (this.isPanning && this.panStart) {
      this.panX = this.panStart.x + e.clientX - this.panStart.clientX;
      this.panY = this.panStart.y + e.clientY - this.panStart.clientY;
      this.applyCanvasView();
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
      for (let i = 1; i <= n; i++) this.stamp(this.last.x + (dx * i) / n, this.last.y + (dy * i) / n);
      this.last = p;
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
      if (this.brush.shapeFill) ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    } else if (this.strokeTool === 'ellipse') {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
      if (this.brush.shapeFill) ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private commitShape(start: { x: number; y: number }, end: { x: number; y: number }, tool: Tool): void {
    const layer = this.strokeLayer;
    if (!layer) return;
    const { width: docW, height: docH } = this.ctl.doc;
    const padding = Math.ceil(this.brush.size / 2) + 2;
    const left = Math.max(0, Math.floor(Math.min(start.x, end.x) - padding));
    const top = Math.max(0, Math.floor(Math.min(start.y, end.y) - padding));
    const right = Math.min(docW, Math.ceil(Math.max(start.x, end.x) + padding));
    const bottom = Math.min(docH, Math.ceil(Math.max(start.y, end.y) + padding));
    const w = right - left, h = bottom - top;
    if (w <= 0 || h <= 0) return;
    const scratch = document.createElement('canvas'); scratch.width = w; scratch.height = h;
    const ctx = scratch.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = this.brush.opacity / 100;
    ctx.strokeStyle = this.foregroundHex(); ctx.fillStyle = this.foregroundHex();
    ctx.lineWidth = this.brush.size; ctx.lineCap = this.brush.lineCap; ctx.lineJoin = this.brush.lineJoin;
    const x1 = start.x - left, y1 = start.y - top, x2 = end.x - left, y2 = end.y - top;
    if (tool === 'line') { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    else if (tool === 'rectangle') {
      const x = Math.min(x1, x2), y = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      if (this.brush.shapeFill) ctx.fillRect(x, y, rw, rh);
      ctx.strokeRect(x, y, rw, rh);
    } else if (tool === 'ellipse') {
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
      if (this.brush.shapeFill) ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const source = ctx.getImageData(0, 0, w, h).data;
    const target = new Uint8Array(w * h * 4);
    layer.readRectToJS(left, top, w, h, target);
    let changed = false;
    for (let i = 0; i < target.length; i += 4) {
      const sa = source[i + 3] / 255;
      if (sa <= 0) continue;
      const da = target[i + 3] / 255;
      const outA = sa + da * (1 - sa);
      const oldWeight = da * (1 - sa);
      target[i] = Math.round((source[i] * sa + target[i] * oldWeight) / outA);
      target[i + 1] = Math.round((source[i + 1] * sa + target[i + 1] * oldWeight) / outA);
      target[i + 2] = Math.round((source[i + 2] * sa + target[i + 2] * oldWeight) / outA);
      target[i + 3] = Math.round(outA * 255);
      changed = true;
    }
    if (changed) layer.writeRectFromJS(left, top, w, h, target);
  }

  private up(e?: PointerEvent): void {
    if (this.vectorGesture) { this.finishVectorGesture(e ? this.toDoc(e) : this.vectorGesture.startPoint); return; }
    if (this.isPanning) {
      this.isPanning = false; this.panStart = null; this.applyCanvasView();
      return;
    }
    if (!this.stroke) { this.clearToolPreview(); return; }
    const tool = this.strokeTool;
    try {
      if (e && (tool === 'brush' || tool === 'eraser')) this.onPointerMove(e, true);
      else if (e && this.shapeStart && (tool === 'line' || tool === 'rectangle' || tool === 'ellipse')) {
        this.commitShape(this.shapeStart, this.toDoc(e), tool);
      }
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
    const { width, height } = this.ctl.doc;
    const total = width * height;
    if (total > 8_000_000) { this.q<HTMLElement>('#status').textContent = 'El relleno está limitado a 8 millones de píxeles para proteger la memoria. Reducí el tamaño o usá un documento más pequeño.'; return; }
    if (this.brush.sampleMerged && total > 4_000_000) { this.q<HTMLElement>('#status').textContent = 'El muestreo de todas las capas en el bote de pintura admite hasta 4 millones de píxeles por operación.'; return; }
    const targetLayer = this.ctl.layerPixels(node);
    if (!targetLayer) return;
    const original = this.ctl.readPixels(node) ?? new Uint8Array(total * 4);
    const reference = this.brush.sampleMerged ? this.compositePixelsForSampling() : original;
    if (!reference) return;
    const seedX = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
    const seedY = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
    const seed = (seedY * width + seedX) * 4;
    const sr = reference[seed], sg = reference[seed + 1], sb = reference[seed + 2], sa = reference[seed + 3];
    const tolerance = this.brush.tolerance;
    const matches = (i: number) => Math.max(Math.abs(reference[i] - sr), Math.abs(reference[i + 1] - sg), Math.abs(reference[i + 2] - sb), Math.abs(reference[i + 3] - sa)) <= tolerance;
    const result = new Uint8Array(original);
    const [cr, cg, cb] = this.brush.rgb;
    const srcA = this.brush.opacity / 100;
    const paint = (pixel: number) => {
      const i = pixel * 4, oldA = result[i + 3] / 255, outA = srcA + oldA * (1 - srcA), oldWeight = oldA * (1 - srcA);
      if (outA <= 0) return;
      result[i] = Math.round((cr * srcA + result[i] * oldWeight) / outA);
      result[i + 1] = Math.round((cg * srcA + result[i + 1] * oldWeight) / outA);
      result[i + 2] = Math.round((cb * srcA + result[i + 2] * oldWeight) / outA);
      result[i + 3] = Math.round(outA * 255);
    };
    let filled = 0;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    const fillPixel = (pixel: number) => {
      paint(pixel); filled++;
      const px = pixel % width, py = Math.floor(pixel / width);
      minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
    };
    if (!this.brush.contiguous) {
      for (let pixel = 0; pixel < total; pixel++) {
        if (matches(pixel * 4)) fillPixel(pixel);
      }
    } else {
      const stack = new Uint32Array(total);
      const seen = new Uint8Array(total);
      let top = 0;
      const seedPixel = seedY * width + seedX;
      stack[top++] = seedPixel; seen[seedPixel] = 1;
      while (top > 0) {
        const pixel = stack[--top], refIndex = pixel * 4;
        if (!matches(refIndex)) continue;
        fillPixel(pixel);
        const x = pixel % width, y = Math.floor(pixel / width);
        const push = (next: number) => { if (!seen[next]) { seen[next] = 1; stack[top++] = next; } };
        if (x > 0) push(pixel - 1); if (x + 1 < width) push(pixel + 1);
        if (y > 0) push(pixel - width); if (y + 1 < height) push(pixel + width);
      }
    }
    if (!filled) { this.q<HTMLElement>('#status').textContent = 'No se encontraron píxeles dentro de la tolerancia.'; return; }
    const regionWidth = maxX - minX + 1, regionHeight = maxY - minY + 1;
    const region = new Uint8Array(regionWidth * regionHeight * 4);
    for (let row = 0; row < regionHeight; row++) {
      const sourceStart = ((minY + row) * width + minX) * 4;
      region.set(result.subarray(sourceStart, sourceStart + regionWidth * 4), row * regionWidth * 4);
    }
    runEdit(this.ctx, node.engineId, 'Bote de pintura', (layer) => { layer.writeRectFromJS(minX, minY, regionWidth, regionHeight, region); });
    this.q<HTMLElement>('#status').textContent = `Relleno aplicado · ${filled.toLocaleString()} píxeles`;
    this.updateHistoryUI();
    if (this.hasFilterLayer()) this.scheduleRefresh();
  }

  /** Renderiza la composición visible completa para el bote de pintura, con un límite de tamaño previo. */
  private compositePixelsForSampling(): Uint8Array | null {
    const { width, height } = this.ctl.doc;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const compose = (nodes: LayerNode[], target: HTMLCanvasElement): void => {
      const targetCtx = target.getContext('2d', { willReadFrequently: true })!;
      targetCtx.clearRect(0, 0, width, height);
      const scratch = document.createElement('canvas'); scratch.width = width; scratch.height = height;
      const scratchCtx = scratch.getContext('2d', { willReadFrequently: true })!;
      for (const layer of nodes) {
        if (!layer.visible || layer.opacity <= 0) continue;
        if (layer.type === 'filter') {
          const original = document.createElement('canvas'); original.width = width; original.height = height;
          original.getContext('2d')!.drawImage(target, 0, 0);
          const filtered = document.createElement('canvas'); filtered.width = width; filtered.height = height;
          const filteredCtx = filtered.getContext('2d')!; filteredCtx.filter = this.filterCss(layer.filterKind ?? 'grayscale', layer.filterStrength ?? 1); filteredCtx.drawImage(original, 0, 0); filteredCtx.filter = 'none';
          const originalCtx = original.getContext('2d', { willReadFrequently: true })!;
          const originalImage = originalCtx.getImageData(0, 0, width, height);
          const filteredImage = filtered.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height);
          for (let i = 0; i < originalImage.data.length; i++) originalImage.data[i] = Math.round(originalImage.data[i] * (1 - layer.opacity) + filteredImage.data[i] * layer.opacity);
          targetCtx.clearRect(0, 0, width, height); targetCtx.putImageData(originalImage, 0, 0);
          continue;
        }
        if (layer.type === 'group') {
          const group = document.createElement('canvas'); group.width = width; group.height = height; compose(layer.children, group);
          targetCtx.save(); targetCtx.globalAlpha = layer.opacity; targetCtx.globalCompositeOperation = this.canvasBlend(layer.blendMode); targetCtx.drawImage(group, 0, 0); targetCtx.restore();
          continue;
        }
        if (!isPixelLayerType(layer.type)) continue;
        const pixels = this.ctl.readPixels(layer);
        if (!pixels) continue;
        const image = new ImageData(new Uint8ClampedArray(pixels), width, height);
        scratchCtx.clearRect(0, 0, width, height); scratchCtx.putImageData(image, 0, 0);
        targetCtx.save(); targetCtx.globalAlpha = layer.opacity; targetCtx.globalCompositeOperation = this.canvasBlend(layer.blendMode); targetCtx.drawImage(scratch, 0, 0); targetCtx.restore();
      }
    };
    compose(this.ctl.doc.layers, canvas);
    const image = ctx.getImageData(0, 0, width, height);
    return new Uint8Array(image.data.buffer.slice(image.data.byteOffset, image.data.byteOffset + image.data.byteLength));
  }

  private pickColorAt(x: number, y: number): void {
    const layer = this.active();
    if (!layer) return;
    let rgba: Uint8Array | null = null;
    if (this.brush.sampleMerged) {
      const one = this.compositeSamplePixel(x, y); rgba = one;
    } else {
      const pixels = this.ctl.layerPixels(layer);
      if (pixels) { const value = new Uint8Array(4); pixels.readRectToJS(x, y, 1, 1, value); rgba = value; }
    }
    if (!rgba) { this.q<HTMLElement>('#status').textContent = 'No se pudo tomar el color de esta capa.'; return; }
    this.brush.rgb = [rgba[0], rgba[1], rgba[2]];
    this.renderToolOptions(); this.syncToolbarProps();
    this.q<HTMLElement>('#status').textContent = `Color seleccionado ${this.foregroundHex()}`;
  }

  private compositeSamplePixel(x: number, y: number): Uint8Array {
    const target = document.createElement('canvas'); target.width = target.height = 1;
    const compose = (nodes: LayerNode[], dest: HTMLCanvasElement): void => {
      const ctx = dest.getContext('2d', { willReadFrequently: true })!; ctx.clearRect(0, 0, 1, 1);
      for (const node of nodes) {
        if (!node.visible || node.opacity <= 0) continue;
        if (node.type === 'group') {
          const group = document.createElement('canvas'); group.width = group.height = 1; compose(node.children, group);
          ctx.save(); ctx.globalAlpha = node.opacity; ctx.globalCompositeOperation = this.canvasBlend(node.blendMode); ctx.drawImage(group, 0, 0); ctx.restore(); continue;
        }
        if (node.type === 'filter') {
          const original = document.createElement('canvas'); original.width = original.height = 1; original.getContext('2d')!.drawImage(dest, 0, 0);
          const filtered = document.createElement('canvas'); filtered.width = filtered.height = 1; const fc = filtered.getContext('2d')!; fc.filter = this.filterCss(node.filterKind ?? 'grayscale', node.filterStrength ?? 1); fc.drawImage(original, 0, 0); fc.filter = 'none';
          const originalData = original.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, 1, 1);
          const filteredData = filtered.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, 1, 1);
          for (let i = 0; i < 4; i++) originalData.data[i] = Math.round(originalData.data[i] * (1 - node.opacity) + filteredData.data[i] * node.opacity);
          ctx.clearRect(0, 0, 1, 1); ctx.putImageData(originalData, 0, 0); continue;
        }
        if (!isPixelLayerType(node.type)) continue;
        const surface = this.ctl.layerPixels(node); if (!surface) continue;
        const data = new Uint8Array(4); surface.readRectToJS(x, y, 1, 1, data);
        const layerCanvas = document.createElement('canvas'); layerCanvas.width = layerCanvas.height = 1;
        layerCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), 1, 1), 0, 0);
        ctx.save(); ctx.globalAlpha = node.opacity; ctx.globalCompositeOperation = this.canvasBlend(node.blendMode); ctx.drawImage(layerCanvas, 0, 0); ctx.restore();
      }
    };
    compose(this.ctl.doc.layers, target);
    return new Uint8Array(target.getContext('2d')!.getImageData(0, 0, 1, 1).data);
  }

  // ───────────── Undo / archivos ─────────────

  private doUndo(): void {
    if (this.stroke) return;
    const kind = this.ctl.undo();
    if (kind === 'pixels') this.renderFrame();
    else if (kind === 'structure') {
      if (!this.ctl.find(this.activeId)) this.activeId = this.topRaster()?.id ?? '';
      this.syncUI(); this.scheduleRefresh();
    }
    this.updateHistoryUI();
  }
  private doRedo(): void {
    if (this.stroke) return;
    const kind = this.ctl.redo();
    if (kind === 'pixels') this.renderFrame();
    else if (kind === 'structure') {
      if (!this.ctl.find(this.activeId)) this.activeId = this.topRaster()?.id ?? '';
      this.syncUI(); this.scheduleRefresh();
    }
    this.updateHistoryUI();
  }

  private async save(asNew: boolean): Promise<void> {
    if (this.stroke) return;
    try {
      const doc = this.ctl.doc;
      const read = (layer: LayerNode) => this.ctl.readPixels(layer);
      const h = await saveToDisk(doc, read, asNew ? undefined : this.fileHandle ?? undefined);
      if (supportsFileSystemAccess() && !h) return; // el usuario canceló el diálogo de Guardar
      if (h) this.fileHandle = h;
      // saveToDisk sincroniza el nombre con el archivo elegido antes de serializarlo.
      this.syncDocumentHeader();
      const bytes = packNvtsPhoto(doc, read);
      if (readPreferences().rememberRecentProjects) {
        await rememberRecentProject(doc, bytes).catch((error) => console.warn('El archivo se guardó, pero no se pudo actualizar Proyectos recientes:', error));
      }
      this.q<HTMLElement>('#status').textContent = `Guardado · ${doc.width}×${doc.height}`;
    } catch (e) { this.fail(e); }
  }

  private async open(): Promise<void> {
    if (this.stroke) return;
    try {
      const res = await openFromDisk();
      if (!res) return;
      this.fileHandle = res.handle;
      if (res.fileName) res.doc.name = documentNameFromFile(res.fileName);
      this.setDocument(DocumentController.fromUnpacked(this.engine.module, res));
      await this.refreshLinkedFileLayers(false);
      if (readPreferences().rememberRecentProjects) {
        const doc = this.ctl.doc;
        const bytes = packNvtsPhoto(doc, (layer) => this.ctl.readPixels(layer));
        await rememberRecentProject(doc, bytes).catch((error) => console.warn('No se pudo actualizar Proyectos recientes:', error));
      }
    } catch (e) { this.fail(e); }
  }

  private fail(e: unknown): void {
    console.error(e);
    alert(e instanceof Error ? e.message : String(e));
  }

  private q<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector<T>(sel)!;
  }
}
