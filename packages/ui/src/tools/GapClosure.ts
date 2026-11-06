export type RgbaSeed = readonly [number, number, number, number];

export function createGapClosedMatchMask(
  reference: Uint8Array,
  width: number,
  height: number,
  seed: RgbaSeed,
  tolerance: number,
  radius: 1 | 2,
): Uint8Array {
  const total = width * height;
  const matches = createColorMatchMask(reference, total, seed, tolerance);
  const boundary = invertMask(matches);
  const expanded = dilateMask(boundary, width, height, radius);
  const closedBoundary = erodeMask(expanded, width, height, radius);
  return invertMask(closedBoundary);
}

function createColorMatchMask(reference: Uint8Array, total: number, seed: RgbaSeed, tolerance: number): Uint8Array {
  const mask = new Uint8Array(total);
  for (let pixel = 0; pixel < total; pixel++) {
    const offset = pixel * 4;
    const difference = Math.max(
      Math.abs(reference[offset] - seed[0]),
      Math.abs(reference[offset + 1] - seed[1]),
      Math.abs(reference[offset + 2] - seed[2]),
      Math.abs(reference[offset + 3] - seed[3]),
    );
    mask[pixel] = difference <= tolerance ? 1 : 0;
  }
  return mask;
}

function invertMask(source: Uint8Array): Uint8Array {
  const output = new Uint8Array(source.length);
  for (let index = 0; index < source.length; index++) output[index] = source[index] ? 0 : 1;
  return output;
}

function dilateMask(source: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) output[y * width + x] = neighborhoodHasValue(source, width, height, x, y, radius) ? 1 : 0;
  }
  return output;
}

function erodeMask(source: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) output[y * width + x] = neighborhoodIsFull(source, width, height, x, y, radius) ? 1 : 0;
  }
  return output;
}

function neighborhoodHasValue(source: Uint8Array, width: number, height: number, x: number, y: number, radius: number): boolean {
  for (let offsetY = -radius; offsetY <= radius; offsetY++) {
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      const pointX = x + offsetX;
      const pointY = y + offsetY;
      if (!isInside(pointX, pointY, width, height)) continue;
      if (source[pointY * width + pointX]) return true;
    }
  }
  return false;
}

function neighborhoodIsFull(source: Uint8Array, width: number, height: number, x: number, y: number, radius: number): boolean {
  for (let offsetY = -radius; offsetY <= radius; offsetY++) {
    for (let offsetX = -radius; offsetX <= radius; offsetX++) {
      const pointX = x + offsetX;
      const pointY = y + offsetY;
      if (!isInside(pointX, pointY, width, height)) return false;
      if (!source[pointY * width + pointX]) return false;
    }
  }
  return true;
}

function isInside(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}
