import type { ColorizeMask } from '@nvts/shared';

type PixelRegion = { left: number; top: number; width: number; height: number };
type PaletteColor = [number, number, number] | null;

const MAX_COLORIZE_PIXELS = 4_000_000;

/** Applies editable color seeds to the enclosed regions of a raster layer. */
export function colorizePixels(source: Uint8Array, width: number, height: number, mask: ColorizeMask): Uint8Array {
  const total = width * height;
  if (total > MAX_COLORIZE_PIXELS || mask.strokes.length === 0) return source;

  const bounds = getColorizeBounds(source, mask, width, height);
  const owner = new Int32Array(total);
  owner.fill(-1);
  const barrier = createColorizeBarriers(source, mask.threshold, mask.gapClose, width, height, total);
  const palette = createPalette(mask);
  const queue = new Int32Array(total);
  const tail = seedColorizeQueue(mask, owner, barrier, queue, bounds, width);
  if (tail === 0) return source;

  spreadColorizeColors(queue, tail, owner, barrier, bounds, width);
  return applyColorizePalette(source, owner, palette, total);
}

function getColorizeBounds(source: Uint8Array, mask: ColorizeMask, width: number, height: number): PixelRegion {
  if (!mask.limitToLayerBounds) return { left: 0, top: 0, width, height };
  let left = width, top = height, right = -1, bottom = -1;
  for (let pixel = 0; pixel < width * height; pixel++) {
    if (source[pixel * 4 + 3] === 0) continue;
    left = Math.min(left, pixel % width);
    top = Math.min(top, Math.floor(pixel / width));
    right = Math.max(right, pixel % width);
    bottom = Math.max(bottom, Math.floor(pixel / width));
  }
  for (const stroke of mask.strokes) for (const point of stroke.points) {
    left = Math.min(left, Math.floor(point.x - mask.gapClose));
    top = Math.min(top, Math.floor(point.y - mask.gapClose));
    right = Math.max(right, Math.ceil(point.x + mask.gapClose));
    bottom = Math.max(bottom, Math.ceil(point.y + mask.gapClose));
  }
  if (right < left || bottom < top) return { left: 0, top: 0, width: 0, height: 0 };
  const x = Math.max(0, left), y = Math.max(0, top);
  const maxX = Math.min(width - 1, right), maxY = Math.min(height - 1, bottom);
  return { left: x, top: y, width: maxX - x + 1, height: maxY - y + 1 };
}

function createColorizeBarriers(source: Uint8Array, threshold: number, gapClose: number, width: number, height: number, total: number): Uint8Array {
  const barrier = new Uint8Array(total);
  const limit = Math.max(0, Math.min(255, Math.round(threshold * 255)));
  for (let pixel = 0; pixel < total; pixel++) {
    const offset = pixel * 4;
    if (source[offset + 3] < 16) continue;
    const luminance = getLuminance(source[offset], source[offset + 1], source[offset + 2]);
    if (luminance <= limit) barrier[pixel] = 1;
  }
  closeColorizeBarrierGaps(barrier, width, height, Math.round(gapClose));
  return barrier;
}

function getLuminance(red: number, green: number, blue: number): number {
  return red * 0.299 + green * 0.587 + blue * 0.114;
}

function closeColorizeBarrierGaps(barrier: Uint8Array, width: number, height: number, maxGap: number): void {
  if (maxGap <= 0) return;
  for (let y = 0; y < height; y++) closeBarrierLine(barrier, y * width, 1, width, maxGap);
  for (let x = 0; x < width; x++) closeBarrierLine(barrier, x, width, height, maxGap);
}

function closeBarrierLine(barrier: Uint8Array, start: number, stride: number, length: number, maxGap: number): void {
  let previous = -1;
  for (let index = 0; index < length; index++) {
    if (!barrier[start + index * stride]) continue;
    if (previous >= 0 && index - previous - 1 <= maxGap) {
      for (let gap = previous + 1; gap < index; gap++) barrier[start + gap * stride] = 1;
    }
    previous = index;
  }
}

function createPalette(mask: ColorizeMask): PaletteColor[] {
  const transparent = new Set(mask.transparentColors.map((color) => color.toLowerCase()));
  const seen = new Set<string>();
  const palette: PaletteColor[] = [];
  for (const stroke of mask.strokes) {
    const color = stroke.color.toLowerCase();
    if (seen.has(color)) continue;
    seen.add(color);
    palette.push(transparent.has(color) ? null : parseMaskColor(color));
  }
  return palette;
}

function parseMaskColor(color: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!match) return [224, 48, 48];
  return [0, 2, 4].map((offset) => Number.parseInt(match[1].slice(offset, offset + 2), 16)) as [number, number, number];
}

function seedColorizeQueue(
  mask: ColorizeMask,
  owner: Int32Array,
  barrier: Uint8Array,
  queue: Int32Array,
  bounds: PixelRegion,
  width: number,
): number {
  const colorIds = new Map<string, number>();
  for (const stroke of mask.strokes) if (!colorIds.has(stroke.color.toLowerCase())) colorIds.set(stroke.color.toLowerCase(), colorIds.size);
  let tail = 0;
  for (const stroke of mask.strokes) {
    const colorId = colorIds.get(stroke.color.toLowerCase());
    if (colorId === undefined) continue;
    for (const point of stroke.points) {
      const x = Math.round(point.x), y = Math.round(point.y);
      if (x < bounds.left || x >= bounds.left + bounds.width || y < bounds.top || y >= bounds.top + bounds.height) continue;
      const pixel = y * width + x;
      if (barrier[pixel] || owner[pixel] !== -1) continue;
      owner[pixel] = colorId;
      queue[tail++] = pixel;
    }
  }
  return tail;
}

function spreadColorizeColors(queue: Int32Array, tail: number, owner: Int32Array, barrier: Uint8Array, bounds: PixelRegion, width: number): void {
  let head = 0;
  const right = bounds.left + bounds.width - 1;
  const bottom = bounds.top + bounds.height - 1;
  while (head < tail) {
    const pixel = queue[head++];
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > bounds.left) tail = enqueueNeighbor(pixel - 1, owner[pixel], owner, barrier, queue, tail);
    if (x < right) tail = enqueueNeighbor(pixel + 1, owner[pixel], owner, barrier, queue, tail);
    if (y > bounds.top) tail = enqueueNeighbor(pixel - width, owner[pixel], owner, barrier, queue, tail);
    if (y < bottom) tail = enqueueNeighbor(pixel + width, owner[pixel], owner, barrier, queue, tail);
  }
}

function enqueueNeighbor(pixel: number, colorId: number, owner: Int32Array, barrier: Uint8Array, queue: Int32Array, tail: number): number {
  if (barrier[pixel] || owner[pixel] !== -1) return tail;
  owner[pixel] = colorId;
  queue[tail] = pixel;
  return tail + 1;
}

function applyColorizePalette(source: Uint8Array, owner: Int32Array, palette: PaletteColor[], total: number): Uint8Array {
  const output = new Uint8Array(source);
  for (let pixel = 0; pixel < total; pixel++) {
    const colorId = owner[pixel];
    if (colorId === -1) continue;
    const offset = pixel * 4;
    const color = palette[colorId];
    if (!color) {
      output.fill(0, offset, offset + 4);
      continue;
    }
    const luminance = getLuminance(source[offset], source[offset + 1], source[offset + 2]) / 255;
    output[offset] = Math.round(color[0] * luminance);
    output[offset + 1] = Math.round(color[1] * luminance);
    output[offset + 2] = Math.round(color[2] * luminance);
    output[offset + 3] = 255;
  }
  return output;
}
