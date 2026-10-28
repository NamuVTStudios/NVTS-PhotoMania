// Canvas compositing and color sampling.
import { AppDrawingFeatures } from './AppDrawingFeatures';
import { blendImageData, renderFilteredImage } from '@nvts/image-processing';
import { type LayerNode } from '@nvts/document-model';
import { isPixelLayerType, type LayerMask } from '@nvts/shared';

export abstract class AppSamplingFeatures extends AppDrawingFeatures {
  protected compositePixelsForSampling(): Uint8Array | null {
      const { width, height } = this.ctl.doc;
      const canvas = this.createSamplingCanvas(width, height);
      if (!canvas.getContext('2d', { willReadFrequently: true })) return null;
      this.composeSamplingLayers(this.ctl.doc.layers, canvas, width, height, (layer) => this.ctl.readPixels(layer));
      return this.readSamplingCanvas(canvas, width, height);
    }

  protected createSamplingCanvas(width: number, height: number): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      return canvas;
    }

  protected readSamplingCanvas(canvas: HTMLCanvasElement, width: number, height: number): Uint8Array {
      const image = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height);
      return new Uint8Array(image.data.buffer.slice(image.data.byteOffset, image.data.byteOffset + image.data.byteLength));
    }

  protected composeSamplingLayers(
      nodes: LayerNode[],
      target: HTMLCanvasElement,
      width: number,
      height: number,
      readLayerPixels: (layer: LayerNode) => Uint8Array | null,
    ): void {
      const targetCtx = target.getContext('2d', { willReadFrequently: true })!;
      const scratch = this.createSamplingCanvas(width, height);
      const scratchCtx = scratch.getContext('2d', { willReadFrequently: true })!;
      targetCtx.clearRect(0, 0, width, height);
      for (const layer of nodes) this.composeSamplingLayer(layer, target, targetCtx, scratch, scratchCtx, width, height, readLayerPixels);
    }

  protected composeSamplingLayer(
      layer: LayerNode,
      target: HTMLCanvasElement,
      targetCtx: CanvasRenderingContext2D,
      scratch: HTMLCanvasElement,
      scratchCtx: CanvasRenderingContext2D,
      width: number,
      height: number,
      readLayerPixels: (layer: LayerNode) => Uint8Array | null,
    ): void {
      if (!layer.visible || layer.opacity <= 0) return;
      if (layer.type === 'filter') {
        this.applySamplingFilter(layer, target, targetCtx, width, height);
        return;
      }
      if (layer.type === 'group') {
        this.compositeSamplingGroup(layer, targetCtx, width, height, readLayerPixels);
        return;
      }
      if (!isPixelLayerType(layer.type)) return;
      const pixels = readLayerPixels(layer);
      if (pixels) this.compositeSamplingRaster(layer, pixels, targetCtx, scratch, scratchCtx, width, height);
    }

  protected applySamplingFilter(
      layer: LayerNode,
      target: HTMLCanvasElement,
      targetCtx: CanvasRenderingContext2D,
      width: number,
      height: number,
    ): void {
      const images = this.createSamplingFilterImages(layer, target, width, height);
      this.blendSamplingFilterIntoTarget(targetCtx, images.original, images.filtered, layer.opacity, width, height);
    }

  protected createSamplingFilterImages(
      layer: LayerNode,
      target: HTMLCanvasElement,
      width: number,
      height: number,
    ): { original: ImageData; filtered: ImageData } {
      const original = this.createSamplingCanvas(width, height);
      original.getContext('2d')!.drawImage(target, 0, 0);
      const filtered = this.createSamplingCanvas(width, height);
      const filteredCtx = filtered.getContext('2d')!;
      const kind = layer.filterKind ?? 'grayscale';
      const strength = layer.filterStrength ?? 1;
      const filteredImage = renderFilteredImage(original, filteredCtx, kind, strength, {
        x: 0, y: 0, width, height, fullWidth: width, fullHeight: height,
      });
      return {
        original: original.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height),
        filtered: filteredImage,
      };
    }

  protected blendSamplingFilterIntoTarget(
      targetCtx: CanvasRenderingContext2D,
      original: ImageData,
      filtered: ImageData,
      opacity: number,
      width: number,
      height: number,
    ): void {
      blendImageData(original, filtered, opacity);
      targetCtx.clearRect(0, 0, width, height);
      targetCtx.putImageData(original, 0, 0);
    }

  protected compositeSamplingGroup(
      layer: LayerNode,
      targetCtx: CanvasRenderingContext2D,
      width: number,
      height: number,
      readLayerPixels: (layer: LayerNode) => Uint8Array | null,
    ): void {
      const group = this.createSamplingCanvas(width, height);
      this.composeSamplingLayers(layer.children, group, width, height, readLayerPixels);
      targetCtx.save();
      targetCtx.globalAlpha = layer.opacity;
      targetCtx.globalCompositeOperation = this.canvasBlend(layer.blendMode);
      targetCtx.drawImage(group, 0, 0);
      targetCtx.restore();
    }

  protected compositeSamplingRaster(
      layer: LayerNode,
      pixels: Uint8Array,
      targetCtx: CanvasRenderingContext2D,
      scratch: HTMLCanvasElement,
      scratchCtx: CanvasRenderingContext2D,
      width: number,
      height: number,
    ): void {
      const transformedPixels = this.applyTransformMasksToFullLayer(layer, pixels, width, height);
      const colorizedPixels = this.applyColorizeMasksToFullLayer(layer, transformedPixels);
      const filteredPixels = this.applyFilterMasksToFullLayer(layer, colorizedPixels, width, height);
      const image = new ImageData(new Uint8ClampedArray(filteredPixels), width, height);
      scratchCtx.clearRect(0, 0, width, height);
      scratchCtx.putImageData(image, 0, 0);
      targetCtx.save();
      targetCtx.globalAlpha = layer.opacity;
      targetCtx.globalCompositeOperation = this.canvasBlend(layer.blendMode);
      targetCtx.drawImage(scratch, 0, 0);
      targetCtx.restore();
    }

  protected applyTransformMasksToFullLayer(layer: LayerNode, pixels: Uint8Array, width: number, height: number): Uint8Array {
      const masks = layer.masks?.filter((mask): mask is Extract<LayerMask, { type: 'transform' }> => mask.enabled && mask.type === 'transform') ?? [];
      if (!masks.length) return pixels;
      const input = this.createPixelCanvas(width, height, pixels);
      const output = this.createSamplingCanvas(width, height);
      const context = output.getContext('2d', { willReadFrequently: true })!;
      const matrix = this.combineTransformMasks(masks);
      context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
      context.drawImage(input, 0, 0);
      return this.readSamplingCanvas(output, width, height);
    }

  protected applyFilterMasksToFullLayer(layer: LayerNode, pixels: Uint8Array, width: number, height: number): Uint8Array {
      const masks = layer.masks?.filter((mask): mask is Extract<LayerMask, { type: 'filter' }> => mask.enabled && mask.type === 'filter') ?? [];
      if (!masks.length) return pixels;
      let current = new Uint8Array(pixels);
      for (const mask of masks) current = new Uint8Array(this.applyFilterStackToPixels(mask, current, width, height));
      return current;
    }

  protected applyColorizeMasksToFullLayer(layer: LayerNode, fallback: Uint8Array): Uint8Array {
      const masks = layer.masks?.filter((mask): mask is Extract<LayerMask, { type: 'colorize' }> => mask.enabled && mask.type === 'colorize') ?? [];
      let current = fallback;
      for (const mask of masks) current = this.getColorizeOutput(layer, mask) ?? current;
      return current;
    }

  protected applyFilterStackToPixels(
      mask: Extract<LayerMask, { type: 'filter' }>,
      pixels: Uint8Array,
      width: number,
      height: number,
    ): Uint8Array {
      let current = new ImageData(new Uint8ClampedArray(pixels), width, height);
      for (const filter of mask.filters) {
        const source = this.createSamplingCanvas(width, height);
        const sourceContext = source.getContext('2d', { willReadFrequently: true })!;
        sourceContext.putImageData(current, 0, 0);
        const output = this.createSamplingCanvas(width, height);
        const outputContext = output.getContext('2d', { willReadFrequently: true })!;
        const result = renderFilteredImage(source, outputContext, filter.kind, filter.strength, {
          x: 0, y: 0, width, height, fullWidth: width, fullHeight: height,
        });
        current = result;
      }
      return new Uint8Array(current.data);
    }

  protected pickColorAt(x: number, y: number): void {
      const layer = this.active();
      if (!layer) return;
      const rgba = this.sampleColorArea(layer, Math.round(x), Math.round(y));
      if (!rgba) { this.q<HTMLElement>('#status').textContent = 'No se pudo tomar el color de esta capa.'; return; }
      this.brush.rgb = [rgba[0], rgba[1], rgba[2]];
      this.renderToolOptions(); this.syncToolbarProps();
      this.q<HTMLElement>('#status').textContent = `Color seleccionado ${this.foregroundHex()}`;
    }

  protected sampleColorArea(layer: LayerNode, centerX: number, centerY: number): Uint8Array | null {
      const size = this.brush.sampleRadius;
      const radius = Math.floor(size / 2);
      const startX = Math.max(0, centerX - radius);
      const startY = Math.max(0, centerY - radius);
      const endX = Math.min(this.ctl.doc.width - 1, centerX + radius);
      const endY = Math.min(this.ctl.doc.height - 1, centerY + radius);
      const totals = [0, 0, 0];
      let samples = 0;
      const width = endX - startX + 1;
      const height = endY - startY + 1;
      const totalPixels = width * height;
      for (let index = 0; index < totalPixels; index++) {
        const x = startX + (index % width);
        const y = startY + Math.floor(index / width);
        const sample = this.readColorSample(layer, x, y);
        samples += this.accumulateSampleColor(totals, sample);
      }
      if (samples === 0) return null;
      return new Uint8Array([Math.round(totals[0] / samples), Math.round(totals[1] / samples), Math.round(totals[2] / samples), 255]);
    }

  protected accumulateSampleColor(totals: number[], sample: Uint8Array | null): number {
      if (!sample || sample[3] === 0) return 0;
      totals[0] += sample[0];
      totals[1] += sample[1];
      totals[2] += sample[2];
      return 1;
    }

  protected readColorSample(layer: LayerNode, x: number, y: number): Uint8Array | null {
      if (this.brush.sampleMerged) return this.compositeSamplePixel(x, y);
      return this.readActiveLayerPixel(layer, x, y);
    }

  protected readActiveLayerPixel(layer: LayerNode, x: number, y: number): Uint8Array | null {
      const pixels = this.ctl.layerPixels(layer);
      if (!pixels) return null;
      const value = new Uint8Array(4);
      pixels.readRectToJS(x, y, 1, 1, value);
      return value;
    }

  protected compositeSamplePixel(x: number, y: number): Uint8Array {
      const target = this.createSamplingCanvas(1, 1);
      this.composeSamplingLayers(this.ctl.doc.layers, target, 1, 1, (layer) => this.readSamplingLayerPixel(layer, x, y));
      return new Uint8Array(target.getContext('2d')!.getImageData(0, 0, 1, 1).data);
    }

  protected readSamplingLayerPixel(layer: LayerNode, x: number, y: number): Uint8Array | null {
      const surface = this.ctl.layerPixels(layer);
      if (!surface) return null;
      const data = new Uint8Array(4);
      surface.readRectToJS(x, y, 1, 1, data);
      return data;
    }
}
