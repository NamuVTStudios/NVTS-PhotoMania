import type { FilterKind } from '@nvts/shared';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Strategy registry for CSS-backed filters; each entry encapsulates one interchangeable rendering algorithm. */
const CSS_FILTER_RENDERERS = {
  grayscale: (amount) => `grayscale(${amount * 100}%)`,
  invert: (amount) => `invert(${amount * 100}%)`,
  sepia: (amount) => `sepia(${amount * 100}%)`,
  blur: (amount) => `blur(${amount * 12}px)`,
  brightness: (amount) => `brightness(${100 + amount * 100}%)`,
  contrast: (amount) => `contrast(${100 + amount * 150}%)`,
  saturation: (amount) => `saturate(${100 + amount * 200}%)`,
  'hue-rotate': (amount: number) => `hue-rotate(${amount * 180}deg)`,
} satisfies Partial<Record<FilterKind, (amount: number) => string>>;
type CustomFilterKind = Exclude<FilterKind, keyof typeof CSS_FILTER_RENDERERS>;

/** CSS-only effects are rendered by Canvas2D; custom effects use pixel processing below. */
export function getCssFilter(kind: FilterKind, strength: number): string {
  const amount = clamp(strength, 0, 1);
  const renderer = CSS_FILTER_RENDERERS[kind as keyof typeof CSS_FILTER_RENDERERS];
  return renderer?.(amount) ?? 'none';
}

export function isCustomFilter(kind: FilterKind): kind is CustomFilterKind {
  return kind in FILTER_STRATEGIES;
}

export function blendImageData(original: ImageData, filtered: ImageData, opacity: number): ImageData {
  for (let index = 0; index < original.data.length; index++) {
    original.data[index] = Math.round(original.data[index] * (1 - opacity) + filtered.data[index] * opacity);
  }
  return original;
}

export type FilterRenderRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
  fullWidth: number;
  fullHeight: number;
};

export function renderFilteredImage(
  source: CanvasImageSource,
  outputContext: CanvasRenderingContext2D,
  kind: FilterKind,
  strength: number,
  region: FilterRenderRegion,
): ImageData {
  outputContext.filter = getCssFilter(kind, strength);
  outputContext.drawImage(source, 0, 0);
  outputContext.filter = 'none';
  const image = outputContext.getImageData(0, 0, region.width, region.height);
  return applyCustomFilter(image, kind, strength, region.x, region.y, region.fullWidth, region.fullHeight);
}

/**
 * Applies pixel-based effects consistently to destructive filters, filter layers and sampling.
 * Origin coordinates keep pixelation, grain and vignette aligned when the renderer works in tiles.
 */
export function applyCustomFilter(
  image: ImageData,
  kind: FilterKind,
  strength: number,
  originX = 0,
  originY = 0,
  fullWidth = image.width,
  fullHeight = image.height,
): ImageData {
  if (!isCustomFilter(kind)) return image;
  const amount = clamp(strength, 0, 1);
  FILTER_STRATEGIES[kind](image, amount, { originX, originY, fullWidth, fullHeight });
  return image;
}

type FilterRegion = { originX: number; originY: number; fullWidth: number; fullHeight: number };
type FilterStrategy = (image: ImageData, amount: number, region: FilterRegion) => void;

function applyPosterize(image: ImageData, amount: number): void {
  const levels = Math.max(2, Math.round(32 - amount * 30));
  const divisor = levels - 1;
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = quantize(image.data[index], divisor);
    image.data[index + 1] = quantize(image.data[index + 1], divisor);
    image.data[index + 2] = quantize(image.data[index + 2], divisor);
  }
}

function quantize(channel: number, divisor: number): number {
  return Math.round(Math.round((channel / 255) * divisor) / divisor * 255);
}

function applyThreshold(image: ImageData, amount: number): void {
  const threshold = 220 - amount * 110;
  for (let index = 0; index < image.data.length; index += 4) applyThresholdPixel(image.data, index, threshold);
}

function applyThresholdPixel(data: Uint8ClampedArray, index: number, threshold: number): void {
  const luminance = getLuminance(data[index], data[index + 1], data[index + 2]);
  const value = luminance >= threshold ? 255 : 0;
  data[index] = value;
  data[index + 1] = value;
  data[index + 2] = value;
}

function applyPixelate(
  image: ImageData, amount: number, originX: number, originY: number, fullWidth: number, fullHeight: number,
): void {
  const blockSize = Math.pow(2, Math.round(1 + amount * 4));
  const source = new Uint8ClampedArray(image.data);
  for (let y = 0; y < image.height; y++) pixelateRow(image, source, y, blockSize, originX, originY, fullWidth, fullHeight);
}

function pixelateRow(
  image: ImageData, source: Uint8ClampedArray, y: number, blockSize: number,
  originX: number, originY: number, fullWidth: number, fullHeight: number,
): void {
  for (let x = 0; x < image.width; x++) pixelatePixel(image, source, x, y, blockSize, originX, originY, fullWidth, fullHeight);
}

