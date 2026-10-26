import type { FilterKind } from '@nvts/shared';

const CUSTOM_FILTERS = new Set<FilterKind>([
  'posterize', 'threshold', 'pixelate', 'solarize', 'noise', 'vignette', 'duotone', 'sharpen', 'edge-detect',
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** CSS-only effects are rendered by Canvas2D; custom effects use pixel processing below. */
export function getCssFilter(kind: FilterKind, strength: number): string {
  const amount = clamp(strength, 0, 1);
  switch (kind) {
    case 'grayscale': return `grayscale(${amount * 100}%)`;
    case 'invert': return `invert(${amount * 100}%)`;
    case 'sepia': return `sepia(${amount * 100}%)`;
    case 'blur': return `blur(${amount * 12}px)`;
    case 'brightness': return `brightness(${100 + amount * 100}%)`;
    case 'contrast': return `contrast(${100 + amount * 150}%)`;
    case 'saturation': return `saturate(${100 + amount * 200}%)`;
    case 'hue-rotate': return `hue-rotate(${amount * 180}deg)`;
    default: return 'none';
  }
}

export function isCustomFilter(kind: FilterKind): boolean {
  return CUSTOM_FILTERS.has(kind);
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
  switch (kind) {
    case 'posterize': applyPosterize(image, amount); break;
    case 'threshold': applyThreshold(image, amount); break;
    case 'pixelate': applyPixelate(image, amount, originX, originY, fullWidth, fullHeight); break;
    case 'solarize': applySolarize(image, amount); break;
    case 'noise': applyNoise(image, amount, originX, originY); break;
    case 'vignette': applyVignette(image, amount, originX, originY, fullWidth, fullHeight); break;
    case 'duotone': applyDuotone(image, amount); break;
    case 'sharpen': applySharpen(image, amount); break;
    case 'edge-detect': applyEdgeDetect(image, amount); break;
  }
  return image;
}

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
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = getLuminance(image.data[index], image.data[index + 1], image.data[index + 2]);
    const value = luminance >= threshold ? 255 : 0;
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
  }
}

function applyPixelate(
  image: ImageData,
  amount: number,
  originX: number,
  originY: number,
  fullWidth: number,
  fullHeight: number,
): void {
  const blockSize = Math.pow(2, Math.round(1 + amount * 4));
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const globalX = originX + x;
      const globalY = originY + y;
      const centerX = Math.min(fullWidth - 1, Math.floor(globalX / blockSize) * blockSize + Math.floor(blockSize / 2));
      const centerY = Math.min(fullHeight - 1, Math.floor(globalY / blockSize) * blockSize + Math.floor(blockSize / 2));
      const sampleX = clamp(centerX - originX, 0, width - 1);
      const sampleY = clamp(centerY - originY, 0, height - 1);
      const targetIndex = (y * width + x) * 4;
      const sampleIndex = (sampleY * width + sampleX) * 4;
      data[targetIndex] = source[sampleIndex];
      data[targetIndex + 1] = source[sampleIndex + 1];
      data[targetIndex + 2] = source[sampleIndex + 2];
      data[targetIndex + 3] = source[sampleIndex + 3];
    }
  }
}

function applySolarize(image: ImageData, amount: number): void {
  const threshold = 255 - amount * 180;
  for (let index = 0; index < image.data.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) {
      const value = image.data[index + channel];
      if (value >= threshold) image.data[index + channel] = 255 - value;
    }
  }
}

function applyNoise(image: ImageData, amount: number, originX: number, originY: number): void {
  const amplitude = amount * 52;
  const { data, width } = image;
  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4;
    const x = originX + pixel % width;
    const y = originY + Math.floor(pixel / width);
    const random = deterministicNoise(x, y) * amplitude;
    data[index] = clamp(data[index] + random, 0, 255);
    data[index + 1] = clamp(data[index + 1] + random, 0, 255);
    data[index + 2] = clamp(data[index + 2] + random, 0, 255);
  }
}

function deterministicNoise(x: number, y: number): number {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

function applyVignette(
  image: ImageData,
  amount: number,
  originX: number,
  originY: number,
  fullWidth: number,
  fullHeight: number,
): void {
  const centerX = (fullWidth - 1) / 2;
  const centerY = (fullHeight - 1) / 2;
  const halfWidth = Math.max(1, fullWidth / 2);
  const halfHeight = Math.max(1, fullHeight / 2);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const nx = (originX + x - centerX) / halfWidth;
      const ny = (originY + y - centerY) / halfHeight;
      const distance = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
      const falloff = clamp((distance - 0.28) / 0.72, 0, 1);
      const factor = 1 - falloff * amount * 0.78;
      const index = (y * image.width + x) * 4;
      image.data[index] = Math.round(image.data[index] * factor);
      image.data[index + 1] = Math.round(image.data[index + 1] * factor);
      image.data[index + 2] = Math.round(image.data[index + 2] * factor);
    }
  }
}

function applyDuotone(image: ImageData, amount: number): void {
  const shadow = [36, 25, 74];
  const highlight = [255, 206, 163];
  for (let index = 0; index < image.data.length; index += 4) {
    const luminance = getLuminance(image.data[index], image.data[index + 1], image.data[index + 2]) / 255;
    for (let channel = 0; channel < 3; channel++) {
      const toned = shadow[channel] + (highlight[channel] - shadow[channel]) * luminance;
      image.data[index + channel] = Math.round(image.data[index + channel] * (1 - amount) + toned * amount);
    }
  }
}


function applySharpen(image: ImageData, amount: number): void {
  const { data, width, height } = image;
  if (width < 3 || height < 3) return;
  const source = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const center = source[index + channel];
        const neighborSum = source[index - 4 + channel] + source[index + 4 + channel]
          + source[index - width * 4 + channel] + source[index + width * 4 + channel];
        data[index + channel] = clamp(center + amount * (4 * center - neighborSum), 0, 255);
      }
    }
  }
}

function applyEdgeDetect(image: ImageData, amount: number): void {
  const { data, width, height } = image;
  const luminance = new Uint8ClampedArray(width * height);
  const threshold = 140 - amount * 105;
  for (let pixel = 0; pixel < luminance.length; pixel++) {
    const index = pixel * 4;
    luminance[pixel] = getLuminance(data[index], data[index + 1], data[index + 2]);
  }
  for (let y = 0; y < height; y++) {
    const topRow = Math.max(0, y - 1) * width;
    const middleRow = y * width;
    const bottomRow = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x++) {
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
      const magnitude = Math.sqrt(horizontal * horizontal + vertical * vertical);
      const edge = clamp((magnitude - threshold) * (1.2 + amount * 1.8), 0, 255);
      const index = middleRow * 4 + x * 4;
      data[index] = edge;
      data[index + 1] = edge;
      data[index + 2] = edge;
    }
  }
}

function getLuminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}
