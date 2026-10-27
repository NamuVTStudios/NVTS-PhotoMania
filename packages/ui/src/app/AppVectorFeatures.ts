// Vector layer editing and export.
import { AppLayerPanelFeatures } from './AppLayerPanelFeatures';
import { type LayerNode } from '@nvts/document-model';
import { cloneVectorShape, cloneVectorShapes, type VectorShape } from '@nvts/shared';
import { renderVectorEditorPanel } from '../panels/VectorEditorPanel';
import { exportVectorShapeToSvg, renderVectorShape } from '@nvts/vector';

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

  protected updateVectorShapeFromFields(): void {
      const shape = this.vectorDraft.find((item) => item.id === this.vectorSelectedId);
      if (!shape) return;
      this.updateVectorShapeGeometry(shape);
      this.updateVectorShapePaintStyle(shape);
      this.updateVectorShapeTextStyle(shape);
      this.updateVectorShapePoints(shape);
      this.updateVectorShapeSummary(shape);
    }

  protected updateVectorShapeGeometry(shape: VectorShape): void {
      shape.kind = this.q<HTMLSelectElement>('#vector-kind').value as VectorShape['kind'];
      const read = (id: string, fallback: number) => this.readVectorNumber(id, fallback);
      shape.x = read('vector-x', shape.x);
      shape.y = read('vector-y', shape.y);
      shape.width = Math.max(1, read('vector-width', shape.width));
      shape.height = Math.max(1, read('vector-height', shape.height));
      shape.rotation = Math.max(-360, Math.min(360, read('vector-rotation', shape.rotation ?? 0)));
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
      if (listButton) listButton.textContent = `${this.vectorKindLabel(shape.kind)} · ${Math.round(shape.x)}, ${Math.round(shape.y)}`;
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