function pixelatePixel(
  image: ImageData, source: Uint8ClampedArray, x: number, y: number, blockSize: number,
  originX: number, originY: number, fullWidth: number, fullHeight: number,
): void {
  const globalX = originX + x;
  const globalY = originY + y;
  const centerX = Math.min(fullWidth - 1, Math.floor(globalX / blockSize) * blockSize + Math.floor(blockSize / 2));
  const centerY = Math.min(fullHeight - 1, Math.floor(globalY / blockSize) * blockSize + Math.floor(blockSize / 2));
  const sampleX = clamp(centerX - originX, 0, image.width - 1);
  const sampleY = clamp(centerY - originY, 0, image.height - 1);
  const targetIndex = (y * image.width + x) * 4;
  const sampleIndex = (sampleY * image.width + sampleX) * 4;
  copyRgbaPixel(image.data, source, targetIndex, sampleIndex);
}

function copyRgbaPixel(target: Uint8ClampedArray, source: Uint8ClampedArray, targetIndex: number, sourceIndex: number): void {
  target[targetIndex] = source[sourceIndex];
  target[targetIndex + 1] = source[sourceIndex + 1];
  target[targetIndex + 2] = source[sourceIndex + 2];
  target[targetIndex + 3] = source[sourceIndex + 3];
}

function applySolarize(image: ImageData, amount: number): void {
  const threshold = 255 - amount * 180;
  for (let index = 0; index < image.data.length; index += 4) applySolarizePixel(image.data, index, threshold);
}

function applySolarizePixel(data: Uint8ClampedArray, index: number, threshold: number): void {
  applySolarizeChannel(data, index, 0, threshold);
  applySolarizeChannel(data, index, 1, threshold);
  applySolarizeChannel(data, index, 2, threshold);
}

function applySolarizeChannel(data: Uint8ClampedArray, index: number, channel: number, threshold: number): void {
  const value = data[index + channel];
  if (value < threshold) return;
  data[index + channel] = 255 - value;
}

function applyNoise(image: ImageData, amount: number, originX: number, originY: number): void {
  const amplitude = amount * 52;
  for (let index = 0; index < image.data.length; index += 4) applyNoisePixel(image.data, index, image.width, originX, originY, amplitude);
}

function applyNoisePixel(data: Uint8ClampedArray, index: number, width: number, originX: number, originY: number, amplitude: number): void {
  const pixel = index / 4;
  const x = originX + pixel % width;
  const y = originY + Math.floor(pixel / width);
  const random = deterministicNoise(x, y) * amplitude;
  data[index] = clamp(data[index] + random, 0, 255);
  data[index + 1] = clamp(data[index + 1] + random, 0, 255);
  data[index + 2] = clamp(data[index + 2] + random, 0, 255);
}

function deterministicNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function applyVignette(
  image: ImageData, amount: number, originX: number, originY: number, fullWidth: number, fullHeight: number,
): void {
  const context = createVignetteContext(amount, originX, originY, fullWidth, fullHeight);
  for (let y = 0; y < image.height; y++) applyVignetteRow(image, y, context);
}

type VignetteContext = { amount: number; originX: number; originY: number; centerX: number; centerY: number; halfWidth: number; halfHeight: number };

function createVignetteContext(amount: number, originX: number, originY: number, fullWidth: number, fullHeight: number): VignetteContext {
  return { amount, originX, originY, centerX: (fullWidth - 1) / 2, centerY: (fullHeight - 1) / 2,
    halfWidth: Math.max(1, fullWidth / 2), halfHeight: Math.max(1, fullHeight / 2) };
}

function applyVignetteRow(image: ImageData, y: number, context: VignetteContext): void {
  for (let x = 0; x < image.width; x++) applyVignettePixel(image, x, y, context);
}

function applyVignettePixel(image: ImageData, x: number, y: number, context: VignetteContext): void {
  const nx = (context.originX + x - context.centerX) / context.halfWidth;
  const ny = (context.originY + y - context.centerY) / context.halfHeight;
  const distance = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
  const falloff = clamp((distance - 0.28) / 0.72, 0, 1);
  const factor = 1 - falloff * context.amount * 0.78;
  const index = (y * image.width + x) * 4;
  image.data[index] = Math.round(image.data[index] * factor);
  image.data[index + 1] = Math.round(image.data[index + 1] * factor);
  image.data[index + 2] = Math.round(image.data[index + 2] * factor);
}

function applyDuotone(image: ImageData, amount: number): void {
  const shadow = [36, 25, 74];
  const highlight = [255, 206, 163];
  for (let index = 0; index < image.data.length; index += 4) applyDuotonePixel(image.data, index, amount, shadow, highlight);
}

function applyDuotonePixel(data: Uint8ClampedArray, index: number, amount: number, shadow: number[], highlight: number[]): void {
  const luminance = getLuminance(data[index], data[index + 1], data[index + 2]) / 255;
  applyDuotoneChannel(data, index, 0, amount, luminance, shadow, highlight);
  applyDuotoneChannel(data, index, 1, amount, luminance, shadow, highlight);
  applyDuotoneChannel(data, index, 2, amount, luminance, shadow, highlight);
}

