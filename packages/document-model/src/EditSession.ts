// EditSession.ts — Puente UI -> motor para ediciones deshacibles.
// Regla de oro: abrir acción (beginAction) ANTES de editar; sellarla (saveState) al terminar.
// (Los alias '@nvts/...' asumen el package.json de cada paquete; ajusta a tus rutas.)

import type { NvtsEngineModule, Compositor, HistoryManager, TiledLayer } from '@nvts/wasm-bindings';
import { flushDirtyTiles } from '@nvts/wasm-bindings';

export interface EngineCtx {
  mod: NvtsEngineModule;
  comp: Compositor;
  history: HistoryManager;
  /** Sube un tile a la textura de WebGPU (ver DirtyTiles.ts / WebGPURenderer). */
  uploadTile: (tx: number, ty: number, pixels: Uint8Array) => void;
  render: () => void;
  /** Si existe, las pinceladas lo usan para agrupar el refresco en 1 vez por frame (rAF). */
  scheduleRefresh?: () => void;
}

/** Recompone los tiles sucios, sube a la GPU solo los de salida que cambiaron y dibuja. */
export function refresh(ctx: EngineCtx): void {
  ctx.comp.composite();
  flushDirtyTiles(ctx.mod, ctx.comp.output(), ctx.uploadTile);
  ctx.render();
}

/** Edición puntual (filtro, relleno, pegado...): una llamada = un paso de undo. */
export function runEdit(
  ctx: EngineCtx, layerId: number, label: string, edit: (layer: TiledLayer) => void,
): void {
  if (!ctx.history.beginAction(layerId)) return;   // 1) abre la acción (arma la captura)
  try {
    edit(ctx.comp.layer(layerId)!);                // 2) edita: el motor guarda los píxeles previos solo
    ctx.history.saveState(label);                  // 3) sella: solo los tiles que cambiaron
  } catch (e) {
    ctx.history.cancelAction();                    // si algo falla, revierte lo editado
    throw e;
  }
  refresh(ctx);
}

/** Pincelada: muchas escrituras (una por pointermove) = UN solo paso de undo. */
export class StrokeSession {
  private open: boolean;
  constructor(private ctx: EngineCtx, private layerId: number) {
    this.open = ctx.history.beginAction(layerId);  // pointerdown
  }
  addDab(x: number, y: number, w: number, h: number, rgba: Uint8Array): void {
    if (!this.open) return;
    this.ctx.comp.layer(this.layerId)!.writeRectFromJS(x, y, w, h, rgba);  // pointermove
    this.touch();
  }
  /** Pincel redondo (o borrador con erase=true) con mezcla en el motor. r,g,b,a en 0..255. */
  stampDisc(cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number, erase: boolean): void {
    if (!this.open) return;
    this.ctx.comp.layer(this.layerId)!.stampDisc(cx, cy, radius, r, g, b, a, erase);
    this.touch();
  }
  private touch(): void {
    if (this.ctx.scheduleRefresh) this.ctx.scheduleRefresh(); else refresh(this.ctx);
  }
  end(label = 'Pincel'): void {                    // pointerup
    if (this.open) this.ctx.history.saveState(label);
    this.open = false;
  }
  cancel(): void {                                 // Escape durante el trazo
    if (!this.open) return;
    this.ctx.history.cancelAction();
    this.open = false;
    refresh(this.ctx);
  }
}

export function undo(ctx: EngineCtx): void { if (ctx.history.undo()) refresh(ctx); }
export function redo(ctx: EngineCtx): void { if (ctx.history.redo()) refresh(ctx); }

/* Ejemplo de uso en la UI:

const history = new mod.HistoryManager(comp, 512);   // 512 MB de tope; crear DESPUÉS del compositor
const ctx: EngineCtx = { mod, comp, history, uploadTile, render: () => renderer.render() };

// Filtro de brillo sobre la capa 2 (un paso de undo):
runEdit(ctx, 2, 'Brillo', (layer) => layer.applyBrightness(40));

// Pincel:
canvas.onpointerdown = (e) => { stroke = new StrokeSession(ctx, activeLayerId); };
canvas.onpointermove = (e) => stroke?.addDab(e.offsetX - 8, e.offsetY - 8, 16, 16, dabRGBA);
canvas.onpointerup   = () => { stroke?.end('Pincel'); stroke = null; };

// Atajos y texto del menú Editar ("Deshacer Pincel"):
window.onkeydown = (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  e.shiftKey ? redo(ctx) : undo(ctx);
};
const menuText = history.canUndo() ? `Deshacer ${history.undoLabel()}` : 'Deshacer';

// Al cerrar el documento (orden importante):
history.delete(); comp.delete();
*/
