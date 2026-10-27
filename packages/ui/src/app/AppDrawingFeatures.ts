// Drawing tools, brush strokes and fill operations.
import { AppEventFeatures } from './AppEventFeatures';
import { applyBrushStamp, type StampOperation } from '@nvts/image-processing';
import { containsLayerType, StrokeSession, runEdit, type LayerNode } from '@nvts/document-model';
import { isPixelLayerType } from '@nvts/shared';
import { updateHistoryMemoryIndicator } from '../panels/HistoryPanel';
import type { Tool, FillOperation, FillResult, PixelRegion, StrokeLayerPixels } from './AppBase';

function nextPowerOfTwo(value: number): number {
  let size = 1;
  while (size < value) size *= 2;
  return size;
}

export abstract class AppDrawingFeatures extends AppEventFeatures {
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
      if (!operation) return;
      const pixels = this.readStampPixels(layer, operation.region);
      const changed = applyBrushStamp(pixels, operation);
      if (changed && layer.writeRectFromJS(
        operation.region.left, operation.region.top, operation.region.width, operation.region.height, pixels,
      )) this.scheduleRefreshForRegion(operation.region);
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
      if (target && layer.writeRectFromJS(region.left, region.top, region.width, region.height, target)) {
        this.scheduleRefreshForRegion(region);
      }
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
      if (this.handleImmediateTool(point, event)) return;
      const activeLayer = this.active();
      if (activeLayer && isPixelLayerType(activeLayer.type)
        && this.ctl.isEffectivelyVisible(activeLayer.id)
        && !this.ctl.isEffectivelyLocked(activeLayer.id)
        && this.beginColorizeStroke(event, point, activeLayer)) return;
      const layer = this.getEditablePaintLayer();
      if (!layer) return;
      if (this.tool === 'fill') {
        this.fillAt(point, layer);
        return;
      }
      this.beginPaintStroke(event, point, layer);
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
      if (this.tool === 'eyedropper') {
        this.pickColorAt(Math.floor(point.x), Math.floor(point.y));
        return true;
      }
      if (this.tool === 'text') {
        void this.createTextAt({ x: Math.round(point.x), y: Math.round(point.y) });
        return true;
      }
      if (this.tool === 'vector-select') {
        this.beginVectorGesture(point, event);
        return true;
      }
      return false;
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
        this.q<HTMLElement>('#status').textContent = locked
          ? 'La capa o su grupo está bloqueado'
          : 'La capa o su grupo está oculto';
        return null;
      }
      return layer;
    }

  protected beginPaintStroke(event: PointerEvent, point: { x: number; y: number }, layer: LayerNode): void {
      this.canvas.setPointerCapture(event.pointerId);
      this.stroke = new StrokeSession(this.ctx, layer.engineId);
      this.strokeLayer = this.ctl.layerPixels(layer);
      this.strokeLayerNodeId = layer.id;
      this.strokeHasGlobalFilterDependency = this.layerPathHasGlobalFilterDependency(layer.id);
      this.strokeTool = this.tool;
      this.last = point;
      if (this.tool === 'brush' || this.tool === 'eraser') {
        this.stamp(point.x, point.y);
        return;
      }
      if (this.tool !== 'line' && this.tool !== 'rectangle' && this.tool !== 'ellipse') return;
      this.shapeStart = { ...point, clientX: event.clientX, clientY: event.clientY };
      this.drawToolPreview(event);
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
      if (this.strokeTool !== 'brush' && this.strokeTool !== 'eraser') return;
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
      if (!this.hasPendingBrushDabs()) {
        this.finishQueuedStrokeIfReady();
        return;
      }
      if (!this.stroke || !this.strokeLayer || (this.strokeTool !== 'brush' && this.strokeTool !== 'eraser')) {
        this.clearPendingBrushDabs();
        this.pendingStrokeFinish = null;
        return;
      }
      const startedAt = performance.now();
      let processed = 0;
      try {
        while (this.hasPendingBrushDabs() && processed < 64) {
          const point = this.pendingBrushDabs[this.pendingBrushDabHead++];
          this.stamp(point.x, point.y);
          processed++;
          if (performance.now() - startedAt >= 4) break;
        }
      } catch (error) {
        this.abortStroke(error);
        return;
      }
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
      this.updatePreviewCanvasSize();
      const preview = this.q<HTMLCanvasElement>('#tool-preview');
      const ctx = preview.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, preview.width, preview.height);
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const stage = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
      const x1 = this.shapeStart.clientX - stage.left, y1 = this.shapeStart.clientY - stage.top;
      const x2 = e.clientX - stage.left, y2 = e.clientY - stage.top;
      const rect = this.canvas.getBoundingClientRect();
      const scale = Math.min(rect.width / this.ctl.doc.width, rect.height / this.ctl.doc.height);
      ctx.globalAlpha = this.brush.opacity / 100;
      ctx.strokeStyle = this.foregroundHex(); ctx.fillStyle = this.foregroundHex();
      ctx.lineWidth = Math.max(1, this.brush.size * scale); ctx.lineCap = this.brush.lineCap; ctx.lineJoin = this.brush.lineJoin;
      if (this.strokeTool === 'line') { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
      else if (this.strokeTool === 'rectangle') {
        const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
        this.brush.shapeFill ? ctx.fillRect(x, y, w, h) : undefined;
        ctx.strokeRect(x, y, w, h);
      } else if (this.strokeTool === 'ellipse') {
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
        this.brush.shapeFill ? ctx.fill() : undefined; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

  protected up(e?: PointerEvent): void {
      if (this.vectorGesture) { this.finishVectorGesture(e ? this.toDoc(e) : this.vectorGesture.startPoint); return; }
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
        if (this.hasPendingBrushDabs()) {
          this.pendingStrokeFinish = { tool: this.strokeTool };
          this.requestRefreshFrame();
          return;
        }
        this.finishStroke(this.strokeTool);
      } catch (error) {
        this.abortStroke(error);
      }
    }

  protected finishStroke(tool: Tool | null): void {
      const stroke = this.stroke;
      if (!stroke) return;
      const label: Record<Tool, string> = {
        brush: 'Pincel', eraser: 'Borrador', eyedropper: 'Cuentagotas', line: 'Línea',
        rectangle: 'Rectángulo', ellipse: 'Elipse', fill: 'Relleno', hand: 'Mover lienzo',
        text: 'Texto', 'vector-select': 'Selección vectorial',
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
      if (operation.contiguous) this.fillContiguousPixels(operation, result);
      else this.fillAllMatchingPixels(operation, result);
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

  protected fillAllMatchingPixels(operation: FillOperation, result: FillResult): void {
      const total = operation.width * operation.height;
      for (let pixel = 0; pixel < total; pixel++) this.fillMatchingPixel(operation, result, pixel);
    }

  protected fillMatchingPixel(operation: FillOperation, result: FillResult, pixel: number): void {
      if (!this.fillMatches(operation, pixel * 4)) return;
      this.paintFillPixel(operation, result, pixel);
    }

  protected fillContiguousPixels(operation: FillOperation, result: FillResult): void {
      const { width, height } = operation;
      const total = width * height;
      const stack = new Uint32Array(total);
      const seen = new Uint8Array(total);
      let top = 0;
      const seedPixel = operation.seedY * width + operation.seedX;
      stack[top++] = seedPixel;
      seen[seedPixel] = 1;
      while (top > 0) top = this.processNextFillPixel(operation, result, stack, seen, top, width, height);
    }

  protected processNextFillPixel(
      operation: FillOperation,
      result: FillResult,
      stack: Uint32Array,
      seen: Uint8Array,
      top: number,
      width: number,
      height: number,
    ): number {
      const pixel = stack[--top];
      if (!this.fillMatches(operation, pixel * 4)) return top;
      this.paintFillPixel(operation, result, pixel);
      return this.pushUnseenFillNeighbors(pixel, width, height, stack, seen, top);
    }

  protected pushUnseenFillNeighbors(
      pixel: number,
      width: number,
      height: number,
      stack: Uint32Array,
      seen: Uint8Array,
      top: number,
    ): number {
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      const push = (next: number): void => {
        if (seen[next]) return;
        seen[next] = 1;
        stack[top++] = next;
      };
      if (x > 0) push(pixel - 1);
      if (x + 1 < width) push(pixel + 1);
      if (y > 0) push(pixel - width);
      if (y + 1 < height) push(pixel + width);
      return top;
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
