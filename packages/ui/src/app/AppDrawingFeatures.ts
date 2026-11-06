// Drawing tools, brush strokes and fill operations.
import { AppEventFeatures } from './AppEventFeatures';
import { type StampOperation } from '@nvts/image-processing';
import { CloneStampStrategy, ContiguousFillStrategy, EraserStrategy, EyedropperStrategy, GlobalFillStrategy, PaintBrushStrategy, TextCreationStrategy, VectorSelectionStrategy, type BrushStrategy, type CloneStampOperation, type ImmediateToolStrategy } from './EditorStrategies';
import { containsLayerType, runEdit, StrokeSession, type LayerNode } from '@nvts/document-model';
import { cloneLayerMasks, cloneVectorShapes, createLayerMask, getVectorShapeBounds, isPixelLayerType, type LayerMask, type TransformMask, type VectorShape } from '@nvts/shared';
import { renderVectorShape } from '@nvts/vector';
import { findVectorSelectionTarget, getDocumentDisplayTransform } from './VectorSelectionGeometry';
import { eraseVectorStrokeAt } from './VectorStrokeEraser';
import { isBrushStrokeTool as isBrushStrokeToolId, isPixelShapeTool, isVectorDrawingTool, type PixelShapeToolId, type VectorDrawingToolId } from '../tools/ToolsBase';
import { renderRasterShape, type RasterShapeSettings } from './RasterShapeRenderer';
import { createTransformMaskValues, moveRect, resizeRect, snapMoveRect, snapResizeRect, transformRectWithMask, translateVectorShapes, type LayerRect, type SnapGuides } from '../tools/LayerTransformGeometry';
import { movePixelSurface } from '../tools/PixelLayerMover';
import { simplifyVectorLine } from '../tools/VectorLineCorrection';
import { updateHistoryMemoryIndicator } from '../panels/HistoryPanel';
import { createComicSplitShapes as buildComicSplitShapes } from '../features/comics/createComicSplitShapes';
import type { Tool, ToolSettings, FillOperation, FillResult, PixelRegion, StrokeLayerPixels } from './AppBase';
import { symmetryManager } from '../managers/SymmetryManager';
import { createMagicWandMask, createSelectionMask, getSelectionBounds, type SelectionKind, type SelectionPoint } from '../tools/RasterSelection';
import { paintSelectionMask } from '../tools/SelectionBrush';
import { createGapClosedMatchMask } from '../tools/GapClosure';

const MAX_CLONE_ORIGINAL_TILE_BYTES = 64 * 1024 * 1024;

type ToolPreviewContext = {
  ctx: CanvasRenderingContext2D;
  start: { x: number; y: number };
  end: { x: number; y: number };
  scale: number;
};

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

type LayerTransformSession = {
  layerId: string;
  originalMasks: LayerMask[];
  baseMasks: LayerMask[];
  template: TransformMask;
  baseBounds: LayerRect;
  currentBounds: LayerRect;
  latestMasks: LayerMask[];
};

type LayerTransformHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type LayerTransformGesture = {
  pointerId: number;
  handle: LayerTransformHandle;
  startPoint: { x: number; y: number };
  startBounds: LayerRect;
};

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
  private rasterMoveGesture: { layerId: string; startPoint: { x: number; y: number }; currentPoint: { x: number; y: number }; pointerId: number } | null = null;
  private selectionGesture: { kind: SelectionKind; startPoint: SelectionPoint; points: SelectionPoint[]; pointerId: number } | null = null;
  private selectionBrushGesture: { pointerId: number; lastPoint: SelectionPoint; erase: boolean } | null = null;
  private selectionRenderCanvas: HTMLCanvasElement | null = null;
  private layerTransformSession: LayerTransformSession | null = null;
  private layerTransformGesture: LayerTransformGesture | null = null;
  private layerTransformOverlay: HTMLElement | null = null;
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
      if (!this.strokeLayer || !this.stroke) return;
      const points = this.shouldMirrorCurrentStroke()
        ? symmetryManager.getSymmetryPoints({ x, y }, this.ctl.doc.width, this.ctl.doc.height)
        : [{ x, y }];
      points.forEach((point) => this.stampAt(point.x, point.y));
    }

  private shouldMirrorCurrentStroke(): boolean {
    if (!symmetryManager.isEnabled()) return false;
    return isBrushStrokeToolId(this.strokeTool);
  }

  private stampAt(x: number, y: number): void {
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
      const original = this.selectionMask ? pixels.slice() : null;
      const changed = this.applyStampStrategy(pixels, operation);
      if (!changed) return;
      this.clipStampPixelsToComicPanel(operation.region, pixels);
      if (original) this.restoreOutsideSelection(original, pixels, operation.region);
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
      if (this.strokeTool === 'smudge') return this.applySmudge(pixels, operation);
      if (this.strokeTool === 'liquify') return this.applyLiquify(pixels, operation);
      if (this.strokeTool === 'dust-removal') return this.applyDustRemoval(pixels, operation);
      const strategy = this.brushStrategies[this.strokeTool === 'eraser' ? 'eraser' : 'brush'];
      return strategy.apply(pixels, operation);
    }

  private applyDustRemoval(pixels: Uint8Array, operation: StampOperation): boolean {
    const original = pixels.slice();
    const { width, height } = operation.region;
    let changed = false;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        changed = this.removeDustPixel(pixels, original, operation, x, y, width) || changed;
      }
    }
    return changed;
  }

  private removeDustPixel(
    pixels: Uint8Array,
    original: Uint8Array,
    operation: StampOperation,
    x: number,
    y: number,
    width: number,
  ): boolean {
    const docX = operation.region.left + x + 0.5 - operation.centerX;
    const docY = operation.region.top + y + 0.5 - operation.centerY;
    if (docX * docX + docY * docY > operation.radius * operation.radius) return false;
    const index = (y * width + x) * 4;
    if (original[index + 3] < 64) return false;
    const neighborhood = this.getDustNeighborhood(original, x, y, width);
    if (neighborhood.count < 5 || neighborhood.spread > 44) return false;
    const difference = Math.max(
      Math.abs(original[index] - neighborhood.red),
      Math.abs(original[index + 1] - neighborhood.green),
      Math.abs(original[index + 2] - neighborhood.blue),
    );
    if (difference < 68) return false;
    const blend = Math.max(0, Math.min(1, operation.opacity * 0.85));
    pixels[index] = Math.round(original[index] * (1 - blend) + neighborhood.red * blend);
    pixels[index + 1] = Math.round(original[index + 1] * (1 - blend) + neighborhood.green * blend);
    pixels[index + 2] = Math.round(original[index + 2] * (1 - blend) + neighborhood.blue * blend);
    return true;
  }

  private getDustNeighborhood(
    pixels: Uint8Array,
    x: number,
    y: number,
    width: number,
  ): { red: number; green: number; blue: number; spread: number; count: number } {
    const totals = { red: 0, green: 0, blue: 0, count: 0, min: 255, max: 0 };
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        if (offsetX === 0 && offsetY === 0) continue;
        this.addDustNeighbor(pixels, x + offsetX, y + offsetY, width, totals);
      }
    }
    if (!totals.count) return { red: 0, green: 0, blue: 0, spread: 255, count: 0 };
    return {
      red: totals.red / totals.count,
      green: totals.green / totals.count,
      blue: totals.blue / totals.count,
      spread: totals.max - totals.min,
      count: totals.count,
    };
  }

  private addDustNeighbor(
    pixels: Uint8Array,
    x: number,
    y: number,
    width: number,
    totals: { red: number; green: number; blue: number; count: number; min: number; max: number },
  ): void {
    const index = (y * width + x) * 4;
    if (pixels[index + 3] < 64) return;
    const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
    totals.red += pixels[index];
    totals.green += pixels[index + 1];
    totals.blue += pixels[index + 2];
    totals.min = Math.min(totals.min, luminance);
    totals.max = Math.max(totals.max, luminance);
    totals.count++;
  }

  private applySmudge(pixels: Uint8Array, operation: StampOperation): boolean {
    const original = pixels.slice();
    const { width, height } = operation.region;
    const mode = this.brush.smudgeMode;
    const strength = this.getSmudgeStrength(mode, operation.opacity);
    for (let y = 1; y < height - 1; y++) this.smudgeRow(pixels, original, operation, y, width, strength, mode);
    return true;
  }

  private getSmudgeStrength(mode: ToolSettings['smudgeMode'], opacity: number): number {
    const factors: Record<ToolSettings['smudgeMode'], number> = { smudge: 0.35, blur: 0.72, mixer: 0.48, wet: 0.62 };
    return Math.max(0.05, Math.min(1, opacity * factors[mode]));
  }

  private smudgeRow(pixels: Uint8Array, original: Uint8Array, operation: StampOperation, y: number, width: number, strength: number, mode: ToolSettings['smudgeMode']): void {
    for (let x = 1; x < width - 1; x++) this.smudgePixel(pixels, original, operation, x, y, width, strength, mode);
  }

  private smudgePixel(pixels: Uint8Array, original: Uint8Array, operation: StampOperation, x: number, y: number, width: number, strength: number, mode: ToolSettings['smudgeMode']): void {
    const dx = operation.region.left + x - operation.centerX;
    const dy = operation.region.top + y - operation.centerY;
    if (dx * dx + dy * dy > operation.radius * operation.radius) return;
    const index = (y * width + x) * 4;
    const sample = this.getSmudgeSample(original, index, width, operation.color, mode);
    pixels[index] = Math.round(original[index] * (1 - strength) + sample[0] * strength);
    pixels[index + 1] = Math.round(original[index + 1] * (1 - strength) + sample[1] * strength);
    pixels[index + 2] = Math.round(original[index + 2] * (1 - strength) + sample[2] * strength);
  }

  private getSmudgeSample(
    pixels: Uint8Array, index: number, width: number, foreground: readonly [number, number, number], mode: ToolSettings['smudgeMode'],
  ): readonly [number, number, number] {
    const averages: [number, number, number] = [
      (pixels[index - 4] + pixels[index + 4] + pixels[index - width * 4] + pixels[index + width * 4]) / 4,
      (pixels[index - 3] + pixels[index + 5] + pixels[index - width * 4 + 1] + pixels[index + width * 4 + 1]) / 4,
      (pixels[index - 2] + pixels[index + 6] + pixels[index - width * 4 + 2] + pixels[index + width * 4 + 2]) / 4,
    ];
    if (mode === 'mixer') return this.mixSmudgeColor(averages, foreground, 0.4);
    if (mode === 'wet') return this.mixSmudgeColor(averages, foreground, 0.18);
    return averages;
  }

  private mixSmudgeColor(
    sampled: readonly [number, number, number], foreground: readonly [number, number, number], foregroundWeight: number,
  ): readonly [number, number, number] {
    return [0, 1, 2].map((channel) => Math.round(sampled[channel] * (1 - foregroundWeight) + foreground[channel] * foregroundWeight)) as [number, number, number];
  }

  private applyLiquify(pixels: Uint8Array, operation: StampOperation): boolean {
      const original = pixels.slice(); const { width, height } = operation.region;
      const shift = Math.max(1, Math.min(4, Math.round(operation.radius * 0.12)));
      for (let y = 0; y < height; y++) this.liquifyRow(pixels, original, operation, y, width, shift);
      return true;
    }

  private liquifyRow(pixels: Uint8Array, original: Uint8Array, operation: StampOperation, y: number, width: number, shift: number): void {
      for (let x = 0; x < width; x++) this.liquifyPixel(pixels, original, operation, x, y, width, shift);
    }

  private liquifyPixel(pixels: Uint8Array, original: Uint8Array, operation: StampOperation, x: number, y: number, width: number, shift: number): void {
      const dx = operation.region.left + x - operation.centerX; const dy = operation.region.top + y - operation.centerY;
      if (dx * dx + dy * dy > operation.radius * operation.radius) return;
      const sourceX = Math.max(0, Math.min(width - 1, x - shift));
      const source = (y * width + sourceX) * 4; const target = (y * width + x) * 4;
      pixels[target] = original[source]; pixels[target + 1] = original[source + 1];
      pixels[target + 2] = original[source + 2]; pixels[target + 3] = original[source + 3];
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
        tipShape: this.brush.tipShape,
        texture: this.brush.texture,
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

  protected commitGradient(start: { x: number; y: number }, end: { x: number; y: number }): void {
      const layer = this.strokeLayer;
      if (!layer) return;
      const width = this.ctl.doc.width;
      const height = this.ctl.doc.height;
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = Math.max(1, dx * dx + dy * dy);
      const [red, green, blue] = this.brush.rgb;
      const chunkHeight = 64;
      for (let top = 0; top < height; top += chunkHeight) {
        this.applyGradientChunk(layer, start, dx, dy, lengthSquared, red, green, blue, width, height, top, chunkHeight);
      }
      this.scheduleRefreshForRegion({ left: 0, top: 0, width, height });
    }

  private applyGradientChunk(layer: NonNullable<StrokeLayerPixels>, start: { x: number; y: number }, dx: number, dy: number, lengthSquared: number, red: number, green: number, blue: number, width: number, height: number, top: number, chunkHeight: number): void {
      const rows = Math.min(chunkHeight, height - top);
      const bytes = width * rows * 4;
      const original = new Uint8Array(bytes);
      const pixels = new Uint8Array(bytes);
      layer.readRectToJS(0, top, width, rows, original);
      for (let localY = 0; localY < rows; localY++) {
        this.applyGradientRow(pixels, original, start, dx, dy, lengthSquared, red, green, blue, width, top, localY);
      }
      this.restoreOutsideSelection(original, pixels, { left: 0, top, width, height: rows });
      layer.writeRectFromJS(0, top, width, rows, pixels);
    }

  private applyGradientRow(pixels: Uint8Array, original: Uint8Array, start: { x: number; y: number }, dx: number, dy: number, lengthSquared: number, red: number, green: number, blue: number, width: number, top: number, localY: number): void {
      for (let x = 0; x < width; x++) {
        this.applyGradientPixel(pixels, original, start, dx, dy, lengthSquared, red, green, blue, width, top, localY, x);
      }
    }

  private applyGradientPixel(pixels: Uint8Array, original: Uint8Array, start: { x: number; y: number }, dx: number, dy: number, lengthSquared: number, red: number, green: number, blue: number, width: number, top: number, localY: number, x: number): void {
      const index = (localY * width + x) * 4;
      const y = top + localY;
      const t = this.getGradientPosition(x, y, start, dx, dy, lengthSquared);
      const alpha = (1 - t) * (this.brush.opacity / 100);
      const oldAlpha = original[index + 3] / 255;
      const outAlpha = alpha + oldAlpha * (1 - alpha);
      if (outAlpha <= 0) return;
      pixels[index] = Math.round((red * alpha + original[index] * oldAlpha * (1 - alpha)) / outAlpha);
      pixels[index + 1] = Math.round((green * alpha + original[index + 1] * oldAlpha * (1 - alpha)) / outAlpha);
      pixels[index + 2] = Math.round((blue * alpha + original[index + 2] * oldAlpha * (1 - alpha)) / outAlpha);
      pixels[index + 3] = Math.round(outAlpha * 255);
    }

  private getGradientPosition(x: number, y: number, start: { x: number; y: number }, dx: number, dy: number, lengthSquared: number): number {
      const offsetX = x - start.x;
      const offsetY = y - start.y;
      const position = this.brush.gradientType === 'radial'
        ? Math.sqrt(offsetX * offsetX + offsetY * offsetY) / Math.sqrt(lengthSquared)
        : this.brush.gradientType === 'contour'
          ? this.getContourGradientPosition(x, y, start, dx, dy)
          : (offsetX * dx + offsetY * dy) / lengthSquared;
      const clamped = Math.max(0, Math.min(1, position));
      return this.brush.gradientReverse ? 1 - clamped : clamped;
    }

  private getContourGradientPosition(x: number, y: number, start: { x: number; y: number }, dx: number, dy: number): number {
    const radiusX = Math.max(0.5, Math.abs(dx) / 2);
    const radiusY = Math.max(0.5, Math.abs(dy) / 2);
    const centerX = start.x + dx / 2;
    const centerY = start.y + dy / 2;
    const normalizedX = (x - centerX) / radiusX;
    const normalizedY = (y - centerY) / radiusY;
    const distance = Math.sqrt(normalizedX * normalizedX + normalizedY * normalizedY);
    return Math.max(0, Math.min(1, 1 - distance));
  }

  protected commitShape(
    start: { x: number; y: number },
    end: { x: number; y: number },
    tool: Tool,
    points: readonly { x: number; y: number }[] = this.pixelShapePoints,
  ): void {
      const layer = this.strokeLayer;
      if (!layer) return;
      const region = this.getShapeRegion(start, end, tool, points);
      if (!region) return;
      const source = this.renderShapePixels(start, end, tool, region, points);
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

  protected getShapeRegion(
    start: { x: number; y: number },
    end: { x: number; y: number },
    tool: Tool = 'rectangle',
    points: readonly { x: number; y: number }[] = [],
  ): PixelRegion | null {
      const boundsPoints = tool === 'pixel-polyline' && points.length > 1 ? points : [start, end];
      const xs = boundsPoints.map((point) => point.x);
      const ys = boundsPoints.map((point) => point.y);
      const strokePadding = Math.ceil(this.brush.size / 2) + 2;
      const curvePadding = tool === 'pixel-bezier'
        ? Math.ceil(Math.min(160, Math.hypot(end.x - start.x, end.y - start.y) * 0.24))
        : 0;
      const padding = strokePadding + curvePadding;
      const left = Math.max(0, Math.floor(Math.min(...xs) - padding));
      const top = Math.max(0, Math.floor(Math.min(...ys) - padding));
      const right = Math.min(this.ctl.doc.width, Math.ceil(Math.max(...xs) + padding));
      const bottom = Math.min(this.ctl.doc.height, Math.ceil(Math.max(...ys) + padding));
      const region = { left, top, width: right - left, height: bottom - top };
      return region.width > 0 && region.height > 0 ? region : null;
    }

  protected renderShapePixels(
      start: { x: number; y: number },
      end: { x: number; y: number },
      tool: Tool,
      region: PixelRegion,
      points: readonly { x: number; y: number }[] = [],
    ): Uint8ClampedArray | null {
      const scratch = document.createElement('canvas');
      scratch.width = region.width;
      scratch.height = region.height;
      const ctx = scratch.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      this.drawShapeSource(ctx, start, end, tool, region, points);
      ctx.globalAlpha = 1;
      return ctx.getImageData(0, 0, region.width, region.height).data;
    }

  protected drawShapeSource(
      ctx: CanvasRenderingContext2D,
      start: { x: number; y: number },
      end: { x: number; y: number },
      tool: Tool,
      region: PixelRegion,
      points: readonly { x: number; y: number }[] = [],
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
      if (isPixelShapeTool(tool)) {
        const localPoints = points.map((point) => ({ x: point.x - region.left, y: point.y - region.top }));
        renderRasterShape(ctx, tool, { x: x1, y: y1 }, { x: x2, y: y2 }, this.getRasterShapeSettings(), localPoints);
        return;
      }
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

  private getRasterShapeSettings(): RasterShapeSettings {
    return {
      color: this.foregroundHex(),
      opacity: this.brush.opacity,
      size: this.brush.size,
      lineCap: this.brush.lineCap,
      lineJoin: this.brush.lineJoin,
      shapeFill: this.brush.shapeFill,
      shapeCornerRadius: this.brush.shapeCornerRadius,
      polygonSides: this.brush.polygonSides,
      starPoints: this.brush.starPoints,
      spiralTurns: this.brush.spiralTurns,
    };
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
        const pixel = offset / 4;
        const x = region.left + (pixel % region.width);
        const y = region.top + Math.floor(pixel / region.width);
        if (!this.isSelectionPixelSelected(x, y)) continue;
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
      if (this.beginSelectionBrush(point, event)) return;
      if (this.handleSelectionTool(point, event)) return;
      if (this.handleImmediateTool(point, event)) return;
      if (this.tool === 'move') { this.beginElementMove(point, event); return; }
      if (this.tool === 'vector-eraser') { this.eraseVectorShapeAt(point); return; }
      if (this.tool === 'vector-line-correction') { this.correctVectorLineAt(point); return; }
      if (this.tool === 'comic-panel') { this.beginComicPanel(point, event); return; }
      if (isVectorDrawingTool(this.tool)) { this.beginVectorDrawingGesture(point, event); return; }
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


  private handleSelectionTool(point: SelectionPoint, event: PointerEvent): boolean {
    if (this.tool === 'selection-clear') {
      this.clearRasterSelection();
      this.q<HTMLElement>('#status').textContent = 'Selección eliminada.';
      return true;
    }
    if (this.tool === 'magic-wand') {
      this.selectMagicWand(point);
      return true;
    }
    const kind = this.getSelectionKind(this.tool);
    if (!kind) return false;
    this.beginSelectionGesture(kind, point, event);
    return true;
  }

  private beginSelectionBrush(point: SelectionPoint, event: PointerEvent): boolean {
    if (this.tool !== 'selection-brush' && this.tool !== 'selection-erase') return false;
    this.selectionBrushGesture = { pointerId: event.pointerId, lastPoint: { ...point }, erase: this.tool === 'selection-erase' };
    this.canvas.setPointerCapture(event.pointerId);
    this.paintSelectionBrushSegment(point, point);
    return true;
  }

  private updateSelectionBrush(point: SelectionPoint): void {
    const gesture = this.selectionBrushGesture;
    if (!gesture) return;
    this.paintSelectionBrushSegment(gesture.lastPoint, point);
    gesture.lastPoint = { ...point };
  }

  private paintSelectionBrushSegment(from: SelectionPoint, to: SelectionPoint): void {
    const gesture = this.selectionBrushGesture;
    if (!gesture) return;
    const { width, height } = this.ctl.doc;
    if (gesture.erase && !this.selectionMask) return;
    const mask = paintSelectionMask(this.selectionMask, width, height, from, to, Math.max(1, this.brush.size / 2), gesture.erase);
    this.applyRasterSelection(mask);
  }

  private finishSelectionBrush(event?: PointerEvent): void {
    const gesture = this.selectionBrushGesture;
    if (!gesture) return;
    if (event && event.pointerId !== gesture.pointerId) return;
    if (event && event.type !== 'pointercancel') this.updateSelectionBrush(this.toDoc(event));
    this.selectionBrushGesture = null;
    const count = this.selectionMask ? this.countSelectedPixels(this.selectionMask) : 0;
    this.q<HTMLElement>('#status').textContent = count
      ? `Selección activa · ${count.toLocaleString()} píxeles`
      : 'La selección está vacía.';
  }

  private getSelectionKind(tool: Tool): SelectionKind | null {
    if (tool === 'select-rectangle') return 'rectangle';
    if (tool === 'select-ellipse') return 'ellipse';
    if (tool === 'select-lasso') return 'lasso';
    if (tool === 'select-polygon') return 'polygon';
    return null;
  }

  private beginSelectionGesture(kind: SelectionKind, point: SelectionPoint, event: PointerEvent): void {
    this.selectionGesture = { kind, startPoint: { ...point }, points: [{ ...point }], pointerId: event.pointerId };
    this.canvas.setPointerCapture(event.pointerId);
    this.drawSelectionGesturePreview(point);
  }

  private updateSelectionGesture(point: SelectionPoint): void {
    const gesture = this.selectionGesture;
    if (!gesture) return;
    if (gesture.kind === 'lasso') this.appendLassoPoint(gesture.points, point);
    else gesture.points[1] = { ...point };
    this.drawSelectionGesturePreview(point);
  }

  private appendLassoPoint(points: SelectionPoint[], point: SelectionPoint): void {
    const lastPoint = points.at(-1);
    if (lastPoint && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 2) return;
    points.push({ ...point });
  }

  private finishSelectionGesture(event?: PointerEvent): void {
    const gesture = this.selectionGesture;
    if (!gesture) return;
    if (event?.type === 'pointercancel') {
      this.selectionGesture = null;
      this.clearSelectionGesturePreview();
      return;
    }
    if (event) this.updateSelectionGesture(this.toDoc(event));
    this.selectionGesture = null;
    const points = gesture.kind === 'lasso' ? gesture.points : [gesture.startPoint, gesture.points.at(-1) ?? gesture.startPoint];
    this.applyRasterSelection(createSelectionMask(this.ctl.doc.width, this.ctl.doc.height, gesture.kind, points));
  }

  private selectMagicWand(point: SelectionPoint): void {
    const layer = this.active();
    if (!layer || !isPixelLayerType(layer.type)) {
      this.q<HTMLElement>('#status').textContent = 'La varita mágica necesita una capa raster seleccionada.';
      return;
    }
    const pixels = this.ctl.readPixels(layer);
    if (!pixels) return;
    const { width, height } = this.ctl.doc;
    if (width * height > 8_000_000) {
      this.q<HTMLElement>('#status').textContent = 'La varita mágica admite hasta 8 millones de píxeles por selección.';
      return;
    }
    const mask = createMagicWandMask(width, height, pixels, Math.floor(point.x), Math.floor(point.y), this.brush.tolerance);
    this.applyRasterSelection(mask);
  }

  private applyRasterSelection(mask: Uint8Array): void {
    const { width, height } = this.ctl.doc;
    const bounds = getSelectionBounds(mask, width, height);
    this.selectionMask = bounds ? mask : null;
    this.selectionMaskWidth = this.selectionMask ? width : 0;
    this.selectionMaskHeight = this.selectionMask ? height : 0;
    this.drawSelectionOverlay();
    this.q<HTMLElement>('#status').textContent = bounds
      ? `Selección activa · ${this.countSelectedPixels(mask).toLocaleString()} píxeles`
      : 'No se seleccionaron píxeles.';
  }

  private countSelectedPixels(mask: Uint8Array): number {
    let count = 0;
    for (const value of mask) count += value;
    return count;
  }

  private drawSelectionGesturePreview(point: SelectionPoint): void {
    const gesture = this.selectionGesture;
    if (!gesture) return;
    const preview = this.q<HTMLCanvasElement>('#tool-preview');
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    this.resetPreviewContext(ctx, preview);
    const stage = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
    const display = getDocumentDisplayTransform(stage, this.canvas.getBoundingClientRect(), this.ctl.doc.width, this.ctl.doc.height);
    ctx.save();
    ctx.translate(display.left, display.top);
    ctx.scale(display.scale, display.scale);
    ctx.strokeStyle = '#18a8f0';
    ctx.lineWidth = 1 / display.scale;
    ctx.setLineDash([5 / display.scale, 3 / display.scale]);
    this.drawSelectionGesturePath(ctx, gesture, point);
    ctx.restore();
  }

  private drawSelectionGesturePath(ctx: CanvasRenderingContext2D, gesture: NonNullable<AppDrawingFeatures['selectionGesture']>, point: SelectionPoint): void {
    if (gesture.kind === 'rectangle') {
      const x = Math.min(gesture.startPoint.x, point.x);
      const y = Math.min(gesture.startPoint.y, point.y);
      ctx.strokeRect(x, y, Math.abs(point.x - gesture.startPoint.x), Math.abs(point.y - gesture.startPoint.y));
      return;
    }
    if (gesture.kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse((gesture.startPoint.x + point.x) / 2, (gesture.startPoint.y + point.y) / 2, Math.max(0.5, Math.abs(point.x - gesture.startPoint.x) / 2), Math.max(0.5, Math.abs(point.y - gesture.startPoint.y) / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    gesture.points.forEach((entry, index) => index === 0 ? ctx.moveTo(entry.x, entry.y) : ctx.lineTo(entry.x, entry.y));
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  private drawSelectionOverlay(): void {
    const preview = this.q<HTMLCanvasElement>('#selection-preview');
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    this.updatePreviewCanvasSize();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, preview.width, preview.height);
    const mask = this.selectionMask;
    if (!mask) return;
    const width = this.selectionMaskWidth;
    const height = this.selectionMaskHeight;
    this.selectionRenderCanvas = this.createSelectionRenderCanvas(mask, width, height);
    const stage = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
    const display = getDocumentDisplayTransform(stage, this.canvas.getBoundingClientRect(), width, height);
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.drawImage(this.selectionRenderCanvas, display.left, display.top, width * display.scale, height * display.scale);
    this.drawSelectionBounds(ctx, mask, width, height, display.left, display.top, display.scale);
  }

  private createSelectionRenderCanvas(mask: Uint8Array, width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return canvas;
    const image = context.createImageData(width, height);
    for (let index = 0; index < mask.length; index++) this.paintSelectionOverlayPixel(image.data, index, mask[index]);
    context.putImageData(image, 0, 0);
    return canvas;
  }

  private paintSelectionOverlayPixel(data: Uint8ClampedArray, pixelIndex: number, selected: number): void {
    if (!selected) return;
    const offset = pixelIndex * 4;
    data[offset] = 24;
    data[offset + 1] = 150;
    data[offset + 2] = 235;
    data[offset + 3] = 42;
  }

  private drawSelectionBounds(ctx: CanvasRenderingContext2D, mask: Uint8Array, width: number, height: number, left: number, top: number, scale: number): void {
    const bounds = getSelectionBounds(mask, width, height);
    if (!bounds) return;
    ctx.strokeStyle = '#18a8f0';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(left + bounds.left * scale, top + bounds.top * scale, (bounds.right - bounds.left) * scale, (bounds.bottom - bounds.top) * scale);
    ctx.setLineDash([]);
  }

  private clearSelectionGesturePreview(): void {
    const preview = this.q<HTMLCanvasElement>('#tool-preview');
    const ctx = preview.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, preview.width, preview.height);
  }

  private clearRasterSelection(): void {
    this.selectionMask = null;
    this.selectionMaskWidth = 0;
    this.selectionMaskHeight = 0;
    this.selectionRenderCanvas = null;
    const preview = this.root.querySelector<HTMLCanvasElement>('#selection-preview');
    const ctx = preview?.getContext('2d');
    if (ctx && preview) ctx.clearRect(0, 0, preview.width, preview.height);
  }

  private isSelectionPixelSelected(x: number, y: number): boolean {
    const mask = this.selectionMask;
    if (!mask || this.selectionMaskWidth !== this.ctl.doc.width || this.selectionMaskHeight !== this.ctl.doc.height) return true;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.selectionMaskWidth || iy >= this.selectionMaskHeight) return false;
    return mask[iy * this.selectionMaskWidth + ix] === 1;
  }

  private restoreOutsideSelection(original: Uint8Array, modified: Uint8Array, region: PixelRegion): void {
    if (!this.selectionMask || this.selectionMaskWidth !== this.ctl.doc.width || this.selectionMaskHeight !== this.ctl.doc.height) return;
    for (let y = 0; y < region.height; y++) this.restoreUnselectedRow(original, modified, region, y);
  }

  private restoreUnselectedRow(original: Uint8Array, modified: Uint8Array, region: PixelRegion, y: number): void {
    for (let x = 0; x < region.width; x++) {
      if (this.isSelectionPixelSelected(region.left + x, region.top + y)) continue;
      const offset = (y * region.width + x) * 4;
      modified.set(original.subarray(offset, offset + 4), offset);
    }
  }

  private applySelectionToFillResult(operation: FillOperation, result: FillResult): void {
    if (!this.selectionMask || this.selectionMaskWidth !== operation.width || this.selectionMaskHeight !== operation.height) return;
    result.filled = 0;
    result.minX = operation.width;
    result.minY = operation.height;
    result.maxX = -1;
    result.maxY = -1;
    for (let pixel = 0; pixel < operation.width * operation.height; pixel++) this.applyFillSelectionPixel(operation, result, pixel);
  }

  private applyFillSelectionPixel(operation: FillOperation, result: FillResult, pixel: number): void {
    const offset = pixel * 4;
    const selected = this.selectionMask?.[pixel] === 1;
    if (!selected) result.pixels.set(operation.original.subarray(offset, offset + 4), offset);
    if (!selected || this.pixelsMatch(operation.original, result.pixels, offset)) return;
    result.filled++;
    this.expandFillBounds(result, pixel, operation.width);
  }

  private pixelsMatch(first: Uint8Array, second: Uint8Array, offset: number): boolean {
    return first[offset] === second[offset] && first[offset + 1] === second[offset + 1]
      && first[offset + 2] === second[offset + 2] && first[offset + 3] === second[offset + 3];
  }

  private correctVectorLineAt(point: { x: number; y: number }): void {
    const layer = this.active();
    if (!layer || layer.type !== 'vector') {
      this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa vectorial para corregir sus trazos.';
      return;
    }
    const shapes = layer.vectorShapes ?? [];
    const target = findVectorSelectionTarget(point, shapes, (shape) => Math.max(6, shape.strokeWidth));
    if (!target) {
      this.q<HTMLElement>('#status').textContent = 'No hay un trazo vectorial bajo el cursor.';
      return;
    }
    const corrected = simplifyVectorLine(target.shape, Math.max(1, this.brush.size * 0.08));
    if (!corrected) {
      this.q<HTMLElement>('#status').textContent = 'El trazo no necesita simplificación o contiene controles Bézier.';
      return;
    }
    const next = shapes.map((shape) => shape.id === corrected.id ? corrected : shape);
    this.commitVectorShapes(layer, next);
    this.q<HTMLElement>('#status').textContent = 'Trazo vectorial simplificado.';
  }

  protected beginElementMove(point: { x: number; y: number }, event: PointerEvent): void {
    if (this.layerTransformSession) this.cancelLayerTransformSession();
    this.activeMaskId = '';
    this.canvas.dataset.moveOperation = 'content-only';
    const layer = this.active();
    if (!layer) return this.reportMoveUnavailable('Seleccioná una capa para mover sus elementos.');
    if (!this.ctl.isEffectivelyVisible(layer.id) || this.ctl.isEffectivelyLocked(layer.id)) {
      return this.reportMoveUnavailable('La capa está oculta o bloqueada.');
    }
    if (!isPixelLayerType(layer.type)) {
      return this.reportMoveUnavailable('La herramienta Mover admite capas de píxeles, texto, imágenes y vectores.');
    }
    this.rasterMoveGesture = { layerId: layer.id, startPoint: { ...point }, currentPoint: { ...point }, pointerId: event.pointerId };
    this.canvas.setPointerCapture(event.pointerId);
    this.canvas.style.cursor = 'grabbing';
    this.q<HTMLElement>('#status').textContent = 'Moviendo contenido · soltá para confirmar · Escape para cancelar.';
  }

  private reportMoveUnavailable(message: string): void {
    this.q<HTMLElement>('#status').textContent = message;
  }

  private updateElementMove(point: { x: number; y: number }): void {
    const gesture = this.rasterMoveGesture;
    if (!gesture) return;
    gesture.currentPoint = { ...point };
    const deltaX = Math.round(point.x - gesture.startPoint.x);
    const deltaY = Math.round(point.y - gesture.startPoint.y);
    this.q<HTMLElement>('#status').textContent = `Mover elementos · X: ${deltaX >= 0 ? '+' : ''}${deltaX}px · Y: ${deltaY >= 0 ? '+' : ''}${deltaY}px`;
  }

  private finishElementMove(event?: PointerEvent): void {
    const gesture = this.rasterMoveGesture;
    if (event && gesture && event.pointerId !== gesture.pointerId) return;
    if (!gesture) return;
    if (event?.type === 'pointercancel') {
      this.rasterMoveGesture = null;
      this.canvas.style.cursor = this.tool === 'move' ? 'move' : this.canvas.style.cursor;
      this.q<HTMLElement>('#status').textContent = 'Movimiento cancelado.';
      return;
    }
    if (event) this.updateElementMove(this.toDoc(event));
    const deltaX = Math.round(gesture.currentPoint.x - gesture.startPoint.x);
    const deltaY = Math.round(gesture.currentPoint.y - gesture.startPoint.y);
    const layerId = gesture.layerId;
    this.rasterMoveGesture = null;
    this.canvas.style.cursor = this.tool === 'move' ? 'move' : this.canvas.style.cursor;
    if (deltaX === 0 && deltaY === 0) {
      this.q<HTMLElement>('#status').textContent = 'La capa no cambió de posición.';
      return;
    }
    const layer = this.ctl.find(layerId);
    if (!layer) return;
    const label = `Mover elementos de «${layer.name}»`;
    this.commitLayerContentMove(layer, deltaX, deltaY, label);
  }

  private commitLayerContentMove(layer: LayerNode, deltaX: number, deltaY: number, label: string): void {
    if (layer.type === 'vector') {
      this.commitVectorShapes(layer, translateVectorShapes(layer.vectorShapes ?? [], deltaX, deltaY));
      this.reportLayerContentMoved(layer);
      return;
    }
    if (layer.type === 'text') {
      this.commitTextLayerMove(layer, deltaX, deltaY);
      return;
    }
    this.moveRasterLayerContent(layer, deltaX, deltaY, label);
  }

  private commitTextLayerMove(layer: LayerNode, deltaX: number, deltaY: number): void {
    if (!this.moveTextLayerContent(layer, deltaX, deltaY)) return;
    this.refreshAfterLayerPropertyChange();
    this.reportLayerContentMoved(layer);
  }

  private moveTextLayerContent(layer: LayerNode, deltaX: number, deltaY: number): boolean {
    const content = layer.textContent ?? '';
    const x = (layer.textX ?? 0) + deltaX;
    const y = (layer.textY ?? 0) + deltaY;
    const settings = this.textSettingsFromLayer(layer);
    const pixels = this.rasterizeText(content, x, y, settings);
    return this.ctl.replaceTextContent(layer.id, this.textLayerPatch(content, x, y, settings), pixels);
  }

  private moveRasterLayerContent(layer: LayerNode, deltaX: number, deltaY: number, label: string): void {
    const surface = this.ctl.layerPixels(layer);
    if (!surface) {
      this.q<HTMLElement>('#status').textContent = 'No se pudo mover el contenido de esta capa.';
      return;
    }
    try {
      runEdit(this.ctx, layer.engineId, label, (pixels) => movePixelSurface(pixels, deltaX, deltaY));
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
      this.reportLayerContentMoved(layer);
    } catch (error) {
      this.fail(error);
    }
  }

  private reportLayerContentMoved(layer: LayerNode): void {
    this.q<HTMLElement>('#status').textContent = `Se movió «${layer.name}» sin crear una máscara de transformación.`;
  }

  protected startLayerTransform(): void {
    const layer = this.active();
    if (!layer) {
      this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa para transformarla.';
      return;
    }
    if (!isPixelLayerType(layer.type)) {
      this.q<HTMLElement>('#status').textContent = 'Esta transformación admite capas de píxeles, texto, imágenes y vectores.';
      return;
    }
    if (this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id)) {
      this.q<HTMLElement>('#status').textContent = 'La capa está oculta o bloqueada.';
      return;
    }
    if (this.layerTransformSession) this.cancelLayerTransformSession();
    if (!this.beginLayerTransformSession(layer, false)) return;
    this.q<HTMLElement>('#status').textContent = 'Transformación activa · arrastrá el marco o sus controles · Enter aplica · Escape cancela.';
  }

  protected handleTransformSessionKey(event: KeyboardEvent): boolean {
    if (event.key === 'Escape' && this.selectionBrushGesture) {
      event.preventDefault();
      this.selectionBrushGesture = null;
      this.drawSelectionOverlay();
      this.q<HTMLElement>('#status').textContent = 'Trazo de selección cancelado.';
      return true;
    }
    if (event.key === 'Escape' && this.selectionGesture) {
      event.preventDefault();
      this.selectionGesture = null;
      this.clearSelectionGesturePreview();
      return true;
    }
    if (event.key === 'Escape' && this.selectionMask) {
      event.preventDefault();
      this.clearRasterSelection();
      this.q<HTMLElement>('#status').textContent = 'Selección eliminada.';
      return true;
    }
    if (this.rasterMoveGesture && event.key === 'Escape') {
      event.preventDefault();
      const pointerId = this.rasterMoveGesture.pointerId;
      this.rasterMoveGesture = null;
      if (this.canvas.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId);
      this.canvas.style.cursor = this.tool === 'move' ? 'move' : this.canvas.style.cursor;
      this.q<HTMLElement>('#status').textContent = 'Movimiento cancelado.';
      return true;
    }
    if (!this.layerTransformSession) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelLayerTransformSession();
      this.q<HTMLElement>('#status').textContent = 'Transformación cancelada.';
      return true;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitLayerTransformSession();
      return true;
    }
    return false;
  }

  private beginLayerTransformSession(layer: LayerNode, liveMove: boolean): boolean {
    if (this.layerTransformSession) this.cancelLayerTransformSession();
    const originalMasks = cloneLayerMasks(layer.masks);
    const existing = liveMove
      ? originalMasks.find((mask): mask is TransformMask => mask.type === 'transform' && mask.enabled)
      : [...originalMasks].reverse().find((mask): mask is TransformMask => mask.type === 'transform');
    const template = existing ? { ...existing } : createLayerMask('transform', crypto.randomUUID()) as TransformMask;
    const baseMasks = existing ? originalMasks.filter((mask) => mask.id !== existing.id) : originalMasks;
    const sourceBounds = this.getLayerContentBounds(layer);
    const baseBounds = this.getBoundsAfterTransformMasks(sourceBounds, baseMasks);
    const currentBounds = existing && existing.enabled
      ? transformRectWithMask(baseBounds, existing, this.ctl.doc.width, this.ctl.doc.height)
      : baseBounds;
    this.layerTransformSession = {
      layerId: layer.id,
      originalMasks,
      baseMasks,
      template,
      baseBounds,
      currentBounds,
      latestMasks: cloneLayerMasks(originalMasks),
    };
    this.createLayerTransformOverlay(liveMove);
    this.renderLayerTransformOverlay({ vertical: [], horizontal: [] });
    return true;
  }

  private getLayerContentBounds(layer: LayerNode): LayerRect {
    const shapes = layer.vectorShapes ?? [];
    if (shapes.length) return this.getVectorContentBounds(shapes);
    const pixels = this.ctl.readPixels(layer);
    if (!pixels) return { x: 0, y: 0, width: this.ctl.doc.width, height: this.ctl.doc.height };
    return this.getPixelContentBounds(pixels, this.ctl.doc.width, this.ctl.doc.height);
  }

  private getVectorContentBounds(shapes: readonly VectorShape[]): LayerRect {
    const bounds = shapes.map(getVectorShapeBounds);
    const left = Math.min(...bounds.map((rect) => rect.x));
    const top = Math.min(...bounds.map((rect) => rect.y));
    const right = Math.max(...bounds.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...bounds.map((rect) => rect.y + rect.height));
    return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
  }

  private getPixelContentBounds(pixels: Uint8Array, width: number, height: number): LayerRect {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < height; y++) this.scanPixelBoundsRow(pixels, width, y, (x) => {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    });
    if (right < left || bottom < top) return { x: 0, y: 0, width, height };
    return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  }

  private scanPixelBoundsRow(pixels: Uint8Array, width: number, y: number, visit: (x: number) => void): void {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) this.visitVisiblePixel(pixels, rowStart, x, visit);
  }

  private visitVisiblePixel(pixels: Uint8Array, rowStart: number, x: number, visit: (x: number) => void): void {
    if (pixels[rowStart + x * 4 + 3] > 0) visit(x);
  }

  private getBoundsAfterTransformMasks(bounds: LayerRect, masks: readonly LayerMask[]): LayerRect {
    return masks.reduce((current, mask) => {
      if (mask.type !== 'transform' || !mask.enabled) return current;
      return transformRectWithMask(current, mask, this.ctl.doc.width, this.ctl.doc.height);
    }, bounds);
  }

  private createLayerTransformOverlay(liveMove: boolean): void {
    this.removeLayerTransformOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'layer-transform-overlay';
    overlay.dataset.liveMove = String(liveMove);
    const guides = document.createElement('div');
    guides.className = 'layer-transform-guides';
    const frame = document.createElement('div');
    frame.className = 'layer-transform-frame';
    frame.setAttribute('role', 'group');
    frame.setAttribute('aria-label', 'Marco de transformación');
    this.appendTransformHandles(frame);
    const toolbar = document.createElement('div');
    toolbar.className = 'layer-transform-toolbar';
    toolbar.innerHTML = '<button type="button" data-transform-apply>Aplicar</button><button type="button" data-transform-cancel>Cancelar</button>';
    overlay.append(guides, frame, toolbar);
    this.q<HTMLElement>('.canvas-stage').append(overlay);
    this.layerTransformOverlay = overlay;
    frame.addEventListener('pointerdown', (event) => this.beginTransformOverlayGesture(event));
    frame.addEventListener('pointermove', (event) => this.updateTransformOverlayGesture(event));
    frame.addEventListener('pointerup', (event) => this.endTransformOverlayGesture(event));
    frame.addEventListener('pointercancel', (event) => this.endTransformOverlayGesture(event));
    overlay.addEventListener('click', (event) => this.handleTransformOverlayAction(event));
  }

  private appendTransformHandles(frame: HTMLElement): void {
    const handles: LayerTransformHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    for (const handle of handles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'layer-transform-handle';
      button.dataset.transformHandle = handle;
      button.setAttribute('aria-label', `Redimensionar desde ${handle}`);
      frame.append(button);
    }
  }

  private handleTransformOverlayAction(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.closest('[data-transform-apply]')) this.commitLayerTransformSession();
    if (target.closest('[data-transform-cancel]')) this.cancelLayerTransformSession();
  }

  private beginTransformOverlayGesture(event: PointerEvent): void {
    if (this.layerTransformOverlay?.dataset.liveMove === 'true') return;
    const target = event.target as HTMLElement;
    const handle = target.closest<HTMLElement>('[data-transform-handle]')?.dataset.transformHandle as LayerTransformHandle | undefined;
    const frame = this.layerTransformOverlay?.querySelector<HTMLElement>('.layer-transform-frame');
    const session = this.layerTransformSession;
    if (!frame || !session || event.button !== 0) return;
    event.preventDefault();
    const pointer = this.toDocAt(event.clientX, event.clientY);
    this.layerTransformGesture = {
      pointerId: event.pointerId,
      handle: handle ?? 'move',
      startPoint: pointer,
      startBounds: { ...session.currentBounds },
    };
    frame.setPointerCapture(event.pointerId);
  }

  private updateTransformOverlayGesture(event: PointerEvent): void {
    if (!this.layerTransformGesture || event.pointerId !== this.layerTransformGesture.pointerId) return;
    this.updateLayerTransformGesture(this.toDocAt(event.clientX, event.clientY), event.shiftKey);
  }

  private updateLayerTransformGesture(point: { x: number; y: number }, keepAspectRatio: boolean): void {
    const gesture = this.layerTransformGesture;
    if (!gesture) return;
    const dx = point.x - gesture.startPoint.x;
    const dy = point.y - gesture.startPoint.y;
    const { width, height } = this.ctl.doc;
    const snapThreshold = this.getLayerTransformSnapThreshold();
    if (gesture.handle === 'move') {
      const moved = moveRect(gesture.startBounds, dx, dy);
      const snapped = snapMoveRect(moved, width, height, snapThreshold);
      this.applyLayerTransformPreview(snapped.rect, snapped.guides);
      return;
    }
    const resized = resizeRect(gesture.startBounds, gesture.handle, dx, dy, keepAspectRatio);
    const snapped = snapResizeRect(resized, gesture.handle, width, height, snapThreshold);
    this.applyLayerTransformPreview(snapped.rect, snapped.guides);
  }

  private endTransformOverlayGesture(event: PointerEvent): void {
    if (!this.layerTransformGesture || event.pointerId !== this.layerTransformGesture.pointerId) return;
    this.layerTransformGesture = null;
  }

  private getLayerTransformSnapThreshold(): number {
    const stageRect = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const display = getDocumentDisplayTransform(stageRect, canvasRect, this.ctl.doc.width, this.ctl.doc.height);
    return 8 / Math.max(0.01, display.scale);
  }

  private applyLayerTransformPreview(target: LayerRect, guides: SnapGuides): void {
    const session = this.layerTransformSession;
    if (!session) return;
    const values = createTransformMaskValues(session.baseBounds, target, this.ctl.doc.width, this.ctl.doc.height);
    const transform: TransformMask = { ...session.template, ...values, enabled: true };
    const nextMasks = cloneLayerMasks(session.originalMasks);
    const existingIndex = nextMasks.findIndex((mask) => mask.id === session.template.id);
    if (existingIndex >= 0) nextMasks[existingIndex] = transform;
    else nextMasks.push(transform);
    const layer = this.ctl.find(session.layerId);
    if (!layer) return this.cancelLayerTransformSession();
    layer.masks = cloneLayerMasks(nextMasks);
    session.latestMasks = cloneLayerMasks(nextMasks);
    session.currentBounds = { ...target };
    this.ctl.comp.invalidateAll();
    this.scheduleRefresh();
    this.renderLayerTransformOverlay(guides);
  }

  private renderLayerTransformOverlay(guides: SnapGuides): void {
    const overlay = this.layerTransformOverlay;
    const session = this.layerTransformSession;
    if (!overlay || !session) return;
    const stage = this.q<HTMLElement>('.canvas-stage');
    const stageRect = stage.getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const display = getDocumentDisplayTransform(stageRect, canvasRect, this.ctl.doc.width, this.ctl.doc.height);
    const frame = overlay.querySelector<HTMLElement>('.layer-transform-frame');
    const guidesRoot = overlay.querySelector<HTMLElement>('.layer-transform-guides');
    if (!frame || !guidesRoot) return;
    const bounds = session.currentBounds;
    frame.style.left = `${display.left + bounds.x * display.scale}px`;
    frame.style.top = `${display.top + bounds.y * display.scale}px`;
    frame.style.width = `${Math.max(2, bounds.width * display.scale)}px`;
    frame.style.height = `${Math.max(2, bounds.height * display.scale)}px`;
    guidesRoot.replaceChildren();
    guides.vertical.forEach((position) => this.appendTransformGuide(guidesRoot, 'vertical', display.left + position * display.scale));
    guides.horizontal.forEach((position) => this.appendTransformGuide(guidesRoot, 'horizontal', display.top + position * display.scale));
  }

  private appendTransformGuide(root: HTMLElement, orientation: 'vertical' | 'horizontal', position: number): void {
    const guide = document.createElement('div');
    guide.className = `layer-transform-guide layer-transform-guide--${orientation}`;
    if (orientation === 'vertical') guide.style.left = `${position}px`;
    else guide.style.top = `${position}px`;
    root.append(guide);
  }

  private commitLayerTransformSession(label?: string): void {
    const session = this.layerTransformSession;
    if (!session) return;
    const layer = this.ctl.find(session.layerId);
    if (!layer) return this.cancelLayerTransformSession();
    const finalMasks = cloneLayerMasks(session.latestMasks);
    layer.masks = cloneLayerMasks(session.originalMasks);
    this.removeLayerTransformOverlay();
    this.layerTransformSession = null;
    this.layerTransformGesture = null;
    this.rasterMoveGesture = null;
    if (this.ctl.replaceLayerMasks(session.layerId, finalMasks, label ?? `Transformar capa «${layer.name}»`)) {
      this.refreshAfterLayerPropertyChange();
    } else {
      this.ctl.comp.invalidateAll();
      this.scheduleRefresh();
    }
    this.canvas.style.cursor = this.tool === 'move' ? 'move' : '';
    this.q<HTMLElement>('#status').textContent = `Transformación aplicada a «${layer.name}».`;
  }

  private cancelLayerTransformSession(): void {
    const session = this.layerTransformSession;
    if (!session) return;
    const layer = this.ctl.find(session.layerId);
    if (layer) layer.masks = cloneLayerMasks(session.originalMasks);
    this.layerTransformSession = null;
    this.layerTransformGesture = null;
    this.rasterMoveGesture = null;
    this.removeLayerTransformOverlay();
    this.ctl.comp.invalidateAll();
    this.scheduleRefresh();
    this.canvas.style.cursor = this.tool === 'move' ? 'move' : '';
  }

  private removeLayerTransformOverlay(): void {
    this.layerTransformOverlay?.remove();
    this.layerTransformOverlay = null;
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
      const layer = this.ctl.addLayerAbove('paint', `Dibujo de viñeta ${this.ctl.doc.layers.length}`, this.activeId, { comicClipBounds: bounds });
      this.activateCreatedLayer(layer);
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

  private eraseVectorShapeAt(point: { x: number; y: number }): void {
    const layer = this.active();
    if (!layer || layer.type !== 'vector') {
      this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa vectorial para borrar objetos.';
      return;
    }
    if (!this.ctl.isEffectivelyVisible(layer.id) || this.ctl.isEffectivelyLocked(layer.id)) {
      this.q<HTMLElement>('#status').textContent = 'La capa vectorial está oculta o bloqueada.';
      return;
    }
    const shapes = layer.vectorShapes ?? [];
    const erasedStroke = eraseVectorStrokeAt(shapes, point, Math.max(5, this.brush.size / 2));
    if (erasedStroke) {
      this.commitVectorShapes(layer, erasedStroke.shapes);
      this.q<HTMLElement>('#status').textContent = erasedStroke.erasedBetweenIntersections
        ? 'Se borró el tramo vectorial hasta las intersecciones.'
        : 'Se eliminó el trazo vectorial seleccionado.';
      return;
    }
    const target = findVectorSelectionTarget(point, shapes, (shape) => Math.max(5, shape.strokeWidth / 2), 0);
    if (!target) {
      this.q<HTMLElement>('#status').textContent = 'No hay un trazo vectorial debajo del cursor.';
      return;
    }
    this.commitVectorShapes(layer, shapes.filter((shape) => shape.id !== target.shape.id));
    this.q<HTMLElement>('#status').textContent = 'Se eliminó el objeto vectorial seleccionado.';
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

  private beginVectorDrawingGesture(point: { x: number; y: number }, event: PointerEvent): void {
    const layer = this.active();
    if (!layer || layer.type !== 'vector' || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id)) {
      this.reportVectorToolUnavailable();
      return;
    }
    const startPoint = { ...point };
    this.vectorDrawGesture = {
      layerId: layer.id,
      id: crypto.randomUUID(),
      tool: this.tool as VectorDrawingToolId,
      startPoint,
      currentPoint: { ...startPoint },
      points: [{ ...startPoint }],
    };
    this.canvas.setPointerCapture(event.pointerId);
    this.drawVectorDrawingPreview();
  }

  private updateVectorDrawingGesture(point: { x: number; y: number }, finalPoint = false): void {
    const gesture = this.vectorDrawGesture;
    if (!gesture) return;
    gesture.currentPoint = { ...point };
    this.appendVectorFreehandPoint(gesture, point, finalPoint);
    this.drawVectorDrawingPreview();
  }

  private appendVectorFreehandPoint(
    gesture: NonNullable<AppDrawingFeatures['vectorDrawGesture']>,
    point: { x: number; y: number },
    finalPoint: boolean,
  ): void {
    if (gesture.tool !== 'vector-freehand' && gesture.tool !== 'vector-polyline') return;
    const lastPoint = gesture.points[gesture.points.length - 1];
    if (!lastPoint) { gesture.points.push({ ...point }); return; }
    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
    if (distance < 1 && !finalPoint) return;
    gesture.points.push({ ...point });
  }

  private drawVectorDrawingPreview(): void {
    const gesture = this.vectorDrawGesture;
    if (!gesture) return;
    this.updatePreviewCanvasSize();
    const preview = this.q<HTMLCanvasElement>('#tool-preview');
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    this.resetPreviewContext(ctx, preview);
    const stageRect = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const display = getDocumentDisplayTransform(stageRect, canvasRect, this.ctl.doc.width, this.ctl.doc.height);
    const shapes = this.createVectorShapesFromGesture(gesture.tool, gesture.startPoint, gesture.currentPoint, gesture.points, gesture.id);
    ctx.save();
    ctx.translate(display.left, display.top);
    ctx.scale(display.scale, display.scale);
    shapes.forEach((shape) => renderVectorShape(ctx, shape));
    ctx.restore();
  }

  private finishVectorDrawingGesture(event?: PointerEvent): void {
    const gesture = this.vectorDrawGesture;
    if (!gesture) return;
    if (event?.type === 'pointercancel') {
      this.vectorDrawGesture = null;
      this.clearToolPreview();
      return;
    }
    if (event) this.updateVectorDrawingGesture(this.toDoc(event), true);
    this.vectorDrawGesture = null;
    this.clearToolPreview();
    if (!this.hasMeaningfulVectorGesture(gesture)) return;
    const layer = this.ctl.find(gesture.layerId);
    if (!layer || layer.type !== 'vector') return;
    const createdShapes = this.createVectorShapesFromGesture(gesture.tool, gesture.startPoint, gesture.currentPoint, gesture.points, gesture.id);
    const shapes = cloneVectorShapes(layer.vectorShapes);
    shapes.push(...createdShapes);
    const primaryShape = createdShapes[0];
    this.vectorDirectSelectedId = primaryShape?.id ?? null;
    this.commitVectorShapes(layer, shapes);
    if (primaryShape) this.drawVectorSelectionOverlay(primaryShape);
    this.q<HTMLElement>('#status').textContent = createdShapes.length > 1
      ? `Se crearon ${createdShapes.length} líneas vectoriales.`
      : `${this.vectorKindLabel(primaryShape.kind)} vectorial creado.`;
  }

  private hasMeaningfulVectorGesture(gesture: NonNullable<AppDrawingFeatures['vectorDrawGesture']>): boolean {
    return Math.hypot(gesture.currentPoint.x - gesture.startPoint.x, gesture.currentPoint.y - gesture.startPoint.y) > 1;
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
      if (this.tool !== 'line' && this.tool !== 'rectangle' && this.tool !== 'ellipse' && this.tool !== 'gradient' && !isPixelShapeTool(this.tool)) return;
      this.shapeStart = { ...point, clientX: event.clientX, clientY: event.clientY };
      this.pixelShapePoints = this.tool === 'pixel-polyline' ? [{ ...point }] : [];
      this.drawToolPreview(event);
    }

  private isBrushStrokeTool(): boolean {
    return isBrushStrokeToolId(this.tool);
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
      if (this.selectionBrushGesture) { this.updateSelectionBrush(this.toDoc(e)); return; }
      if (this.selectionGesture) { this.updateSelectionGesture(this.toDoc(e)); return; }
      if (this.rasterMoveGesture) { this.updateElementMove(this.toDoc(e)); return;}
      if (this.vectorDrawGesture) { this.updateVectorDrawingGesture(this.toDoc(e), finalPoint); return; }
      if (this.vectorGesture) { this.updateVectorGesture(this.toDoc(e)); return; }
      if (this.comicPanelStart) { this.drawComicPanelPreview(e); return; }
      if (this.isPanning && this.panStart) {
        const sensitivity = this.brush.panSensitivity / 100;
        this.panX = this.panStart.x + (e.clientX - this.panStart.clientX) * sensitivity;
        this.panY = this.panStart.y + (e.clientY - this.panStart.clientY) * sensitivity;
        this.applyCanvasView();
        return;
      }
      if (this.colorizeStroke) {
        this.extendColorizeStroke(this.toDoc(e), finalPoint);
        return;
      }
      if (!this.stroke || !this.last || !this.strokeTool) return;
      if (this.strokeTool === 'pixel-polyline') this.appendPixelShapePoint(this.toDoc(e), finalPoint);
      if (this.strokeTool === 'line' || this.strokeTool === 'rectangle' || this.strokeTool === 'ellipse' || this.strokeTool === 'gradient' || isPixelShapeTool(this.strokeTool)) {
        this.drawToolPreview(e);
        return;
      }
      if (!isBrushStrokeToolId(this.strokeTool)) return;
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
      && isBrushStrokeToolId(this.strokeTool));
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
    const display = getDocumentDisplayTransform(stage, rect, this.ctl.doc.width, this.ctl.doc.height);
    const start = { x: this.shapeStart.clientX - stage.left, y: this.shapeStart.clientY - stage.top };
    const end = { x: e.clientX - stage.left, y: e.clientY - stage.top };
    this.configurePreviewStroke(ctx, display.scale);
    return { ctx, start, end, scale: display.scale };
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
    if (this.strokeTool === 'gradient') return this.drawGradientPreview(preview);
    if (isPixelShapeTool(this.strokeTool)) return this.drawPixelShapePreview(preview, this.strokeTool);
  }

  private drawPixelShapePreview(preview: ToolPreviewContext, tool: PixelShapeToolId): void {
    const stageRect = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
    const canvasRect = this.canvas.getBoundingClientRect();
    const display = getDocumentDisplayTransform(stageRect, canvasRect, this.ctl.doc.width, this.ctl.doc.height);
    const points = this.pixelShapePoints.map((point) => ({
      x: display.left + point.x * display.scale,
      y: display.top + point.y * display.scale,
    }));
    renderRasterShape(preview.ctx, tool, preview.start, preview.end, this.getRasterShapeSettings(), points, preview.scale);
  }

  private appendPixelShapePoint(point: { x: number; y: number }, finalPoint: boolean): void {
    const lastPoint = this.pixelShapePoints[this.pixelShapePoints.length - 1];
    if (!lastPoint) { this.pixelShapePoints.push({ ...point }); return; }
    const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
    if (distance < Math.max(1, this.brush.spacing / 20) && !finalPoint) return;
    if (distance < 0.1) return;
    this.pixelShapePoints.push({ ...point });
  }

  private drawGradientPreview(preview: ToolPreviewContext): void {
    if (this.brush.gradientType === 'linear') return this.drawLinePreview(preview);
    const { ctx, start, end } = preview;
    const radius = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y));
    if (this.brush.gradientType === 'contour') {
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, Math.max(1, Math.abs(end.x - start.x) / 2), Math.max(1, Math.abs(end.y - start.y) / 2), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, Math.max(1, Math.abs(end.x - start.x) / 4), Math.max(1, Math.abs(end.y - start.y) / 4), 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    ctx.beginPath();
    ctx.arc(start.x, start.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(start.x, start.y, 2, 0, Math.PI * 2);
    ctx.fill();
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
      if (this.selectionBrushGesture) return this.finishSelectionBrush(e);
      if (this.selectionGesture) return this.finishSelectionGesture(e);
      if (this.rasterMoveGesture) return this.finishElementMove(e);
      if (this.vectorDrawGesture) return this.finishVectorDrawingGesture(e);
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
        brush: 'Pincel', pen: 'Plumilla', pencil: 'Lápiz', airbrush: 'Aerógrafo', decoration: 'Decoración', eraser: 'Borrador', 'dust-removal': 'Eliminar polvo', 'vector-eraser': 'Goma vectorial', eyedropper: 'Cuentagotas', line: 'Línea',
        rectangle: 'Rectángulo', ellipse: 'Elipse', fill: 'Relleno', hand: 'Mover lienzo', move: 'Mover elementos',
        text: 'Texto', 'vector-select': 'Selección vectorial', 'vector-rectangle': 'Rectángulo vectorial',
        'vector-rounded-rectangle': 'Rectángulo redondeado vectorial', 'vector-ellipse': 'Elipse vectorial', 'vector-line': 'Línea vectorial',
        'vector-polyline': 'Polilínea vectorial', 'vector-pen': 'Pluma vectorial', 'vector-polygon': 'Polígono vectorial',
        'vector-star': 'Estrella vectorial', 'vector-freehand': 'Trazo vectorial libre', 'vector-spiral': 'Espiral vectorial',
        'vector-parallel-lines': 'Líneas paralelas', 'vector-radial-lines': 'Líneas radiales', 'speech-bubble': 'Bocadillo', flash: 'Flash',
        'pixel-rounded-rectangle': 'Rectángulo redondeado de píxeles', 'pixel-polyline': 'Polilínea de píxeles',
        'pixel-bezier': 'Curva Bézier de píxeles', 'pixel-polygon': 'Polígono de píxeles', 'pixel-star': 'Estrella de píxeles', 'pixel-spiral': 'Espiral de píxeles',
        'clone-stamp': 'Tampón de clonar', 'comic-panel': 'Marco y viñetas', gradient: 'Degradado', smudge: 'Dedo', liquify: 'Licuar',
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
      this.pixelShapePoints = [];
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
      this.applySelectionToFillResult(operation, result);
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
        matchMask: this.brush.gapClosure > 0
          ? createGapClosedMatchMask(reference, width, height, seedColor, this.brush.tolerance, this.brush.gapClosure)
          : undefined,
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
      if (operation.matchMask) return operation.matchMask[Math.floor(offset / 4)] === 1;
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
