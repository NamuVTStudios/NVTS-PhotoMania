// Document lifecycle, rendering and filter composition.
import { AppBase } from './AppBase';
import { type TiledLayer } from '@nvts/wasm-bindings';
import { blendImageData, colorizePixels, expandFilterTile, forEachFilterTile, readFilterTilePixels, renderFilteredImage, type FilterCanvasPools, type FilterTile } from '@nvts/image-processing';
import { containsEnabledMask, containsLayerType, findTopRasterLayer, DocumentController, refresh, type EngineCtx, type LayerNode } from '@nvts/document-model';
import { isPixelLayerType, type FilterKind, type LayerMask } from '@nvts/shared';
import { readPreferences } from '../panels/PreferencesPanel';
import { packNvtsPhoto, unpackNvtsPhoto, rememberRecentProject } from '@nvts/storage';
import type { PixelRegion } from './AppBase';
import { documentNameFromFile, CANVAS_BLEND_OPERATIONS } from './AppUtilities';

const MAX_FILTER_TILES_PER_FRAME = 8;
const FILTER_RENDER_BUDGET_MS = 6;
const FILTER_TILE_PADDING_BY_KIND: Partial<Record<FilterKind, number>> = {
  blur: 36, pixelate: 32, sharpen: 1, 'edge-detect': 1,
};
function getFilterKindTilePadding(kind: FilterKind): number {
  return FILTER_TILE_PADDING_BY_KIND[kind] ?? 0;
}


export abstract class AppDocumentFeatures extends AppBase {
  protected async openInitialFile(file: File | undefined, fallbackName: string): Promise<void> {
      if (!file) return;
      if (/\.nvtsphoto$/i.test(file.name)) {
        await this.openNativeProjectFile(file, fallbackName);
        return;
      }
      await this.importImage(file);
      this.queueRecentSnapshot();
    }

  protected async openNativeProjectFile(file: File, fallbackName: string): Promise<void> {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const unpacked = unpackNvtsPhoto(bytes);
      unpacked.doc.name = documentNameFromFile(file.name) || fallbackName;
      this.setDocument(this.documentLifecycle.fromUnpacked(this.engine.module, unpacked));
      await this.refreshLinkedFileLayers(false);
      await this.rememberOpenedProject();
    }

  protected async rememberOpenedProject(): Promise<void> {
      if (!readPreferences().rememberRecentProjects) return;
      const bytes = packNvtsPhoto(this.ctl.doc, (layer) => this.ctl.readPixels(layer));
      await rememberRecentProject(this.ctl.doc, bytes).catch((error) => {
        console.warn('No se pudo guardar la copia reciente:', error);
      });
    }

  protected async importImage(file: File): Promise<void> {
      const pixels = await this.imageFileToDocumentPixels(file);
      this.ctl.addFileLayer(documentNameFromFile(file.name) || 'Imagen importada', pixels, file.name, undefined, file.lastModified, file.size);
      this.activeId = this.ctl.doc.layers.at(-1)?.id ?? this.activeId;
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    }

  protected newDocument(w: number, h: number, name = 'Sin título'): void {
      const ctl = this.documentLifecycle.createBlank(this.engine.module, w, h, name);
      this.fileHandle = null;
      this.setDocument(ctl);
    }

  protected setDocument(ctl: DocumentController): void {
      this.ctl = this.documentLifecycle.replace(this.ctl, ctl);
      this.activeId = this.topRaster()?.id ?? '';
      this.prepareRendererForDocument(ctl.doc.width, ctl.doc.height);
      this.clearRendererForDocument(ctl.doc.width, ctl.doc.height);
      this.ctx = this.createEngineContext(ctl);
      this.refreshAfterDocumentReplacement();
    }

  protected prepareRendererForDocument(width: number, height: number): void {
      this.renderer.ensureSize(width, height);
    }

  protected clearRendererForDocument(width: number, height: number): void {
      const tileSize = this.engine.module.TILE_SIZE;
      const transparentTile = new Uint8Array(tileSize * tileSize * 4);
      for (let y = 0; y < height; y += tileSize) this.clearRendererRow(width, tileSize, transparentTile, y);
    }

