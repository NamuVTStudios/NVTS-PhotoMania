// Dueño del documento: árbol de capas + compositor/historial Wasm.
// Las capas filter se representan como nodos transparentes en Wasm y se componen de forma no destructiva en UI.
import type { NvtsEngineModule, Compositor, HistoryManager, TiledLayer } from '@nvts/wasm-bindings';
import { blendModeFromManifest } from '@nvts/wasm-bindings';
import type { BlendMode as BlendName, FilterKind, LayerType, VectorShape } from '@nvts/shared';
import { isPixelLayerType } from '@nvts/shared';
import type { DocumentState, LayerNode, UnpackedDocument } from './types';

const BLEND_NAMES: readonly BlendName[] = ['normal', 'multiply', 'screen', 'overlay'];
export const blendModeToManifest = (v: number): BlendName => BLEND_NAMES[v] ?? 'normal';
export type LayerPatch = Partial<Pick<LayerNode,
  'name' | 'visible' | 'locked' | 'opacity' | 'blendMode' | 'fillColor' | 'filterKind' | 'filterStrength' | 'vectorShapes' | 'sourceName' | 'sourceLinkId' | 'sourceLastModified' | 'sourceFileSize'>>;
type HistoryAction = { kind: 'pixels'; label: string } | { kind: 'structure'; label: string; undo: () => void; redo: () => void };
type LayerSnapshot = { node: LayerNode; parentId: string | null; index: number; pixels: Map<string, Uint8Array> };

