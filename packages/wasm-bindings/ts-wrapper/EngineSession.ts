// EngineSession.ts — API limpia y tipada sobre Compositor + HistoryManager:
// añadir capas, escribir tiles, acciones deshacibles (Ctrl+Z) y volcado a la GPU.
// Es independiente de la UI: no sabe nada de DOM ni de WebGPU, solo recibe un callback de subida.

import type { NvtsEngineModule, Compositor, HistoryManager, TiledLayer } from '../build/engine.js';
import { flushDirtyTiles } from './DirtyTiles';
import type { HeapAccess } from './SafeMemory';
import type { BlendModeValue } from './BlendMode';

/** Recibe un tile (tileSize² RGBA8, stride tileSize*4). Úsalo dentro del callback: no lo guardes. */
export type TileUploader = (tx: number, ty: number, pixels: Uint8Array) => void;

export interface LayerProps { visible: boolean; opacity: number; blendMode: BlendModeValue }
export interface AddLayerOptions {
  /** id del grupo padre (0 = raíz). */
  parent?: number;
  /** Posición entre hermanos (0 = abajo). Por defecto, arriba del todo. */
  index?: number;
  group?: boolean;
}

export class EngineSession {
  readonly tileSize: number;
  private readonly comp: Compositor;
  private readonly history: HistoryManager;
  private readonly props = new Map<number, LayerProps>(); // el motor exige las 4 props juntas
  private readonly scratch: Uint8Array;                   // tile NO compartido, reutilizable
  private nextId = 1;
  private disposed = false;

  constructor(
    private readonly mod: NvtsEngineModule,
    private readonly heap: HeapAccess,
    readonly width: number,
    readonly height: number,
    historyMB = 512,
    /** Si tu backend de render acepta vistas sobre SharedArrayBuffer, true evita una copia por tile. */
    private readonly sharedUploadsOk = false,
  ) {
    this.tileSize = mod.TILE_SIZE;
    this.scratch = new Uint8Array(this.tileSize * this.tileSize * 4);
    this.comp = new mod.Compositor(width, height);
    this.history = new mod.HistoryManager(this.comp, historyMB); // siempre DESPUÉS del compositor
  }

  // ───────────── Capas ─────────────

  /** Crea una capa raster (o un grupo) y devuelve su id numérico. */
  addLayer(opts: AddLayerOptions = {}): number {
    this.alive();
    const id = this.nextId++;
    const parent = opts.parent ?? 0;
    const index = opts.index ?? -1;
    const ok = opts.group ? this.comp.addGroup(id, parent, index) : this.comp.addRaster(id, parent, index);
    if (!ok) throw new Error(`El motor rechazó crear la capa (el padre ${parent} no existe o no es un grupo)`);
    this.props.set(id, { visible: true, opacity: 1, blendMode: 0 });
    return id;
  }

  /** Borra la capa (y sus hijos). Vacía el historial: podría referirse a capas borradas. */
  removeLayer(id: number): boolean {
    this.alive();
    const ok = this.comp.removeLayer(id);
    if (ok) { this.props.delete(id); this.history.clear(); }
    return ok;
  }

  moveLayer(id: number, newParent: number, index: number): boolean {
    this.alive();
    return this.comp.moveLayer(id, newParent, index);
  }

  setLayerProps(id: number, patch: Partial<LayerProps>): boolean {
    this.alive();
    const cur = this.props.get(id);
    if (!cur) return false;
    const next: LayerProps = { ...cur, ...patch };
    next.opacity = Math.min(1, Math.max(0, next.opacity));
    if (!this.comp.setProps(id, next.visible, next.opacity, next.blendMode)) return false;
    this.props.set(id, next);
    return true;
  }

  // ───────────── Píxeles ─────────────

