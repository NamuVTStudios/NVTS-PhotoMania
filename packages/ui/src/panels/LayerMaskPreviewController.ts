export type LayerMaskPreviewMode = 'before' | 'split' | 'after';
type PreviewSnapshot = { width: number; height: number; pixels: Uint8Array };
type SnapshotProvider = () => Promise<PreviewSnapshot>;

/** Captures a stable renderer snapshot and presents before/after comparisons without changing document pixels. */
export class LayerMaskPreviewController {
  private readonly modeControl: HTMLSelectElement;
  private readonly toolbar: HTMLElement;
  private readonly previewClip: HTMLElement;
  private readonly previewCanvas: HTMLCanvasElement;
  private readonly divider: HTMLElement;
  private readonly beforeLabel: HTMLElement;
  private readonly afterLabel: HTMLElement;
  private readonly stage: HTMLElement;
  private active = false;
  private panelVisible = false;
  private snapshotReady = false;
  private captureGeneration = 0;

  constructor(
    private readonly root: HTMLElement,
    private readonly sourceCanvas: HTMLCanvasElement,
    private readonly snapshotProvider?: SnapshotProvider,
  ) {
    this.modeControl = this.requireElement<HTMLSelectElement>('#mask-preview-mode');
    this.toolbar = this.requireElement<HTMLElement>('#canvas-preview-toolbar');
    this.previewClip = this.requireElement<HTMLElement>('#mask-before-preview-clip');
    this.previewCanvas = this.requireElement<HTMLCanvasElement>('#mask-before-preview');
    this.divider = this.requireElement<HTMLElement>('#mask-preview-divider');
    this.beforeLabel = this.requireElement<HTMLElement>('#mask-preview-before-label');
    this.afterLabel = this.requireElement<HTMLElement>('#mask-preview-after-label');
    this.stage = this.requireElement<HTMLElement>('.canvas-stage');
  }

  mount(): void {
    this.modeControl.addEventListener('change', () => this.setMode(this.modeControl.value as LayerMaskPreviewMode));
  }

  setPanelVisible(visible: boolean): void {
    this.panelVisible = visible;
    this.setMode(this.modeControl.value as LayerMaskPreviewMode);
  }

  captureBefore(): boolean {
    if (this.snapshotProvider) return this.captureFromRenderer();
    return this.captureFromCanvas();
  }

  private captureFromRenderer(): boolean {
    this.active = true;
    this.snapshotReady = false;
    const generation = ++this.captureGeneration;
    this.toolbar.hidden = !this.panelVisible;
    this.modeControl.disabled = true;
    this.setMode('after');
    void this.snapshotProvider!()
      .then((snapshot) => this.applyPixelSnapshot(snapshot, generation))
      .catch((error: unknown) => this.handleRendererCaptureFailure(error, generation));
    return true;
  }

  private captureFromCanvas(): boolean {
    const fallbackCaptured = this.copyCanvasPixels();
    const bitmapCaptureAvailable = typeof createImageBitmap === 'function';
    if (!fallbackCaptured && !bitmapCaptureAvailable) return false;
    this.active = true;
    this.snapshotReady = fallbackCaptured;
    const generation = ++this.captureGeneration;
    this.toolbar.hidden = !this.panelVisible;
    this.modeControl.disabled = !fallbackCaptured;
    this.syncCanvasTransform();
    this.setMode('after');
    if (!fallbackCaptured) this.startBitmapCapture(generation);
    return true;
  }

  setMode(mode: LayerMaskPreviewMode): void {
    const selectedMode = this.active ? mode : 'after';
    const previewVisible = this.active && this.panelVisible;
    const canShowBefore = previewVisible && this.snapshotReady;
    const showSnapshot = canShowBefore && selectedMode !== 'after';
    const showSplit = showSnapshot && selectedMode === 'split';
    const clipPath = showSplit ? 'inset(0 50% 0 0)' : 'none';

    this.modeControl.value = selectedMode;
    this.toolbar.hidden = !previewVisible;
    this.syncCanvasTransform();
    this.sourceCanvas.style.visibility = selectedMode === 'before' && canShowBefore ? 'hidden' : '';
    this.previewClip.hidden = !showSnapshot;
    this.previewClip.classList.toggle('is-split', showSplit);
    // Apply the clipping directly as well as through the CSS class. This keeps
    // split mode deterministic even when theme or panel styles override defaults.
    this.previewClip.style.clipPath = clipPath;
    this.previewClip.style.setProperty('-webkit-clip-path', clipPath);
    this.previewCanvas.style.visibility = showSnapshot ? 'visible' : 'hidden';
    this.divider.hidden = !showSplit;
    this.beforeLabel.hidden = !canShowBefore || (selectedMode !== 'split' && selectedMode !== 'before');
    this.afterLabel.hidden = !previewVisible || selectedMode === 'before';
    this.stage.classList.toggle('mask-preview-before', selectedMode === 'before' && canShowBefore);
    this.stage.classList.toggle('mask-preview-split', showSplit);
  }