  protected clearRendererRow(width: number, tileSize: number, transparentTile: Uint8Array, y: number): void {
      for (let x = 0; x < width; x += tileSize) {
        const tileWidth = Math.min(tileSize, width - x);
        const tileHeight = Math.min(tileSize, this.ctl.doc.height - y);
        this.renderer.writeRegion(x, y, tileWidth, tileHeight, transparentTile, tileSize * 4);
      }
    }

  protected createEngineContext(ctl: DocumentController): EngineCtx {
      const module = this.engine.module;
      const tileSize = module.TILE_SIZE;
      const { width, height } = ctl.doc;
      return {
        mod: module,
        comp: ctl.comp,
        history: ctl.history,
        uploadTile: (tileX, tileY, pixels) => this.uploadDocumentTile(width, height, tileSize, tileX, tileY, pixels),
        render: () => this.renderer.render(),
        scheduleRefresh: () => this.scheduleRefresh(),
        onPixelHistory: (label) => {
          ctl.recordPixelAction(label);
          this.updateHistoryUI();
        },
      };
    }

  protected uploadDocumentTile(
      documentWidth: number,
      documentHeight: number,
      tileSize: number,
      tileX: number,
      tileY: number,
      pixels: Uint8Array,
    ): void {
      const x = tileX * tileSize;
      const y = tileY * tileSize;
      const width = Math.min(tileSize, documentWidth - x);
      const height = Math.min(tileSize, documentHeight - y);
      if (width <= 0 || height <= 0) return;
      this.renderer.writeRegion(x, y, width, height, pixels, tileSize * 4);
    }

  protected refreshAfterDocumentReplacement(): void {
      this.ctl.comp.invalidateAll();
      this.syncUI();
      this.scheduleRefresh();
    }

  protected topRaster(nodes: LayerNode[] = this.ctl.doc.layers): LayerNode | undefined {
      return findTopRasterLayer(nodes);
    }

  protected active(): LayerNode | undefined { return this.ctl ? this.ctl.find(this.activeId) : undefined; }

  protected scheduleRefresh(): void {
      this.invalidateFilterRender();
      this.requestRefreshFrame();
    }

  protected scheduleRefreshForRegion(region: PixelRegion): void {
      if (this.strokeLayerHasGlobalFilterDependency()) {
        this.filterRenderInvalidated = true;
        this.dirtyFilterTiles.clear();
        this.requestRefreshFrame();
        return;
      }
      if (!this.hasNonDestructiveEffects()) {
        this.requestRefreshFrame();
        return;
      }
      this.markFilterTilesDirty(region);
      this.requestRefreshFrame();
    }

  protected requestRefreshFrame(): void {
      if (this.raf) return;
      this.raf = requestAnimationFrame(() => { this.raf = 0; this.renderFrame(); });
    }

  protected invalidateFilterRender(): void {
      this.filterRenderInvalidated = true;
      this.cachedHasNonDestructiveEffects = null;
      this.dirtyFilterTiles.clear();
      this.cachedFilterTilePadding = null;
      this.colorizeOutputCache.clear();
    }

  protected hasNonDestructiveEffects(): boolean {
      if (this.cachedHasNonDestructiveEffects !== null) return this.cachedHasNonDestructiveEffects;
      const layers = this.ctl.doc.layers;
      this.cachedHasNonDestructiveEffects = containsLayerType(layers, 'filter')
        || containsEnabledMask(layers, 'filter')
        || containsEnabledMask(layers, 'transform')
        || containsEnabledMask(layers, 'colorize');
      return this.cachedHasNonDestructiveEffects;
    }

  protected strokeLayerHasGlobalFilterDependency(): boolean {
      return this.stroke !== null && this.strokeHasGlobalFilterDependency;
    }

  protected layerPathHasGlobalFilterDependency(layerId: string): boolean {
      return this.findGlobalFilterDependencyOnPath(this.ctl.doc.layers, layerId, false) ?? false;
    }

