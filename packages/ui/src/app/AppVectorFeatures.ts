// Vector layer editing and export.
import { AppLayerPanelFeatures } from './AppLayerPanelFeatures';
import { type LayerNode } from '@nvts/document-model';
import { cloneVectorShape, cloneVectorShapes, getVectorShapeBounds, remapVectorPoints, type VectorShape } from '@nvts/shared';
import { renderVectorEditorPanel } from '../panels/VectorEditorPanel';
import { exportVectorShapeToSvg, renderVectorShape } from '@nvts/vector';
import type { VectorDrawingToolId } from '../tools/ToolsBase';

export abstract class AppVectorFeatures extends AppLayerPanelFeatures {
  protected editVectorLayer(layer: LayerNode): void {
      if (layer.type !== 'vector') return;
      if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
      this.activeId = layer.id;
      this.vectorEditLayerId = layer.id;
      this.vectorDraft = cloneVectorShapes(layer.vectorShapes);
      this.vectorSelectedId = this.vectorDraft[0]?.id ?? null;
      this.q<HTMLElement>('#vector-layer-name').textContent = layer.name;
      this.renderVectorEditor();
      this.q<HTMLElement>('#vector-panel').hidden = false;
    }

  protected vectorKindLabel(kind: VectorShape['kind']): string {
      return ({
        rectangle: 'Rectángulo', 'rounded-rectangle': 'Rectángulo redondeado', ellipse: 'Elipse', line: 'Línea',
        polygon: 'Polígono', polyline: 'Polilínea', bezier: 'Curva Bézier', freehand: 'Trazo libre',
        star: 'Estrella', spiral: 'Espiral', text: 'Texto artístico',
      } as const)[kind];
    }

  protected renderVectorEditor(): void {
      renderVectorEditorPanel(
        this.root,
        this.vectorDraft,
        this.vectorSelectedId,
        (kind) => this.vectorKindLabel(kind),
        (id) => { this.vectorSelectedId = id; this.renderVectorEditor(); },
      );
    }

  protected addVectorShape(kind: VectorShape['kind']): void {
    if (!this.vectorEditLayerId) return;
    const geometry = this.getDefaultVectorGeometry();
    const shape = this.createDefaultVectorShape(kind, geometry);
    this.vectorDraft.push(shape);
    this.vectorSelectedId = shape.id;
    this.renderVectorEditor();
  }

  protected createVectorShapeFromGesture(
    tool: VectorDrawingToolId,
    start: { x: number; y: number },
    end: { x: number; y: number },
    points: Array<{ x: number; y: number }>,
    id: string,
  ): VectorShape {
    const kind = this.getVectorDrawingKind(tool);
    const geometry = this.getVectorGestureGeometry(start, end, points, tool);
    const shape = this.createDefaultVectorShape(kind, geometry);
    this.applyVectorGestureIdentity(shape, id);
    this.applyVectorGestureGeometry(shape, tool, start, end, points, geometry);
    this.applyVectorGestureStyle(shape, kind);
    return shape;
  }

  private getVectorDrawingKind(tool: VectorDrawingToolId): VectorShape['kind'] {
    const kinds: Record<VectorDrawingToolId, VectorShape['kind']> = {
      'vector-rectangle': 'rectangle', 'vector-rounded-rectangle': 'rounded-rectangle',
      'vector-ellipse': 'ellipse', 'vector-line': 'line', 'vector-pen': 'bezier',
      'vector-polygon': 'polygon', 'vector-star': 'star', 'vector-freehand': 'freehand',
      'vector-polyline': 'polyline', 'vector-spiral': 'spiral',
    };
    return kinds[tool];
  }

  private getVectorGestureGeometry(
    start: { x: number; y: number },
    end: { x: number; y: number },
    points: Array<{ x: number; y: number }>,
    tool: VectorDrawingToolId,
  ): { x: number; y: number; width: number; height: number } {
    if ((tool === 'vector-freehand' || tool === 'vector-polyline') && points.length > 1) return this.getVectorPointsGeometry(points);
    return {
      x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
      width: Math.max(1, Math.abs(end.x - start.x)), height: Math.max(1, Math.abs(end.y - start.y)),
    };
  }

  private getVectorPointsGeometry(points: Array<{ x: number; y: number }>): { x: number; y: number; width: number; height: number } {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    return { x: left, y: top, width: Math.max(1, Math.max(...xs) - left), height: Math.max(1, Math.max(...ys) - top) };
  }

  private applyVectorGestureIdentity(shape: VectorShape, id: string): void {
    shape.id = id;
  }

