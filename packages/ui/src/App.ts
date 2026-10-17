// App.ts — Ensambla todo: motor Wasm + renderer (WebGPU/WebGL2) + documento + guardado + UI.
// Todo corre en el hilo principal por ahora (mover el motor a un Worker es un paso posterior).
// Reutiliza createToolbar (Toolbar.ts) para color/tamaño/brillo/opacidad/modo.

import { EngineClient, blendModeFromManifest } from '@nvts/wasm-bindings';
import { createRenderer, type RendererBackend } from '@nvts/renderer';
import {
  DocumentController, blendModeToManifest, StrokeSession, refresh, runEdit,
  type EngineCtx, type LayerNode,
} from '@nvts/document-model';
import { isPixelLayerType, type FilterKind, type LayerType, type VectorShape } from '@nvts/shared';
import { openFromDisk, packNvtsPhoto, saveToDisk, unpackNvtsPhoto, listRecentProjects, loadRecentProject, rememberRecentProject, removeRecentProject, clearRecentProjects, supportsFileSystemAccess, type RecentProjectInfo } from '@nvts/storage';
import { createToolbar } from './Toolbar';

type Tool = 'brush' | 'eraser';
const LOGO_URL = `${import.meta.env.BASE_URL}branding/photomania-icon.svg`;

const PREFERENCES_KEY = 'nvts-photomania-preferences';
type UiTheme = 'dark' | 'light';
interface AppPreferences { rememberRecentProjects: boolean; theme: UiTheme }
const DEFAULT_PREFERENCES: AppPreferences = { rememberRecentProjects: false, theme: 'dark' };

function readPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      rememberRecentProjects: parsed.rememberRecentProjects === true,
      theme: parsed.theme === 'light' ? 'light' : 'dark',
    };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}

function writePreferences(prefs: AppPreferences): void {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs)); }
  catch (error) { console.warn('No se pudieron guardar las preferencias:', error); }
  document.documentElement.dataset.theme = prefs.theme;
}

async function initializePreferences(): Promise<AppPreferences> {
  let isFirstRun = false;
  try { isFirstRun = localStorage.getItem(PREFERENCES_KEY) === null; } catch { /* preferencias predeterminadas */ }
  const prefs = readPreferences();
  if (isFirstRun) {
    writePreferences(prefs);
    // Las entradas generadas por versiones anteriores no se consideran consentimiento para guardar recientes.
    await clearRecentProjects().catch((error) => console.warn('No se pudieron limpiar los recientes anteriores:', error));
  }
  document.documentElement.dataset.theme = prefs.theme;
  return prefs;
}

const PREFERENCES_TEMPLATE = `
<section id="preferences-overlay" class="preferences-overlay" hidden>
  <div class="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
    <header><div><strong id="preferences-title">Preferencias</strong><p>Personalizá NVTS PhotoMania.</p></div><button type="button" id="preferences-close" class="preferences-close" aria-label="Cerrar preferencias">×</button></header>
    <div class="preferences-content">
      <label class="preference-row" for="pref-recent-projects">
        <span><strong>Guardar proyectos recientes</strong><small>Recordar documentos creados o abiertos en este navegador. Se guardan copias locales para poder recuperarlos.</small></span>
        <input id="pref-recent-projects" type="checkbox" />
      </label>
      <div class="preference-row">
        <span><strong>Tema de la interfaz</strong><small>Cambiá entre la apariencia oscura y la clara.</small></span>
        <select id="pref-theme"><option value="dark">Tema oscuro</option><option value="light">Tema claro</option></select>
      </div>
      <p class="preferences-note">Al desactivar los proyectos recientes, PhotoMania borra las copias y la lista guardadas para esta función.</p>
    </div>
    <footer><button type="button" id="preferences-cancel">Cancelar</button><button type="button" class="primary" id="preferences-save">Guardar preferencias</button></footer>
  </div>
</section>`;

function wirePreferences(root: HTMLElement, onSaved?: (next: AppPreferences, previous: AppPreferences) => void | Promise<void>): () => void {
  const overlay = root.querySelector<HTMLElement>('#preferences-overlay')!;
  const recent = root.querySelector<HTMLInputElement>('#pref-recent-projects')!;
  const theme = root.querySelector<HTMLSelectElement>('#pref-theme')!;
  const close = () => { overlay.hidden = true; };
  const open = () => {
    const current = readPreferences();
    recent.checked = current.rememberRecentProjects;
    theme.value = current.theme;
    overlay.hidden = false;
    root.querySelector<HTMLButtonElement>('#preferences-close')?.focus();
  };
  root.querySelector<HTMLButtonElement>('#b-preferences')?.addEventListener('click', open);
  root.querySelector<HTMLButtonElement>('#home-preferences')?.addEventListener('click', open);
  root.querySelector<HTMLButtonElement>('#preferences-close')?.addEventListener('click', close);
  root.querySelector<HTMLButtonElement>('#preferences-cancel')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  root.querySelector<HTMLButtonElement>('#preferences-save')?.addEventListener('click', () => {
    const previous = readPreferences();
    const next: AppPreferences = { rememberRecentProjects: recent.checked, theme: theme.value === 'light' ? 'light' : 'dark' };
    writePreferences(next);
    close();
    void (async () => {
      if (previous.rememberRecentProjects && !next.rememberRecentProjects) {
        await clearRecentProjects().catch((error) => console.warn('No se pudieron borrar los proyectos recientes:', error));
      }
      await onSaved?.(next, previous);
    })();
  });
  return open;
}

