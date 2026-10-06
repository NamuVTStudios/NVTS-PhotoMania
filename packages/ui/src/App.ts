// App.ts — Ensambla todo: motor Wasm + renderer (WebGPU/WebGL2) + documento + guardado + UI.
// Todo corre en el hilo principal por ahora (mover el motor a un Worker es un paso posterior).
// Reutiliza createToolbar (Toolbar.ts) para color/tamaño/brillo/opacidad/modo/deshacer.

import { EngineClient, blendModeFromManifest } from '@nvts/wasm-bindings';
import { createRenderer, type RendererBackend } from '@nvts/renderer';
import {
  DocumentController, blendModeToManifest, StrokeSession, refresh, runEdit, undo, redo,
  type EngineCtx, type LayerNode,
} from '@nvts/document-model';
import { openFromDisk, saveToDisk } from '@nvts/storage';
import { createToolbar, type ToolbarApi } from './Toolbar';

type Tool = 'brush' | 'eraser';

const TEMPLATE = `
<header class="bar">
  <strong>NVTS Photomania</strong>
  <button id="b-new">Nuevo</button><button id="b-open">Abrir</button><button id="b-save">Guardar</button>
  <span class="sep"></span>
  <button id="t-brush" class="on">Pincel (B)</button><button id="t-eraser">Borrador (E)</button>
  <span class="sep"></span>
  <div id="toolbar" class="toolbar"></div>
  <span id="status"></span>
</header>
<main class="main">
  <canvas id="canvas"></canvas>
  <aside class="side">
    <h3>Capas</h3>
    <div id="layers"></div>
    <div class="row">
      <button id="l-add">+ Capa</button><button id="l-del">Eliminar</button>
      <button id="l-up" title="Subir">▲</button><button id="l-down" title="Bajar">▼</button>
    </div>
  </aside>
</main>`;

export class App {
  private ctl!: DocumentController;
  private ctx!: EngineCtx;
  private toolbar!: ToolbarApi;
  private fileHandle: FileSystemFileHandle | null = null;
  private activeId = '';
  private tool: Tool = 'brush';
  private brush = { rgb: [224, 48, 48] as [number, number, number], size: 24 };
  private stroke: StrokeSession | null = null;
  private last: { x: number; y: number } | null = null;
  private raf = 0;

  private constructor(
    private readonly root: HTMLElement,
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: EngineClient,
    private readonly renderer: RendererBackend,
  ) {}

  static async start(root: HTMLElement, wasmBase = '/wasm/'): Promise<App> {
    root.innerHTML = TEMPLATE; // marcado estático: sin contenido del usuario
    const canvas = root.querySelector<HTMLCanvasElement>('#canvas')!;
    const [engine, renderer] = await Promise.all([EngineClient.create(wasmBase), createRenderer(canvas)]);
    const app = new App(root, canvas, engine, renderer);
    app.bind();
    app.newDocument(1280, 720);
    return app;
  }

  // ───────────── Documento ─────────────

  private newDocument(w: number, h: number): void {
    const ctl = DocumentController.create(this.engine.module, w, h);
    const bg = ctl.addRaster('Fondo');
    ctl.layerPixels(bg)!.loadFromRGBA(new Uint8Array(w * h * 4).fill(255)); // fondo blanco
    ctl.addRaster('Capa 1');
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
    this.renderLayers();
    this.syncToolbarProps();
    this.updateHistoryUI();
    this.q('#status').textContent =
      `${this.renderer.kind === 'webgpu' ? 'WebGPU' : 'WebGL2'} · ${this.ctl.doc.width}×${this.ctl.doc.height}`;
  }

  private updateHistoryUI(): void {
    const h = this.ctl.history;
    this.toolbar.setHistoryState({
      canUndo: h.canUndo(), canRedo: h.canRedo(), undoLabel: h.undoLabel(), redoLabel: h.redoLabel(),
    });
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
    for (const l of [...this.ctl.doc.layers].reverse()) { // arriba del todo primero
      const row = document.createElement('div');
      row.className = 'layer' + (l.id === this.activeId ? ' active' : '');
      const vis = Object.assign(document.createElement('input'), { type: 'checkbox', checked: l.visible, title: 'Visible' });
      vis.onclick = (e) => {
        e.stopPropagation();
        this.ctl.setProps(l.id, { visible: vis.checked });
        this.scheduleRefresh();
      };
      const name = document.createElement('span');
      name.textContent = l.name; // textContent: los nombres vienen de archivos
      row.append(vis, name);
      row.onclick = () => { this.activeId = l.id; this.renderLayers(); this.syncToolbarProps(); };
      list.append(row);
    }
  }

  // ───────────── Eventos ─────────────

  private bind(): void {
    this.toolbar = createToolbar(this.q('#toolbar'), {
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
        this.scheduleRefresh(); // cambia propiedades: el motor recompone todo el lienzo
      },
      onUndo: () => this.doUndo(),
      onRedo: () => this.doRedo(),
    });

    const on = (id: string, fn: () => void) => { this.q(id).onclick = fn; };
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
      this.scheduleRefresh();
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
    this.newDocument(w, h);
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

  private doUndo(): void { if (!this.stroke) { undo(this.ctx); this.updateHistoryUI(); } }
  private doRedo(): void { if (!this.stroke) { redo(this.ctx); this.updateHistoryUI(); } }

  private async save(asNew: boolean): Promise<void> {
    if (this.stroke) return;
    try {
      const h = await saveToDisk(this.ctl.doc, (l) => this.ctl.readPixels(l), asNew ? undefined : this.fileHandle ?? undefined);
      if (h) this.fileHandle = h;
    } catch (e) { this.fail(e); }
  }

  private async open(): Promise<void> {
    if (this.stroke) return;
    try {
      const res = await openFromDisk();
      if (!res) return;
      this.fileHandle = res.handle;
      this.setDocument(DocumentController.fromUnpacked(this.engine.module, res));
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
