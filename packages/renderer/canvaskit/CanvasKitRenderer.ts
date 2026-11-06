import { loadCanvasKit } from '@nvts/shared-core/libraries/canvaskit';
import type { RendererBackend, RendererSnapshot } from '../RendererBackend';

type CanvasKitApi = Record<string, any>;
type CanvasKitSurface = {
  getCanvas(): any;
  flush(): void;
  makeImageSnapshot(): { readPixels(x: number, y: number, info: object): Uint8Array | null; delete(): void };
  delete(): void;
};

/** CanvasKit-backed software fallback. WebGPU remains the preferred accelerated backend. */
export class CanvasKitRenderer implements RendererBackend {
  readonly kind = 'canvaskit' as const;
  private surface: CanvasKitSurface | null = null;
  private stagingCanvas: HTMLCanvasElement | null = null;
  private stagingContext: CanvasRenderingContext2D | null = null;
  private width = 0;
  private height = 0;
  private opacity = 1;
  private readonly imageInfo: Record<string, unknown>;
  private readonly canvas: HTMLCanvasElement;
  private readonly kit: CanvasKitApi;

  private constructor(canvas: HTMLCanvasElement, kit: CanvasKitApi) {
    this.canvas = canvas;
    this.kit = kit;
    this.imageInfo = {
      colorType: kit.ColorType.RGBA_8888,
      alphaType: kit.AlphaType.Unpremul,
      colorSpace: kit.ColorSpace.SRGB,
    };
  }

  static async create(canvas: HTMLCanvasElement): Promise<CanvasKitRenderer> {
    const kit = await loadCanvasKit() as CanvasKitApi;
    if (typeof kit.MakeSurface !== 'function' || typeof kit.MakeImage !== 'function') {
      throw new Error('Shared Core CanvasKit runtime is missing raster surface APIs.');
    }
    return new CanvasKitRenderer(canvas, kit);
  }

  ensureSize(width: number, height: number): void {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new RangeError('CanvasKit renderer dimensions must be positive integers.');
    }
    if (this.surface && width === this.width && height === this.height) return;
    this.surface?.delete();
    const surface = this.kit.MakeSurface(width, height) as CanvasKitSurface | null;
    if (!surface) throw new Error(`CanvasKit could not allocate a ${width}×${height} surface.`);
    this.surface = surface;
    this.width = width;
    this.height = height;
    this.stagingCanvas = null;
    this.stagingContext = null;
  }

  writeRegion(x: number, y: number, width: number, height: number, pixels: Uint8Array, bytesPerRow: number): void {
    if (!this.surface) throw new Error('CanvasKit surface has not been initialized.');
    if (width < 1 || height < 1 || x < 0 || y < 0 || x + width > this.width || y + height > this.height) return;
    if (bytesPerRow < width * 4 || pixels.byteLength < bytesPerRow * height) {
      throw new RangeError('CanvasKit pixel region does not match its row stride.');
    }

    const imageInfo = { ...this.imageInfo, width, height };
    const image = this.kit.MakeImage(imageInfo, pixels, bytesPerRow);
    if (!image) throw new Error('CanvasKit could not create an image from the supplied pixel region.');
    try {
      this.surface.getCanvas().drawImage(image, x, y);
    } finally {
      image.delete();
    }
  }

  setOpacity(value: number): void {
    this.opacity = Math.min(1, Math.max(0, value));
  }

  capturePixels(): Promise<RendererSnapshot> {
    if (!this.surface) throw new Error('CanvasKit surface has not been initialized.');
    const snapshot = this.surface.makeImageSnapshot();
    try {
      const pixels = snapshot.readPixels(0, 0, { ...this.imageInfo, width: this.width, height: this.height });
      if (!pixels) throw new Error('CanvasKit could not read back the document surface.');
      return Promise.resolve({ width: this.width, height: this.height, pixels: new Uint8Array(pixels) });
    } finally {
      snapshot.delete();
    }
  }

  render(): void {
    if (!this.surface) return;
    const pixels = this.readSurfacePixels();
    const staging = this.getStagingContext();
    const imageData = staging.createImageData(this.width, this.height);
    imageData.data.set(pixels);
    staging.putImageData(imageData, 0, 0);

    const dpr = window.devicePixelRatio || 1;
    const renderScale = Math.min(4, Math.max(1, Number(this.canvas.dataset.renderScale) || 1));
    const targetWidth = Math.max(1, Math.floor(this.canvas.clientWidth * dpr * renderScale));
    const targetHeight = Math.max(1, Math.floor(this.canvas.clientHeight * dpr * renderScale));
    if (this.canvas.width !== targetWidth) this.canvas.width = targetWidth;
    if (this.canvas.height !== targetHeight) this.canvas.height = targetHeight;

    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('CanvasKit fallback could not acquire the display 2D context.');
    const scale = Math.min(targetWidth / this.width, targetHeight / this.height);
    const drawWidth = this.width * scale;
    const drawHeight = this.height * scale;
    const x = (targetWidth - drawWidth) / 2;
    const y = (targetHeight - drawHeight) / 2;
    context.clearRect(0, 0, targetWidth, targetHeight);
    context.globalAlpha = this.opacity;
    context.imageSmoothingEnabled = false;
    context.drawImage(this.stagingCanvas!, x, y, drawWidth, drawHeight);
    context.globalAlpha = 1;
  }

  destroy(): void {
    this.surface?.delete();
    this.surface = null;
    this.stagingCanvas = null;
    this.stagingContext = null;
    this.width = 0;
    this.height = 0;
  }

  private readSurfacePixels(): Uint8Array {
    if (!this.surface) throw new Error('CanvasKit surface has not been initialized.');
    this.surface.flush();
    const snapshot = this.surface.makeImageSnapshot();
    try {
      const pixels = snapshot.readPixels(0, 0, { ...this.imageInfo, width: this.width, height: this.height });
      if (!pixels) throw new Error('CanvasKit could not read the rendered surface.');
      return new Uint8Array(pixels);
    } finally {
      snapshot.delete();
    }
  }

  private getStagingContext(): CanvasRenderingContext2D {
    if (this.stagingContext) return this.stagingContext;
    const staging = document.createElement('canvas');
    staging.width = this.width;
    staging.height = this.height;
    const context = staging.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('CanvasKit fallback could not create its staging context.');
    this.stagingCanvas = staging;
    this.stagingContext = context;
    return context;
  }
}
