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
  const textureCoverage = 1 - texture * getDeterministicGrain(x, y) * 0.72;
  const sourceAlpha = getStampCoverage(distance, operation) * operation.opacity * textureCoverage;
  if (sourceAlpha <= 0) return false;
  const offset = pixel * 4;
  return operation.erase
    ? applyEraserPixel(pixels, offset, sourceAlpha)
    : applyBrushPixel(pixels, offset, sourceAlpha, operation.color);
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
