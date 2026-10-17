// App.ts — Ensambla todo: motor Wasm + renderer (WebGPU/WebGL2) + documento + guardado + UI.
// Todo corre en el hilo principal por ahora (mover el motor a un Worker es un paso posterior).
// Reutiliza createToolbar (Toolbar.ts) para color/tamaño/brillo/opacidad/modo.

import { EngineClient, blendModeFromManifest } from '@nvts/wasm-bindings';
import { createRenderer, type RendererBackend } from '@nvts/renderer';
import {
  DocumentController, blendModeToManifest, StrokeSession, refresh, runEdit,
  type EngineCtx, type LayerNode,
} from '@nvts/document-model';
import { openFromDisk, packNvtsPhoto, saveToDisk, unpackNvtsPhoto, listRecentProjects, loadRecentProject, rememberRecentProject, supportsFileSystemAccess, type RecentProjectInfo } from '@nvts/storage';
import { createToolbar } from './Toolbar';

type Tool = 'brush' | 'eraser';
const LOGO_URL = `${import.meta.env.BASE_URL}branding/photomania-icon.svg`;

const TEMPLATE = `
<header class="topbar">
  <div class="brand"><img class="app-logo" src="${LOGO_URL}" alt="NVTS PhotoMania"/><strong>PhotoMania</strong></div>
  <nav class="menus"><button id="menu-file">Archivo</button><button id="menu-edit">Editar</button><button id="menu-image">Imagen</button><button id="menu-layer">Capa</button><button id="menu-select">Seleccionar</button><button id="menu-filter">Filtro</button><button id="menu-view">Ver</button><button id="menu-help">Ayuda</button></nav>
  <div class="doc-title">Sin título <small id="doc-size">1280 × 720</small></div>
  <div class="top-actions"><button id="b-new">Nuevo</button><button id="b-open">Abrir</button><button id="b-save" class="primary">Guardar</button></div>
</header>
<div class="tool-options"><button id="t-brush" class="on">✎ Pincel</button><button id="t-eraser">◩ Borrador</button><div id="toolbar" class="toolbar"></div><span id="status"></span></div>
<main class="workspace">
  <aside class="tools-rail"><button title="Mover">➤</button><button title="Selección">▧</button><button id="rail-brush" class="selected" title="Pincel">✎</button><button id="rail-eraser" title="Borrador">⌫</button><button title="Pluma">♧</button><button title="Texto">T</button><button title="Formas">◯</button><button title="Cuentagotas">⌁</button><div class="swatches"><span></span><span></span></div></aside>
  <section class="canvas-area"><div class="canvas-label"><span id="canvas-name">Sin título</span><span id="canvas-meta">1280 × 720 px · RGB/8</span></div><div class="canvas-stage"><canvas id="canvas"></canvas></div><div class="zoom-controls"><button id="zoom-out">−</button><span id="zoom-value">Ajustar</span><button id="zoom-in">+</button><button id="zoom-fit">⛶ Ajustar</button></div></section>
  <aside class="right-dock">
    <section class="dock-panel history-panel"><header><span>⌄</span><strong>Historial</strong><span id="history-count" class="count">0</span><div class="panel-spacer"></div></header><div id="history-list" class="history-list"></div></section>
    <section class="dock-panel layers-panel"><header><strong>Capas</strong><div class="panel-spacer"></div><select id="dock-blend" aria-label="Modo de fusión"><option value="normal">Normal</option><option value="multiply">Multiplicar</option><option value="screen">Trama</option><option value="overlay">Superponer</option></select></header>
      <div class="layer-props"><label>Opacidad <input id="tb-opacity" type="number" min="0" max="100" value="100"/>%</label><label>Relleno <input id="layer-fill" type="number" min="0" max="100" value="100"/>%</label></div>
      <div id="layers"></div><div class="layer-empty" id="layer-empty">◇<strong>Capas de imagen</strong><span>Seleccioná una capa o creá una nueva.</span></div>
      <footer><button id="l-up" title="Subir capa">↑</button><button id="l-down" title="Bajar capa">↓</button><button id="l-del" title="Eliminar capa">▤−</button><button id="l-add" class="primary">＋ Nueva capa</button></footer>
    </section>
  </aside>
</main>
<section id="effects-panel" class="editor-panel" hidden><header><strong>✧ Estilos de capa</strong><span id="effects-layer-name"></span><button class="panel-close" data-close="effects-panel">×</button></header><div class="editor-content"><aside class="editor-list"><button class="active">□ Trazo</button><button>□ Superposición de colores</button><button>□ Superposición de degradados</button><button>□ Resplandor exterior</button><button>□ Bisel y relieve</button></aside><div class="editor-settings"><strong>Trazo</strong><label>Tamaño <input type="range" min="1" max="40" value="3"/><output>3 px</output></label><label>Opacidad <input type="range" min="0" max="100" value="100"/><output>100%</output></label><label>Posición <select><option>Exterior</option><option>Interior</option><option>Centro</option></select></label><label>Color <input type="color" value="#000000"/></label></div></div><footer><span>Vista previa en vivo</span><button data-close="effects-panel">Cancelar</button><button class="primary" id="effects-apply">Aplicar</button></footer></section>
<section id="filters-panel" class="editor-panel" hidden><header><strong>⚒ Filtros</strong><span id="filters-layer-name"></span><button class="panel-close" data-close="filters-panel">×</button></header><div class="editor-content"><aside class="editor-list"><button class="active" data-filter="blur">Desenfoque gaussiano</button><button data-filter="sharpen">Enfocar</button><button data-filter="noise">Añadir ruido</button><button data-filter="pixelate">Pixelar</button></aside><div class="editor-settings"><strong id="filter-title">Desenfoque gaussiano</strong><label>Radio <input id="filter-radius" type="range" min="1" max="30" value="4"/><output id="filter-radius-value">4 px</output></label><p class="hint">Los filtros se aplicarán a la capa rasterizada activa cuando el motor correspondiente esté disponible.</p></div></div><footer><span>Vista previa</span><button data-close="filters-panel">Cancelar</button><button class="primary" id="filter-apply">Aplicar</button></footer></section>`;

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
  <header class="home-topbar"><button class="home-back" title="Volver" aria-label="Volver">←</button><div class="home-mini-brand"><img src="${LOGO_URL}" alt=""/><strong>PhotoMania</strong></div><span class="home-top-divider"></span><span id="home-current">Nuevo proyecto</span><button class="home-language" title="Idioma">◎ ES</button></header>
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

  private constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: EngineClient,
    private readonly renderer: RendererBackend,
  ) { }

  static async start(root: HTMLElement, wasmBase = '/wasm/'): Promise<void> {
    // La pantalla de bienvenida no inicializa el motor Wasm hasta que el usuario abre/crea un documento.
    root.innerHTML = HOME_TEMPLATE;
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
    const refreshRecent = async () => {
      try { recentItems = await listRecentProjects(); }
      catch (error) { console.warn('No se pudieron cargar los proyectos recientes:', error); recentItems = []; }
      renderRecent();
    };
    const renderRecent = () => {
      const host = root.querySelector<HTMLElement>('#home-recents')!;
      host.replaceChildren();
      root.querySelector<HTMLElement>('#home-recent-count')!.textContent = String(recentItems.length);
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
        const canvas = root.querySelector<HTMLCanvasElement>('#canvas')!;
        const [engine, renderer] = await Promise.all([EngineClient.create(wasmBase), createRenderer(canvas)]);
        const app = new App(root, canvas, engine, renderer);
        app.bind(); app.newDocument(w, h, name);
        if (file && /\.nvtsphoto$/i.test(file.name)) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const unpacked = unpackNvtsPhoto(bytes);
          app.setDocument(DocumentController.fromUnpacked(engine.module, unpacked));
          await rememberRecentProject(unpacked.doc, bytes).catch((error) => console.warn('No se pudo guardar la copia reciente:', error));
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
    const layer = this.ctl.doc.layers.find((l) => l.name === 'Capa 1' && l.type === 'raster');
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

  private topRaster(): LayerNode | undefined {
    return [...this.ctl.doc.layers].reverse().find((l) => l.type === 'raster');
  }
  private active(): LayerNode | undefined { return this.ctl.find(this.activeId); }

  // ───────────── Refresco ─────────────

  private scheduleRefresh(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; refresh(this.ctx); });
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
    if (!this.ctl) return;
    if (this.recentSaveTimer !== null) clearTimeout(this.recentSaveTimer);
    const doc = this.ctl.doc;
    let rasterLayers = 0;
    const countRaster = (nodes: LayerNode[]) => nodes.forEach((node) => { if (node.type === 'raster') rasterLayers++; countRaster(node.children); });
    countRaster(doc.layers);
    // Evita copiar potencialmente cientos de MiB en cada pausa de edición; esos proyectos se guardan al pulsar Guardar.
    if (doc.width * doc.height * Math.max(1, rasterLayers) * 4 > 64 * 1024 * 1024) return;
    this.recentSaveTimer = setTimeout(() => {
      this.recentSaveTimer = null;
      const current = this.ctl;
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
    const l = this.active();
    const opacity = this.root.querySelector<HTMLInputElement>('#tb-opacity');
    const blend = this.root.querySelector<HTMLSelectElement>('#tb-blend');
    if (!l || !opacity || !blend) return;
    opacity.value = String(Math.round(l.opacity * 100));
    blend.value = String(blendModeFromManifest(l.blendMode));
  }

  // ───────────── Panel de capas ─────────────

  private renderLayers(): void {
    const list = this.q('#layers');
    list.replaceChildren();
    const openLayerEffects = () => { this.q<HTMLElement>('#effects-layer-name').textContent = this.active()?.name ?? ''; this.q<HTMLElement>('#effects-panel').hidden = false; };
    for (const l of [...this.ctl.doc.layers].reverse()) { // arriba del todo primero
      const row = document.createElement('div');
      row.className = 'layer' + (l.id === this.activeId ? ' active' : '');
      const vis = Object.assign(document.createElement('input'), { type: 'checkbox', checked: l.visible, title: 'Visible' });
      vis.onclick = (e) => {
        e.stopPropagation();
        this.ctl.setProps(l.id, { visible: vis.checked });
        this.scheduleRefresh(); this.updateHistoryUI();
      };
      const name = document.createElement('span');
      const lock = document.createElement('button');
      name.textContent = l.name; // textContent: los nombres vienen de archivos
      const effects = document.createElement('button'); effects.className = 'layer-effects-hit'; effects.type = 'button'; effects.textContent = 'fx'; effects.title = 'Estilos de capa (doble clic)'; effects.onclick = (e) => { e.stopPropagation(); this.activeId = l.id; this.renderLayers(); this.syncToolbarProps(); openLayerEffects(); };
      row.append(vis, name, effects, lock);
      row.onclick = () => { this.activeId = l.id; this.renderLayers(); this.syncToolbarProps(); };
      row.ondblclick = (e) => { if ((e.target as HTMLElement).closest('.layer-effects-hit')) openLayerEffects(); };
      row.oncontextmenu = (e) => { e.preventDefault(); this.activeId = l.id; this.renderLayers(); this.syncToolbarProps(); this.q<HTMLElement>('#effects-layer-name').textContent = l.name; this.q<HTMLElement>('#effects-panel').hidden = false; };
      list.append(row);
      lock.type = 'button';
      lock.textContent = l.locked ? '🔒' : '🔓';
      lock.title = l.locked ? 'Desbloquear capa' : 'Bloquear capa';
      lock.setAttribute('aria-label', lock.title);
      lock.onclick = (e) => {
        e.stopPropagation();
        this.ctl.setProps(l.id, { locked: !l.locked });
        this.renderLayers(); this.updateHistoryUI();
      };
    }
  }

  // ───────────── Eventos ─────────────

  private bind(): void {
    createToolbar(this.q('#toolbar'), {
      onBrush: (rgb, size) => { this.brush = { rgb, size }; },
      onBrightness: (delta) => {
        const l = this.active();
        if (!l || l.type !== 'raster' || l.locked) return;
        runEdit(this.ctx, l.engineId, 'Brillo', (layer) => layer.applyBrightness(delta));
        this.updateHistoryUI();
      },
      onLayerProps: (opacity, blendMode) => {
        if (!this.active()) return;
        this.ctl.setProps(this.activeId, { opacity, blendMode: blendModeToManifest(blendMode) });
        this.scheduleRefresh(); this.updateHistoryUI(); // cambia propiedades: el motor recompone todo el lienzo
      },
    });

    const on = (id: string, fn: () => void) => { this.q(id).onclick = fn; };
    const openPanel = (id: string) => { this.q<HTMLElement>('#' + id).hidden = false; };
    on('#menu-filter', () => openPanel('filters-panel'));
    on('#menu-layer', () => openPanel('effects-panel'));
    on('#rail-brush', () => this.setTool('brush')); on('#rail-eraser', () => this.setTool('eraser'));
    this.root.querySelectorAll<HTMLElement>('[data-close]').forEach((el) => el.addEventListener('click', () => {
      const target = el.dataset.close; if (target) this.q<HTMLElement>('#' + target).hidden = true;
    }));
    this.q('#filters-panel').querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => btn.onclick = () => {
      this.q('#filters-panel').querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      this.q('#filter-title').textContent = btn.textContent || 'Filtro';
    });
    this.q<HTMLInputElement>('#filter-radius').oninput = (e) => {
      this.q('#filter-radius-value').textContent = `${(e.currentTarget as HTMLInputElement).value} px`;
    };
    this.q('#effects-apply').onclick = () => { this.q<HTMLElement>('#effects-panel').hidden = true; };
    this.q('#filter-apply').onclick = () => { this.q<HTMLElement>('#filters-panel').hidden = true; };

    on('#b-new', () => this.promptNew());
    on('#b-open', () => void this.open());
    on('#b-save', () => void this.save(false));
    on('#t-brush', () => this.setTool('brush'));
    on('#t-eraser', () => this.setTool('eraser'));
    on('#l-add', () => {
      this.activeId = this.ctl.addRaster(`Capa ${this.ctl.doc.layers.length}`).id;
      this.syncUI();
    });
    on('#l-del', () => {
      if (this.stroke || !this.active() || this.ctl.doc.layers.length <= 1) return;
      this.ctl.removeLayer(this.activeId);
      this.activeId = this.topRaster()?.id ?? '';
      this.ctl.comp.invalidateAll();
      this.syncUI();
      this.scheduleRefresh();
    });
    on('#l-up', () => this.moveActive(+1));
    on('#l-down', () => this.moveActive(-1));

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
    this.tool = t;
    this.q('#t-brush').classList.toggle('on', t === 'brush');
    this.q('#t-eraser').classList.toggle('on', t === 'eraser');
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
    if (!l || l.type !== 'raster' || !l.visible || l.locked) return; // no se pinta en capas ocultas/bloqueadas
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
    if (kind === 'pixels') refresh(this.ctx);
    else if (kind === 'structure') { this.activeId = this.topRaster()?.id ?? ''; this.syncUI(); this.scheduleRefresh(); }
    this.updateHistoryUI();
  }
  private doRedo(): void {
    if (this.stroke) return;
    const kind = this.ctl.redo();
    if (kind === 'pixels') refresh(this.ctx);
    else if (kind === 'structure') { this.activeId = this.topRaster()?.id ?? ''; this.syncUI(); this.scheduleRefresh(); }
    this.updateHistoryUI();
  }

  private async save(asNew: boolean): Promise<void> {
    if (this.stroke) return;
    try {
      const doc = this.ctl.doc;
      const read = (layer: LayerNode) => this.ctl.readPixels(layer);
      const bytes = packNvtsPhoto(doc, read);
      const h = await saveToDisk(doc, read, asNew ? undefined : this.fileHandle ?? undefined, bytes);
      if (supportsFileSystemAccess() && !h) return; // el usuario canceló el diálogo de Guardar
      if (h) this.fileHandle = h;
      await rememberRecentProject(doc, bytes).catch((error) => console.warn('El archivo se guardó, pero no se pudo actualizar Proyectos recientes:', error));
      this.q<HTMLElement>('#status').textContent = `Guardado · ${doc.width}×${doc.height}`;
    } catch (e) { this.fail(e); }
  }

  private async open(): Promise<void> {
    if (this.stroke) return;
    try {
      const res = await openFromDisk();
      if (!res) return;
      this.fileHandle = res.handle;
      this.setDocument(DocumentController.fromUnpacked(this.engine.module, res));
      await rememberRecentProject(res.doc, res.bytes).catch((error) => console.warn('No se pudo actualizar Proyectos recientes:', error));
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
