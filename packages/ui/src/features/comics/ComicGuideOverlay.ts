import { calculatePrintGuideRects, millimetresToPixels, type PrintBoundsMm } from '@nvts/templates';
import { symmetryManager, type SymmetryAxis } from '../../managers/SymmetryManager';

export interface ComicGuideOptions {
  dpi: number;
  page: PrintBoundsMm;
  showBleed: boolean;
  showTrim: boolean;
  showSafeArea: boolean;
  showMargins: boolean;
  showGrid: boolean;
  gridSpacingPx: number;
  showSymmetry: boolean;
  symmetryAxes: number;
  symmetryCenterX: number;
  symmetryCenterY: number;
  symmetryVerticalAxis?: boolean;
  symmetryHorizontalAxis?: boolean;
}

export const DEFAULT_COMIC_GUIDE_OPTIONS: ComicGuideOptions = {
  dpi: 300,
  page: { pageWidthMm: 148, pageHeightMm: 210, bleedMm: 3, safeMarginMm: 5, innerMarginMm: 8, outerMarginMm: 5, topMarginMm: 5, bottomMarginMm: 5 },
  showBleed: true,
  showTrim: true,
  showSafeArea: true,
  showMargins: true,
  showGrid: false,
  gridSpacingPx: 32,
  showSymmetry: false,
  symmetryAxes: 4,
  symmetryCenterX: 0.5,
  symmetryCenterY: 0.5,
};

/** Draws non-exported editorial guides on a dedicated overlay canvas. */
export function drawComicGuideOverlay(canvas: HTMLCanvasElement, options: ComicGuideOptions): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  const rects = calculatePrintGuideRects(options.page, options.dpi);
  const scaleX = canvas.width / Math.max(1, rects.canvas.width);
  const scaleY = canvas.height / Math.max(1, rects.canvas.height);
  context.save();
  context.scale(scaleX, scaleY);
  drawBleed(context, rects.canvas, rects.trim, options.showBleed);
  drawTrim(context, rects.trim, options.showTrim);
  drawSafeArea(context, rects.safe, options.showSafeArea);
  drawGrid(context, rects.canvas, options.gridSpacingPx, options.showGrid);
  drawSymmetry(context, rects.canvas, options, options.showSymmetry);
  context.restore();
}

function drawBleed(context: CanvasRenderingContext2D, canvas: { width: number; height: number }, trim: { x: number; y: number; width: number; height: number }, visible: boolean): void {
  if (!visible) return;
  context.fillStyle = 'rgba(220, 40, 55, 0.07)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.clearRect(trim.x, trim.y, trim.width, trim.height);
}

function drawTrim(context: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, visible: boolean): void {
  if (!visible) return;
  context.strokeStyle = '#e44747';
  context.lineWidth = 1;
  context.setLineDash([]);
  context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
}

function drawSafeArea(context: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, visible: boolean): void {
  if (!visible) return;
  context.strokeStyle = '#2385d7';
  context.lineWidth = 1;
  context.setLineDash([6, 4]);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.setLineDash([]);
}

function drawGrid(context: CanvasRenderingContext2D, rect: { width: number; height: number }, spacing: number, visible: boolean): void {
  if (!visible) return;
  const step = Math.max(2, Math.round(spacing));
  context.strokeStyle = 'rgba(90, 160, 190, 0.22)';
  context.lineWidth = 1;
  context.beginPath();
  drawVerticalGrid(context, rect.width, rect.height, step);
  drawHorizontalGrid(context, rect.width, rect.height, step);
  context.stroke();
}

function drawVerticalGrid(context: CanvasRenderingContext2D, width: number, height: number, step: number): void {
  for (let x = step; x < width; x += step) { context.moveTo(x, 0); context.lineTo(x, height); }
}

function drawHorizontalGrid(context: CanvasRenderingContext2D, width: number, height: number, step: number): void {
  for (let y = step; y < height; y += step) { context.moveTo(0, y); context.lineTo(width, y); }
}

function drawSymmetry(context: CanvasRenderingContext2D, rect: { width: number; height: number }, options: ComicGuideOptions, visible: boolean): void {
  if (!visible) return;
  const centerX = rect.width * clampUnit(options.symmetryCenterX);
  const centerY = rect.height * clampUnit(options.symmetryCenterY);
  const axes = Math.max(1, Math.min(64, Math.floor(options.symmetryAxes)));
  const radius = Math.hypot(rect.width, rect.height);
  context.strokeStyle = '#29a66b';
  context.lineWidth = 1;
  context.setLineDash([8, 5]);
  drawConfiguredSymmetryAxes(context, options, centerX, centerY, radius, axes);
  context.setLineDash([]);
}

function drawConfiguredSymmetryAxes(
  context: CanvasRenderingContext2D,
  options: ComicGuideOptions,
  centerX: number,
  centerY: number,
  radius: number,
  axes: number,
): void {
  if (options.symmetryVerticalAxis === undefined && options.symmetryHorizontalAxis === undefined) {
    return drawLegacySymmetryAxes(context, centerX, centerY, radius, axes);
  }
  if (options.symmetryHorizontalAxis) drawSymmetryAxis(context, centerX, centerY, radius, 0);
  if (options.symmetryVerticalAxis) drawSymmetryAxis(context, centerX, centerY, radius, Math.PI / 2);
}

function drawLegacySymmetryAxes(context: CanvasRenderingContext2D, centerX: number, centerY: number, radius: number, axes: number): void {
  for (let index = 0; index < axes; index += 1) {
    drawSymmetryAxis(context, centerX, centerY, radius, index / axes * Math.PI);
  }
}

