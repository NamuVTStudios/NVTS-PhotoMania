import { getBrushTextureSample, type BrushTexturePattern } from './BrushTexture';
type StampRegion = { left: number; top: number; width: number; height: number };

export type StampOperation = {
  region: StampRegion;
  centerX: number;
  centerY: number;
  radius: number;
  hardEdge: number;
  fadeWidth: number;
  erase: boolean;
  color: readonly [number, number, number];
  opacity: number;
  tipShape?: 'round' | 'square' | 'diamond' | 'star' | 'flower' | 'leaf' | 'lace';
  texture?: number;
  material?: 'generic' | 'oil' | 'watercolor' | 'acrylic' | 'graphite' | 'charcoal' | 'ink' | 'airbrush' | 'pastel' | 'chalk' | 'marker' | 'colored-pencil' | 'sanguine';
  materialAngle?: number;
  texturePattern?: BrushTexturePattern;
  textureSeed?: number;
};

export function applyBrushStamp(pixels: Uint8Array, operation: StampOperation): boolean {
  let changed = false;
  const pixelCount = operation.region.width * operation.region.height;
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    changed = applyStampPixel(pixels, pixel, operation) || changed;
  }
  return changed;
}

function applyStampPixel(pixels: Uint8Array, pixel: number, operation: StampOperation): boolean {
  const { region, centerX, centerY, radius } = operation;
  const x = region.left + pixel % region.width + 0.5;
  const y = region.top + Math.floor(pixel / region.width) + 0.5;
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = getTipDistance(dx, dy, radius, operation.tipShape ?? 'round');
  if (distance >= radius + 0.5) return false;
  const texture = Math.max(0, Math.min(1, operation.texture ?? 0));
  const textureSample = getBrushTextureSample(x, y, operation.texturePattern, operation.materialAngle ?? 0.35, operation.textureSeed ?? 0);
  const textureCoverage = 1 - texture * (1 - textureSample.coverage);
  const materialCoverage = getMaterialCoverage(x, y, distance, operation);
  const sourceAlpha = Math.max(0, Math.min(1, getStampCoverage(distance, operation) * operation.opacity * textureCoverage * materialCoverage));
  if (sourceAlpha <= 0) return false;
  const offset = pixel * 4;
  return operation.erase
    ? applyEraserPixel(pixels, offset, sourceAlpha)
    : applyBrushPixel(pixels, offset, sourceAlpha, getMaterialColor(x, y, distance, operation, textureSample.brightness));
}


function getMaterialColor(
  x: number,
  y: number,
  distance: number,
  operation: StampOperation,
  textureBrightness = 1,
): readonly [number, number, number] {
  const material = operation.material ?? 'generic';
  if (material === 'generic' || material === 'ink' || material === 'marker') return operation.color;
  const grain = getDeterministicGrain(Math.floor(x * 2.3 + 31), Math.floor(y * 2.3 - 13));
  const across = -x * Math.sin(operation.materialAngle ?? 0.35) + y * Math.cos(operation.materialAngle ?? 0.35);
  const ridges = Math.sin(across * 0.8 + Math.sin(x * 0.07) * 1.4);
  let brightness = 1;

  if (material === 'oil') brightness = 0.86 + grain * 0.12 + Math.max(0, ridges) * 0.12;
  if (material === 'watercolor') {
    const edge = Math.max(0, Math.min(1, (distance / Math.max(1, operation.radius) - 0.58) / 0.42));
    brightness = 0.82 + grain * 0.16 - edge * (0.08 + grain * 0.08);
  }
  if (material === 'acrylic') brightness = 0.9 + grain * 0.12 + Math.max(0, ridges) * 0.05;
  if (material === 'graphite') brightness = 0.84 + grain * 0.16;
  if (material === 'charcoal' || material === 'pastel' || material === 'chalk') brightness = 0.78 + grain * 0.2;
  if (material === 'colored-pencil' || material === 'sanguine') brightness = 0.82 + grain * 0.16 + Math.max(0, ridges) * 0.04;
  if (material === 'airbrush') brightness = 0.96 + grain * 0.04;

  return operation.color.map((channel) => Math.max(0, Math.min(255, Math.round(channel * brightness * textureBrightness)))) as unknown as readonly [number, number, number];
}

