// DocumentController.ts — Dueño del documento: árbol de capas (TS) + Compositor e HistoryManager (C++).
// La estructura vive aquí; los píxeles, en el motor. Cada LayerNode guarda su `engineId` numérico.
// La estructura (añadir/borrar/mover capas, propiedades) NO es deshacible todavía: solo los píxeles.

import type { NvtsEngineModule, Compositor, HistoryManager, TiledLayer } from '@nvts/wasm-bindings';
import { blendModeFromManifest } from '@nvts/wasm-bindings';
import type { BlendMode as BlendName } from '@nvts/shared';
import type { DocumentState, LayerNode, UnpackedDocument } from './types';

const BLEND_NAMES: readonly BlendName[] = ['normal', 'multiply', 'screen', 'overlay'];
/** Valor numérico del motor (BlendMode.ts) -> nombre del manifest. */
export const blendModeToManifest = (v: number): BlendName => BLEND_NAMES[v] ?? 'normal';

export type LayerPatch = Partial<Pick<LayerNode, 'name' | 'visible' | 'locked' | 'opacity' | 'blendMode'>>;

export class DocumentController {
  readonly comp: Compositor;
  readonly history: HistoryManager;
  private nextEngineId = 1;
  private readonly nodes = new Map<string, LayerNode>();

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
  addRaster(name = 'Capa', parentId?: string, index = -1): LayerNode { return this.add('raster', name, parentId, index); }
  addGroup(name = 'Grupo', parentId?: string, index = -1): LayerNode { return this.add('group', name, parentId, index); }

  removeLayer(id: string): boolean {
    const node = this.nodes.get(id);
    if (!node || !this.comp.removeLayer(node.engineId)) return false;
    const siblings = this.siblingsOf(node);
    siblings.splice(siblings.indexOf(node), 1);
    const forget = (n: LayerNode) => { this.nodes.delete(n.id); n.children.forEach(forget); };
    forget(node);
    this.history.clear(); // el historial podría referirse a capas borradas
    return true;
  }

  /** Mueve la capa `delta` posiciones entre sus hermanos (+1 = hacia arriba). */
  moveLayer(id: string, delta: number): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    const siblings = this.siblingsOf(node);
    const from = siblings.indexOf(node);
    const to = Math.max(0, Math.min(siblings.length - 1, from + delta));
    if (to === from) return false;
    const parentEngine = this.parentOf(node)?.engineId ?? 0;
    if (!this.comp.moveLayer(node.engineId, parentEngine, to)) return false;
    siblings.splice(from, 1);
    siblings.splice(to, 0, node);
    return true;
  }

  setProps(id: string, patch: LayerPatch): boolean {
    const node = this.nodes.get(id);
    if (!node) return false;
    Object.assign(node, patch);
    this.pushProps(node);
    return true;
  }

  /** Libera la memoria C++ (historial primero, luego el compositor). */
  dispose(): void {
    this.history.delete();
    this.comp.delete();
    this.nodes.clear();
  }

  // ── Internos ──
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