  protected findGlobalFilterDependencyOnPath(
    nodes: LayerNode[], layerId: string, inheritedDependency: boolean,
  ): boolean | null {
    const pending = this.createDependencySearchStack(nodes, inheritedDependency);
    let match: boolean | null = null;
    while (pending.length > 0 && match === null) {
      const current = pending.pop()!;
      match = this.inspectDependencyNode(current, layerId);
      this.pushDependencyChildren(pending, current);
    }
    return match;
  }

  private createDependencySearchStack(nodes: LayerNode[], inheritedDependency: boolean): Array<{ node: LayerNode; inherited: boolean }> {
    return nodes.slice().reverse().map((node) => ({ node, inherited: inheritedDependency }));
  }

  private inspectDependencyNode(current: { node: LayerNode; inherited: boolean }, layerId: string): boolean | null {
    const dependency = current.inherited || this.nodeHasGlobalFilterMask(current.node);
    if (current.node.id !== layerId) return null;
    return dependency;
  }

  private pushDependencyChildren(stack: Array<{ node: LayerNode; inherited: boolean }>, current: { node: LayerNode; inherited: boolean }): void {
    const inherited = current.inherited || this.nodeHasGlobalFilterMask(current.node);
    for (const child of [...current.node.children].reverse()) stack.push({ node: child, inherited });
  }

  private nodeHasGlobalFilterMask(node: LayerNode): boolean {
    return Boolean(node.masks?.some((mask) => mask.enabled && (mask.type === 'transform' || mask.type === 'colorize')));
  }

  protected markFilterTilesDirty(region: PixelRegion): void {
      const { width, height } = this.ctl.doc;
      const tileSize = this.engine.module.TILE_SIZE || 256;
      const padding = this.getFilterTilePadding();
      const left = Math.max(0, region.left - padding);
      const top = Math.max(0, region.top - padding);
      const right = Math.min(width, region.left + region.width + padding);
      const bottom = Math.min(height, region.top + region.height + padding);
      if (right <= left || bottom <= top) return;
      const firstX = Math.floor(left / tileSize);
      const firstY = Math.floor(top / tileSize);
      const lastX = Math.floor((right - 1) / tileSize);
      const lastY = Math.floor((bottom - 1) / tileSize);
      for (let ty = firstY; ty <= lastY; ty++) this.markFilterTileRowDirty(ty, firstX, lastX, tileSize, width, height);
    }

  private markFilterTileRowDirty(ty: number, firstX: number, lastX: number, tileSize: number, width: number, height: number): void {
    for (let tx = firstX; tx <= lastX; tx++) this.markFilterTileDirty(tx, ty, tileSize, width, height);
  }

  private markFilterTileDirty(tx: number, ty: number, tileSize: number, width: number, height: number): void {
    const x = tx * tileSize;
    const y = ty * tileSize;
    const tile: FilterTile = { x, y, width: Math.min(tileSize, width - x), height: Math.min(tileSize, height - y) };
    this.dirtyFilterTiles.set(`${tx}:${ty}`, tile);
  }

  protected getFilterTilePadding(nodes: LayerNode[] = this.ctl.doc.layers): number {
    const isRoot = nodes === this.ctl.doc.layers;
    if (isRoot && this.cachedFilterTilePadding !== null) return this.cachedFilterTilePadding;
    const padding = nodes.reduce((maximum, node) => Math.max(maximum, this.getNodeFilterTilePadding(node)), 0);
    if (isRoot) this.cachedFilterTilePadding = padding;
    return padding;
  }

  private getNodeFilterTilePadding(node: LayerNode): number {
    return Math.max(this.getOwnFilterTilePadding(node), this.getMaskFilterTilePadding(node), this.getChildFilterTilePadding(node));
  }

  private getOwnFilterTilePadding(node: LayerNode): number {
    if (node.type !== 'filter') return 0;
    return getFilterKindTilePadding(node.filterKind ?? 'grayscale');
  }

  private getMaskFilterTilePadding(node: LayerNode): number {
    return (node.masks ?? []).reduce((maximum, mask) => Math.max(maximum, this.getMaskPadding(mask)), 0);
  }

  private getMaskPadding(mask: NonNullable<LayerNode['masks']>[number]): number {
    if (!mask.enabled || mask.type !== 'filter') return 0;
    return mask.filters.reduce((maximum, filter) => Math.max(maximum, getFilterKindTilePadding(filter.kind)), 0);
  }

