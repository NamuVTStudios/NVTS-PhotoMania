// DocumentController.ts — Dueño del documento: árbol de capas (TS) + Compositor e HistoryManager (C++).
// La estructura vive aquí; los píxeles, en el motor. Cada LayerNode guarda su `engineId` numérico.
// El historial común registra tanto acciones de píxeles como cambios estructurales de capas.

import type { NvtsEngineModule, Compositor, HistoryManager, TiledLayer } from '@nvts/wasm-bindings';
import { blendModeFromManifest } from '@nvts/wasm-bindings';
import type { BlendMode as BlendName } from '@nvts/shared';
import type { DocumentState, LayerNode, UnpackedDocument } from './types';

const BLEND_NAMES: readonly BlendName[] = ['normal', 'multiply', 'screen', 'overlay'];
/** Valor numérico del motor (BlendMode.ts) -> nombre del manifest. */
export const blendModeToManifest = (v: number): BlendName => BLEND_NAMES[v] ?? 'normal';

export type LayerPatch = Partial<Pick<LayerNode, 'name' | 'visible' | 'locked' | 'opacity' | 'blendMode'>>;
type HistoryAction = { kind: 'pixels'; label: string } | { kind: 'structure'; label: string; undo: () => void; redo: () => void };
type LayerSnapshot = { node: LayerNode; parentId: string | null; index: number; pixels: Map<string, Uint8Array> };

export class DocumentController {
  readonly comp: Compositor;
  readonly history: HistoryManager;
  private nextEngineId = 1;
  private readonly nodes = new Map<string, LayerNode>();
  private undoStack: HistoryAction[] = [];
  private redoStack: HistoryAction[] = [];
  private replaying = false;

  private constructor(readonly mod: NvtsEngineModule, readonly doc: DocumentState, historyMB: number) {
    this.comp = new mod.Compositor(doc.width, doc.height);
    this.history = new mod.HistoryManager(this.comp, historyMB); // se crea DESPUÉS del compositor
  }

  /** Documento vacío (sin capas). */
  static create(mod: NvtsEngineModule, width: number, height: number, name = 'Sin título', historyMB = 512) {
    const doc: DocumentState = { id: crypto.randomUUID(), name, width, height, layers: [] };
    return new DocumentController(mod, doc, historyMB);
  }

  /** Reconstruye un documento leído de disco: crea las capas en el motor y carga sus píxeles. */
  static fromUnpacked(mod: NvtsEngineModule, u: UnpackedDocument, historyMB = 512) {
    const ctl = new DocumentController(mod, { ...u.doc, layers: [] }, historyMB);
    for (const layer of u.doc.layers) ctl.adopt(layer, null, u.pixels);
    ctl.undoStack = []; ctl.redoStack = [];
    return ctl;
  }

  // ── Consulta ──
  find(id: string): LayerNode | undefined { return this.nodes.get(id); }
  /** Capa raster del motor (referencia no propietaria: no llamar a delete()). */
  layerPixels(node: LayerNode): TiledLayer | null { return this.comp.layer(node.engineId); }

  /** Copia los píxeles de una capa a un Uint8Array nuevo. null si la capa está vacía (para no guardar ceros). */
  readPixels(node: LayerNode): Uint8Array | null {
    const l = this.layerPixels(node);
    if (!l || l.allocatedTiles() === 0) return null;
    const { width, height } = this.doc;
    const out = new Uint8Array(width * height * 4);
    return l.readRectToJS(0, 0, width, height, out) ? out : null;
  }

  // ── Estructura ──
  addRaster(name = 'Capa', parentId?: string, index = -1): LayerNode {
    const node = this.add('raster', name, parentId, index);
    if (!this.replaying) this.recordStructure(`Crear ${name}`, () => this.removeRaw(node.id), () => this.restoreRaw({ node: this.cloneNode(node), parentId: parentId ?? null, index: this.siblingsOf(node).indexOf(node), pixels: new Map() }));
    return node;
  }
  addGroup(name = 'Grupo', parentId?: string, index = -1): LayerNode {
    const node = this.add('group', name, parentId, index);
    if (!this.replaying) this.recordStructure(`Crear ${name}`, () => this.removeRaw(node.id), () => this.restoreRaw({ node: this.cloneNode(node), parentId: parentId ?? null, index: this.siblingsOf(node).indexOf(node), pixels: new Map() }));
    return node;
  }