  private applyVectorGestureGeometry(
    shape: VectorShape,
    tool: VectorDrawingToolId,
    start: { x: number; y: number },
    end: { x: number; y: number },
    points: Array<{ x: number; y: number }>,
    geometry: { x: number; y: number; width: number; height: number },
  ): void {
    if (tool === 'vector-line') {
      shape.points = [{ ...start }, { ...end }];
      Object.assign(shape, geometry);
    }
    if (tool === 'vector-pen') shape.points = this.createBezierGesturePoints(start, end);
    if (tool === 'vector-freehand' || tool === 'vector-polyline') {
      shape.points = points.length > 1 ? points.map((point) => ({ ...point })) : [{ ...start }, { ...end }];
      Object.assign(shape, geometry);
    }
  }

  private createBezierGesturePoints(start: { x: number; y: number }, end: { x: number; y: number }): NonNullable<VectorShape['points']> {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return [
      { x: start.x, y: start.y, outX: start.x + dx / 3, outY: start.y + dy / 3 },
      { x: end.x, y: end.y, inX: end.x - dx / 3, inY: end.y - dy / 3 },
    ];
  }

  private applyVectorGestureStyle(shape: VectorShape, kind: VectorShape['kind']): void {
    const color = this.foregroundHex();
    shape.color = color;
    shape.fillColor = color;
    shape.strokeColor = color;
    shape.opacity = this.brush.opacity / 100;
    shape.strokeWidth = Math.max(1, this.brush.size);
    shape.lineCap = this.brush.lineCap;
    shape.lineJoin = this.brush.lineJoin;
    shape.strokeEnabled = true;
    shape.fillEnabled = this.brush.shapeFill && !['line', 'polyline', 'bezier', 'freehand', 'spiral'].includes(kind);
  }

  private getDefaultVectorGeometry(): { x: number; y: number; width: number; height: number } {
    const x = Math.round(this.ctl.doc.width * 0.25);
    const y = Math.round(this.ctl.doc.height * 0.25);
    const width = Math.max(24, Math.round(this.ctl.doc.width * 0.25));
    const height = Math.max(24, Math.round(this.ctl.doc.height * 0.25));
    return { x, y, width, height };
  }

  private createDefaultVectorShape(kind: VectorShape['kind'], geometry: { x: number; y: number; width: number; height: number }): VectorShape {
    const { x, y, width, height } = geometry;
    return {
      id: crypto.randomUUID(), kind, x, y, width, height, color: '#e03030', fillColor: '#e03030', strokeColor: '#e03030',
      opacity: 1, strokeWidth: 4, fillEnabled: !['line','polyline','bezier','freehand','spiral'].includes(kind),
      strokeEnabled: true, strokeDash: 'solid', lineCap: 'round', lineJoin: 'round', cornerRadius: 20,
      points: this.createDefaultVectorPoints(kind, geometry), starPoints: 5, rotation: 0, text: 'Texto vectorial',
      fontFamily: 'Arial', fontSize: 64, fontWeight: 'normal', fontStyle: 'normal', textAlign: 'left',
    };
  }

  private createDefaultVectorPoints(kind: VectorShape['kind'], geometry: { x: number; y: number; width: number; height: number }): VectorShape['points'] {
    const { x, y, width, height } = geometry;
    if (kind === 'polygon') return [{ x: x + width / 2, y }, { x: x + width, y: y + height }, { x, y: y + height }];
    if (kind === 'polyline' || kind === 'freehand') return this.createDefaultPolylinePoints(geometry);
    if (kind === 'bezier') return this.createDefaultBezierPoints(geometry);
    return undefined;
  }

  private createDefaultPolylinePoints({ x, y, width, height }: { x: number; y: number; width: number; height: number }): NonNullable<VectorShape['points']> {
    return [
      { x, y: y + height * .75 }, { x: x + width * .22, y: y + height * .12 },
      { x: x + width * .45, y: y + height * .82 }, { x: x + width * .69, y: y + height * .22 },
      { x: x + width, y: y + height * .58 },
    ];
  }

  private createDefaultBezierPoints({ x, y, width, height }: { x: number; y: number; width: number; height: number }): NonNullable<VectorShape['points']> {
    return [{ x, y: y + height, outX: x + width * .25, outY: y }, { x: x + width, y, inX: x + width * .75, inY: y + height }];
  }

  protected updateVectorShapeFromFields(fieldId?: string): void {
      const shape = this.vectorDraft.find((item) => item.id === this.vectorSelectedId);
      if (!shape) return;
      this.updateVectorShapeGeometry(shape, fieldId);
      this.updateVectorShapePaintStyle(shape);
      this.updateVectorShapeTextStyle(shape);
      if (!fieldId || fieldId === 'vector-points') this.updateVectorShapePoints(shape);
      if (fieldId === 'vector-points') this.syncVectorShapeGeometryToBounds(shape);
      this.updateVectorShapeSummary(shape);
    }