const cloneShapes = (shapes: VectorShape[] | undefined): VectorShape[] => (shapes ?? []).map((s) => ({ ...s, points: s.points?.map((point) => ({ ...point })) }));
const clonePatch = (n: LayerNode): LayerPatch => ({
  name: n.name, visible: n.visible, locked: n.locked, opacity: n.opacity, blendMode: n.blendMode,
  fillColor: n.fillColor, filterKind: n.filterKind, filterStrength: n.filterStrength,
  vectorShapes: cloneShapes(n.vectorShapes), sourceName: n.sourceName, sourceLinkId: n.sourceLinkId, sourceLastModified: n.sourceLastModified, sourceFileSize: n.sourceFileSize,
});

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
    this.history = new mod.HistoryManager(this.comp, historyMB);
  }

  static create(mod: NvtsEngineModule, width: number, height: number, name = 'Sin título', historyMB = 512) {
    const doc: DocumentState = { id: crypto.randomUUID(), name, width, height, layers: [] };
    return new DocumentController(mod, doc, historyMB);
  }

  static fromUnpacked(mod: NvtsEngineModule, u: UnpackedDocument, historyMB = 512) {
    const ctl = new DocumentController(mod, { ...u.doc, layers: [] }, historyMB);
    for (const layer of u.doc.layers) ctl.adopt(layer, null, u.pixels);
    ctl.undoStack = []; ctl.redoStack = [];
    return ctl;
  }

  find(id: string): LayerNode | undefined { return this.nodes.get(id); }
  isEffectivelyLocked(id: string): boolean {
    let node = this.nodes.get(id);
    while (node) { if (node.locked) return true; node = this.parentOf(node) ?? undefined; }
    return false;
  }
  isEffectivelyVisible(id: string): boolean {
    let node = this.nodes.get(id);
    if (!node) return false;
    while (node) { if (!node.visible) return false; node = this.parentOf(node) ?? undefined; }
    return true;
  }
  layerPixels(node: LayerNode): TiledLayer | null { return this.comp.layer(node.engineId); }

  readPixels(node: LayerNode): Uint8Array | null {
    if (!isPixelLayerType(node.type)) return null;
    const l = this.layerPixels(node);
    if (!l || l.allocatedTiles() === 0) return null;
    const { width, height } = this.doc;
    const out = new Uint8Array(width * height * 4);
    return l.readRectToJS(0, 0, width, height, out) ? out : null;
  }

  /** Copia píxeles de una región, útil para componer por tiles. */
  readLayerRect(node: LayerNode, x: number, y: number, width: number, height: number, target: Uint8Array): boolean {
    if (!isPixelLayerType(node.type)) { target.fill(0); return false; }
    const layer = this.layerPixels(node);
    if (!layer) { target.fill(0); return false; }
    return layer.readRectToJS(x, y, width, height, target);
  }

  // ── Crear capas ──
  addRaster(name = 'Capa', parentId?: string, index = -1): LayerNode { return this.addLayer('paint', name, parentId, index); }

  addLayer(type: LayerType, name?: string, parentId?: string, index = -1, extras: Partial<LayerNode> = {}): LayerNode {
    if (type === 'group') return this.addGroup(name ?? 'Grupo', parentId, index);
    const defaults: Partial<LayerNode> = {};
    if (type === 'filter') { defaults.filterKind = 'grayscale'; defaults.filterStrength = 1; }
    if (type === 'fill') defaults.fillColor = '#ffffff';
    if (type === 'vector') defaults.vectorShapes = [];
    Object.assign(defaults, extras);
    const label = name ?? ({ paint: 'Capa de pintura', filter: 'Capa de filtro', fill: 'Capa de relleno', file: 'Capa de archivo', vector: 'Capa vectorial', raster: 'Capa' }[type]);
    const node = this.add(type, label, parentId, index, defaults);
    if (type === 'fill') this.fillLayerPixelsRaw(node, node.fillColor ?? '#ffffff');
    if (!this.replaying) {
      const snapshot = this.snapshot(node);
      this.recordStructure(`Crear ${this.typeLabel(type)} «${label}»`, () => this.removeRaw(node.id), () => this.restoreRaw(snapshot));
    }
    return node;
  }

  addFileLayer(name: string, pixels: Uint8Array, sourceName: string, sourceLinkId?: string, sourceLastModified?: number, sourceFileSize?: number): LayerNode {
    const node = this.add('file', name, undefined, -1, { sourceName, sourceLinkId, sourceLastModified, sourceFileSize });
    const surface = this.layerPixels(node);
    if (!surface || !surface.loadFromRGBA(pixels)) {
      this.removeRaw(node.id);
      throw new Error('No se pudo cargar la imagen en la capa de archivo.');
    }
    const snapshot = this.snapshot(node);
    if (!this.replaying) this.recordStructure(`Crear capa de archivo «${name}»`, () => this.removeRaw(node.id), () => this.restoreRaw(snapshot));
    return node;
  }

  addGroup(name = 'Grupo', parentId?: string, index = -1): LayerNode {
    const node = this.add('group', name, parentId, index);
    if (!this.replaying) {
      const snapshot = this.snapshot(node);
      this.recordStructure(`Crear grupo «${name}»`, () => this.removeRaw(node.id), () => this.restoreRaw(snapshot));
    }
    return node;
  }

  /** Sustituye la imagen incrustada de una capa de archivo como una sola acción de historial. */
  replaceFileLayerContent(id: string, pixels: Uint8Array, sourceName: string, sourceLinkId?: string, sourceLastModified?: number, sourceFileSize?: number): boolean {
    const node = this.nodes.get(id);
    if (!node || node.type !== 'file' || pixels.byteLength !== this.doc.width * this.doc.height * 4) return false;
    const beforePixels = this.readPixels(node) ?? new Uint8Array(this.doc.width * this.doc.height * 4);
    const afterPixels = new Uint8Array(pixels);
    const beforeName = node.sourceName ?? node.name;
    const beforeLinkId = node.sourceLinkId;
    const beforeLastModified = node.sourceLastModified;
    const beforeFileSize = node.sourceFileSize;
    const apply = (data: Uint8Array, name: string, linkId?: string, lastModified?: number, fileSize?: number) => {
      const current = this.nodes.get(id);
      if (!current || current.type !== 'file') return;
      current.sourceName = name;
      current.sourceLinkId = linkId;
      current.sourceLastModified = lastModified;
      current.sourceFileSize = fileSize;
      this.layerPixels(current)?.loadFromRGBA(data);
      this.comp.invalidateAll();
    };
    const equalPixels = beforePixels.byteLength === afterPixels.byteLength && beforePixels.every((value, index) => value === afterPixels[index]);
    const unchanged = equalPixels && beforeName === sourceName && beforeLinkId === sourceLinkId && beforeLastModified === sourceLastModified && beforeFileSize === sourceFileSize;
    if (unchanged) return true;
    apply(afterPixels, sourceName, sourceLinkId, sourceLastModified, sourceFileSize);
    if (!this.replaying) this.recordStructure(
      `Actualizar imagen vinculada de «${node.name}»`,
      () => apply(beforePixels, beforeName, beforeLinkId, beforeLastModified, beforeFileSize),
      () => apply(afterPixels, sourceName, sourceLinkId, sourceLastModified, sourceFileSize),
    );
    return true;
  }

  duplicateLayer(id: string): LayerNode | null {
    const original = this.nodes.get(id);
    if (!original) return null;
    const parent = this.parentOf(original);
    const siblings = this.siblingsOf(original);
    const clone = this.cloneNodeWithNewIds(original);
    const pixels = new Map<string, Uint8Array>();
    const copyPixels = (oldNode: LayerNode, newNode: LayerNode) => {
      const source = this.readPixels(oldNode);
      if (source) pixels.set(newNode.id, source);
      oldNode.children.forEach((child, i) => copyPixels(child, newNode.children[i]));
    };
    copyPixels(original, clone);
    const seed: LayerSnapshot = { node: clone, parentId: parent?.id ?? null, index: siblings.indexOf(original) + 1, pixels };
    this.restoreRaw(seed);
    const duplicated = this.nodes.get(clone.id)!;
    // Guardamos los IDs del motor que realmente se asignaron. El historial de píxeles
    // del motor Wasm referencia esos IDs y debe seguir funcionando tras rehacer la duplicación.
    const stableSnapshot = this.snapshot(duplicated);
    if (!this.replaying) this.recordStructure(`Duplicar «${original.name}»`, () => this.removeRaw(clone.id), () => this.restoreRaw(stableSnapshot));
    return duplicated;
  }

  removeLayer(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const snapshot = this.snapshot(node);
    if (!this.removeRaw(id)) return false;
    if (!this.replaying) this.recordStructure(`Eliminar «${node.name}»`, () => this.restoreRaw(snapshot), () => this.removeRaw(id));
    return true;
  }

  moveLayer(id: string, delta: number): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const siblings = this.siblingsOf(node), from = siblings.indexOf(node);
    const to = Math.max(0, Math.min(siblings.length - 1, from + delta));
    if (to === from || !this.moveRaw(id, to)) return false;
    if (!this.replaying) this.recordStructure(`Reordenar «${node.name}»`, () => this.moveRaw(id, from), () => this.moveRaw(id, to));
    return true;
  }

  /** Mueve una capa entre la raíz y grupos; el cambio forma parte del historial común. */
  moveLayerToParent(id: string, parentId: string | null, index = -1): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const oldParent = this.parentOf(node);
    const oldParentId = oldParent?.id ?? null;
    const oldIndex = this.siblingsOf(node).indexOf(node);
    const newParent = parentId ? this.nodes.get(parentId) : null;
    if (parentId && (!newParent || newParent.type !== 'group')) return false;
    if (newParent === node || (newParent && this.containsNode(node, newParent))) return false;
    const destination = newParent ? newParent.children : this.doc.layers;
    const requestedIndex = index < 0 ? destination.length : Math.max(0, Math.min(index, destination.length));
    if (oldParentId === parentId) {
      const bounded = Math.max(0, Math.min(destination.length - 1, requestedIndex));
      if (bounded === oldIndex || !this.moveRaw(id, bounded)) return false;
      if (!this.replaying) this.recordStructure(`Mover «${node.name}»`, () => this.moveRaw(id, oldIndex), () => this.moveRaw(id, bounded));
      return true;
    }
    if (!this.moveToParentRaw(id, parentId, requestedIndex)) return false;
    if (!this.replaying) this.recordStructure(
      `Mover «${node.name}» ${newParent ? `al grupo «${newParent.name}»` : 'a la raíz'}`,
      () => this.moveToParentRaw(id, oldParentId, oldIndex),
      () => this.moveToParentRaw(id, parentId, requestedIndex),
    );
    return true;
  }

  setProps(id: string, patch: LayerPatch): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const before = clonePatch(node);
    this.applyPatchRaw(id, patch);
    const after = clonePatch(node);
    if (!this.replaying && JSON.stringify(before) !== JSON.stringify(after)) {
      const label = patch.name !== undefined && Object.keys(patch).length === 1
        ? `Renombrar «${before.name}»`
        : patch.filterKind !== undefined || patch.filterStrength !== undefined
          ? `Cambiar filtro de «${node.name}»`
          : patch.fillColor !== undefined
            ? `Cambiar relleno de «${node.name}»`
            : `Propiedades de «${node.name}»`;
      this.recordStructure(label, () => this.applyPatchRaw(id, before), () => this.applyPatchRaw(id, after));
    }
    return true;
  }

  /** Actualiza objetos vectoriales y su rasterización como UNA acción de historial. */
  replaceVectorContent(id: string, shapes: VectorShape[], rasterPixels: Uint8Array): boolean {
    const node = this.nodes.get(id);
    if (!node || node.type !== 'vector') return false;
    const oldShapes = cloneShapes(node.vectorShapes);
    const oldPixels = this.readPixels(node) ?? new Uint8Array(this.doc.width * this.doc.height * 4);
    const nextShapes = cloneShapes(shapes);
    const nextPixels = new Uint8Array(rasterPixels);
    const apply = (whichShapes: VectorShape[], whichPixels: Uint8Array) => {
      node.vectorShapes = cloneShapes(whichShapes);
      const layer = this.layerPixels(node);
      if (layer) layer.loadFromRGBA(whichPixels);
      this.comp.invalidateAll();
    };
    apply(nextShapes, nextPixels);
    if (!this.replaying) this.recordStructure(`Editar vectores de «${node.name}»`, () => apply(oldShapes, oldPixels), () => apply(nextShapes, nextPixels));
    return true;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  get undoLabel(): string { return this.undoStack.at(-1)?.label ?? ''; }
  get redoLabel(): string { return this.redoStack.at(-1)?.label ?? ''; }
  get historyEntries(): Array<{ label: string; current: boolean }> { return [...this.undoStack].reverse().map((a, i) => ({ label: a.label, current: i === 0 })); }
  recordPixelAction(label: string): void { if (!this.replaying) { this.redoStack = []; this.undoStack.push({ kind: 'pixels', label }); } }

  undo(): 'pixels' | 'structure' | null {
    while (this.undoStack.length) {
      const action = this.undoStack.pop()!;
      if (action.kind === 'pixels') {
        if (!this.history.undo()) {
          // El historial Wasm puede descartar sus snapshots de píxeles más antiguos por el límite de memoria.
          // No dejamos que una etiqueta obsoleta bloquee las acciones estructurales anteriores.
          if (this.history.undoCount() === 0) continue;
          this.undoStack.push(action); return null;
        }
      } else {
        this.replaying = true;
        try { action.undo(); } finally { this.replaying = false; }
        this.comp.invalidateAll();
      }
      this.redoStack.push(action);
      return action.kind;
    }
    return null;
  }
  redo(): 'pixels' | 'structure' | null {
    while (this.redoStack.length) {
      const action = this.redoStack.pop()!;
      if (action.kind === 'pixels') {
        if (!this.history.redo()) {
          if (this.history.redoCount() === 0) continue;
          this.redoStack.push(action); return null;
        }
      } else {
        this.replaying = true;
        try { action.redo(); } finally { this.replaying = false; }
        this.comp.invalidateAll();
      }
      this.undoStack.push(action);
      return action.kind;
    }
    return null;
  }
  clearHistory(): void { this.history.clear(); this.undoStack = []; this.redoStack = []; }
  dispose(): void { this.history.delete(); this.comp.delete(); this.nodes.clear(); }

  // ── Internos ──
  private typeLabel(type: LayerType): string {
    return ({ paint: 'capa de pintura', raster: 'capa de pintura', filter: 'capa de filtro', fill: 'capa de relleno', file: 'capa de archivo', vector: 'capa vectorial', group: 'grupo' } as const)[type];
  }
  private recordStructure(label: string, undo: () => void, redo: () => void): void { this.redoStack = []; this.undoStack.push({ kind: 'structure', label, undo, redo }); }
  private cloneNode(n: LayerNode): LayerNode { return { ...n, vectorShapes: cloneShapes(n.vectorShapes), children: n.children.map((c) => this.cloneNode(c)) }; }
  private cloneNodeWithNewIds(n: LayerNode): LayerNode {
    return { ...n, id: crypto.randomUUID(), engineId: 0, vectorShapes: cloneShapes(n.vectorShapes), children: n.children.map((c) => this.cloneNodeWithNewIds(c)) };
  }
  private snapshot(node: LayerNode): LayerSnapshot {
    const parent = this.parentOf(node);
    const pixels = new Map<string, Uint8Array>();
    const capture = (n: LayerNode) => { const px = this.readPixels(n); if (px) pixels.set(n.id, px); n.children.forEach(capture); };
    capture(node);
    return { node: this.cloneNode(node), parentId: parent?.id ?? null, index: this.siblingsOf(node).indexOf(node), pixels };
  }
  private applyPatchRaw(id: string, patch: LayerPatch): void {
    const n = this.nodes.get(id); if (!n) return;
    const fillChanged = n.type === 'fill' && patch.fillColor !== undefined && patch.fillColor !== n.fillColor;
    Object.assign(n, patch);
    if (patch.vectorShapes) n.vectorShapes = cloneShapes(patch.vectorShapes);
    this.pushProps(n);
    if (fillChanged) this.fillLayerPixelsRaw(n, n.fillColor ?? '#ffffff');
  }
  private moveRaw(id: string, index: number): boolean {
    const n = this.nodes.get(id); if (!n) return false;
    const siblings = this.siblingsOf(n), from = siblings.indexOf(n);
    if (from < 0) return false;
    const parentEngine = this.parentOf(n)?.engineId ?? 0;
    if (!this.comp.moveLayer(n.engineId, parentEngine, index)) return false;
    siblings.splice(from, 1); siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, n); return true;
  }
  private moveToParentRaw(id: string, parentId: string | null, index: number): boolean {
    const n = this.nodes.get(id); if (!n) return false;
    const parent = parentId ? this.nodes.get(parentId) : null;
    if (parentId && (!parent || parent.type !== 'group')) return false;
    if (parent === n || (parent && this.containsNode(n, parent))) return false;
    const oldSiblings = this.siblingsOf(n), oldIndex = oldSiblings.indexOf(n);
    if (oldIndex < 0) return false;
    const destination = parent ? parent.children : this.doc.layers;
    const destIndex = Math.max(0, Math.min(index, destination.length));
    const parentEngine = parent?.engineId ?? 0;
    if (!this.comp.moveLayer(n.engineId, parentEngine, destIndex)) return false;
    oldSiblings.splice(oldIndex, 1);
    const corrected = oldSiblings === destination ? Math.max(0, Math.min(destIndex, destination.length)) : Math.max(0, Math.min(destIndex, destination.length));
    destination.splice(corrected, 0, n);
    return true;
  }
  private containsNode(root: LayerNode, candidate: LayerNode): boolean {
    return root.children.some((child) => child === candidate || this.containsNode(child, candidate));
  }
  private removeRaw(id: string): boolean {
    const n = this.nodes.get(id); if (!n || !this.comp.removeLayer(n.engineId)) return false;
    const siblings = this.siblingsOf(n); siblings.splice(siblings.indexOf(n), 1);
    const forget = (x: LayerNode) => { this.nodes.delete(x.id); x.children.forEach(forget); }; forget(n); return true;
  }
  private restoreRaw(snapshot: LayerSnapshot): void {
    const parent = snapshot.parentId ? this.nodes.get(snapshot.parentId) ?? null : null;
    const insert = (src: LayerNode, parentNode: LayerNode | null, index: number): LayerNode => {
      // Si se restaura una capa eliminada, se reutiliza su engineId original cuando está libre.
      // HistoryManager guarda ese ID en sus snapshots de tiles, por lo que esto conserva la
      // continuidad de Deshacer/Rehacer para trazos que existían antes de eliminar la capa.
      const engineIdInUse = (id: number) => [...this.nodes.values()].some((node) => node.engineId === id);
      const engineId = src.engineId > 0 && !engineIdInUse(src.engineId) ? src.engineId : this.nextEngineId++;
      this.nextEngineId = Math.max(this.nextEngineId, engineId + 1);
      const n: LayerNode = { ...src, engineId, vectorShapes: cloneShapes(src.vectorShapes), children: [] };
      const siblings = parentNode ? parentNode.children : this.doc.layers;
      const at = Math.max(0, Math.min(index, siblings.length));
      const ok = n.type === 'group' ? this.comp.addGroup(n.engineId, parentNode?.engineId ?? 0, at) : this.comp.addRaster(n.engineId, parentNode?.engineId ?? 0, at);
      if (!ok) throw new Error(`No se pudo restaurar la capa ${n.name}`);
      siblings.splice(at, 0, n); this.nodes.set(n.id, n); this.pushProps(n);
      const px = snapshot.pixels.get(n.id);
      if (px && isPixelLayerType(n.type)) this.layerPixels(n)?.loadFromRGBA(px);
      else if (n.type === 'fill' && n.fillColor) this.fillLayerPixelsRaw(n, n.fillColor);
      src.children.forEach((c, i) => insert(c, n, i));
      return n;
    };
    insert(snapshot.node, parent, snapshot.index);
  }
  private add(type: LayerType, name: string, parentId: string | undefined, index: number, extras: Partial<LayerNode> = {}): LayerNode {
    const parent = parentId ? this.nodes.get(parentId) ?? null : null;
    if (parent && parent.type !== 'group') throw new Error('Las capas solo pueden agregarse dentro de un grupo.');
    const node: LayerNode = {
      id: crypto.randomUUID(), engineId: this.nextEngineId++, type, name,
      visible: true, locked: false, opacity: 1, blendMode: 'normal', children: [], ...extras,
    };
    const siblings = parent ? parent.children : this.doc.layers;
    const at = index < 0 || index > siblings.length ? siblings.length : index;
    const ok = type === 'group' ? this.comp.addGroup(node.engineId, parent?.engineId ?? 0, at) : this.comp.addRaster(node.engineId, parent?.engineId ?? 0, at);
    if (!ok) throw new Error(`El motor rechazó crear la capa «${name}».`);
    siblings.splice(at, 0, node); this.nodes.set(node.id, node); this.pushProps(node); return node;
  }
  private fillLayerPixelsRaw(node: LayerNode, color: string): void {
    const layer = this.layerPixels(node); if (!layer) return;
    const { width, height } = this.doc;
    const match = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    const hex = match?.[1] ?? 'ffffff';
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i += 4) { pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255; }
    layer.loadFromRGBA(pixels);
  }
  private adopt(src: LayerNode, parent: LayerNode | null, pixels: Map<string, Uint8Array>): void {
    // Versiones anteriores usaban "raster" para pintura; se normalizan a "paint" al abrir.
    const normalizedType: LayerType = src.type === 'raster' ? 'paint' : src.type;
    const node = this.add(normalizedType, src.name, parent?.id, -1, {
      visible: src.visible, locked: src.locked, opacity: src.opacity, blendMode: src.blendMode,
      fillColor: src.fillColor, filterKind: src.filterKind, filterStrength: src.filterStrength,
      vectorShapes: cloneShapes(src.vectorShapes), sourceName: src.sourceName, sourceLinkId: src.sourceLinkId, sourceLastModified: src.sourceLastModified, sourceFileSize: src.sourceFileSize,
    });
    this.nodes.delete(node.id); node.id = src.id; this.nodes.set(node.id, node);
    const px = pixels.get(src.id);
    if (px && isPixelLayerType(node.type)) this.layerPixels(node)?.loadFromRGBA(px);
    else if (node.type === 'fill' && node.fillColor) this.fillLayerPixelsRaw(node, node.fillColor);
    src.children.forEach((c) => this.adopt(c, node, pixels));
  }
  private pushProps(n: LayerNode): void { this.comp.setProps(n.engineId, n.visible, n.opacity, blendModeFromManifest(n.blendMode)); }
  private parentOf(n: LayerNode): LayerNode | null {
    const find = (list: LayerNode[], parent: LayerNode | null): LayerNode | null | undefined => {
      for (const c of list) { if (c === n) return parent; const r = find(c.children, c); if (r !== undefined) return r; }
      return undefined;
    };
    return find(this.doc.layers, null) ?? null;
  }
  private siblingsOf(n: LayerNode): LayerNode[] { return this.parentOf(n)?.children ?? this.doc.layers; }
}