  syncCanvasTransform(): void {
    const width = this.getSourceCanvasDisplaySize('width');
    const height = this.getSourceCanvasDisplaySize('height');

    // The source canvas is a flex item centered by .canvas-stage. The preview
    // canvas is absolutely positioned, so mirror that same centered layout box
    // before applying the exact same pan/zoom transform.
    this.previewCanvas.style.position = 'absolute';
    this.previewCanvas.style.left = '50%';
    this.previewCanvas.style.top = '50%';
    this.previewCanvas.style.right = 'auto';
    this.previewCanvas.style.bottom = 'auto';
    this.previewCanvas.style.width = `${width}px`;
    this.previewCanvas.style.height = `${height}px`;
    this.previewCanvas.style.marginLeft = `${-width / 2}px`;
    this.previewCanvas.style.marginTop = `${-height / 2}px`;
    this.previewCanvas.style.objectFit = 'contain';
    this.previewCanvas.style.transform = this.sourceCanvas.style.transform || 'none';
    this.previewCanvas.style.transformOrigin = this.sourceCanvas.style.transformOrigin || 'center center';
  }

  private getSourceCanvasDisplaySize(dimension: 'width' | 'height'): number {
    const inlineSize = Number.parseFloat(this.sourceCanvas.style[dimension]);
    if (Number.isFinite(inlineSize) && inlineSize > 0) return inlineSize;

    const layoutSize = dimension === 'width' ? this.sourceCanvas.offsetWidth : this.sourceCanvas.offsetHeight;
    if (layoutSize > 0) return layoutSize;

    const intrinsicSize = dimension === 'width' ? this.sourceCanvas.width : this.sourceCanvas.height;
    return Math.max(1, intrinsicSize);
  }

  hide(): void {
    this.active = false;
    this.snapshotReady = false;
    this.captureGeneration += 1;
    this.toolbar.hidden = true;
    this.modeControl.disabled = false;
    this.previewClip.hidden = true;
    this.previewClip.classList.remove('is-split');
    this.previewClip.style.clipPath = 'none';
    this.previewClip.style.setProperty('-webkit-clip-path', 'none');
    this.previewCanvas.style.visibility = 'hidden';
    this.divider.hidden = true;
    this.beforeLabel.hidden = true;
    this.afterLabel.hidden = true;
    this.sourceCanvas.style.visibility = '';
    this.stage.classList.remove('mask-preview-before', 'mask-preview-split');
    this.modeControl.value = 'after';
  }

  private applyPixelSnapshot(snapshot: PreviewSnapshot, generation: number): void {
    if (!this.isCurrentCapture(generation)) return;
    const context = this.previewCanvas.getContext('2d');
    if (!context) return this.failRendererCapture(generation, new Error('No se pudo preparar el lienzo de comparación.'));
    this.previewCanvas.width = snapshot.width;
    this.previewCanvas.height = snapshot.height;
    const image = context.createImageData(snapshot.width, snapshot.height);
    image.data.set(snapshot.pixels);
    context.putImageData(image, 0, 0);
    this.snapshotReady = true;
    this.finishSnapshotCapture();
  }

  private handleRendererCaptureFailure(error: unknown, generation: number): void {
    if (!this.isCurrentCapture(generation)) return;
    this.failRendererCapture(generation, error);
  }

  private failRendererCapture(generation: number, error: unknown): void {
    if (!this.isCurrentCapture(generation)) return;
    console.warn('No se pudo capturar la textura del lienzo para la vista previa:', error);
    this.reportSnapshotFailure();
  }

  private startBitmapCapture(generation: number): void {
    if (typeof createImageBitmap !== 'function') return;
    void createImageBitmap(this.sourceCanvas)
      .then((bitmap) => this.applyBitmapSnapshot(bitmap, generation))
      .catch((error: unknown) => this.handleBitmapCaptureFailure(error, generation));
  }

  private applyBitmapSnapshot(bitmap: ImageBitmap, generation: number): void {
    if (!this.isCurrentCapture(generation)) {
      bitmap.close();
      return;
    }
    const context = this.previewCanvas.getContext('2d');
    if (!context) {
      bitmap.close();
      this.modeControl.disabled = false;
      this.setMode(this.modeControl.value as LayerMaskPreviewMode);
      return this.reportSnapshotFailure();
    }
    this.previewCanvas.width = bitmap.width;
    this.previewCanvas.height = bitmap.height;
    context.clearRect(0, 0, bitmap.width, bitmap.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    this.snapshotReady = true;
    this.finishSnapshotCapture();
  }

  private handleBitmapCaptureFailure(error: unknown, generation: number): void {
    if (!this.isCurrentCapture(generation)) return;
    console.warn('No se pudo crear una instantánea de la vista previa de máscaras:', error);
    this.finishSnapshotCapture();
    if (!this.snapshotReady) this.reportSnapshotFailure();
  }

  private finishSnapshotCapture(): void {
    this.modeControl.disabled = false;
    this.syncCanvasTransform();
    this.setMode(this.modeControl.value as LayerMaskPreviewMode);
  }

  private reportSnapshotFailure(): void {
    this.hide();
    const status = this.root.querySelector<HTMLElement>('#status');
    if (status) status.textContent = 'No se pudo capturar el antes del lienzo; las opciones de comparación no están disponibles.';
  }

  private isCurrentCapture(generation: number): boolean {
    return this.active && generation === this.captureGeneration;
  }

  private copyCanvasPixels(): boolean {
    const width = Math.max(1, this.sourceCanvas.width);
    const height = Math.max(1, this.sourceCanvas.height);
    this.previewCanvas.width = width;
    this.previewCanvas.height = height;
    const context = this.previewCanvas.getContext('2d');
    if (!context) return false;
    try {
      context.clearRect(0, 0, width, height);
      context.drawImage(this.sourceCanvas, 0, 0, width, height);
      return true;
    } catch (error) {
      console.warn('No se pudo capturar la vista original del lienzo:', error);
      return false;
    }
  }

  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Falta el elemento requerido para la vista previa de máscaras: ${selector}`);
    return element;
  }
}