function applyDuotoneChannel(data: Uint8ClampedArray, index: number, channel: number, amount: number, luminance: number, shadow: number[], highlight: number[]): void {
  const toned = shadow[channel] + (highlight[channel] - shadow[channel]) * luminance;
  data[index + channel] = Math.round(data[index + channel] * (1 - amount) + toned * amount);
}


function applySharpen(image: ImageData, amount: number): void {
  const { data, width, height } = image;
  if (width < 3 || height < 3) return;
  const source = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) sharpenRow(source, data, width, y, amount);
}

function sharpenRow(source: Uint8ClampedArray, target: Uint8ClampedArray, width: number, y: number, amount: number): void {
  for (let x = 1; x < width - 1; x++) sharpenPixel(source, target, width, x, y, amount);
}

function sharpenPixel(source: Uint8ClampedArray, target: Uint8ClampedArray, width: number, x: number, y: number, amount: number): void {
  const index = (y * width + x) * 4;
  sharpenChannel(source, target, width, index, 0, amount);
  sharpenChannel(source, target, width, index, 1, amount);
  sharpenChannel(source, target, width, index, 2, amount);
}

function sharpenChannel(source: Uint8ClampedArray, target: Uint8ClampedArray, width: number, index: number, channel: number, amount: number): void {
  const center = source[index + channel];
  const neighborSum = source[index - 4 + channel] + source[index + 4 + channel]
    + source[index - width * 4 + channel] + source[index + width * 4 + channel];
  target[index + channel] = clamp(center + amount * (4 * center - neighborSum), 0, 255);
}

function applyEdgeDetect(image: ImageData, amount: number): void {
  const luminance = createLuminanceBuffer(image);
  const threshold = 140 - amount * 105;
  for (let y = 0; y < image.height; y++) applyEdgeDetectRow(image, luminance, y, threshold, amount);
}

function createLuminanceBuffer(image: ImageData): Uint8ClampedArray {
  const luminance = new Uint8ClampedArray(image.width * image.height);
  for (let pixel = 0; pixel < luminance.length; pixel++) setPixelLuminance(image.data, luminance, pixel);
  return luminance;
}

function setPixelLuminance(data: Uint8ClampedArray, luminance: Uint8ClampedArray, pixel: number): void {
  const index = pixel * 4;
  luminance[pixel] = getLuminance(data[index], data[index + 1], data[index + 2]);
}

function applyEdgeDetectRow(image: ImageData, luminance: Uint8ClampedArray, y: number, threshold: number, amount: number): void {
  const width = image.width;
  const topRow = Math.max(0, y - 1) * width;
  const middleRow = y * width;
  const bottomRow = Math.min(image.height - 1, y + 1) * width;
  for (let x = 0; x < width; x++) applyEdgeDetectPixel(image.data, luminance, width, x, topRow, middleRow, bottomRow, threshold, amount);
}

function applyEdgeDetectPixel(
  data: Uint8ClampedArray, luminance: Uint8ClampedArray, width: number, x: number,
  topRow: number, middleRow: number, bottomRow: number, threshold: number, amount: number,
): void {
  const left = Math.max(0, x - 1);
  const right = Math.min(width - 1, x + 1);
  const topLeft = luminance[topRow + left];
  const top = luminance[topRow + x];
  const topRight = luminance[topRow + right];
  const middleLeft = luminance[middleRow + left];
  const middleRight = luminance[middleRow + right];
  const bottomLeft = luminance[bottomRow + left];
  const bottom = luminance[bottomRow + x];
  const bottomRight = luminance[bottomRow + right];
  const horizontal = -topLeft - 2 * middleLeft - bottomLeft + topRight + 2 * middleRight + bottomRight;
  const vertical = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight;
  const edge = clamp((Math.sqrt(horizontal * horizontal + vertical * vertical) - threshold) * (1.2 + amount * 1.8), 0, 255);
  const index = middleRow * 4 + x * 4;
  data[index] = edge;
  data[index + 1] = edge;
  data[index + 2] = edge;
}

function getLuminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

/** Strategy registry for pixel-backed filters, shared by destructive and non-destructive rendering. */
const FILTER_STRATEGIES: Record<CustomFilterKind, FilterStrategy> = {
  posterize: applyPosterize,
  threshold: applyThreshold,
  pixelate: (image, amount, region) => applyPixelate(
    image, amount, region.originX, region.originY, region.fullWidth, region.fullHeight,
  ),
  solarize: applySolarize,
  noise: (image, amount, region) => applyNoise(image, amount, region.originX, region.originY),
  vignette: (image, amount, region) => applyVignette(
    image, amount, region.originX, region.originY, region.fullWidth, region.fullHeight,
  ),
  duotone: applyDuotone,
  sharpen: applySharpen,
  'edge-detect': applyEdgeDetect,
};