function drawSymmetryAxis(context: CanvasRenderingContext2D, x: number, y: number, radius: number, angle: number): void {
  context.beginPath();
  context.moveTo(x - Math.cos(angle) * radius, y - Math.sin(angle) * radius);
  context.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  context.stroke();
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

export function createPrintCanvasSize(page: PrintBoundsMm, dpi: number): { width: number; height: number } {
  const bleed = millimetresToPixels(page.bleedMm, dpi);
  return {
    width: millimetresToPixels(page.pageWidthMm, dpi) + bleed * 2,
    height: millimetresToPixels(page.pageHeightMm, dpi) + bleed * 2,
  };
}


/** Wires optional guide overlays to the existing editor canvas without touching artwork pixels. */
export class ComicGuideOverlayController {
  private readonly overlay: HTMLCanvasElement;
  private readonly guidesButton: HTMLButtonElement;
  private readonly verticalSymmetryButton: HTMLButtonElement;
  private readonly horizontalSymmetryButton: HTMLButtonElement;
  private showGuides = false;
  private showSymmetry = symmetryManager.isEnabled();
  private readonly observer: MutationObserver;

  constructor(private readonly root: HTMLElement, private readonly sourceCanvas: HTMLCanvasElement) {
    this.overlay = this.createOverlay();
    this.guidesButton = this.requireButton('#toggle-comic-guides');
    this.verticalSymmetryButton = this.requireButton('#toggle-comic-symmetry-vertical');
    this.horizontalSymmetryButton = this.requireButton('#toggle-comic-symmetry-horizontal');
    this.syncSymmetryButtons();
    this.guidesButton.addEventListener('click', () => this.toggleGuides());
    this.verticalSymmetryButton.addEventListener('click', () => this.toggleSymmetryAxis('vertical'));
    this.horizontalSymmetryButton.addEventListener('click', () => this.toggleSymmetryAxis('horizontal'));
    this.observer = new MutationObserver(() => this.syncCanvasView());
    this.observer.observe(this.sourceCanvas, { attributes: true, attributeFilter: ['style', 'width', 'height'] });
    new ResizeObserver(() => this.syncCanvasView()).observe(this.sourceCanvas.parentElement!);
    this.syncCanvasView();
  }

  private createOverlay(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.id = 'comic-guide-overlay';
    canvas.setAttribute('aria-hidden', 'true');
    this.root.querySelector<HTMLElement>('.canvas-stage')?.append(canvas);
    return canvas;
  }

  private requireButton(selector: string): HTMLButtonElement {
    const button = this.root.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error(`Falta el control de guías ${selector}.`);
    return button;
  }

  private toggleGuides(): void {
    this.showGuides = !this.showGuides;
    this.guidesButton.setAttribute('aria-pressed', String(this.showGuides));
    this.redraw();
  }

  private toggleSymmetryAxis(axis: SymmetryAxis): void {
    symmetryManager.toggleAxis(axis);
    this.showSymmetry = symmetryManager.isEnabled();
    this.syncSymmetryButtons();
    this.redraw();
  }

  private syncSymmetryButtons(): void {
    const settings = symmetryManager.getSettings();
    this.verticalSymmetryButton.setAttribute('aria-pressed', String(settings.verticalAxis));
    this.horizontalSymmetryButton.setAttribute('aria-pressed', String(settings.horizontalAxis));
  }

  private syncCanvasView(): void {
    this.overlay.width = this.sourceCanvas.width;
    this.overlay.height = this.sourceCanvas.height;
    this.overlay.style.transform = this.sourceCanvas.style.transform;
    this.overlay.style.width = this.sourceCanvas.style.width;
    this.overlay.style.height = this.sourceCanvas.style.height;
    this.overlay.style.left = `${this.sourceCanvas.offsetLeft}px`;
    this.overlay.style.top = `${this.sourceCanvas.offsetTop}px`;
    this.redraw();
  }

  private redraw(): void {
    const visible = this.showGuides || this.showSymmetry;
    this.overlay.hidden = !visible;
    if (!visible) {
      this.overlay.getContext('2d')?.clearRect(0, 0, this.overlay.width, this.overlay.height);
      return;
    }
    const dpi = 300;
    const bleedMm = this.showGuides ? 3 : 0;
    const page = {
      pageWidthMm: Math.max(1, this.sourceCanvas.width * 25.4 / dpi - bleedMm * 2),
      pageHeightMm: Math.max(1, this.sourceCanvas.height * 25.4 / dpi - bleedMm * 2),
      bleedMm,
      safeMarginMm: 5,
      innerMarginMm: 8,
      outerMarginMm: 5,
      topMarginMm: 5,
      bottomMarginMm: 5,
    };
    const symmetry = symmetryManager.getSettings();
    drawComicGuideOverlay(this.overlay, {
      ...DEFAULT_COMIC_GUIDE_OPTIONS,
      dpi,
      page,
      showBleed: this.showGuides,
      showTrim: this.showGuides,
      showSafeArea: this.showGuides,
      showMargins: this.showGuides,
      showSymmetry: this.showSymmetry,
      symmetryAxes: 2,
      symmetryCenterX: symmetry.centerX,
      symmetryCenterY: symmetry.centerY,
      symmetryVerticalAxis: symmetry.verticalAxis,
      symmetryHorizontalAxis: symmetry.horizontalAxis,
    });
  }
}