  removeLayer(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const siblings = this.siblingsOf(node);
    const snapshot: LayerSnapshot = {
      node: this.cloneNode(node), parentId: this.parentOf(node)?.id ?? null, index: siblings.indexOf(node), pixels: new Map(),
    };
    const capture = (n: LayerNode) => { const px = this.readPixels(n); if (px) snapshot.pixels.set(n.id, px); n.children.forEach(capture); };
    capture(node);
    if (!this.removeRaw(id)) return false;
    if (!this.replaying) this.recordStructure(`Eliminar ${node.name}`, () => this.restoreRaw(snapshot), () => this.removeRaw(id));
    return true;
  }

  /** Mueve la capa `delta` posiciones entre sus hermanos (+1 = hacia arriba). */
  moveLayer(id: string, delta: number): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const siblings = this.siblingsOf(node), from = siblings.indexOf(node);
    const to = Math.max(0, Math.min(siblings.length - 1, from + delta));
    if (to === from) return false;
    if (!this.moveRaw(id, to)) return false;
    if (!this.replaying) this.recordStructure(`Mover ${node.name}`, () => this.moveRaw(id, from), () => this.moveRaw(id, to));
    return true;
  }

  setProps(id: string, patch: LayerPatch): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const before: LayerPatch = { name: node.name, visible: node.visible, locked: node.locked, opacity: node.opacity, blendMode: node.blendMode };
    Object.assign(node, patch);
    this.pushProps(node);
    if (!this.replaying) {
      const after: LayerPatch = { name: node.name, visible: node.visible, locked: node.locked, opacity: node.opacity, blendMode: node.blendMode };
      if (JSON.stringify(before) !== JSON.stringify(after)) this.recordStructure('Propiedades de capa', () => this.applyPatchRaw(id, before), () => this.applyPatchRaw(id, after));
    }
    return true;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string { return this.undoStack.at(-1)?.label ?? ''; }
  get redoLabel(): string { return this.redoStack.at(-1)?.label ?? ''; }
  get historyEntries(): Array<{ label: string; current: boolean }> {
    return [...this.undoStack].reverse().map((a, i) => ({ label: a.label, current: i === 0 }));
  }
  recordPixelAction(label: string): void {
    if (this.replaying) return;
    this.redoStack = []; this.undoStack.push({ kind: 'pixels', label });
  }
  undo(): 'pixels' | 'structure' | null {
    const action = this.undoStack.pop(); if (!action) return null;
    if (action.kind === 'pixels') { if (!this.history.undo()) { this.undoStack.push(action); return null; } }
    else { this.replaying = true; try { action.undo(); } finally { this.replaying = false; } this.comp.invalidateAll(); }
    this.redoStack.push(action); return action.kind;
  }
  redo(): 'pixels' | 'structure' | null {
    const action = this.redoStack.pop(); if (!action) return null;
    if (action.kind === 'pixels') { if (!this.history.redo()) { this.redoStack.push(action); return null; } }
    else { this.replaying = true; try { action.redo(); } finally { this.replaying = false; } this.comp.invalidateAll(); }
    this.undoStack.push(action); return action.kind;
  }
  clearHistory(): void { this.history.clear(); this.undoStack = []; this.redoStack = []; }

  /** Libera la memoria C++ (historial primero, luego el compositor). */
  dispose(): void {
    this.history.delete();
    this.comp.delete();
    this.nodes.clear();
  }

  // ── Internos ──
  private recordStructure(label: string, undo: () => void, redo: () => void): void {
    this.redoStack = []; this.undoStack.push({ kind: 'structure', label, undo, redo });
  }
  private cloneNode(n: LayerNode): LayerNode {
    return { ...n, children: n.children.map((c) => this.cloneNode(c)) };
  }
  private applyPatchRaw(id: string, patch: LayerPatch): void {
    const n = this.nodes.get(id); if (!n) return; Object.assign(n, patch); this.pushProps(n);
  }
  private moveRaw(id: string, index: number): boolean {
    const n = this.nodes.get(id); if (!n) return false;
    const siblings = this.siblingsOf(n), from = siblings.indexOf(n);
    if (from < 0) return false;
    const parentEngine = this.parentOf(n)?.engineId ?? 0;
    if (!this.comp.moveLayer(n.engineId, parentEngine, index)) return false;
    siblings.splice(from, 1); siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, n);
    return true;
  }
  private removeRaw(id: string): boolean {
    const n = this.nodes.get(id); if (!n) return false;
    if (!this.comp.removeLayer(n.engineId)) return false;
    const siblings = this.siblingsOf(n); siblings.splice(siblings.indexOf(n), 1);
    const forget = (x: LayerNode) => { this.nodes.delete(x.id); x.children.forEach(forget); }; forget(n); return true;
  }
  private restoreRaw(snapshot: LayerSnapshot): void {
    const parent = snapshot.parentId ? this.nodes.get(snapshot.parentId) ?? null : null;
    const insert = (src: LayerNode, parentNode: LayerNode | null, index: number): LayerNode => {
      const n: LayerNode = { ...src, children: [] };
      const at = Math.max(0, Math.min(index, (parentNode ? parentNode.children : this.doc.layers).length));
      const ok = n.type === 'group' ? this.comp.addGroup(n.engineId, parentNode?.engineId ?? 0, at) : this.comp.addRaster(n.engineId, parentNode?.engineId ?? 0, at);
      if (!ok) throw new Error(`No se pudo restaurar la capa ${n.name}`);
      (parentNode ? parentNode.children : this.doc.layers).splice(at, 0, n); this.nodes.set(n.id, n); this.nextEngineId = Math.max(this.nextEngineId, n.engineId + 1); this.pushProps(n);
      const px = snapshot.pixels.get(n.id); if (px && n.type === 'raster') this.layerPixels(n)?.loadFromRGBA(px);
      src.children.forEach((c, i) => { insert(c, n, i); });
      return n;
    };
    insert(snapshot.node, parent, snapshot.index);
  }
  private add(type: 'raster' | 'group', name: string, parentId: string | undefined, index: number): LayerNode {
    const parent = parentId ? this.nodes.get(parentId) ?? null : null;
    const node: LayerNode = {
      id: crypto.randomUUID(), engineId: this.nextEngineId++, type, name,
      visible: true, locked: false, opacity: 1, blendMode: 'normal', children: [],
    };
    const siblings = parent ? parent.children : this.doc.layers;
    const at = index < 0 || index > siblings.length ? siblings.length : index;
    const ok = type === 'group'
      ? this.comp.addGroup(node.engineId, parent?.engineId ?? 0, at)
      : this.comp.addRaster(node.engineId, parent?.engineId ?? 0, at);
    if (!ok) throw new Error(`El motor rechazó crear la capa "${name}"`);
    siblings.splice(at, 0, node);
    this.nodes.set(node.id, node);
    return node;
  }

  /** Inserta en el motor una capa (y su subárbol) leída de disco, cargando sus píxeles. */
  private adopt(src: LayerNode, parent: LayerNode | null, pixels: Map<string, Uint8Array>): void {
    const node = this.add(src.type, src.name, parent?.id, -1); // en orden: cada capa queda encima de la anterior
    this.nodes.delete(node.id);   // quita el id aleatorio que registró add()...
    Object.assign(node, { id: src.id, visible: src.visible, locked: src.locked, opacity: src.opacity, blendMode: src.blendMode });
    this.nodes.set(node.id, node); // ...y registra la capa con el id que traía el archivo
    this.pushProps(node);
    const px = pixels.get(src.id);
    if (px) this.layerPixels(node)?.loadFromRGBA(px);
    src.children.forEach((c) => this.adopt(c, node, pixels));
  }

  private pushProps(n: LayerNode): void {
    this.comp.setProps(n.engineId, n.visible, n.opacity, blendModeFromManifest(n.blendMode));
  }

  private parentOf(n: LayerNode): LayerNode | null {
    const find = (list: LayerNode[], parent: LayerNode | null): LayerNode | null | undefined => {
      for (const c of list) {
        if (c === n) return parent;
        const r = find(c.children, c);
        if (r !== undefined) return r;
      }
      return undefined;
    };
    return find(this.doc.layers, null) ?? null;
  }

  private siblingsOf(n: LayerNode): LayerNode[] {
    return this.parentOf(n)?.children ?? this.doc.layers;
  }
}