function documentNameFromFile(fileName: string): string {
  const leaf = fileName.split(/[\\/]/).pop() ?? fileName;
  return leaf.replace(/\.(nvtsphoto|png|jpe?g|webp|gif|bmp|tiff?)$/i, '').trim() || 'Sin título';
}

const TEMPLATE = `
<header class="topbar">
  <div class="brand"><img class="app-logo" src="${LOGO_URL}" alt="NVTS PhotoMania"/><strong>PhotoMania</strong></div>
  <nav class="menus" aria-label="Menú principal">
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
    <button id="menu-image">Imagen</button><button id="menu-layer">Capa</button><button id="menu-select">Seleccionar</button><button id="menu-filter">Filtro</button><button id="menu-view">Ver</button><button id="menu-help">Ayuda</button>
  </nav>
  <div class="doc-title">Sin título <small id="doc-size">1280 × 720</small></div>
</header>
<div class="tool-options"><button id="t-brush" class="on">✎ Pincel</button><button id="t-eraser">◩ Borrador</button><div id="toolbar" class="toolbar"></div><span id="status"></span></div>
<main class="workspace">
  <aside class="tools-rail"><button title="Mover">➤</button><button title="Selección">▧</button><button id="rail-brush" class="selected" title="Pincel">✎</button><button id="rail-eraser" title="Borrador">⌫</button><button title="Pluma">♧</button><button title="Texto">T</button><button title="Formas">◯</button><button title="Cuentagotas">⌁</button><div class="swatches"><span></span><span></span></div></aside>
  <section class="canvas-area"><div class="canvas-label"><span id="canvas-name">Sin título</span><span id="canvas-meta">1280 × 720 px · RGB/8</span></div><div class="canvas-stage"><canvas id="canvas"></canvas></div><div class="zoom-controls"><button id="zoom-out">−</button><span id="zoom-value">Ajustar</span><button id="zoom-in">+</button><button id="zoom-fit">⛶ Ajustar</button></div></section>
  <aside class="right-dock">
    <section class="dock-panel history-panel"><header><span>⌄</span><strong>Historial</strong><span id="history-count" class="count">0</span><div class="panel-spacer"></div></header><div id="history-list" class="history-list"></div></section>
    <section class="dock-panel layers-panel"><header><strong>Capas</strong><div class="panel-spacer"></div><select id="dock-blend" aria-label="Modo de fusión"><option value="normal">Normal</option><option value="multiply">Multiplicar</option><option value="screen">Trama</option><option value="overlay">Superponer</option></select></header>
      <div class="layer-props"><label>Opacidad <input id="layer-opacity" type="number" min="0" max="100" value="100"/>%</label><button id="l-fill-color" type="button" hidden>Color de relleno…</button><button id="l-filter-options" type="button" hidden>Configurar filtro…</button><button id="l-vector-add" type="button" hidden>Agregar figura…</button></div>
      <div id="layers"></div><div class="layer-empty" id="layer-empty">◇<strong>Capas</strong><span>Seleccioná una capa o creá una nueva.</span></div>
      <footer><button id="l-up" title="Subir capa">↑</button><button id="l-down" title="Bajar capa">↓</button><button id="l-duplicate" title="Duplicar capa">▣+</button><button id="l-del" title="Eliminar capa">▤−</button><button id="l-add" class="primary">＋ Nueva capa</button>
        <div id="layer-create-menu" class="layer-create-menu" hidden>
          <button type="button" data-layer-type="paint">✎ &nbsp; Capa de pintura</button>
          <button type="button" data-layer-type="filter">◐ &nbsp; Capa de filtro</button>
          <button type="button" data-layer-type="fill">◧ &nbsp; Capa de relleno…</button>
          <button type="button" data-layer-type="file">▧ &nbsp; Capa de archivo…</button>
          <button type="button" data-layer-type="vector">◇ &nbsp; Capa vectorial</button>
          <button type="button" data-layer-type="group">▱ &nbsp; Grupo</button>
        </div>
      </footer>
    </section>
  </aside>
</main>
<section id="effects-panel" class="editor-panel" hidden><header><strong>✧ Estilos de capa</strong><span id="effects-layer-name"></span><button class="panel-close" data-close="effects-panel">×</button></header><div class="editor-content"><aside class="editor-list"><button class="active">□ Trazo</button><button>□ Superposición de colores</button><button>□ Superposición de degradados</button><button>□ Resplandor exterior</button><button>□ Bisel y relieve</button></aside><div class="editor-settings"><strong>Trazo</strong><label>Tamaño <input type="range" min="1" max="40" value="3"/><output>3 px</output></label><label>Opacidad <input type="range" min="0" max="100" value="100"/><output>100%</output></label><label>Posición <select><option>Exterior</option><option>Interior</option><option>Centro</option></select></label><label>Color <input type="color" value="#000000"/></label></div></div><footer><span>Vista previa en vivo</span><button data-close="effects-panel">Cancelar</button><button class="primary" id="effects-apply">Aplicar</button></footer></section>
<section id="filters-panel" class="editor-panel" hidden><header><strong>⚒ Filtros</strong><span id="filters-layer-name"></span><button class="panel-close" data-close="filters-panel">×</button></header><div class="editor-content"><aside class="editor-list"><button class="active" data-filter="grayscale">Escala de grises</button><button data-filter="invert">Invertir colores</button><button data-filter="sepia">Sepia</button><button data-filter="blur">Desenfoque gaussiano</button><button data-filter="brightness">Brillo</button><button data-filter="contrast">Contraste</button></aside><div class="editor-settings"><strong id="filter-title">Escala de grises</strong><label>Intensidad <input id="filter-radius" type="range" min="1" max="100" value="100"/><output id="filter-radius-value">100%</output></label><p class="hint" id="filter-hint">En una capa de filtro, el ajuste queda editable y afecta a las capas que están debajo.</p></div></div><footer><span id="filter-mode-hint">Ajuste no destructivo</span><button data-close="filters-panel">Cancelar</button><button class="primary" id="filter-apply">Aplicar</button></footer></section>
<section id="vector-panel" class="editor-panel vector-panel" hidden><header><strong>◇ Editor de capa vectorial</strong><span id="vector-layer-name"></span><button class="panel-close" id="vector-close" type="button" aria-label="Cerrar editor vectorial">×</button></header><div class="vector-editor-grid"><aside class="editor-list" id="vector-shape-list" aria-label="Objetos vectoriales"></aside><div class="editor-settings"><div class="vector-add-row"><button id="vector-add-rect" type="button">＋ Rectángulo</button><button id="vector-add-ellipse" type="button">＋ Elipse</button><button id="vector-add-line" type="button">＋ Línea</button></div><p class="hint">Los objetos de esta capa se guardan como formas vectoriales editables en el proyecto.</p><div class="vector-fields"><label>Tipo <select id="vector-kind"><option value="rectangle">Rectángulo</option><option value="ellipse">Elipse</option><option value="line">Línea</option></select></label><label>X <input id="vector-x" type="number" step="1"/></label><label>Y <input id="vector-y" type="number" step="1"/></label><label>Ancho <input id="vector-width" type="number" min="1" step="1"/></label><label>Alto <input id="vector-height" type="number" min="1" step="1"/></label><label>Color <input id="vector-color" type="color" value="#e03030"/></label><label>Opacidad <input id="vector-opacity" type="range" min="0" max="100" value="100"/><output id="vector-opacity-value">100%</output></label><label>Trazo (px) <input id="vector-stroke" type="number" min="1" max="100" value="4"/></label></div><button id="vector-delete-shape" type="button" class="danger-button">Eliminar objeto seleccionado</button></div></div><footer><span>Las modificaciones se guardan como una sola acción de historial.</span><button id="vector-cancel" type="button">Cancelar</button><button id="vector-clear" type="button">Vaciar capa</button><button id="vector-apply" class="primary" type="button">Aplicar cambios</button></footer></section>`;

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
  <header class="home-topbar"><button class="home-back" title="Volver" aria-label="Volver">←</button><div class="home-mini-brand"><img src="${LOGO_URL}" alt=""/><strong>PhotoMania</strong></div><span class="home-top-divider"></span><span id="home-current">Nuevo proyecto</span><button class="home-preferences" id="home-preferences" title="Preferencias de PhotoMania">⚙ Preferencias</button></header>
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
  private activeId = '';
  private tool: Tool = 'brush';
  private brush = { rgb: [224, 48, 48] as [number, number, number], size: 24 };
  private stroke: StrokeSession | null = null;
  private last: { x: number; y: number } | null = null;
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
    root.insertAdjacentHTML('beforeend', PREFERENCES_TEMPLATE);
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
      root.querySelector('#home-current')!.textContent = labels[section];
      title.textContent = labels[section];
      if (section === 'recent') renderRecent();
    };
    const launch = async (name: string, w: number, h: number, file?: File) => {
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 8192 || h > 8192) { homeStatus.textContent = 'Usá dimensiones entre 1 y 8192 píxeles.'; return; }
      homeStatus.textContent = 'Iniciando PhotoMania…';
      try {
        root.innerHTML = TEMPLATE;
        root.insertAdjacentHTML('beforeend', PREFERENCES_TEMPLATE);
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
  private active(): LayerNode | undefined { return this.ctl.find(this.activeId); }

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
    const ctl = this.ctl;
    const list = this.root.querySelector<HTMLElement>('#history-list');
    const count = this.root.querySelector<HTMLElement>('#history-count');
    if (!list || !count) return;
    list.replaceChildren();
    const entries = ctl.historyEntries.slice(0, 30);
    count.textContent = String(entries.length);
    if (!entries.length) {
      const empty = document.createElement('div'); empty.className = 'history-empty'; empty.textContent = 'Sin acciones todavía'; list.append(empty);
    } else {
      entries.forEach((entry, index) => {
        const row = document.createElement('div'); row.className = 'history-entry' + (index === 0 ? ' current' : '');
        const marker = document.createElement('span'); marker.textContent = '▢';
        const label = document.createElement('span'); label.textContent = entry.label;
        const number = document.createElement('small'); number.textContent = String(entries.length - index).padStart(2, '0');
        row.append(marker, label, number); row.title = entry.label; list.append(row);
      });
    }
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

  /** Refleja opacidad/modo de la capa activa en los controles de la Toolbar (ids de Toolbar.ts). */
  private syncToolbarProps(): void {
    const layer = this.active();
    if (!layer) return;
    const value = String(Math.round(layer.opacity * 100));
    const toolbarOpacity = this.root.querySelector<HTMLInputElement>('#tb-opacity');
    const layerOpacity = this.root.querySelector<HTMLInputElement>('#layer-opacity');
    const blend = this.root.querySelector<HTMLSelectElement>('#tb-blend');
    const dockBlend = this.root.querySelector<HTMLSelectElement>('#dock-blend');
    if (toolbarOpacity) toolbarOpacity.value = value;
    if (layerOpacity) layerOpacity.value = value;
    if (blend) blend.value = String(blendModeFromManifest(layer.blendMode));
    if (dockBlend) dockBlend.value = layer.blendMode;
    const fillButton = this.root.querySelector<HTMLButtonElement>('#l-fill-color');
    const filterButton = this.root.querySelector<HTMLButtonElement>('#l-filter-options');
    const vectorButton = this.root.querySelector<HTMLButtonElement>('#l-vector-add');
    if (fillButton) { fillButton.hidden = layer.type !== 'fill'; fillButton.textContent = `Color ${layer.fillColor ?? '#ffffff'}…`; }
    if (filterButton) filterButton.hidden = layer.type !== 'filter';
    if (vectorButton) vectorButton.hidden = layer.type !== 'vector';
    const duplicate = this.root.querySelector<HTMLButtonElement>('#l-duplicate');
    const remove = this.root.querySelector<HTMLButtonElement>('#l-del');
    if (duplicate) duplicate.disabled = !layer;
    if (remove) remove.disabled = !layer;
    const canPaint = !!layer && (layer.type === 'paint' || layer.type === 'raster') && !this.ctl.isEffectivelyLocked(layer.id) && this.ctl.isEffectivelyVisible(layer.id);
    ['#t-brush', '#t-eraser', '#rail-brush', '#rail-eraser', '#tb-dark', '#tb-light'].forEach((selector) => {
      const button = this.root.querySelector<HTMLButtonElement>(selector);
      if (button) button.disabled = !canPaint;
    });
  }

  // ───────────── Panel de capas ─────────────

  private renderLayers(): void {
    const list = this.q('#layers');
    list.replaceChildren();
    const openLayerEffects = (layer: LayerNode) => {
      this.q<HTMLElement>('#effects-layer-name').textContent = layer.name;
      this.q<HTMLElement>('#effects-panel').hidden = false;
    };
    let total = 0;
    const renderTree = (container: HTMLElement, nodes: LayerNode[], depth: number) => {
      // La interfaz invierte el orden de apilado: la capa superior se muestra primero.
      for (const layer of [...nodes].reverse()) {
        total++;
        const row = document.createElement('div');
        row.className = 'layer' + (layer.id === this.activeId ? ' active' : '');
        row.dataset.layerId = layer.id;
        row.style.paddingLeft = `${5 + depth * 14}px`;
        row.title = `${this.layerTypeLabel(layer.type)} · ${layer.name}`;

        const visible = Object.assign(document.createElement('input'), { type: 'checkbox', checked: layer.visible });
        visible.title = 'Visibilidad'; visible.setAttribute('aria-label', `Visibilidad de ${layer.name}`);
        visible.onclick = (event) => event.stopPropagation();
        visible.onchange = () => {
          this.ctl.setProps(layer.id, { visible: visible.checked });
          this.ctl.comp.invalidateAll(); this.renderLayers(); this.updateHistoryUI(); this.scheduleRefresh();
        };

        const icon = document.createElement('span');
        icon.className = 'layer-type-icon';
        icon.textContent = layer.type === 'group' && layer.children.length ? '▾' : this.layerTypeIcon(layer.type);
        icon.title = this.layerTypeLabel(layer.type);

        const thumbnail = document.createElement('canvas');
        thumbnail.className = 'layer-thumbnail'; thumbnail.width = 52; thumbnail.height = 36;
        thumbnail.setAttribute('aria-label', `Miniatura de ${layer.name}`);
        this.drawLayerThumbnail(thumbnail, layer);

        const name = document.createElement('span');
        name.className = 'layer-name'; name.textContent = layer.name;
        name.title = 'Doble clic para renombrar o editar esta capa';
        name.ondblclick = (event) => { event.stopPropagation(); this.editLayerByType(layer); };

        const effects = document.createElement('button');
        effects.className = 'layer-effects-hit'; effects.type = 'button'; effects.textContent = 'fx';
        effects.title = 'Estilos de capa';
        effects.onclick = (event) => { event.stopPropagation(); this.activeId = layer.id; this.syncUI(); openLayerEffects(layer); };

        const lock = document.createElement('button');
        lock.type = 'button'; lock.textContent = layer.locked ? '🔒' : '🔓';
        lock.title = layer.locked ? 'Desbloquear capa' : 'Bloquear capa'; lock.setAttribute('aria-label', lock.title);
        lock.onclick = (event) => {
          event.stopPropagation();
          this.ctl.setProps(layer.id, { locked: !layer.locked });
          this.syncUI(); this.updateHistoryUI();
        };

        row.append(visible, icon, thumbnail, name, effects, lock);
        row.onclick = () => { this.activeId = layer.id; this.syncUI(); };
        row.oncontextmenu = (event) => { event.preventDefault(); this.activeId = layer.id; this.syncUI(); this.showLayerContextMenu(event.clientX, event.clientY, layer); };
        container.append(row);

        if (layer.type === 'group' && layer.children.length) {
          const children = document.createElement('div');
          children.className = 'layer-children';
          children.dataset.parentLayerId = layer.id;
          renderTree(children, layer.children, depth + 1);
          container.append(children);
        }
      }
    };
    renderTree(list, this.ctl.doc.layers, 0);
    const empty = this.root.querySelector<HTMLElement>('#layer-empty');
    if (empty) empty.hidden = total > 0;
  }

  private layerTypeLabel(type: LayerType): string {
    return ({ paint: 'Capa de pintura', raster: 'Capa de pintura', filter: 'Capa de filtro', fill: 'Capa de relleno', file: 'Capa de archivo incrustada', vector: 'Capa vectorial', group: 'Grupo de capas' })[type];
  }

  private layerTypeIcon(type: LayerType): string {
    return ({ paint: '✎', raster: '✎', filter: '◐', fill: '◧', file: '▧', vector: '◇', group: '▱' })[type];
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
    if (layer.type === 'file') {
      options.push([`Origen: ${layer.sourceName ?? layer.name}`, () => {}]);
      options.push(['Reemplazar imagen incrustada…', () => { void this.replaceFileLayer(layer); }]);
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
    if (type === 'fill') {
      const color = prompt('Color inicial de la capa de relleno', '#ffffff');
      if (!color) return;
      if (!/^#?[0-9a-f]{6}$/i.test(color.trim())) { alert('Color inválido; usá por ejemplo #ffffff.'); return; }
      const node = this.ctl.addLayer('fill', 'Relleno', undefined, -1, { fillColor: color.startsWith('#') ? color : `#${color}` });
      this.activeId = node.id;
    } else {
      const name = ({ paint: `Pintura ${this.ctl.doc.layers.length}`, filter: 'Filtro', vector: 'Vectorial', group: 'Grupo', raster: 'Capa' } as Record<LayerType, string>)[type];
      const node = this.ctl.addLayer(type, name);
      this.activeId = node.id;
      if (type === 'vector') this.editVectorLayer(node);
    }
    this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
  }

  private async createFileLayer(): Promise<void> {
    const file = await this.pickImageFile();
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const temp = document.createElement('canvas'); temp.width = this.ctl.doc.width; temp.height = this.ctl.doc.height;
      const ctx = temp.getContext('2d', { willReadFrequently: true });
      if (!ctx) { bitmap.close(); throw new Error('No se pudo leer la imagen para crear la capa de archivo.'); }
      // Conserva la proporción y el tamaño natural cuando entra en el lienzo; solo reduce si hace falta.
      const scale = Math.min(1, temp.width / bitmap.width, temp.height / bitmap.height);
      const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
      const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
      const x = Math.round((temp.width - drawWidth) / 2), y = Math.round((temp.height - drawHeight) / 2);
      ctx.clearRect(0, 0, temp.width, temp.height); ctx.drawImage(bitmap, x, y, drawWidth, drawHeight); bitmap.close();
      const pixels = new Uint8Array(ctx.getImageData(0, 0, temp.width, temp.height).data);
      const node = this.ctl.addFileLayer(file.name.replace(/\.[^.]+$/, '') || 'Archivo', pixels, file.name);
      this.activeId = node.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    } catch (error) { this.fail(error); }
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
    const file = await this.pickImageFile();
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = this.ctl.doc;
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { bitmap.close(); throw new Error('No se pudo preparar la imagen seleccionada.'); }
      const scale = Math.min(1, width / bitmap.width, height / bitmap.height);
      const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
      const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, Math.round((width - drawWidth) / 2), Math.round((height - drawHeight) / 2), drawWidth, drawHeight);
      bitmap.close();
      const pixels = new Uint8Array(ctx.getImageData(0, 0, width, height).data);
      if (this.ctl.replaceFileLayerContent(layer.id, pixels, file.name)) {
        this.activeId = layer.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      }
    } catch (error) { this.fail(error); }
  }

  private editVectorLayer(layer: LayerNode): void {
    if (layer.type !== 'vector') return;
    if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
    this.activeId = layer.id;
    this.vectorEditLayerId = layer.id;
    this.vectorDraft = (layer.vectorShapes ?? []).map((shape) => ({ ...shape }));
    this.vectorSelectedId = this.vectorDraft[0]?.id ?? null;
    this.q<HTMLElement>('#vector-layer-name').textContent = layer.name;
    this.renderVectorEditor();
    this.q<HTMLElement>('#vector-panel').hidden = false;
  }

  private renderVectorEditor(): void {
    const host = this.q<HTMLElement>('#vector-shape-list');
    host.replaceChildren();
    if (!this.vectorDraft.length) {
      const empty = document.createElement('p'); empty.className = 'hint'; empty.textContent = 'Todavía no hay objetos. Agregá una forma para empezar.'; host.append(empty);
    }
    for (const shape of this.vectorDraft) {
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.toggle('active', shape.id === this.vectorSelectedId);
      button.textContent = `${shape.kind === 'rectangle' ? '▭' : shape.kind === 'ellipse' ? '◯' : '／'}  ${shape.kind === 'rectangle' ? 'Rectángulo' : shape.kind === 'ellipse' ? 'Elipse' : 'Línea'} (${Math.round(shape.x)}, ${Math.round(shape.y)})`;
      button.onclick = () => { this.vectorSelectedId = shape.id; this.renderVectorEditor(); };
      host.append(button);
    }
    const shape = this.vectorDraft.find((item) => item.id === this.vectorSelectedId);
    const field = <T extends HTMLElement>(id: string) => this.q<T>(`#${id}`);
    const fields = ['vector-kind', 'vector-x', 'vector-y', 'vector-width', 'vector-height', 'vector-color', 'vector-opacity', 'vector-stroke', 'vector-delete-shape'];
    fields.forEach((id) => { field<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(id).disabled = !shape; });
    if (!shape) return;
    field<HTMLSelectElement>('vector-kind').value = shape.kind;
    field<HTMLInputElement>('vector-x').value = String(Math.round(shape.x));
    field<HTMLInputElement>('vector-y').value = String(Math.round(shape.y));
    field<HTMLInputElement>('vector-width').value = String(Math.round(shape.width));
    field<HTMLInputElement>('vector-height').value = String(Math.round(shape.height));
    field<HTMLInputElement>('vector-color').value = /^#[0-9a-f]{6}$/i.test(shape.color) ? shape.color : '#e03030';
    field<HTMLInputElement>('vector-opacity').value = String(Math.round(shape.opacity * 100));
    field<HTMLElement>('vector-opacity-value').textContent = `${Math.round(shape.opacity * 100)}%`;
    field<HTMLInputElement>('vector-stroke').value = String(Math.max(1, Math.round(shape.strokeWidth)));
  }

  private addVectorShape(kind: VectorShape['kind']): void {
    if (!this.vectorEditLayerId) return;
    const shape: VectorShape = {
      id: crypto.randomUUID(), kind,
      x: Math.round(this.ctl.doc.width * 0.25), y: Math.round(this.ctl.doc.height * 0.25),
      width: Math.max(1, Math.round(this.ctl.doc.width * 0.25)), height: Math.max(1, Math.round(this.ctl.doc.height * 0.25)),
      color: '#e03030', opacity: 1, strokeWidth: 4,
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
    shape.width = Math.max(1, val('vector-width', shape.width));
    shape.height = Math.max(1, val('vector-height', shape.height));
    shape.color = this.q<HTMLInputElement>('#vector-color').value;
    shape.opacity = Math.max(0, Math.min(1, val('vector-opacity', shape.opacity * 100) / 100));
    shape.strokeWidth = Math.max(1, Math.min(100, val('vector-stroke', shape.strokeWidth)));
    this.q<HTMLElement>('#vector-opacity-value').textContent = `${Math.round(shape.opacity * 100)}%`;
    // Actualiza solo la lista, sin reemplazar el control que acaba de recibir el evento.
    const index = this.vectorDraft.indexOf(shape);
    const listButton = this.q<HTMLElement>('#vector-shape-list').children[index] as HTMLButtonElement | undefined;
    if (listButton) listButton.textContent = `${shape.kind === 'rectangle' ? '▭' : shape.kind === 'ellipse' ? '◯' : '／'}  ${shape.kind === 'rectangle' ? 'Rectángulo' : shape.kind === 'ellipse' ? 'Elipse' : 'Línea'} (${Math.round(shape.x)}, ${Math.round(shape.y)})`;
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
    this.commitVectorShapes(layer, this.vectorDraft.map((shape) => ({ ...shape })));
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
    for (const shape of shapes) {
      ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, shape.opacity)); ctx.fillStyle = shape.color; ctx.strokeStyle = shape.color; ctx.lineWidth = shape.strokeWidth;
      if (shape.kind === 'rectangle') { ctx.fillRect(shape.x, shape.y, shape.width, shape.height); }
      else if (shape.kind === 'ellipse') { ctx.beginPath(); ctx.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, Math.abs(shape.width / 2), Math.abs(shape.height / 2), 0, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(shape.x, shape.y); ctx.lineTo(shape.x + shape.width, shape.y + shape.height); ctx.stroke(); }
      ctx.restore();
    }
    this.ctl.replaceVectorContent(layer.id, shapes, new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
    this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
  }

  private moveLayerById(id: string, delta: number): void {
    this.activeId = id;
    if (this.ctl.moveLayer(id, delta)) { this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh(); }
  }

  // ───────────── Eventos ─────────────

  private bind(): void {
    createToolbar(this.q('#toolbar'), {
      onBrush: (rgb, size) => { this.brush = { rgb, size }; },
      onBrightness: (delta) => {
        const l = this.active();
        if (!l || (l.type !== 'paint' && l.type !== 'raster') || this.ctl.isEffectivelyLocked(l.id) || !this.ctl.isEffectivelyVisible(l.id)) return;
        runEdit(this.ctx, l.engineId, 'Brillo', (layer) => layer.applyBrightness(delta));
        this.updateHistoryUI();
        if (this.hasFilterLayer()) this.scheduleRefresh();
      },
      onLayerProps: (opacity, blendMode) => {
        if (!this.active()) return;
        this.ctl.setProps(this.activeId, { opacity, blendMode: blendModeToManifest(blendMode) });
        this.syncToolbarProps(); this.renderLayers(); this.scheduleRefresh(); this.updateHistoryUI(); // cambia propiedades: el motor recompone todo el lienzo
      },
    });

    const on = (id: string, fn: () => void) => { this.q(id).onclick = fn; };
    const openPanel = (id: string) => { this.q<HTMLElement>('#' + id).hidden = false; };
    const menus = [
      { button: this.q<HTMLButtonElement>('#menu-file'), dropdown: this.q<HTMLElement>('#file-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-edit'), dropdown: this.q<HTMLElement>('#edit-menu-dropdown') },
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
        if ((e.target as HTMLElement).closest('button[role="menuitem"]')) closeMenu(menu);
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

    on('#menu-filter', () => this.openDestructiveFilterPanel());
    on('#menu-layer', () => openPanel('effects-panel'));
    on('#rail-brush', () => this.setTool('brush')); on('#rail-eraser', () => this.setTool('eraser'));
    this.root.querySelectorAll<HTMLElement>('[data-close]').forEach((el) => el.addEventListener('click', () => {
      const target = el.dataset.close; if (target) this.q<HTMLElement>('#' + target).hidden = true;
    }));
    this.q('#filters-panel').querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => button.onclick = () => {
      this.q('#filters-panel').querySelectorAll('[data-filter]').forEach((entry) => entry.classList.remove('active'));
      button.classList.add('active');
      const kind = button.dataset.filter as FilterKind;
      this.q<HTMLElement>('#filter-title').textContent = this.filterLabel(kind);
    });
    this.q<HTMLInputElement>('#filter-radius').oninput = (event) => {
      this.q('#filter-radius-value').textContent = `${(event.currentTarget as HTMLInputElement).value}%`;
    };
    this.q('#effects-apply').onclick = () => { this.q<HTMLElement>('#effects-panel').hidden = true; };
    this.q('#filter-apply').onclick = () => this.applyFilterDialog();
    this.q('#vector-panel').addEventListener('keydown', (event) => { if (event.key === 'Escape') this.cancelVectorEditor(); });

    on('#b-new', () => this.promptNew());
    on('#b-open', () => void this.open());
    on('#b-save', () => void this.save(false));
    on('#b-save-as', () => void this.save(true));
    on('#t-brush', () => this.setTool('brush'));
    on('#t-eraser', () => this.setTool('eraser'));
    on('#l-add', () => { const menu = this.q<HTMLElement>('#layer-create-menu'); menu.hidden = !menu.hidden; });
    this.q('#layer-create-menu').querySelectorAll<HTMLButtonElement>('[data-layer-type]').forEach((button) => {
      button.onclick = () => { void this.createLayerOfType(button.dataset.layerType as LayerType); };
    });
    on('#l-del', () => {
      if (this.stroke || !this.active()) return;
      this.ctl.removeLayer(this.activeId);
      this.activeId = this.topRaster()?.id ?? '';
      this.ctl.comp.invalidateAll(); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    });
    on('#l-duplicate', () => {
      if (this.stroke || !this.active()) return;
      const copy = this.ctl.duplicateLayer(this.activeId);
      if (copy) this.activeId = copy.id;
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    });
    on('#l-up', () => this.moveActive(+1));
    on('#l-down', () => this.moveActive(-1));
    on('#l-fill-color', () => { const layer = this.active(); if (layer?.type === 'fill') this.changeFillColor(layer); });
    on('#l-filter-options', () => { const layer = this.active(); if (layer?.type === 'filter') this.openFilterEditor(layer); });
    on('#l-vector-add', () => { const layer = this.active(); if (layer?.type === 'vector') this.editVectorLayer(layer); });
    on('#vector-add-rect', () => this.addVectorShape('rectangle'));
    on('#vector-add-ellipse', () => this.addVectorShape('ellipse'));
    on('#vector-add-line', () => this.addVectorShape('line'));
    on('#vector-delete-shape', () => this.deleteSelectedVectorShape());
    on('#vector-apply', () => this.applyVectorEditor());
    on('#vector-cancel', () => this.cancelVectorEditor());
    on('#vector-close', () => this.cancelVectorEditor());
    on('#vector-clear', () => { if (confirm('¿Vaciar todos los objetos de esta capa vectorial?')) { this.vectorDraft = []; this.vectorSelectedId = null; this.renderVectorEditor(); } });
    ['vector-kind','vector-x','vector-y','vector-width','vector-height','vector-color','vector-opacity','vector-stroke'].forEach((id) => {
      const input = this.q<HTMLInputElement | HTMLSelectElement>(`#${id}`);
      input.addEventListener(id === 'vector-opacity' ? 'input' : 'change', () => this.updateVectorShapeFromFields());
    });
    this.q<HTMLInputElement>('#layer-opacity').onchange = (event) => {
      const layer = this.active(); if (!layer) return;
      const opacity = Math.max(0, Math.min(100, Number((event.currentTarget as HTMLInputElement).value))) / 100;
      this.ctl.setProps(layer.id, { opacity }); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    };
    this.q<HTMLSelectElement>('#dock-blend').onchange = (event) => {
      const layer = this.active(); if (!layer) return;
      this.ctl.setProps(layer.id, { blendMode: (event.currentTarget as HTMLSelectElement).value as LayerNode['blendMode'] });
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    };
    document.addEventListener('pointerdown', (event) => {
      const menu = this.root.querySelector<HTMLElement>('#layer-create-menu');
      const add = this.root.querySelector<HTMLElement>('#l-add');
      if (menu && add && !menu.contains(event.target as Node) && !add.contains(event.target as Node)) menu.hidden = true;
    });

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.onPointerMove(e));
    c.addEventListener('pointerup', () => this.up());
    c.addEventListener('pointercancel', () => this.up());
    new ResizeObserver(() => this.scheduleRefresh()).observe(c);

    window.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); }
      else if (mod && k === 'y') { e.preventDefault(); this.doRedo(); }
      else if (mod && k === 's') { e.preventDefault(); void this.save(e.shiftKey); }
      else if (mod && k === 'o') { e.preventDefault(); void this.open(); }
      else if (mod && k === 'n') { e.preventDefault(); this.promptNew(); }
      else if (!mod && k === 'b') this.setTool('brush');
      else if (!mod && k === 'e') this.setTool('eraser');
    });
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
    const layer = this.active();
    if (!layer || (layer.type !== 'paint' && layer.type !== 'raster') || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id)) {
      const status = this.root.querySelector<HTMLElement>('#status');
      if (status && layer) status.textContent = layer.locked ? 'La capa está bloqueada' : !layer.visible ? 'La capa está oculta' : `${this.layerTypeLabel(layer.type)}: no admite pintura directa`;
      return;
    }
    this.tool = t;
    this.q('#t-brush').classList.toggle('on', t === 'brush');
    this.q('#t-eraser').classList.toggle('on', t === 'eraser');
    this.q('#rail-brush').classList.toggle('selected', t === 'brush');
    this.q('#rail-eraser').classList.toggle('selected', t === 'eraser');
  }

  private promptNew(): void {
    const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/.exec(prompt('Tamaño (ancho x alto)', '1280x720') ?? '');
    if (!m) return;
    const [w, h] = [Number(m[1]), Number(m[2])];
    if (w > 8192 || h > 8192) { alert('Máximo 8192×8192.'); return; }
    this.newDocument(w, h, 'Sin título');
  }

  // ───────────── Pincel ─────────────

  /** Coordenadas de pantalla -> píxeles del documento (misma lógica "contain" que el renderer). */
  private toDoc(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    const { width: dw, height: dh } = this.ctl.doc;
    const s = Math.min(r.width / dw, r.height / dh);
    return {
      x: (e.clientX - r.left - (r.width - dw * s) / 2) / s,
      y: (e.clientY - r.top - (r.height - dh * s) / 2) / s,
    };
  }

  private stamp(x: number, y: number): void {
    const [r, g, b] = this.brush.rgb;
    this.stroke?.stampDisc(x, y, this.brush.size / 2, r, g, b, 255, this.tool === 'eraser');
  }

  private down(e: PointerEvent): void {
    if (e.button !== 0 || this.stroke) return;
    const l = this.active();
    if (!l) return;
    if (l.type !== 'paint' && l.type !== 'raster') {
      this.q<HTMLElement>('#status').textContent = `${this.layerTypeLabel(l.type)}: no admite pintura directa`;
      return;
    }
    if (!this.ctl.isEffectivelyVisible(l.id) || this.ctl.isEffectivelyLocked(l.id)) {
      this.q<HTMLElement>('#status').textContent = this.ctl.isEffectivelyLocked(l.id) ? 'La capa o su grupo está bloqueado' : 'La capa o su grupo está oculto';
      return;
    }
    this.canvas.setPointerCapture(e.pointerId);
    this.stroke = new StrokeSession(this.ctx, l.engineId); // abre UNA acción de undo para todo el trazo
    this.last = this.toDoc(e);
    this.stamp(this.last.x, this.last.y);
  }

  private onPointerMove(e: PointerEvent): void {
    if (!this.stroke || !this.last) return;
    const p = this.toDoc(e);
    const step = Math.max(1, this.brush.size * 0.125);   // separación entre sellos (1/4 del radio)
    const dx = p.x - this.last.x, dy = p.y - this.last.y, dist = Math.hypot(dx, dy);
    if (dist < step) return;
    const n = Math.floor(dist / step);
    for (let i = 1; i <= n; i++) this.stamp(this.last.x + (dx * i * step) / dist, this.last.y + (dy * i * step) / dist);
    this.last = { x: this.last.x + (dx * n * step) / dist, y: this.last.y + (dy * n * step) / dist };
  }

  private up(): void {
    if (!this.stroke) return;
    this.stroke.end(this.tool === 'eraser' ? 'Borrador' : 'Pincel'); // sella la acción
    this.stroke = null;
    this.last = null;
    this.updateHistoryUI();
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
