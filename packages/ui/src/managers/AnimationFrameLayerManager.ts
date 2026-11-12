import type { DocumentController, LayerNode } from '@nvts/document-model';

const MAX_FRAME_NUMBER = 9999;

type StoredFrameMap = Record<string, string>;

function isAnimationPaintLayer(layer: LayerNode | undefined): layer is LayerNode {
  if (!layer || (layer.type !== 'paint' && layer.type !== 'raster')) return false;
  const name = layer.name.trim().toLowerCase();
  return name !== 'fondo' && name !== 'background' && name !== 'background layer';
}

function getFrameNumberFromLayerName(layer: LayerNode): number | null {
  const match = /^fotograma\s+(\d+)$/i.exec(layer.name.trim());
  if (!match) return null;
  const frame = Number(match[1]);
  return Number.isInteger(frame) && frame >= 1 && frame <= MAX_FRAME_NUMBER ? frame : null;
}

function flattenLayers(layers: LayerNode[]): LayerNode[] {
  const result: LayerNode[] = [];
  const visit = (nodes: LayerNode[]) => {
    for (const node of nodes) {
      result.push(node);
      visit(node.children);
    }
  };
  visit(layers);
  return result;
}

/** Maps timeline frames to independent paint layers stored in the native document. */
export class AnimationFrameLayerManager {
  private readonly frames = new Map<number, string>();
  private currentFrame = 1;
  private currentDocument: DocumentController;
  private currentDocumentId: string;

  constructor(
    private readonly getDocument: () => DocumentController,
    private readonly getActiveLayerId: () => string,
    private readonly setActiveLayerId: (id: string) => void,
  ) {
    this.currentDocument = getDocument();
    this.currentDocumentId = this.currentDocument.doc.id;
    this.load(this.currentDocument);
  }

  private get document(): DocumentController {
    const next = this.getDocument();
    if (next === this.currentDocument && next.doc.id === this.currentDocumentId) return this.currentDocument;
    this.currentDocument = next;
    this.currentDocumentId = next.doc.id;
    this.currentFrame = 1;
    this.frames.clear();
    this.load(next);
    return this.currentDocument;
  }

  initialize(): LayerNode | null {
    let first = this.getFrameLayer(1);
    if (!first) first = this.findInitialPaintLayer();
    if (!first) first = this.document.addRaster('Fotograma 1');
    this.frames.set(1, first.id);
    this.currentFrame = 1;
    this.applyFrameVisibility(1, first);
    this.persist();
    this.setActiveLayerId(first.id);
    return first;
  }

  selectFrame(frame: number): LayerNode | null {
    const targetFrame = Math.max(1, Math.min(MAX_FRAME_NUMBER, Math.floor(frame) || 1));
    this.rememberCurrentFrameLayer();
    let target = this.getFrameLayer(targetFrame);
    if (!target) target = this.createFrameLayer(targetFrame);
    if (!target) return null;

    this.applyFrameVisibility(targetFrame, target);
    this.currentFrame = targetFrame;
    this.persist();
    this.setActiveLayerId(target.id);
    return target;
  }

  getKnownFrames(): number[] {
    return [...this.frames.keys()].sort((left, right) => left - right);
  }

  private rememberCurrentFrameLayer(): void {
    const current = this.getFrameLayer(this.currentFrame);
    if (current) this.frames.set(this.currentFrame, current.id);
    if (this.frames.has(this.currentFrame)) return;
    const active = this.findPaintLayer(this.getActiveLayerId());
    if (active && getFrameNumberFromLayerName(active) === null) {
      this.frames.set(this.currentFrame, active.id);
      return;
    }
    const initial = this.findInitialPaintLayer();
    if (initial) this.frames.set(this.currentFrame, initial.id);
  }

  private createFrameLayer(frame: number): LayerNode | null {
    const reference = this.getFrameLayer(this.currentFrame) ?? this.findInitialPaintLayer();
    const name = `Fotograma ${frame}`;
    const layer = reference
      ? this.document.addLayerAbove('paint', name, reference.id)
      : this.document.addRaster(name);
    this.frames.set(frame, layer.id);
    return layer;
  }

  private applyFrameVisibility(_activeFrame: number, activeLayer: LayerNode): void {
    this.frames.forEach((layerId, frame) => {
      const layer = this.document.find(layerId);
      if (!isAnimationPaintLayer(layer)) {
        this.frames.delete(frame);
        return;
      }
      this.document.setProps(layer.id, { visible: layer.id === activeLayer.id }, false);
    });
    this.document.setProps(activeLayer.id, { visible: true }, false);
    this.document.comp.invalidateAll();
  }

  private getFrameLayer(frame: number): LayerNode | null {
    const layerId = this.frames.get(frame);
    return layerId ? this.findPaintLayer(layerId) : null;
  }

  private findPaintLayer(layerId: string): LayerNode | null {
    const layer = this.document.find(layerId);
    return isAnimationPaintLayer(layer) ? layer : null;
  }

  private findInitialPaintLayer(): LayerNode | null {
    const active = this.findPaintLayer(this.getActiveLayerId());
    if (active && getFrameNumberFromLayerName(active) === null) return active;
    const layers = flattenLayers(this.document.doc.layers);
    return [...layers].reverse().find((layer) => isAnimationPaintLayer(layer) && getFrameNumberFromLayerName(layer) === null) ?? null;
  }

  private load(document: DocumentController): void {
    this.restoreNamedFrameLayers(document);
    if (typeof localStorage === 'undefined') return;
    try {
      const key = this.getStorageKey(document);
      const parsed = JSON.parse(localStorage.getItem(key) || '{}') as StoredFrameMap;
      Object.entries(parsed).forEach(([frameValue, layerId]) => {
        const frame = Number(frameValue);
        if (!Number.isInteger(frame) || frame < 1 || frame > MAX_FRAME_NUMBER || typeof layerId !== 'string') return;
        if (isAnimationPaintLayer(document.find(layerId))) this.frames.set(frame, layerId);
      });
    } catch {
      // The layer names remain a recoverable fallback when local storage is unavailable.
    }
  }

  private restoreNamedFrameLayers(document: DocumentController): void {
    flattenLayers(document.doc.layers).forEach((layer) => {
      if (!isAnimationPaintLayer(layer)) return;
      const frame = getFrameNumberFromLayerName(layer);
      if (frame !== null && !this.frames.has(frame)) this.frames.set(frame, layer.id);
    });
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const stored: StoredFrameMap = {};
      this.frames.forEach((layerId, frame) => { stored[String(frame)] = layerId; });
      localStorage.setItem(this.getStorageKey(this.document), JSON.stringify(stored));
    } catch {
      // The document layers remain authoritative even when local storage is unavailable.
    }
  }

  private getStorageKey(document: DocumentController): string {
    return `nvts-photomania-animation-frames-v1:${document.doc.id}`;
  }
}