  /**
   * Escribe UN tile completo (tileSize² RGBA8 con stride tileSize*4). Los tiles del borde del lienzo
   * se recortan solos. Para que sea deshacible, llámalo dentro de edit() o entre beginAction()/commit().
   */
  writeTile(layerId: number, tx: number, ty: number, rgba: Uint8Array | Uint8ClampedArray): void {
    this.alive();
    const T = this.tileSize;
    if (rgba.length !== T * T * 4) throw new RangeError(`Un tile debe tener ${T * T * 4} bytes (recibidos ${rgba.length})`);
    const x = tx * T, y = ty * T;
    if (!Number.isInteger(tx) || !Number.isInteger(ty) || x < 0 || y < 0 || x >= this.width || y >= this.height) {
      throw new RangeError(`El tile (${tx}, ${ty}) está fuera del lienzo ${this.width}×${this.height}`);
    }
    const w = Math.min(T, this.width - x), h = Math.min(T, this.height - y);

    let src: Uint8Array | Uint8ClampedArray = rgba;
    if (w !== T || h !== T) { // tile del borde: el motor espera filas contiguas de w*4 bytes
      const packed = new Uint8Array(w * h * 4);
      for (let row = 0; row < h; row++) packed.set(rgba.subarray(row * T * 4, row * T * 4 + w * 4), row * w * 4);
      src = packed;
    }
    // JS -> memoria Wasm. Funciona igual si `src` o la memoria de Wasm son compartidas.
    if (!this.layer(layerId).writeRectFromJS(x, y, w, h, src)) throw new Error('El motor rechazó la escritura del tile');
  }

  /** Copia (NO vista, segura con SharedArrayBuffer) de un tile de la capa; null si el tile está vacío. */
  readTile(layerId: number, tx: number, ty: number): Uint8Array | null {
    this.alive();
    const ptr = this.layer(layerId).tilePtr(tx, ty);
    return ptr ? this.heap.copyOut(ptr, this.tileSize * this.tileSize * 4) : null;
  }

  /** Capa raster del motor para herramientas avanzadas (pincel, filtros). No llamar a delete(). */
  layer(id: number): TiledLayer {
    const l = this.comp.layer(id);
    if (!l) throw new Error(`La capa ${id} no existe o es un grupo`);
    return l;
  }

  // ───────────── Acciones deshacibles ─────────────

  /** Ejecuta `fn` como UNA acción deshacible. Si lanza, revierte lo editado. */
  edit<R>(layerId: number, label: string, fn: (layer: TiledLayer) => R): R {
    this.alive();
    if (!this.history.beginAction(layerId)) throw new Error('No se pudo abrir la acción (¿ya hay una abierta o la capa no existe?)');
    try {
      const result = fn(this.layer(layerId));
      this.history.saveState(label);
      return result;
    } catch (e) {
      this.history.cancelAction();
      throw e;
    }
  }

  /** Variante en pasos (para pinceladas: pointerdown / pointerup). */
  beginAction(layerId: number): boolean { this.alive(); return this.history.beginAction(layerId); }
  /** Sella la acción abierta; devuelve cuántos tiles cambiaron (0 = no se creó paso de undo). */
  commit(label: string): number { this.alive(); return this.history.saveState(label); }
  cancel(): void { this.alive(); this.history.cancelAction(); }

  /** Ctrl+Z. Si pasas `upload`, además recompone y sube solo los tiles afectados. */
  undo(upload?: TileUploader): boolean {
    this.alive();
    const ok = this.history.undo();
    if (ok && upload) this.refresh(upload);
    return ok;
  }

  /** Ctrl+Shift+Z / Ctrl+Y. */
  redo(upload?: TileUploader): boolean {
    this.alive();
    const ok = this.history.redo();
    if (ok && upload) this.refresh(upload);
    return ok;
  }

  get canUndo(): boolean { return this.history.canUndo(); }
  get canRedo(): boolean { return this.history.canRedo(); }
  get undoLabel(): string { return this.history.undoLabel(); }
  get redoLabel(): string { return this.history.redoLabel(); }

  // ───────────── Volcado a la GPU ─────────────

  /**
   * Recompone SOLO los tiles sucios y entrega a `upload` únicamente los tiles de salida que cambiaron.
   * Con memoria compartida (SharedArrayBuffer) cada tile se copia a un buffer NO compartido antes de
   * llamar a `upload`, porque muchas APIs web rechazan vistas compartidas (ver SafeMemory.ts).
   */
  refresh(upload: TileUploader): { composed: number; uploaded: number } {
    this.alive();
    const composed = this.comp.composite();
    const mustCopy = this.heap.shared && !this.sharedUploadsOk;
    const uploaded = flushDirtyTiles(this.mod, this.comp.output(), (tx, ty, pixels) => {
      if (mustCopy) { this.scratch.set(pixels); upload(tx, ty, this.scratch); }
      else upload(tx, ty, pixels);
    });
    return { composed, uploaded };
  }

  // ───────────── Ciclo de vida ─────────────

  /** Libera la memoria C++ (historial primero, luego el compositor). Obligatorio. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.history.delete();
    this.comp.delete();
  }
  [Symbol.dispose](): void { this.dispose(); }

  private alive(): void {
    if (this.disposed) throw new Error('EngineSession ya fue liberada');
  }
}