  private getChildFilterTilePadding(node: LayerNode): number {
    if (node.children.length === 0) return 0;
    return this.getFilterTilePadding(node.children);
  }

  protected renderFrame(): void {
      this.processPendingBrushDabs();
      if (this.strokeLayerHasGlobalFilterDependency()) return;
      if (this.hasNonDestructiveEffects()) {
        this.renderWithFilterLayers();
        return;
      }
      this.dirtyFilterTiles.clear();
      this.filterRenderInvalidated = true;
      refresh(this.ctx);
    }

  protected canvasBlend(mode: LayerNode['blendMode']): GlobalCompositeOperation {
      return CANVAS_BLEND_OPERATIONS[mode];
    }

  protected renderWithFilterLayers(): void {
      const { width, height } = this.ctl.doc;
      const tileSize = this.engine.module.TILE_SIZE || 256;
      const padding = this.getFilterTilePadding();
      this.prepareFullFilterInvalidation(width, height, tileSize);
      this.renderDirtyFilterTiles(padding);
      this.renderer.render();
      if (this.dirtyFilterTiles.size > 0) this.requestRefreshFrame();
    }

  protected prepareFullFilterInvalidation(width: number, height: number, tileSize: number): void {
      if (!this.filterRenderInvalidated) return;
      this.colorizeOutputCache.clear();
      this.dirtyFilterTiles.clear();
      forEachFilterTile(width, height, tileSize, (tile) => this.dirtyFilterTiles.set(
        `${Math.floor(tile.x / tileSize)}:${Math.floor(tile.y / tileSize)}`, tile,
      ));
      this.filterRenderInvalidated = false;
    }

  protected renderDirtyFilterTiles(padding: number): void {
    const startedAt = performance.now();
    let rendered = 0;
    while (this.canRenderNextFilterTile(startedAt, rendered)) rendered = this.renderNextFilterTile(padding, rendered);
  }

  private canRenderNextFilterTile(startedAt: number, rendered: number): boolean {
    return this.dirtyFilterTiles.size > 0 && rendered < MAX_FILTER_TILES_PER_FRAME
      && performance.now() - startedAt < FILTER_RENDER_BUDGET_MS;
  }

  private renderNextFilterTile(padding: number, rendered: number): number {
    const [key, tile] = this.dirtyFilterTiles.entries().next().value as [string, FilterTile];
    this.dirtyFilterTiles.delete(key);
    this.renderFilterTile(tile, this.filterCanvasPools, padding);
    return rendered + 1;
  }

  protected renderFilterTile(tile: FilterTile, pools: FilterCanvasPools, padding: number): void {
      const expanded = expandFilterTile(tile, padding, this.ctl.doc.width, this.ctl.doc.height);
      const output = this.composeFilterLayers(this.ctl.doc.layers, 0, expanded, pools);
      const ctx = output.getContext('2d', { willReadFrequently: true })!;
      this.renderer.writeRegion(
        tile.x, tile.y, tile.width, tile.height,
        readFilterTilePixels(ctx, tile, expanded),
        tile.width * 4,
      );
    }

