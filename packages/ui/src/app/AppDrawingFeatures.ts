// Drawing tools, brush strokes and fill operations.
import { AppEventFeatures } from './AppEventFeatures';
import { type StampOperation } from '@nvts/image-processing';
import { CloneStampStrategy, ContiguousFillStrategy, EraserStrategy, EyedropperStrategy, GlobalFillStrategy, PaintBrushStrategy, TextCreationStrategy, VectorSelectionStrategy, type BrushStrategy, type CloneStampOperation, type ImmediateToolStrategy } from './EditorStrategies';
import { containsLayerType, StrokeSession, runEdit, type LayerNode } from '@nvts/document-model';
import { isPixelLayerType, type VectorShape } from '@nvts/shared';
import { updateHistoryMemoryIndicator } from '../panels/HistoryPanel';
import { createComicSplitShapes as buildComicSplitShapes } from '../features/comics/createComicSplitShapes';
import type { Tool, FillOperation, FillResult, PixelRegion, StrokeLayerPixels } from './AppBase';

const MAX_CLONE_ORIGINAL_TILE_BYTES = 64 * 1024 * 1024;

type ToolPreviewContext = {
  ctx: CanvasRenderingContext2D;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

export abstract class AppDrawingFeatures extends AppEventFeatures {
  private readonly brushStrategies: Record<'brush' | 'eraser', BrushStrategy> = {
    brush: new PaintBrushStrategy(),
    eraser: new EraserStrategy(),
  };
  private readonly fillStrategies = { contiguous: new ContiguousFillStrategy(), global: new GlobalFillStrategy() };
  private readonly cloneStampStrategy = new CloneStampStrategy();
  private cloneSource: { x: number; y: number; layerId: string } | null = null;
  private readonly cloneOriginalTiles = new Map<string, { left: number; top: number; width: number; height: number; pixels: Uint8Array }>();
  private cloneOriginalTileBytes = 0;
  private cloneSourceScratch = new Uint8Array(0);
  private cloneDestinationStart: { x: number; y: number } | null = null;
  private comicPanelStart: { x: number; y: number; clientX: number; clientY: number } | null = null;
  private comicSplitPoints: Array<{ x: number; y: number }> = [];
  private comicSplitClientPoints: Array<{ x: number; y: number }> = [];
  private comicVectorLayerId: string | null = null;
  private readonly immediateToolStrategies: Partial<Record<'eyedropper' | 'text' | 'vector-select', ImmediateToolStrategy>> = {
    eyedropper: new EyedropperStrategy(),
    text: new TextCreationStrategy(),
    'vector-select': new VectorSelectionStrategy(),
  };
  protected toDocAt(clientX: number, clientY: number): { x: number; y: number } {
      const r = this.canvas.getBoundingClientRect();
      const { width: dw, height: dh } = this.ctl.doc;
      const scale = Math.min(r.width / dw, r.height / dh);
      return {
        x: (clientX - r.left - (r.width - dw * scale) / 2) / scale,
        y: (clientY - r.top - (r.height - dh * scale) / 2) / scale,
      };
    }

  protected toDoc(e: PointerEvent): { x: number; y: number } { return this.toDocAt(e.clientX, e.clientY); }

  protected onDocument(p: { x: number; y: number }): boolean {
      return p.x >= 0 && p.y >= 0 && p.x < this.ctl.doc.width && p.y < this.ctl.doc.height;
    }

  protected stamp(x: number, y: number): void {
      const layer = this.strokeLayer;
      if (!layer || !this.stroke) return;
      const operation = this.createStampOperation(x, y);
      if (!operation || !this.prepareStampTarget(operation.region)) return;
      const pixels = this.readStampPixels(layer, operation.region);
      this.applyStampToLayer(layer, operation, pixels);
    }

  protected prepareStampTarget(region: PixelRegion): boolean {
      if (this.strokeTool !== 'clone-stamp' || this.cacheCloneDestinationTiles(region)) return true;
      this.abortStroke(new Error('Se canceló el Tampón de clonar para proteger la memoria (límite de 64 MiB por trazo en la misma capa). Elegí otra capa como destino o hacé trazos más cortos.'));
      return false;
    }

  protected applyStampToLayer(
      layer: NonNullable<StrokeLayerPixels>, operation: StampOperation, pixels: Uint8Array,
    ): void {
      const changed = this.applyStampStrategy(pixels, operation);
      if (!changed) return;
      this.clipStampPixelsToComicPanel(operation.region, pixels);
      if (!layer.writeRectFromJS(
        operation.region.left, operation.region.top, operation.region.width, operation.region.height, pixels,
      )) return;
      this.scheduleRefreshForRegion(operation.region);
    }


  private clipStampPixelsToComicPanel(region: PixelRegion, pixels: Uint8Array): void {
    const layer = this.strokeLayerNodeId ? this.ctl.find(this.strokeLayerNodeId) : undefined;
    this.clipPixelsToComicPanel(layer, region, pixels);
  }

  protected applyStampStrategy(pixels: Uint8Array, operation: StampOperation): boolean {
      if (this.strokeTool === 'clone-stamp') return this.applyCloneStamp(pixels, operation);
      const strategy = this.brushStrategies[this.strokeTool === 'eraser' ? 'eraser' : 'brush'];
      return strategy.apply(pixels, operation);
    }

  protected applyCloneStamp(pixels: Uint8Array, operation: StampOperation): boolean {
      const source = this.createCloneStampOperation(operation.region);
      return source ? this.cloneStampStrategy.apply(pixels, operation, source) : false;
    }

  protected createCloneStampOperation(targetRegion: PixelRegion): CloneStampOperation | null {
      const context = this.getCloneSourceContext();
      if (!context) return null;
      const sourceRegion = this.getMappedCloneRegion(targetRegion, context.anchor, context.destinationStart);
      if (!sourceRegion) return null;
      const sourcePixels = this.readCloneSourcePatch(context, sourceRegion);
      if (!sourcePixels) return null;
      return this.buildCloneStampOperation(context.anchor, context.destinationStart, sourceRegion, sourcePixels);
    }

  protected getCloneSourceContext(): {
      anchor: { x: number; y: number; layerId: string };
      destinationStart: { x: number; y: number };
      sourceLayer: LayerNode;
      sourceSurface: NonNullable<StrokeLayerPixels>;
    } | null {
      const anchor = this.cloneSource;
      const destinationStart = this.cloneDestinationStart;
      const sourceLayer = anchor ? this.ctl.find(anchor.layerId) : undefined;
      const sourceSurface = sourceLayer ? this.ctl.layerPixels(sourceLayer) : null;
      if (!anchor || !destinationStart || !sourceLayer || !sourceSurface || !this.strokeLayer) return null;
      return { anchor, destinationStart, sourceLayer, sourceSurface };
    }

  protected readCloneSourcePatch(
      context: { sourceLayer: LayerNode; sourceSurface: NonNullable<StrokeLayerPixels> },
      region: PixelRegion,
    ): Uint8Array | null {
      const pixels = this.getCloneSourceScratch(region.width * region.height * 4);
      if (!context.sourceSurface.readRectToJS(region.left, region.top, region.width, region.height, pixels)) return null;
      if (context.sourceLayer.id === this.strokeLayerNodeId) this.restoreCloneOriginalTiles(region, pixels);
      return pixels;
    }

  protected buildCloneStampOperation(
      anchor: { x: number; y: number },
      destinationStart: { x: number; y: number },
      sourceRegion: PixelRegion,
      sourcePixels: Uint8Array,
    ): CloneStampOperation {
      return {
        sourcePixels,
        sourceLeft: sourceRegion.left,
        sourceTop: sourceRegion.top,
        sourceWidth: sourceRegion.width,
        sourceHeight: sourceRegion.height,
        documentWidth: this.ctl.doc.width,
        documentHeight: this.ctl.doc.height,
        sourcePoint: { x: anchor.x, y: anchor.y },
        destinationStart,
      };
    }

  protected getMappedCloneRegion(
      target: PixelRegion,
      anchor: { x: number; y: number },
      destinationStart: { x: number; y: number },
    ): PixelRegion | null {
      const sourceLeft = Math.round(anchor.x + target.left - destinationStart.x);
      const sourceTop = Math.round(anchor.y + target.top - destinationStart.y);
      const sourceRight = Math.round(anchor.x + target.left + target.width - 1 - destinationStart.x);
      const sourceBottom = Math.round(anchor.y + target.top + target.height - 1 - destinationStart.y);
      const left = Math.max(0, Math.min(sourceLeft, sourceRight));
      const top = Math.max(0, Math.min(sourceTop, sourceBottom));
      const right = Math.min(this.ctl.doc.width - 1, Math.max(sourceLeft, sourceRight));
      const bottom = Math.min(this.ctl.doc.height - 1, Math.max(sourceTop, sourceBottom));
      const region = { left, top, width: right - left + 1, height: bottom - top + 1 };
      return region.width > 0 && region.height > 0 ? region : null;
    }

  protected cacheCloneDestinationTiles(region: PixelRegion): boolean {
      if (!this.cloneSource || this.cloneSource.layerId !== this.strokeLayerNodeId) return true;
      const layer = this.ctl.find(this.cloneSource.layerId);
      const surface = layer ? this.ctl.layerPixels(layer) : null;
      if (!surface) return false;
      const tileSize = 256;
      const firstTileX = Math.floor(region.left / tileSize);
      const lastTileX = Math.floor((region.left + region.width - 1) / tileSize);
      const firstTileY = Math.floor(region.top / tileSize);
      const lastTileY = Math.floor((region.top + region.height - 1) / tileSize);
      const rows = Array.from({ length: lastTileY - firstTileY + 1 }, (_, index) => firstTileY + index);
      return rows.every((tileY) => this.cacheCloneOriginalTileRow(surface, tileY, firstTileX, lastTileX, tileSize));
    }

  private cacheCloneOriginalTileRow(
    surface: NonNullable<StrokeLayerPixels>, tileY: number, firstTileX: number, lastTileX: number, tileSize: number,
  ): boolean {
    return this.cacheCloneOriginalTileAtX(surface, tileY, firstTileX, lastTileX, tileSize);
  }

  private cacheCloneOriginalTileAtX(
    surface: NonNullable<StrokeLayerPixels>, tileY: number, tileX: number, lastTileX: number, tileSize: number,
  ): boolean {
    if (tileX > lastTileX) return true;
    if (!this.cacheCloneOriginalTile(surface, tileX, tileY, tileSize)) return false;
    return this.cacheCloneOriginalTileAtX(surface, tileY, tileX + 1, lastTileX, tileSize);
  }

  protected cacheCloneOriginalTile(
      surface: NonNullable<StrokeLayerPixels>, tileX: number, tileY: number, tileSize: number,
    ): boolean {
      const key = `${tileX}:${tileY}`;
      if (this.cloneOriginalTiles.has(key)) return true;
      const left = tileX * tileSize;
      const top = tileY * tileSize;
      const width = Math.min(tileSize, this.ctl.doc.width - left);
      const height = Math.min(tileSize, this.ctl.doc.height - top);
      if (width <= 0 || height <= 0) return false;
      const requiredBytes = width * height * 4;
      if (this.cloneOriginalTileBytes + requiredBytes > MAX_CLONE_ORIGINAL_TILE_BYTES) return false;
      const pixels = new Uint8Array(requiredBytes);
      if (!surface.readRectToJS(left, top, width, height, pixels)) return false;
      this.cloneOriginalTiles.set(key, { left, top, width, height, pixels });
      this.cloneOriginalTileBytes += requiredBytes;
      return true;
    }

  protected clearCloneOriginalTiles(): void {
      this.cloneOriginalTiles.clear();
      this.cloneOriginalTileBytes = 0;
    }

  protected restoreCloneOriginalTiles(region: PixelRegion, pixels: Uint8Array): void {
      const tileSize = 256;
      const firstX = Math.floor(region.left / tileSize);
      const lastX = Math.floor((region.left + region.width - 1) / tileSize);
      const firstY = Math.floor(region.top / tileSize);
      const lastY = Math.floor((region.top + region.height - 1) / tileSize);
      for (let tileY = firstY; tileY <= lastY; tileY++) this.restoreCloneTileRow(region, pixels, tileY, firstX, lastX);
    }

  private restoreCloneTileRow(region: PixelRegion, pixels: Uint8Array, tileY: number, firstX: number, lastX: number): void {
    for (let tileX = firstX; tileX <= lastX; tileX++) this.restoreCloneTileAt(region, pixels, tileX, tileY);
  }

  private restoreCloneTileAt(region: PixelRegion, pixels: Uint8Array, tileX: number, tileY: number): void {
    const tile = this.cloneOriginalTiles.get(`${tileX}:${tileY}`);
    if (!tile) return;
    this.restoreCloneTileIntersection(region, pixels, tile);
  }

  protected getCloneSourceScratch(requiredBytes: number): Uint8Array {
      if (this.cloneSourceScratch.length < requiredBytes) {
        this.cloneSourceScratch = new Uint8Array(nextPowerOfTwo(requiredBytes));
      }
      return this.cloneSourceScratch.subarray(0, requiredBytes);
    }

  protected restoreCloneTileIntersection(
      region: PixelRegion,
      target: Uint8Array,
      tile: { left: number; top: number; width: number; height: number; pixels: Uint8Array },
    ): void {
      const left = Math.max(region.left, tile.left);
      const top = Math.max(region.top, tile.top);
      const right = Math.min(region.left + region.width, tile.left + tile.width);
      const bottom = Math.min(region.top + region.height, tile.top + tile.height);
      if (right <= left || bottom <= top) return;
      const rowBytes = (right - left) * 4;
      for (let y = top; y < bottom; y++) {
        const sourceOffset = ((y - tile.top) * tile.width + left - tile.left) * 4;
        const targetOffset = ((y - region.top) * region.width + left - region.left) * 4;
        target.set(tile.pixels.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset);
      }
    }

  protected createStampOperation(x: number, y: number): StampOperation | null {
      const region = this.getStampRegion(x, y);
      if (!region) return null;
      const radius = Math.max(0.5, this.brush.size / 2);
      const hardEdge = radius * (this.brush.hardness / 100);
      return {
        region,
        centerX: x,
        centerY: y,
        radius,
        hardEdge,
        fadeWidth: Math.max(0.5, radius + 0.5 - hardEdge),
        erase: this.strokeTool === 'eraser',
        color: [this.brush.rgb[0], this.brush.rgb[1], this.brush.rgb[2]],
        opacity: this.brush.opacity / 100,
      };
    }

  protected getStampRegion(x: number, y: number): PixelRegion | null {
      const { width, height } = this.ctl.doc;
      const radius = Math.max(0.5, this.brush.size / 2);
      const left = Math.max(0, Math.floor(x - radius - 1));
      const top = Math.max(0, Math.floor(y - radius - 1));
      const right = Math.min(width, Math.ceil(x + radius + 1));
      const bottom = Math.min(height, Math.ceil(y + radius + 1));
      const region = { left, top, width: right - left, height: bottom - top };
      return region.width > 0 && region.height > 0 ? region : null;
    }

  protected readStampPixels(layer: NonNullable<StrokeLayerPixels>, region: PixelRegion): Uint8Array {
      const requiredBytes = region.width * region.height * 4;
      if (this.stampPixelsScratch.length < requiredBytes) {
        this.stampPixelsScratch = new Uint8Array(nextPowerOfTwo(requiredBytes));
      }
      const pixels = this.stampPixelsScratch.subarray(0, requiredBytes);
      layer.readRectToJS(region.left, region.top, region.width, region.height, pixels);
      return pixels;
    }

  protected commitShape(start: { x: number; y: number }, end: { x: number; y: number }, tool: Tool): void {
      const layer = this.strokeLayer;
      if (!layer) return;
      const region = this.getShapeRegion(start, end);
      if (!region) return;
      const source = this.renderShapePixels(start, end, tool, region);
      if (!source) return;
      const target = this.blendShapePixels(layer, region, source);
      if (!target) return;
      this.clipShapePixelsToComicPanel(region, target);
      this.writeShapePixels(layer, region, target);
    }

  private clipShapePixelsToComicPanel(region: PixelRegion, target: Uint8Array): void {
    const layer = this.strokeLayerNodeId ? this.ctl.find(this.strokeLayerNodeId) : undefined;
    this.clipPixelsToComicPanel(layer, region, target);
  }

  private writeShapePixels(layer: NonNullable<StrokeLayerPixels>, region: PixelRegion, target: Uint8Array): void {
    const written = layer.writeRectFromJS(region.left, region.top, region.width, region.height, target);
    if (!written) return;
    this.scheduleRefreshForRegion(region);
  }

  protected getShapeRegion(start: { x: number; y: number }, end: { x: number; y: number }): PixelRegion | null {
      const padding = Math.ceil(this.brush.size / 2) + 2;
      const left = Math.max(0, Math.floor(Math.min(start.x, end.x) - padding));
      const top = Math.max(0, Math.floor(Math.min(start.y, end.y) - padding));
      const right = Math.min(this.ctl.doc.width, Math.ceil(Math.max(start.x, end.x) + padding));
      const bottom = Math.min(this.ctl.doc.height, Math.ceil(Math.max(start.y, end.y) + padding));
      const region = { left, top, width: right - left, height: bottom - top };
      return region.width > 0 && region.height > 0 ? region : null;
    }

  protected renderShapePixels(
      start: { x: number; y: number },
      end: { x: number; y: number },
      tool: Tool,
      region: PixelRegion,
    ): Uint8ClampedArray | null {
      const scratch = document.createElement('canvas');
      scratch.width = region.width;
      scratch.height = region.height;
      const ctx = scratch.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      this.drawShapeSource(ctx, start, end, tool, region);
      ctx.globalAlpha = 1;
      return ctx.getImageData(0, 0, region.width, region.height).data;
    }

  protected drawShapeSource(
      ctx: CanvasRenderingContext2D,
      start: { x: number; y: number },
      end: { x: number; y: number },
      tool: Tool,
      region: PixelRegion,
    ): void {
      ctx.clearRect(0, 0, region.width, region.height);
      ctx.globalAlpha = this.brush.opacity / 100;
      ctx.strokeStyle = this.foregroundHex();
      ctx.fillStyle = this.foregroundHex();
      ctx.lineWidth = this.brush.size;
      ctx.lineCap = this.brush.lineCap;
      ctx.lineJoin = this.brush.lineJoin;
      const x1 = start.x - region.left;
      const y1 = start.y - region.top;
      const x2 = end.x - region.left;
      const y2 = end.y - region.top;
      if (tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        return;
      }
      if (tool === 'rectangle') {
        this.drawRectangleSource(ctx, x1, y1, x2, y2);
        return;
      }
      if (tool === 'ellipse') this.drawEllipseSource(ctx, x1, y1, x2, y2);
    }

  protected drawRectangleSource(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
      const x = Math.min(x1, x2);
      const y = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      if (this.brush.shapeFill) ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
    }

  protected drawEllipseSource(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
      if (this.brush.shapeFill) ctx.fill();
      ctx.stroke();
    }

  protected blendShapePixels(
      layer: NonNullable<StrokeLayerPixels>,
      region: PixelRegion,
      source: Uint8ClampedArray,
    ): Uint8Array | null {
      const target = new Uint8Array(region.width * region.height * 4);
      layer.readRectToJS(region.left, region.top, region.width, region.height, target);
      let changed = false;
      for (let offset = 0; offset < target.length; offset += 4) {
        changed = this.blendShapePixel(source, target, offset) || changed;
      }
      return changed ? target : null;
    }

  protected blendShapePixel(source: Uint8ClampedArray, target: Uint8Array, offset: number): boolean {
      const sourceAlpha = source[offset + 3] / 255;
      if (sourceAlpha <= 0) return false;
      const destinationAlpha = target[offset + 3] / 255;
      const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
      const oldWeight = destinationAlpha * (1 - sourceAlpha);
      target[offset] = Math.round((source[offset] * sourceAlpha + target[offset] * oldWeight) / outputAlpha);
      target[offset + 1] = Math.round((source[offset + 1] * sourceAlpha + target[offset + 1] * oldWeight) / outputAlpha);
      target[offset + 2] = Math.round((source[offset + 2] * sourceAlpha + target[offset + 2] * oldWeight) / outputAlpha);
      target[offset + 3] = Math.round(outputAlpha * 255);
      return true;
    }

  protected down(event: PointerEvent): void {
      if (this.stroke || this.isPanning) return;
      if (this.tryBeginPanning(event)) return;
      if (event.button !== 0) return;
      const point = this.toDoc(event);
      if (!this.onDocument(point)) return;
      if (this.tool === 'clone-stamp' && event.altKey) { this.setCloneSource(point); return; }
      if (this.handleImmediateTool(point, event)) return;
      if (this.tool === 'comic-panel') { this.beginComicPanel(point, event); return; }
      const activeLayer = this.active();
      if (activeLayer && isPixelLayerType(activeLayer.type)
        && this.ctl.isEffectivelyVisible(activeLayer.id)
        && !this.ctl.isEffectivelyLocked(activeLayer.id)
        && this.beginColorizeStroke(event, point, activeLayer)) return;
      const layer = this.getEditablePaintLayer();
      if (!layer) return;
      if (this.tool === 'clone-stamp' && !this.prepareCloneStamp()) return;
      if (this.tool === 'fill') {
        this.fillAt(point, layer);
        return;
      }
      this.beginPaintStroke(event, point, layer);
    }


  protected setCloneSource(point: { x: number; y: number }): void {
      const layer = this.getEditablePaintLayer();
      if (!layer) return;
      this.cloneSource = { x: Math.floor(point.x), y: Math.floor(point.y), layerId: layer.id };
      this.q<HTMLElement>('#status').textContent = 'Origen del tampón definido. Arrastrá para clonar; Alt + clic cambia el origen.';
    }

  protected prepareCloneStamp(): boolean {
      if (!this.cloneSource) {
        this.q<HTMLElement>('#status').textContent = 'Definí el origen con Alt + clic antes de usar el Tampón de clonar.';
        return false;
      }
      const sourceLayer = this.ctl.find(this.cloneSource.layerId);
      if (!sourceLayer || !this.ctl.layerPixels(sourceLayer)) {
        this.cloneSource = null;
        this.q<HTMLElement>('#status').textContent = 'La capa de origen ya no existe. Volvé a definir el origen con Alt + clic.';
        return false;
      }
      if (!this.ctl.isEffectivelyVisible(sourceLayer.id) || this.ctl.isEffectivelyLocked(sourceLayer.id)) {
        this.q<HTMLElement>('#status').textContent = 'La capa de origen está oculta o bloqueada.';
        return false;
      }
      this.clearCloneOriginalTiles();
      this.cloneDestinationStart = null;
      return true;
    }

  protected beginComicPanel(point: { x: number; y: number }, event: PointerEvent): void {
      const layer = this.resolveComicVectorLayer();
      if (!layer || layer.type !== 'vector' || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id)) {
        this.reportVectorToolUnavailable();
        return;
      }
      this.comicVectorLayerId = layer.id;
      if (this.comicToolMode === 'frame') {
        this.commitComicPanelBounds({ x: 0, y: 0 }, { x: this.ctl.doc.width, y: this.ctl.doc.height }, 'frame');
        return;
      }
      this.canvas.setPointerCapture(event.pointerId);
      this.comicPanelStart = { ...point, clientX: event.clientX, clientY: event.clientY };
      this.comicSplitPoints = [{ x: point.x, y: point.y }];
      this.comicSplitClientPoints = [{ x: event.clientX, y: event.clientY }];
      this.drawComicPanelPreview(event);
    }

  private resolveComicVectorLayer(): LayerNode | undefined {
    const activeLayer = this.active();
    if (activeLayer?.type === 'vector') return activeLayer;
    if (!this.comicVectorLayerId) return undefined;
    return this.ctl.find(this.comicVectorLayerId);
  }

  protected drawComicPanelPreview(event: PointerEvent): void {
      if (!this.comicPanelStart) return;
      this.updatePreviewCanvasSize();
      const preview = this.q<HTMLCanvasElement>('#tool-preview');
      const context = preview.getContext('2d');
      if (!context) return;
      const dpr = window.devicePixelRatio || 1;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, preview.width, preview.height);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const stage = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
      const x1 = this.comicPanelStart.clientX - stage.left;
      const y1 = this.comicPanelStart.clientY - stage.top;
      const x2 = event.clientX - stage.left;
      const y2 = event.clientY - stage.top;
      context.strokeStyle = '#000000';
      context.lineWidth = Math.max(1, this.comicBorderWidth) * this.getCanvasDisplayScale();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.setLineDash([]);
      if (this.comicToolMode === 'split') return this.drawComicSplitGesturePreview(context, event, stage.width, stage.height);
      context.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      context.setLineDash([]);
    }

  private drawComicSplitGesturePreview(context: CanvasRenderingContext2D, event: PointerEvent, stageWidth: number, stageHeight: number): void {
    this.appendComicSplitPoint(event);
    this.drawComicSplitPreview(context, stageWidth, stageHeight);
  }

  private appendComicSplitPoint(event: PointerEvent): void {
    const last = this.comicSplitClientPoints[this.comicSplitClientPoints.length - 1];
    if (last && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 3) return;
    this.comicSplitClientPoints.push({ x: event.clientX, y: event.clientY });
    this.comicSplitPoints.push(this.toDoc(event));
  }

  protected drawComicSplitPreview(context: CanvasRenderingContext2D, _stageWidth: number, _stageHeight: number): void {
      if (this.comicSplitPoints.length < 2) return;
      const stage = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
      const canvas = this.canvas.getBoundingClientRect();
      const scale = this.getCanvasDisplayScale();
      const offsetX = canvas.left - stage.left;
      const offsetY = canvas.top - stage.top;
      const shapes = this.createComicSplitShapes(this.comicSplitPoints);
      for (const shape of shapes) this.drawComicSplitShape(context, shape, offsetX, offsetY, scale);
    }

  private drawComicSplitShape(context: CanvasRenderingContext2D, shape: VectorShape, offsetX: number, offsetY: number, scale: number): void {
    if (shape.kind === 'line') return this.drawComicSplitLine(context, shape, offsetX, offsetY, scale);
    this.drawComicSplitPath(context, shape, offsetX, offsetY, scale);
  }

  private drawComicSplitLine(context: CanvasRenderingContext2D, shape: VectorShape, offsetX: number, offsetY: number, scale: number): void {
    context.beginPath();
    context.moveTo(offsetX + shape.x * scale, offsetY + shape.y * scale);
    context.lineTo(offsetX + (shape.x + shape.width) * scale, offsetY + (shape.y + shape.height) * scale);
    context.stroke();
  }

  private drawComicSplitPath(context: CanvasRenderingContext2D, shape: VectorShape, offsetX: number, offsetY: number, scale: number): void {
    const points = shape.points ?? [];
    if (points.length < 2) return;
    context.beginPath();
    context.moveTo(offsetX + points[0].x * scale, offsetY + points[0].y * scale);
    for (let index = 1; index < points.length; index++) this.drawComicSplitPoint(context, points[index], offsetX, offsetY, scale);
    context.stroke();
  }

  private drawComicSplitPoint(context: CanvasRenderingContext2D, point: NonNullable<VectorShape['points']>[number], offsetX: number, offsetY: number, scale: number): void {
    context.lineTo(offsetX + point.x * scale, offsetY + point.y * scale);
  }

  protected getCanvasDisplayScale(): number {
      const rect = this.canvas.getBoundingClientRect();
      return Math.min(rect.width / this.ctl.doc.width, rect.height / this.ctl.doc.height);
    }

  protected finishComicPanel(event?: PointerEvent): void {
      const start = this.comicPanelStart;
      const splitPoints = [...this.comicSplitPoints];
      this.comicPanelStart = null;
      this.comicSplitPoints = [];
      this.comicSplitClientPoints = [];
      this.clearToolPreview();
      if (!start || !event || event.type === 'pointercancel') return;
      if (this.comicToolMode === 'split') return this.finishComicSplitGesture(event, splitPoints);
      this.commitComicPanelBounds(start, this.toDoc(event), 'panel');
    }

  private finishComicSplitGesture(event: PointerEvent, splitPoints: Array<{ x: number; y: number }>): void {
    const end = this.toDoc(event);
    this.appendFinalComicSplitPoint(splitPoints, end);
    this.commitComicSplitPath(splitPoints);
  }

  private appendFinalComicSplitPoint(points: Array<{ x: number; y: number }>, end: { x: number; y: number }): void {
    const last = points[points.length - 1];
    if (last && Math.hypot(end.x - last.x, end.y - last.y) <= 1) return;
    points.push(end);
  }

  protected commitComicPanelBounds(
      start: { x: number; y: number },
      end: { x: number; y: number },
      role: 'frame' | 'panel' | 'split',
    ): void {
      const layer = this.comicVectorLayerId ? this.ctl.find(this.comicVectorLayerId) : this.active();
      if (!layer || layer.type !== 'vector') return;
      const shape = role === 'split' ? null : this.createComicPanelShape(start, end);
      const shapes = shape ? [shape] : [];
      if (shapes.length === 0) return;
      this.commitVectorShapes(layer, [...(layer.vectorShapes ?? []), ...shapes]);
      if (role === 'panel') this.createClippedComicLayer(start, end);
      this.reportComicPanelCreated(role);
    }

  protected commitComicSplitPath(points: Array<{ x: number; y: number }>): void {
      if (points.length < 2 || !this.comicVectorLayerId) return;
      const layer = this.ctl.find(this.comicVectorLayerId);
      if (!layer || layer.type !== 'vector' || this.ctl.isEffectivelyLocked(layer.id)) return;
      const shapes = this.createComicSplitShapes(points);
      if (shapes.length === 0) return;
      const existing = layer.vectorShapes ?? [];
      const frame = existing.find((shape) => shape.kind === 'rectangle' && shape.x === 0 && shape.y === 0
        && Math.abs(shape.width - this.ctl.doc.width) <= 1 && Math.abs(shape.height - this.ctl.doc.height) <= 1);
      const splitEndpoints = shapes.flatMap((shape) => this.getComicSplitEndpoints(shape));
      const updated = frame ? this.cutComicFrameAtSplit(existing, frame, splitEndpoints) : existing;
      this.commitVectorShapes(layer, [...updated, ...shapes]);
      this.reportComicPanelCreated('split');
    }


  private getComicSplitEndpoints(shape: VectorShape): Array<{ x: number; y: number }> {
    if (shape.kind === 'line') return [
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.width, y: shape.y + shape.height },
    ];
    const points = shape.points ?? [];
    if (points.length < 2) return [];
    return [points[0], points[points.length - 1]];
  }

  protected cutComicFrameAtSplit(shapes: VectorShape[], frame: VectorShape, endpoints: Array<{ x: number; y: number }>): VectorShape[] {
      const gap = Math.max(this.comicBorderWidth * 2, this.comicBorderWidth * 2);
      const edges = this.createFrameEdgeSegments(frame, endpoints, gap);
      return [...shapes.filter((shape) => shape.id !== frame.id), ...edges];
    }

  protected createFrameEdgeSegments(frame: VectorShape, endpoints: Array<{ x: number; y: number }>, gap: number): VectorShape[] {
      const width = this.ctl.doc.width;
      const height = this.ctl.doc.height;
      const topGaps = endpoints.filter((point) => point.y <= gap && point.x >= 0 && point.x <= width).map((point) => point.x);
      const bottomGaps = endpoints.filter((point) => point.y >= height - gap && point.x >= 0 && point.x <= width).map((point) => point.x);
      const leftGaps = endpoints.filter((point) => point.x <= gap && point.y >= 0 && point.y <= height).map((point) => point.y);
      const rightGaps = endpoints.filter((point) => point.x >= width - gap && point.y >= 0 && point.y <= height).map((point) => point.y);
      return [
        ...this.createFrameEdgeParts('horizontal', 0, width, topGaps, gap, frame),
        ...this.createFrameEdgeParts('horizontal', height, width, bottomGaps, gap, frame),
        ...this.createFrameEdgeParts('vertical', 0, height, leftGaps, gap, frame),
        ...this.createFrameEdgeParts('vertical', width, height, rightGaps, gap, frame),
      ];
    }

  protected createFrameEdgeParts(axis: 'horizontal' | 'vertical', position: number, length: number, gaps: number[], gap: number, frame: VectorShape): VectorShape[] {
      const ranges = gaps.map((point) => [Math.max(0, point - gap / 2), Math.min(length, point + gap / 2)] as [number, number]).sort((a, b) => a[0] - b[0]);
      const merged = this.mergeFrameGapRanges(ranges);
      const segments = this.createFrameSegments(length, merged);
      return segments.filter(([start, end]) => end - start > 1).map(([start, end]) => this.createFrameEdgeShape(axis, position, frame, start, end));
    }

  private mergeFrameGapRanges(ranges: Array<[number, number]>): Array<[number, number]> {
    const merged: Array<[number, number]> = [];
    for (const range of ranges) this.mergeFrameGapRange(merged, range);
    return merged;
  }

  private mergeFrameGapRange(merged: Array<[number, number]>, range: [number, number]): void {
    const previous = merged[merged.length - 1];
    if (!previous || range[0] > previous[1]) {
      merged.push([...range]);
      return;
    }
    previous[1] = Math.max(previous[1], range[1]);
  }

  private createFrameSegments(length: number, gaps: Array<[number, number]>): Array<[number, number]> {
    const segments: Array<[number, number]> = [];
    let cursor = 0;
    for (const gap of gaps) cursor = this.appendFrameSegmentBeforeGap(segments, cursor, gap);
    if (cursor < length) segments.push([cursor, length]);
    return segments;
  }

  private appendFrameSegmentBeforeGap(segments: Array<[number, number]>, cursor: number, gap: [number, number]): number {
    if (gap[0] > cursor) segments.push([cursor, gap[0]]);
    return Math.max(cursor, gap[1]);
  }

  private createFrameEdgeShape(
    axis: 'horizontal' | 'vertical', position: number, frame: VectorShape, start: number, end: number,
  ): VectorShape {
    const horizontal = axis === 'horizontal';
    return {
      ...frame, id: crypto.randomUUID(), kind: 'line',
      x: horizontal ? start : position, y: horizontal ? position : start,
      width: horizontal ? end - start : 0, height: horizontal ? 0 : end - start,
      fillEnabled: false, strokeEnabled: true,
    };
  }

  protected createComicPanelShape(start: { x: number; y: number }, end: { x: number; y: number }): VectorShape | null {
      const bounds = this.normalizeComicBounds(start, end);
      if (bounds.width < 2 || bounds.height < 2) return null;
      return {
        id: crypto.randomUUID(), kind: 'rectangle', ...bounds,
        color: '#000000', opacity: 1, strokeWidth: this.comicBorderWidth,
        fillEnabled: false, strokeEnabled: true, strokeColor: '#000000', fillColor: 'transparent',
        strokeDash: 'solid', lineCap: 'butt', lineJoin: 'miter',
      };
    }

  protected createComicSplitShapes(points: Array<{ x: number; y: number }>): VectorShape[] {
      return buildComicSplitShapes(
        this.ctl.doc.width,
        this.ctl.doc.height,
        points,
        this.comicSplitLineCount,
        this.comicSplitDistance,
        this.comicBorderWidth,
      );
    }

  protected createClippedComicLayer(start: { x: number; y: number }, end: { x: number; y: number }): void {
      const bounds = this.normalizeComicBounds(start, end);
      if (bounds.width < 2 || bounds.height < 2) return;
      const layer = this.ctl.addLayer('paint', `Dibujo de viñeta ${this.ctl.doc.layers.length}`, undefined, -1, { comicClipBounds: bounds });
      this.activeId = layer.id;
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    }

  protected clipPixelsToComicPanel(layer: LayerNode | undefined, region: PixelRegion, pixels: Uint8Array): void {
      const bounds = layer?.comicClipBounds;
      if (!bounds) return;
      for (let y = 0; y < region.height; y++) this.clipComicPixelRow(bounds, region, pixels, y);
    }

  private clipComicPixelRow(
    bounds: NonNullable<LayerNode['comicClipBounds']>, region: PixelRegion, pixels: Uint8Array, y: number,
  ): void {
    for (let x = 0; x < region.width; x++) this.clearPixelOutsideComicBounds(bounds, region, pixels, x, y);
  }

  private clearPixelOutsideComicBounds(
    bounds: NonNullable<LayerNode['comicClipBounds']>, region: PixelRegion, pixels: Uint8Array, x: number, y: number,
  ): void {
    const docX = region.left + x;
    const docY = region.top + y;
    if (docX >= bounds.x && docY >= bounds.y && docX < bounds.x + bounds.width && docY < bounds.y + bounds.height) return;
    const offset = (y * region.width + x) * 4;
    pixels[offset] = 0;
    pixels[offset + 1] = 0;
    pixels[offset + 2] = 0;
    pixels[offset + 3] = 0;
  }

  protected reportComicPanelCreated(role: 'frame' | 'panel' | 'split'): void {
      const messages = {
        frame: 'Marco exterior de página añadido a la capa vectorial.',
        panel: 'Viñeta añadida y capa de dibujo recortada creada.',
        split: this.comicSplitLineCount === 2
          ? 'Marco dividido con dos líneas paralelas.'
          : 'Marco dividido con una línea.',
      };
      this.q<HTMLElement>('#status').textContent = messages[role];
    }

  protected normalizeComicBounds(start: { x: number; y: number }, end: { x: number; y: number }): { x: number; y: number; width: number; height: number } {
      const left = Math.max(0, Math.min(this.ctl.doc.width, Math.min(start.x, end.x)));
      const top = Math.max(0, Math.min(this.ctl.doc.height, Math.min(start.y, end.y)));
      const right = Math.max(left, Math.min(this.ctl.doc.width, Math.max(start.x, end.x)));
      const bottom = Math.max(top, Math.min(this.ctl.doc.height, Math.max(start.y, end.y)));
      return { x: left, y: top, width: right - left, height: bottom - top };
    }

  protected tryBeginPanning(event: PointerEvent): boolean {
      const shouldPan = event.button === 1 || this.spaceDown || this.tool === 'hand';
      if (!shouldPan) return false;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.isPanning = true;
      this.panStart = { clientX: event.clientX, clientY: event.clientY, x: this.panX, y: this.panY };
      this.canvas.style.cursor = 'grabbing';
      return true;
    }

  protected handleImmediateTool(point: { x: number; y: number }, event: PointerEvent): boolean {
      const strategy = this.immediateToolStrategies[this.tool as 'eyedropper' | 'text' | 'vector-select'];
      if (!strategy) return false;
      strategy.execute(point, event, {
        pickColor: (x, y) => this.pickColorAt(x, y),
        createText: (x, y) => { void this.createTextAt({ x, y }); },
        beginVectorSelection: (selectionPoint, pointerEvent) => this.beginVectorGesture(selectionPoint, pointerEvent),
      });
      return true;
    }

  protected getEditablePaintLayer(): LayerNode | null {
      const layer = this.active();
      if (!layer) return null;
      if (layer.type !== 'paint' && layer.type !== 'raster') {
        this.q<HTMLElement>('#status').textContent = `${this.layerTypeLabel(layer.type)}: elegí una capa de pintura para editar píxeles`;
        return null;
      }
      const locked = this.ctl.isEffectivelyLocked(layer.id);
      const visible = this.ctl.isEffectivelyVisible(layer.id);
      if (!visible || locked) {
        this.reportUnavailablePaintLayer(locked);
        return null;
      }
      return layer;
    }

  private reportUnavailablePaintLayer(locked: boolean): void {
    this.q<HTMLElement>('#status').textContent = locked
      ? 'La capa o su grupo está bloqueado'
      : 'La capa o su grupo está oculto';
  }

  protected beginPaintStroke(event: PointerEvent, point: { x: number; y: number }, layer: LayerNode): void {
      this.canvas.setPointerCapture(event.pointerId);
      this.stroke = new StrokeSession(this.ctx, layer.engineId);
      this.strokeLayer = this.ctl.layerPixels(layer);
      this.strokeLayerNodeId = layer.id;
      this.strokeHasGlobalFilterDependency = this.layerPathHasGlobalFilterDependency(layer.id);
      this.strokeTool = this.tool;
      this.last = point;
      if (this.isBrushStrokeTool()) {
        this.prepareInitialBrushDab(point);
        return;
      }
      if (this.tool !== 'line' && this.tool !== 'rectangle' && this.tool !== 'ellipse') return;
      this.shapeStart = { ...point, clientX: event.clientX, clientY: event.clientY };
      this.drawToolPreview(event);
    }

  private isBrushStrokeTool(): boolean {
    return this.tool === 'brush' || this.tool === 'eraser' || this.tool === 'clone-stamp';
  }

  private prepareInitialBrushDab(point: { x: number; y: number }): void {
    if (this.tool === 'clone-stamp') this.cloneDestinationStart = { ...point };
    this.stamp(point.x, point.y);
  }

  protected beginColorizeStroke(event: PointerEvent, point: { x: number; y: number }, layer: LayerNode): boolean {
      if (this.tool !== 'brush') return false;
      const mask = layer.masks?.find((candidate) => candidate.type === 'colorize' && candidate.enabled && candidate.editStrokes);
      if (!mask || mask.type !== 'colorize') return false;
      this.canvas.setPointerCapture(event.pointerId);
      this.colorizeStroke = { color: this.foregroundHex(), radius: Math.max(1, this.brush.size / 2), points: [{ ...point }] };
      this.colorizeStrokeLayerId = layer.id;
      this.colorizeStrokeMaskId = mask.id;
      this.last = point;
      this.q<HTMLElement>('#status').textContent = 'Pintando una marca de colorización.';
      return true;
    }

  protected extendColorizeStroke(point: { x: number; y: number }, finalPoint: boolean): void {
      if (!this.colorizeStroke || !this.last) return;
      const step = Math.max(1, this.colorizeStroke.radius * (this.brush.spacing / 100));
      const dx = point.x - this.last.x;
      const dy = point.y - this.last.y;
      const distance = Math.hypot(dx, dy);
      if (distance < step && !finalPoint) return;
      const count = Math.max(1, Math.floor(distance / step));
      for (let index = 1; index <= count; index++) {
        this.colorizeStroke.points.push({ x: this.last.x + dx * index / count, y: this.last.y + dy * index / count });
      }
      this.last = point;
    }

  protected finishColorizeStroke(): void {
      const stroke = this.colorizeStroke;
      const layerId = this.colorizeStrokeLayerId;
      const maskId = this.colorizeStrokeMaskId;
      this.colorizeStroke = null;
      this.colorizeStrokeLayerId = null;
      this.colorizeStrokeMaskId = null;
      this.last = null;
      if (stroke && layerId && maskId) {
        this.ctl.updateMask(layerId, maskId, (mask) => mask.type === 'colorize'
          ? { ...mask, strokes: [...mask.strokes, stroke] }
          : mask);
      }
      this.colorizeOutputCache.clear();
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    }

  protected onPointerMove(e: PointerEvent, finalPoint = false): void {
      if (this.vectorGesture) { this.updateVectorGesture(this.toDoc(e)); return; }
      if (this.comicPanelStart) { this.drawComicPanelPreview(e); return; }
      if (this.isPanning && this.panStart) {
        this.panX = this.panStart.x + e.clientX - this.panStart.clientX;
        this.panY = this.panStart.y + e.clientY - this.panStart.clientY;
        this.applyCanvasView();
        return;
      }
      if (this.colorizeStroke) {
        this.extendColorizeStroke(this.toDoc(e), finalPoint);
        return;
      }
      if (!this.stroke || !this.last || !this.strokeTool) return;
      if (this.strokeTool === 'line' || this.strokeTool === 'rectangle' || this.strokeTool === 'ellipse') {
        this.drawToolPreview(e);
        return;
      }
      if (this.strokeTool !== 'brush' && this.strokeTool !== 'eraser' && this.strokeTool !== 'clone-stamp') return;
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
        this.stampInterpolatedSegment(this.last, dx, dy, n);
        this.last = p;
      }
    }

  protected stampInterpolatedSegment(start: { x: number; y: number }, dx: number, dy: number, steps: number): void {
      for (let index = 1; index <= steps; index++) {
        this.pendingBrushDabs.push({ x: start.x + (dx * index) / steps, y: start.y + (dy * index) / steps });
      }
      this.requestRefreshFrame();
    }

  protected processPendingBrushDabs(): void {
    if (!this.hasPendingBrushDabs()) return this.finishQueuedStrokeIfReady();
    if (!this.canProcessPendingBrushDabs()) return this.cancelPendingBrushDabs();
    const startedAt = performance.now();
    let processed = 0;
    try {
      processed = this.processBrushDabBatch(startedAt);
    } catch (error) {
      this.abortStroke(error);
      return;
    }
    this.finishBrushDabBatch(processed);
  }

  private canProcessPendingBrushDabs(): boolean {
    return Boolean(this.stroke && this.strokeLayer
      && this.strokeTool !== null && ['brush', 'eraser', 'clone-stamp'].includes(this.strokeTool));
  }

  private cancelPendingBrushDabs(): void {
    this.clearPendingBrushDabs();
    this.pendingStrokeFinish = null;
  }

  private processBrushDabBatch(startedAt: number): number {
    let processed = 0;
    while (this.shouldProcessNextBrushDab(startedAt, processed)) {
      this.processNextBrushDab();
      processed++;
    }
    return processed;
  }

  private shouldProcessNextBrushDab(startedAt: number, processed: number): boolean {
    return this.hasPendingBrushDabs() && processed < 64 && performance.now() - startedAt < 4;
  }

  private processNextBrushDab(): void {
    const point = this.pendingBrushDabs[this.pendingBrushDabHead++];
    this.stamp(point.x, point.y);
  }

  private finishBrushDabBatch(processed: number): void {
    this.compactPendingBrushDabs();
    if (processed > 0) updateHistoryMemoryIndicator(this.root, this.ctl.historyMemoryBytes);
    if (this.hasPendingBrushDabs()) {
      this.requestRefreshFrame();
      return;
    }
    this.finishQueuedStrokeIfReady();
  }

  protected hasPendingBrushDabs(): boolean {
      return this.pendingBrushDabHead < this.pendingBrushDabs.length;
    }

  protected compactPendingBrushDabs(): void {
      if (this.pendingBrushDabHead >= this.pendingBrushDabs.length) {
        this.clearPendingBrushDabs();
        return;
      }
      if (this.pendingBrushDabHead < 1024 || this.pendingBrushDabHead * 2 < this.pendingBrushDabs.length) return;
      this.pendingBrushDabs.splice(0, this.pendingBrushDabHead);
      this.pendingBrushDabHead = 0;
    }

  protected clearPendingBrushDabs(): void {
      this.pendingBrushDabs.length = 0;
      this.pendingBrushDabHead = 0;
    }

  protected finishQueuedStrokeIfReady(): void {
      if (this.hasPendingBrushDabs() || !this.pendingStrokeFinish) return;
      const { tool } = this.pendingStrokeFinish;
      this.pendingStrokeFinish = null;
      this.finishStroke(tool);
    }

  protected drawToolPreview(e: PointerEvent): void {
    if (!this.shapeStart) return;
    const context = this.prepareToolPreviewContext(e);
    if (!context) return;
    this.drawSelectedToolPreview(context);
    context.ctx.globalAlpha = 1;
  }

  private prepareToolPreviewContext(e: PointerEvent): ToolPreviewContext | null {
    this.updatePreviewCanvasSize();
    const preview = this.q<HTMLCanvasElement>('#tool-preview');
    const ctx = preview.getContext('2d');
    if (!ctx || !this.shapeStart) return null;
    this.resetPreviewContext(ctx, preview);
    const stage = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
    const rect = this.canvas.getBoundingClientRect();
    const scale = Math.min(rect.width / this.ctl.doc.width, rect.height / this.ctl.doc.height);
    const start = { x: this.shapeStart.clientX - stage.left, y: this.shapeStart.clientY - stage.top };
    const end = { x: e.clientX - stage.left, y: e.clientY - stage.top };
    this.configurePreviewStroke(ctx, scale);
    return { ctx, start, end };
  }

  private resetPreviewContext(ctx: CanvasRenderingContext2D, preview: HTMLCanvasElement): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, preview.width, preview.height);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private configurePreviewStroke(ctx: CanvasRenderingContext2D, scale: number): void {
    ctx.globalAlpha = this.brush.opacity / 100;
    ctx.strokeStyle = this.foregroundHex();
    ctx.fillStyle = this.foregroundHex();
    ctx.lineWidth = Math.max(1, this.brush.size * scale);
    ctx.lineCap = this.brush.lineCap;
    ctx.lineJoin = this.brush.lineJoin;
  }

  private drawSelectedToolPreview(preview: ToolPreviewContext): void {
    if (this.strokeTool === 'line') return this.drawLinePreview(preview);
    if (this.strokeTool === 'rectangle') return this.drawRectanglePreview(preview);
    if (this.strokeTool === 'ellipse') return this.drawEllipsePreview(preview);
  }

  private drawLinePreview({ ctx, start, end }: ToolPreviewContext): void {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  private drawRectanglePreview({ ctx, start, end }: ToolPreviewContext): void {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (this.brush.shapeFill) ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
  }

  private drawEllipsePreview({ ctx, start, end }: ToolPreviewContext): void {
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    const radiusX = Math.max(0.5, Math.abs(end.x - start.x) / 2);
    const radiusY = Math.max(0.5, Math.abs(end.y - start.y) / 2);
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    if (this.brush.shapeFill) ctx.fill();
    ctx.stroke();
  }

  protected up(e?: PointerEvent): void {
      if (this.vectorGesture) return this.finishVectorGestureAtPointer(e);
      if (this.comicPanelStart) { this.finishComicPanel(e); return; }
      if (this.isPanning) {
        this.isPanning = false; this.panStart = null; this.applyCanvasView();
        return;
      }
      if (this.colorizeStroke) {
        this.finishColorizeStroke();
        return;
      }
      if (!this.stroke) { this.clearToolPreview(); return; }
      try {
        this.commitPointerUpAction(e, this.strokeTool);
        this.finishPendingBrushDabsOrStroke(this.strokeTool);
      } catch (error) {
        this.abortStroke(error);
      }
    }

  private finishPendingBrushDabsOrStroke(tool: Tool | null): void {
    if (!this.hasPendingBrushDabs()) {
      this.finishStroke(tool);
      return;
    }
    this.pendingStrokeFinish = { tool: this.strokeTool };
    this.requestRefreshFrame();
  }

  private finishVectorGestureAtPointer(event?: PointerEvent): void {
    if (!this.vectorGesture) return;
    const point = event ? this.toDoc(event) : this.vectorGesture.startPoint;
    this.finishVectorGesture(point);
  }

  protected finishStroke(tool: Tool | null): void {
      const stroke = this.stroke;
      if (!stroke) return;
      const label: Record<Tool, string> = {
        brush: 'Pincel', eraser: 'Borrador', eyedropper: 'Cuentagotas', line: 'Línea',
        rectangle: 'Rectángulo', ellipse: 'Elipse', fill: 'Relleno', hand: 'Mover lienzo',
        text: 'Texto', 'vector-select': 'Selección vectorial', 'clone-stamp': 'Tampón de clonar', 'comic-panel': 'Marco y viñetas',
      };
      try {
        stroke.end(label[tool ?? 'brush']);
      } catch (error) {
        this.abortStroke(error);
        return;
      }
      this.clearStrokeState();
      this.updateHistoryUI();
      this.requestRefreshFrame();
    }

  protected abortStroke(error: unknown): void {
      this.clearPendingBrushDabs();
      this.pendingStrokeFinish = null;
      try { this.stroke?.cancel(); } catch { /* La sesión puede haber terminado durante el error. */ }
      this.invalidateFilterRender();
      this.q<HTMLElement>('#status').textContent = error instanceof Error ? error.message : String(error);
      this.clearStrokeState();
      this.updateHistoryUI();
      this.requestRefreshFrame();
    }

  protected clearStrokeState(): void {
      this.stroke = null;
      this.strokeLayer = null;
      this.strokeLayerNodeId = null;
      this.strokeHasGlobalFilterDependency = false;
      this.strokeTool = null;
      this.last = null;
      this.shapeStart = null;
      this.clearCloneOriginalTiles();
      this.cloneDestinationStart = null;
      this.clearToolPreview();
    }

  protected fillAt(point: { x: number; y: number }, node: LayerNode): void {
      const limitMessage = this.fillLimitMessage();
      if (limitMessage) {
        this.q<HTMLElement>('#status').textContent = limitMessage;
        return;
      }
      const operation = this.createFillOperation(point, node);
      if (!operation) return;
      const result = this.executeFillOperation(operation);
      if (result.filled === 0) {
        this.q<HTMLElement>('#status').textContent = 'No se encontraron píxeles dentro de la tolerancia.';
        return;
      }
      this.commitFillResult(node, operation, result);
      this.q<HTMLElement>('#status').textContent = `Relleno aplicado · ${result.filled.toLocaleString()} píxeles`;
      this.updateHistoryUI();
      if (containsLayerType(this.ctl.doc.layers, 'filter')) this.scheduleRefresh();
    }

  protected fillLimitMessage(): string | null {
      const total = this.ctl.doc.width * this.ctl.doc.height;
      if (total > 8_000_000) {
        return 'El relleno está limitado a 8 millones de píxeles para proteger la memoria. Reducí el tamaño o usá un documento más pequeño.';
      }
      if (this.brush.sampleMerged && total > 4_000_000) {
        return 'El muestreo de todas las capas en el bote de pintura admite hasta 4 millones de píxeles por operación.';
      }
      return null;
    }

  protected createFillOperation(point: { x: number; y: number }, node: LayerNode): FillOperation | null {
      if (!this.ctl.layerPixels(node)) return null;
      const { width, height } = this.ctl.doc;
      const original = this.ctl.readPixels(node) ?? new Uint8Array(width * height * 4);
      const reference = this.brush.sampleMerged ? this.compositePixelsForSampling() : original;
      if (!reference) return null;
      const seedX = Math.max(0, Math.min(width - 1, Math.floor(point.x)));
      const seedY = Math.max(0, Math.min(height - 1, Math.floor(point.y)));
      const seed = (seedY * width + seedX) * 4;
      const seedColor: [number, number, number, number] = [
        reference[seed], reference[seed + 1], reference[seed + 2], reference[seed + 3],
      ];
      const color: [number, number, number] = [this.brush.rgb[0], this.brush.rgb[1], this.brush.rgb[2]];
      return {
        width, height, original, reference, seedX, seedY, seedColor,
        tolerance: this.brush.tolerance, color,
        opacity: this.brush.opacity / 100, contiguous: this.brush.contiguous,
      };
    }

  protected executeFillOperation(operation: FillOperation): FillResult {
      const result: FillResult = {
        pixels: new Uint8Array(operation.original), filled: 0,
        minX: operation.width, minY: operation.height, maxX: -1, maxY: -1,
      };
      const strategy = operation.contiguous ? this.fillStrategies.contiguous : this.fillStrategies.global;
      strategy.execute(operation, result, {
        matches: (fillOperation, offset) => this.fillMatches(fillOperation, offset),
        paintPixel: (fillOperation, fillResult, pixel) => this.paintFillPixel(fillOperation, fillResult, pixel),
      });
      return result;
    }

  protected fillMatches(operation: FillOperation, offset: number): boolean {
      const reference = operation.reference;
      const seed = operation.seedColor;
      const difference = Math.max(
        Math.abs(reference[offset] - seed[0]),
        Math.abs(reference[offset + 1] - seed[1]),
        Math.abs(reference[offset + 2] - seed[2]),
        Math.abs(reference[offset + 3] - seed[3]),
      );
      return difference <= operation.tolerance;
    }

  protected paintFillPixel(operation: FillOperation, result: FillResult, pixel: number): void {
      const offset = pixel * 4;
      const data = result.pixels;
      const sourceAlpha = operation.opacity;
      const oldAlpha = data[offset + 3] / 255;
      const outputAlpha = sourceAlpha + oldAlpha * (1 - sourceAlpha);
      if (outputAlpha > 0) {
        const oldWeight = oldAlpha * (1 - sourceAlpha);
        data[offset] = Math.round((operation.color[0] * sourceAlpha + data[offset] * oldWeight) / outputAlpha);
        data[offset + 1] = Math.round((operation.color[1] * sourceAlpha + data[offset + 1] * oldWeight) / outputAlpha);
        data[offset + 2] = Math.round((operation.color[2] * sourceAlpha + data[offset + 2] * oldWeight) / outputAlpha);
        data[offset + 3] = Math.round(outputAlpha * 255);
      }
      result.filled++;
      this.expandFillBounds(result, pixel, operation.width);
    }

  protected expandFillBounds(result: FillResult, pixel: number, width: number): void {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      result.minX = Math.min(result.minX, x);
      result.minY = Math.min(result.minY, y);
      result.maxX = Math.max(result.maxX, x);
      result.maxY = Math.max(result.maxY, y);
    }

  protected commitFillResult(node: LayerNode, operation: FillOperation, result: FillResult): void {
      const regionWidth = result.maxX - result.minX + 1;
      const regionHeight = result.maxY - result.minY + 1;
      const region = this.extractFillRegion(operation, result, regionWidth, regionHeight);
      this.clipPixelsToComicPanel(node, { left: result.minX, top: result.minY, width: regionWidth, height: regionHeight }, region);
      runEdit(this.ctx, node.engineId, 'Bote de pintura', (layer) => {
        layer.writeRectFromJS(result.minX, result.minY, regionWidth, regionHeight, region);
      });
    }

  protected extractFillRegion(
      operation: FillOperation,
      result: FillResult,
      regionWidth: number,
      regionHeight: number,
    ): Uint8Array {
      const region = new Uint8Array(regionWidth * regionHeight * 4);
      for (let row = 0; row < regionHeight; row++) {
        const sourceStart = ((result.minY + row) * operation.width + result.minX) * 4;
        region.set(result.pixels.subarray(sourceStart, sourceStart + regionWidth * 4), row * regionWidth * 4);
      }
      return region;
    }
}