  protected updateVectorShapeGeometry(shape: VectorShape, fieldId?: string): void {
      const read = (id: string, fallback: number) => this.readVectorNumber(id, fallback);
      const geometryFields = ['vector-x', 'vector-y', 'vector-width', 'vector-height'];
      if (!fieldId || fieldId === 'vector-kind') shape.kind = this.q<HTMLSelectElement>('#vector-kind').value as VectorShape['kind'];
      if (!fieldId || fieldId === 'vector-rotation') {
        shape.rotation = Math.max(-360, Math.min(360, read('vector-rotation', shape.rotation ?? 0)));
      }
      if (fieldId && !geometryFields.includes(fieldId)) return;
      const sourceBounds = getVectorShapeBounds(shape);
      const targetBounds = {
        x: !fieldId || fieldId === 'vector-x' ? read('vector-x', sourceBounds.x) : sourceBounds.x,
        y: !fieldId || fieldId === 'vector-y' ? read('vector-y', sourceBounds.y) : sourceBounds.y,
        width: !fieldId || fieldId === 'vector-width' ? Math.max(1, read('vector-width', sourceBounds.width)) : sourceBounds.width,
        height: !fieldId || fieldId === 'vector-height' ? Math.max(1, read('vector-height', sourceBounds.height)) : sourceBounds.height,
      };
      shape.points = remapVectorPoints(shape.points, sourceBounds, targetBounds);
      Object.assign(shape, targetBounds);
    }

  protected syncVectorShapeGeometryToBounds(shape: VectorShape): void {
      const bounds = getVectorShapeBounds(shape);
      Object.assign(shape, bounds);
      const fields: Array<[string, number]> = [
        ['vector-x', bounds.x], ['vector-y', bounds.y], ['vector-width', bounds.width], ['vector-height', bounds.height],
      ];
      fields.forEach(([id, value]) => { this.q<HTMLInputElement>(`#${id}`).value = String(Math.round(value)); });
    }

  protected updateVectorShapePaintStyle(shape: VectorShape): void {
      shape.color = this.q<HTMLInputElement>('#vector-color').value;
      shape.fillColor = shape.color;
      shape.strokeColor = this.q<HTMLInputElement>('#vector-stroke-color').value;
      shape.opacity = Math.max(0, Math.min(1, this.readVectorNumber('vector-opacity', shape.opacity * 100) / 100));
      shape.strokeWidth = Math.max(0, Math.min(500, this.readVectorNumber('vector-stroke', shape.strokeWidth)));
      shape.fillEnabled = this.q<HTMLSelectElement>('#vector-fill-enabled').value === 'yes';
      shape.strokeEnabled = this.q<HTMLSelectElement>('#vector-stroke-enabled').value === 'yes';
      shape.strokeDash = this.q<HTMLSelectElement>('#vector-dash').value as NonNullable<VectorShape['strokeDash']>;
      shape.lineCap = this.q<HTMLSelectElement>('#vector-line-cap').value as NonNullable<VectorShape['lineCap']>;
      shape.lineJoin = this.q<HTMLSelectElement>('#vector-line-join').value as NonNullable<VectorShape['lineJoin']>;
      shape.cornerRadius = Math.max(0, Math.min(500, this.readVectorNumber('vector-corner-radius', shape.cornerRadius ?? 20)));
      shape.starPoints = Math.max(3, Math.min(64, Math.round(this.readVectorNumber('vector-star-points', shape.starPoints ?? 5))));
    }

  protected updateVectorShapeTextStyle(shape: VectorShape): void {
      shape.text = this.q<HTMLInputElement>('#vector-text').value;
      shape.fontFamily = this.q<HTMLSelectElement>('#vector-font-family').value;
      shape.fontSize = Math.max(1, Math.min(2000, this.readVectorNumber('vector-font-size', shape.fontSize ?? 64)));
      shape.fontStyle = this.q<HTMLSelectElement>('#vector-font-style').value as NonNullable<VectorShape['fontStyle']>;
      shape.fontWeight = this.q<HTMLSelectElement>('#vector-font-weight').value as NonNullable<VectorShape['fontWeight']>;
      shape.textAlign = this.q<HTMLSelectElement>('#vector-text-align').value as NonNullable<VectorShape['textAlign']>;
    }

  protected updateVectorShapePoints(shape: VectorShape): void {
      const pointsValue = this.q<HTMLTextAreaElement>('#vector-points').value.trim();
      if (!pointsValue) {
        shape.points = undefined;
        return;
      }
      try { shape.points = this.parseVectorShapePoints(pointsValue); }
      catch (error) { this.reportVectorShapePointsError(error); }
    }