function getMaterialCoverage(x: number, y: number, distance: number, operation: StampOperation): number {
  const material = operation.material ?? 'generic';
  const texture = Math.max(0, Math.min(1, operation.texture ?? 0));
  if (material === 'generic' || material === 'ink') return 1;
  const angle = operation.materialAngle ?? 0.35;
  const along = x * Math.cos(angle) + y * Math.sin(angle);
  const across = -x * Math.sin(angle) + y * Math.cos(angle);
  const grain = getDeterministicGrain(Math.floor(x * 1.7), Math.floor(y * 1.7));
  const fineGrain = getDeterministicGrain(Math.floor(x * 4.3 + 17), Math.floor(y * 4.3 - 9));
  const bristle = 0.58 + 0.42 * Math.abs(Math.sin(across * 0.72 + Math.sin(along * 0.13) * 1.6));
  const edge = Math.max(0, Math.min(1, (operation.radius - distance) / Math.max(1, operation.radius * 0.28)));

  switch (material) {
    case 'oil':
      return clamp(0.34 + bristle * 0.42 + grain * 0.24 + (distance > operation.radius * 0.72 ? edge * 0.12 : 0), 0.12, 1.18);
    case 'watercolor': {
      const pooling = distance > operation.radius * 0.72 ? 0.64 + grain * 0.5 : 0.82 + fineGrain * 0.25;
      const granulation = 0.55 + grain * 0.5;
      return clamp(pooling * granulation * (1 - texture * 0.18), 0.12, 1.2);
    }
    case 'acrylic':
      return clamp(0.55 + bristle * 0.32 + grain * 0.25, 0.25, 1.12);
    case 'graphite':
      return clamp(0.42 + fineGrain * 0.5 + bristle * 0.12, 0.16, 1);
    case 'charcoal':
      return grain < 0.18 + texture * 0.28 ? 0.08 : clamp(0.55 + grain * 0.55, 0.2, 1);
    case 'pastel':
    case 'chalk':
      return grain < 0.1 + texture * 0.2 ? 0.04 : clamp(0.38 + fineGrain * 0.62, 0.12, 1);
    case 'marker':
      return clamp(0.68 + fineGrain * 0.24 + bristle * 0.08, 0.35, 1);
    case 'colored-pencil':
      return clamp(0.34 + fineGrain * 0.42 + bristle * 0.22, 0.12, 0.98);
    case 'sanguine':
      return clamp(0.38 + grain * 0.42 + bristle * 0.2, 0.16, 1);
    case 'airbrush':
      return clamp(0.72 + fineGrain * 0.28, 0.5, 1);
    default:
      return 1;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function getTipDistance(dx: number, dy: number, radius: number, shape: NonNullable<StampOperation['tipShape']>): number {
  if (shape === 'square') return Math.max(Math.abs(dx), Math.abs(dy));
  if (shape === 'diamond') return (Math.abs(dx) + Math.abs(dy)) * 0.70710678118;
  const angle = Math.atan2(dy, dx);
  if (shape === 'star') {
    const boundary = 0.64 + 0.36 * Math.max(0, Math.cos(angle * 5));
    return Math.hypot(dx, dy) / boundary;
  }
  if (shape === 'flower') {
    const boundary = 0.76 + 0.24 * Math.cos(angle * 6);
    return Math.hypot(dx, dy) / boundary;
  }
  if (shape === 'leaf') {
    const boundary = 0.58 + 0.42 * Math.abs(Math.cos(angle));
    return Math.hypot(dx, dy) / boundary;
  }
  if (shape === 'lace') {
    const boundary = 0.84 + 0.16 * Math.cos(angle * 16);
    return Math.hypot(dx, dy) / boundary;
  }
  return Math.hypot(dx, dy);
}

function getDeterministicGrain(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function getStampCoverage(distance: number, operation: StampOperation): number {
  if (distance <= operation.hardEdge) return 1;
  const progress = Math.max(0, Math.min(1, (operation.radius + 0.5 - distance) / operation.fadeWidth));
  return progress * progress * (3 - 2 * progress);
}

function applyEraserPixel(pixels: Uint8Array, offset: number, sourceAlpha: number): boolean {
  const oldAlpha = pixels[offset + 3] / 255;
  const nextAlpha = oldAlpha * (1 - sourceAlpha);
  const changed = nextAlpha !== oldAlpha;
  pixels[offset + 3] = Math.round(nextAlpha * 255);
  if (nextAlpha <= 0.0001) clearPixel(pixels, offset);
  return changed;
}

function clearPixel(pixels: Uint8Array, offset: number): void {
  pixels[offset] = 0;
  pixels[offset + 1] = 0;
  pixels[offset + 2] = 0;
  pixels[offset + 3] = 0;
}

function applyBrushPixel(
  pixels: Uint8Array,
  offset: number,
  sourceAlpha: number,
  color: readonly [number, number, number],
): boolean {
  const oldAlpha = pixels[offset + 3] / 255;
  const nextAlpha = sourceAlpha + oldAlpha * (1 - sourceAlpha);
  if (nextAlpha <= 0) return false;
  const oldWeight = oldAlpha * (1 - sourceAlpha);
  pixels[offset] = Math.round((color[0] * sourceAlpha + pixels[offset] * oldWeight) / nextAlpha);
  pixels[offset + 1] = Math.round((color[1] * sourceAlpha + pixels[offset + 1] * oldWeight) / nextAlpha);
  pixels[offset + 2] = Math.round((color[2] * sourceAlpha + pixels[offset + 2] * oldWeight) / nextAlpha);
  pixels[offset + 3] = Math.round(nextAlpha * 255);
  return true;
}
