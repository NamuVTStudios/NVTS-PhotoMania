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
  const distance = Math.hypot(x - centerX, y - centerY);
  if (distance >= radius + 0.5) return false;
  const sourceAlpha = getStampCoverage(distance, operation) * operation.opacity;
  if (sourceAlpha <= 0) return false;
  const offset = pixel * 4;
  return operation.erase
    ? applyEraserPixel(pixels, offset, sourceAlpha)
    : applyBrushPixel(pixels, offset, sourceAlpha, operation.color);
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