  protected parseVectorShapePoints(value: string): NonNullable<VectorShape['points']> {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed) || parsed.some((point) => !point || typeof point.x !== 'number' || typeof point.y !== 'number')) {
        throw new Error('Los nodos deben ser una lista JSON de puntos con coordenadas x e y.');
      }
      return parsed as NonNullable<VectorShape['points']>;
    }

  protected reportVectorShapePointsError(error: unknown): void {
      this.q<HTMLElement>('#status').textContent = error instanceof Error
        ? `Nodos vectoriales: ${error.message}`
        : 'El JSON de nodos no es válido.';
    }

  protected updateVectorShapeSummary(shape: VectorShape): void {
      this.q<HTMLElement>('#vector-opacity-value').textContent = `${Math.round(shape.opacity * 100)}%`;
      const index = this.vectorDraft.indexOf(shape);
      const listButton = this.q<HTMLElement>('#vector-shape-list').children[index] as HTMLButtonElement | undefined;
      const bounds = getVectorShapeBounds(shape);
      if (listButton) listButton.textContent = `${this.vectorKindLabel(shape.kind)} · ${Math.round(bounds.x)}, ${Math.round(bounds.y)}`;
    }

  protected readVectorNumber(id: string, fallback: number): number {
      const parsed = Number(this.q<HTMLInputElement>(`#${id}`).value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

  protected duplicateSelectedVectorShape(): void {
      const index = this.vectorDraft.findIndex((shape) => shape.id === this.vectorSelectedId);
      if (index < 0) return;
      const original = this.vectorDraft[index];
      const clone = cloneVectorShape(original);
      clone.id = crypto.randomUUID();
      clone.x += 12;
      clone.y += 12;
      this.vectorDraft.splice(index + 1, 0, clone); this.vectorSelectedId = clone.id; this.renderVectorEditor();
    }

  protected moveSelectedVectorShape(delta: number): void {
      const index = this.vectorDraft.findIndex((shape) => shape.id === this.vectorSelectedId);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= this.vectorDraft.length) return;
      const [shape] = this.vectorDraft.splice(index, 1); this.vectorDraft.splice(target, 0, shape); this.renderVectorEditor();
    }

  protected deleteSelectedVectorShape(): void {
      const index = this.vectorDraft.findIndex((shape) => shape.id === this.vectorSelectedId);
      if (index < 0) return;
      this.vectorDraft.splice(index, 1);
      this.vectorSelectedId = this.vectorDraft[Math.min(index, this.vectorDraft.length - 1)]?.id ?? null;
      this.renderVectorEditor();
    }

  protected applyVectorEditor(): void {
      const layer = this.vectorEditLayerId ? this.ctl.find(this.vectorEditLayerId) : undefined;
      if (!layer || layer.type !== 'vector') { this.q<HTMLElement>('#vector-panel').hidden = true; return; }
      this.updateVectorShapeFromFields();
      this.commitVectorShapes(layer, cloneVectorShapes(this.vectorDraft));
      this.q<HTMLElement>('#vector-panel').hidden = true;
      this.vectorEditLayerId = null; this.vectorSelectedId = null; this.vectorDraft = [];
    }

  protected cancelVectorEditor(): void {
      this.q<HTMLElement>('#vector-panel').hidden = true;
      this.vectorEditLayerId = null; this.vectorSelectedId = null; this.vectorDraft = [];
    }

  protected commitVectorShapes(layer: LayerNode, shapes: VectorShape[]): void {
      const canvas = document.createElement('canvas'); canvas.width = this.ctl.doc.width; canvas.height = this.ctl.doc.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { alert('No se pudo preparar la capa vectorial.'); return; }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const shape of shapes) renderVectorShape(ctx, shape);
      this.ctl.replaceVectorContent(layer.id, shapes, new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    }

  protected exportVectorLayerSvg(): void {
      const layer = this.getVectorLayerForExport();
      if (!layer) return;
      this.downloadVectorLayerSvg(layer, this.createVectorLayerSvg());
    }

  protected getVectorLayerForExport(): LayerNode | undefined {
      const layer = this.vectorEditLayerId ? this.ctl.find(this.vectorEditLayerId) : undefined;
      return layer?.type === 'vector' ? layer : undefined;
    }

  protected createVectorLayerSvg(): string {
      const width = this.ctl.doc.width;
      const height = this.ctl.doc.height;
      const shapes = this.vectorDraft.map(exportVectorShapeToSvg).join('\n  ');
      return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n  ${shapes}\n</svg>`;
    }

  protected downloadVectorLayerSvg(layer: LayerNode, svg: string): void {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${layer.name.replace(/[\\/:*?"<>|]/g, '_') || 'Capa-vectorial'}.svg`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

  protected moveLayerById(id: string, delta: number): void {
      this.activeId = id;
      if (this.ctl.moveLayer(id, delta)) { this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh(); }
    }
}