  protected getFilterCanvas(pool: HTMLCanvasElement[], depth: number, width: number, height: number): HTMLCanvasElement {
      let canvas = pool[depth];
      if (!canvas) {
        canvas = document.createElement('canvas');
        pool[depth] = canvas;
      }
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.filter = 'none';
        ctx.clearRect(0, 0, width, height);
      }
      return canvas;
    }

  protected composeFilterLayers(nodes: LayerNode[], depth: number, tile: FilterTile, pools: FilterCanvasPools): HTMLCanvasElement {
      const target = this.getFilterCanvas(pools.target, depth, tile.width, tile.height);
      const targetCtx = target.getContext('2d', { willReadFrequently: true })!;
      targetCtx.clearRect(0, 0, tile.width, tile.height);
      for (const node of nodes) this.composeFilterNode(node, target, targetCtx, depth, tile, pools);
      return target;
    }

  protected composeFilterNode(
      node: LayerNode,
      target: HTMLCanvasElement,
      targetCtx: CanvasRenderingContext2D,
      depth: number,
      tile: FilterTile,
      pools: FilterCanvasPools,
    ): void {
      if (!node.visible || node.opacity <= 0) return;
      if (node.type === 'filter') {
        this.applyFilterLayer(node, target, targetCtx, depth, tile, pools);
        return;
      }
      if (node.type === 'group') {
        this.compositeFilterGroup(node, targetCtx, depth, tile, pools);
        return;
      }
      if (isPixelLayerType(node.type)) this.compositeFilterRaster(node, targetCtx, depth, tile, pools);
    }

  protected applyFilterLayer(
      node: LayerNode,
      target: HTMLCanvasElement,
      targetCtx: CanvasRenderingContext2D,
      depth: number,
      tile: FilterTile,
      pools: FilterCanvasPools,
    ): void {
      const source = this.getFilterCanvas(pools.filterSource, depth, tile.width, tile.height);
      const filtered = this.getFilterCanvas(pools.filterResult, depth, tile.width, tile.height);
      const pixels = this.createFilterImages(node, target, source, filtered, tile);
      const blended = blendImageData(pixels.original, pixels.filtered, node.opacity);
      this.replaceFilterPixels(targetCtx, blended, tile);
    }

  protected createFilterImages(
      node: LayerNode,
      target: HTMLCanvasElement,
      source: HTMLCanvasElement,
      filtered: HTMLCanvasElement,
      tile: FilterTile,
    ): { original: ImageData; filtered: ImageData } {
      const sourceCtx = source.getContext('2d', { willReadFrequently: true })!;
      const filteredCtx = filtered.getContext('2d', { willReadFrequently: true })!;
      sourceCtx.drawImage(target, 0, 0);
      const kind = node.filterKind ?? 'grayscale';
      const strength = node.filterStrength ?? 1;
      const filteredImage = renderFilteredImage(source, filteredCtx, kind, strength, {
        x: tile.x, y: tile.y, width: tile.width, height: tile.height,
        fullWidth: this.ctl.doc.width, fullHeight: this.ctl.doc.height,
      });
      return {
        original: sourceCtx.getImageData(0, 0, tile.width, tile.height),
        filtered: filteredImage,
      };
    }

  protected replaceFilterPixels(targetCtx: CanvasRenderingContext2D, image: ImageData, tile: FilterTile): void {
      targetCtx.clearRect(0, 0, tile.width, tile.height);
      targetCtx.putImageData(image, 0, 0);
    }

  protected compositeFilterGroup(
      node: LayerNode,
      targetCtx: CanvasRenderingContext2D,
      depth: number,
      tile: FilterTile,
      pools: FilterCanvasPools,
    ): void {
      const groupCanvas = this.composeFilterLayers(node.children, depth + 1, tile, pools);
      targetCtx.save();
      targetCtx.globalAlpha = node.opacity;
      targetCtx.globalCompositeOperation = this.canvasBlend(node.blendMode);
      targetCtx.drawImage(groupCanvas, 0, 0);
      targetCtx.restore();
    }

  protected compositeFilterRaster(
      node: LayerNode,
      targetCtx: CanvasRenderingContext2D,
      depth: number,
      tile: FilterTile,
      pools: FilterCanvasPools,
    ): void {
      const backing = this.ctl.layerPixels(node);
      if (!backing) return;
      const rgba = new Uint8Array(tile.width * tile.height * 4);
      if (!backing.readRectToJS(tile.x, tile.y, tile.width, tile.height, rgba)) return;
      const transformed = this.applyTransformMasksToTile(node, backing, tile, rgba);
      const layerCanvas = this.getFilterCanvas(pools.layer, depth, tile.width, tile.height);
      const layerCtx = layerCanvas.getContext('2d', { willReadFrequently: true })!;
      const image = layerCtx.createImageData(tile.width, tile.height);
      image.data.set(transformed);
      this.applyColorizeMasksToTile(node, image, tile);
      this.applyFilterMasksToTile(node, image, tile, depth, pools);
      layerCtx.putImageData(image, 0, 0);
      targetCtx.save();
      targetCtx.globalAlpha = node.opacity;
      targetCtx.globalCompositeOperation = this.canvasBlend(node.blendMode);
      targetCtx.drawImage(layerCanvas, 0, 0);
      targetCtx.restore();
    }

  protected applyColorizeMasksToTile(node: LayerNode, image: ImageData, tile: FilterTile): void {
      const masks = node.masks?.filter((mask): mask is Extract<LayerMask, { type: 'colorize' }> => mask.enabled && mask.type === 'colorize') ?? [];
      for (const mask of masks) this.applyColorizeMaskToTile(node, mask, image, tile);
    }

  private applyColorizeMaskToTile(
    node: LayerNode, mask: Extract<LayerMask, { type: 'colorize' }>, image: ImageData, tile: FilterTile,
  ): void {
    const pixels = this.getColorizeOutput(node, mask);
    if (!pixels) return;
    for (let row = 0; row < tile.height; row++) this.copyColorizeTileRow(pixels, image, tile, row);
  }

  private copyColorizeTileRow(pixels: Uint8Array, image: ImageData, tile: FilterTile, row: number): void {
    const start = ((tile.y + row) * this.ctl.doc.width + tile.x) * 4;
    image.data.set(pixels.subarray(start, start + tile.width * 4), row * tile.width * 4);
  }

  protected getColorizeOutput(node: LayerNode, mask: Extract<LayerMask, { type: 'colorize' }>): Uint8Array | null {
      const cacheKey = `${node.id}:${mask.id}`;
      const cached = this.colorizeOutputCache.get(cacheKey);
      if (cached) return cached;
      const original = this.ctl.readPixels(node);
      if (!original) return null;
      const transformed = this.applyTransformMasksToFullLayer(node, original, this.ctl.doc.width, this.ctl.doc.height);
      if (this.ctl.doc.width * this.ctl.doc.height > 4_000_000) {
        this.q<HTMLElement>('#status').textContent = 'La colorización está limitada a documentos de hasta 4 millones de píxeles.';
        this.colorizeOutputCache.set(cacheKey, transformed);
        return transformed;
      }
      const result = mask.showOutput ? colorizePixels(transformed, this.ctl.doc.width, this.ctl.doc.height, mask) : transformed;
      const output = mask.editStrokes ? this.drawColorizeStrokes(result, mask) : result;
      this.colorizeOutputCache.set(cacheKey, output);
      return output;
    }

  protected drawColorizeStrokes(source: Uint8Array, mask: Extract<LayerMask, { type: 'colorize' }>): Uint8Array {
      const { width, height } = this.ctl.doc;
      const canvas = this.createPixelCanvas(width, height, source);
      const context = canvas.getContext('2d')!;
      context.globalAlpha = 0.7;
      for (const stroke of mask.strokes) this.drawColorizeStroke(context, stroke);
      return this.readSamplingCanvas(canvas, width, height);
    }

  private drawColorizeStroke(context: CanvasRenderingContext2D, stroke: Extract<LayerMask, { type: 'colorize' }>['strokes'][number]): void {
    this.configureColorizeStroke(context, stroke);
    if (stroke.points.length === 1) return this.drawColorizeDot(context, stroke);
    this.drawColorizePath(context, stroke);
  }

  private configureColorizeStroke(context: CanvasRenderingContext2D, stroke: Extract<LayerMask, { type: 'colorize' }>['strokes'][number]): void {
    context.strokeStyle = stroke.color;
    context.fillStyle = stroke.color;
    context.lineWidth = stroke.radius * 2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }

  private drawColorizeDot(context: CanvasRenderingContext2D, stroke: Extract<LayerMask, { type: 'colorize' }>['strokes'][number]): void {
    context.beginPath();
    context.arc(stroke.points[0].x, stroke.points[0].y, stroke.radius, 0, Math.PI * 2);
    context.fill();
  }

  private drawColorizePath(context: CanvasRenderingContext2D, stroke: Extract<LayerMask, { type: 'colorize' }>['strokes'][number]): void {
    context.beginPath();
    context.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (const point of stroke.points.slice(1)) context.lineTo(point.x, point.y);
    context.stroke();
  }

  protected applyTransformMasksToTile(node: LayerNode, backing: TiledLayer, tile: FilterTile, rgba: Uint8Array): Uint8Array {
      const masks = node.masks?.filter((mask): mask is Extract<LayerMask, { type: 'transform' }> => mask.enabled && mask.type === 'transform') ?? [];
      if (!masks.length) return rgba;
      const matrix = this.combineTransformMasks(masks);
      if (matrix.isIdentity) return rgba;
      const bounds = this.inverseTransformBounds(matrix, tile);
      const pixels = new Uint8Array(bounds.width * bounds.height * 4);
      if (bounds.width && bounds.height) backing.readRectToJS(bounds.x, bounds.y, bounds.width, bounds.height, pixels);
      const source = this.createSamplingCanvas(bounds.width || 1, bounds.height || 1);
      const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
      if (bounds.width && bounds.height) sourceContext.putImageData(new ImageData(new Uint8ClampedArray(pixels), bounds.width, bounds.height), 0, 0);
      const output = this.createSamplingCanvas(tile.width, tile.height);
      const outputContext = output.getContext('2d', { willReadFrequently: true })!;
      outputContext.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e - tile.x, matrix.f - tile.y);
      if (bounds.width && bounds.height) outputContext.drawImage(source, bounds.x, bounds.y);
      return new Uint8Array(outputContext.getImageData(0, 0, tile.width, tile.height).data);
    }

  protected combineTransformMasks(masks: Array<Extract<LayerMask, { type: 'transform' }>>): DOMMatrix {
      const { width, height } = this.ctl.doc;
      return masks.reduce((result, mask) => {
        const transform = new DOMMatrix()
          .translate(width / 2 + mask.offsetX, height / 2 + mask.offsetY)
          .rotate(mask.rotation)
          .skewX(mask.shearX)
          .skewY(mask.shearY)
          .scale(mask.scaleX, mask.scaleY)
          .translate(-width / 2, -height / 2);
        return result.multiply(transform);
      }, new DOMMatrix());
    }

  protected inverseTransformBounds(matrix: DOMMatrix, tile: FilterTile): { x: number; y: number; width: number; height: number } {
      const inverse = matrix.inverse();
      const points = [
        new DOMPoint(tile.x, tile.y), new DOMPoint(tile.x + tile.width, tile.y),
        new DOMPoint(tile.x, tile.y + tile.height), new DOMPoint(tile.x + tile.width, tile.y + tile.height),
      ].map((point) => inverse.transformPoint(point));
      const { width, height } = this.ctl.doc;
      const x = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
      const y = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
      const right = Math.min(width, Math.ceil(Math.max(...points.map((point) => point.x))));
      const bottom = Math.min(height, Math.ceil(Math.max(...points.map((point) => point.y))));
      return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
    }

  protected applyFilterMasksToTile(
      node: LayerNode,
      image: ImageData,
      tile: FilterTile,
      depth: number,
      pools: FilterCanvasPools,
    ): void {
      const masks = node.masks?.filter((mask): mask is Extract<LayerMask, { type: 'filter' }> => mask.enabled && mask.type === 'filter') ?? [];
      for (const mask of masks) this.applyFilterStackToTile(mask, image, tile, depth, pools);
    }

  protected applyFilterStackToTile(
      mask: Extract<LayerMask, { type: 'filter' }>,
      image: ImageData,
      tile: FilterTile,
      depth: number,
      pools: FilterCanvasPools,
    ): void {
      for (const filter of mask.filters) {
        const source = this.getFilterCanvas(pools.filterSource, depth, tile.width, tile.height);
        const output = this.getFilterCanvas(pools.filterResult, depth, tile.width, tile.height);
        const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
        const outputContext = output.getContext('2d', { willReadFrequently: true })!;
        sourceContext.putImageData(image, 0, 0);
        const filtered = renderFilteredImage(source, outputContext, filter.kind, filter.strength, {
          x: tile.x, y: tile.y, width: tile.width, height: tile.height,
          fullWidth: this.ctl.doc.width, fullHeight: this.ctl.doc.height,
        });
        image.data.set(filtered.data);
      }
    }
}
