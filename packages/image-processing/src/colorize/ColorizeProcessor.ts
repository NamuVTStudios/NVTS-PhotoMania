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
  const bounds = { left: width, top: height, right: -1, bottom: -1 };
  for (let pixel = 0; pixel < width * height; pixel++) updateBoundsFromPixel(source, pixel, width, bounds);
  for (const stroke of mask.strokes) includeStrokeBounds(stroke.points, mask.gapClose, bounds);
  return createBoundedRegion(bounds, width, height);
}

type MutableBounds = { left: number; top: number; right: number; bottom: number };

function updateBoundsFromPixel(source: Uint8Array, pixel: number, width: number, bounds: MutableBounds): void {
  if (source[pixel * 4 + 3] === 0) return;
  bounds.left = Math.min(bounds.left, pixel % width);
  bounds.top = Math.min(bounds.top, Math.floor(pixel / width));
  bounds.right = Math.max(bounds.right, pixel % width);
  bounds.bottom = Math.max(bounds.bottom, Math.floor(pixel / width));
}

function includeStrokeBounds(points: ColorizeMask['strokes'][number]['points'], gapClose: number, bounds: MutableBounds): void {
  for (const point of points) includeStrokePointBounds(point, gapClose, bounds);
}

function includeStrokePointBounds(point: { x: number; y: number }, gapClose: number, bounds: MutableBounds): void {
  bounds.left = Math.min(bounds.left, Math.floor(point.x - gapClose));
  bounds.top = Math.min(bounds.top, Math.floor(point.y - gapClose));
  bounds.right = Math.max(bounds.right, Math.ceil(point.x + gapClose));
  bounds.bottom = Math.max(bounds.bottom, Math.ceil(point.y + gapClose));
}

function createBoundedRegion(bounds: MutableBounds, width: number, height: number): PixelRegion {
  if (bounds.right < bounds.left || bounds.bottom < bounds.top) return { left: 0, top: 0, width: 0, height: 0 };
  const left = Math.max(0, bounds.left);
  const top = Math.max(0, bounds.top);
  const right = Math.min(width - 1, bounds.right);
  const bottom = Math.min(height - 1, bounds.bottom);
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

function createColorizeBarriers(source: Uint8Array, threshold: number, gapClose: number, width: number, height: number, total: number): Uint8Array {
  const barrier = new Uint8Array(total);
  const limit = Math.max(0, Math.min(255, Math.round(threshold * 255)));
  for (let pixel = 0; pixel < total; pixel++) setColorizeBarrierPixel(source, barrier, pixel, limit);
  closeColorizeBarrierGaps(barrier, width, height, Math.round(gapClose));
  return barrier;
}

function setColorizeBarrierPixel(source: Uint8Array, barrier: Uint8Array, pixel: number, limit: number): void {
  const offset = pixel * 4;
  if (source[offset + 3] < 16) return;
  const luminance = getLuminance(source[offset], source[offset + 1], source[offset + 2]);
  if (luminance <= limit) barrier[pixel] = 1;
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
  for (let index = 0; index < length; index++) previous = processBarrierLineIndex(barrier, start, stride, index, maxGap, previous);
}

function processBarrierLineIndex(barrier: Uint8Array, start: number, stride: number, index: number, maxGap: number, previous: number): number {
  if (!barrier[start + index * stride]) return previous;
  fillBarrierGap(barrier, start, stride, index, previous, maxGap);
  return index;
}

function fillBarrierGap(barrier: Uint8Array, start: number, stride: number, index: number, previous: number, maxGap: number): void {
  if (previous < 0 || index - previous - 1 > maxGap) return;
  for (let gap = previous + 1; gap < index; gap++) setBarrierPixel(barrier, start, stride, gap);
}

function setBarrierPixel(barrier: Uint8Array, start: number, stride: number, index: number): void {
  barrier[start + index * stride] = 1;
}

function createPalette(mask: ColorizeMask): PaletteColor[] {
  const transparent = new Set(mask.transparentColors.map((color) => color.toLowerCase()));
  const seen = new Set<string>();
  const palette: PaletteColor[] = [];
  for (const stroke of mask.strokes) addPaletteColor(stroke.color, seen, transparent, palette);
  return palette;
}

function addPaletteColor(colorValue: string, seen: Set<string>, transparent: Set<string>, palette: PaletteColor[]): void {
  const color = colorValue.toLowerCase();
  if (seen.has(color)) return;
  seen.add(color);
  palette.push(transparent.has(color) ? null : parseMaskColor(color));
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
  const colorIds = createColorIds(mask);
  const state = { tail: 0, owner, barrier, queue, bounds, width, colorIds };
  for (const stroke of mask.strokes) seedStroke(stroke, state);
  return state.tail;
}

type SeedState = {
  tail: number;
  owner: Int32Array;
  barrier: Uint8Array;
  queue: Int32Array;
  bounds: PixelRegion;
  width: number;
  colorIds: Map<string, number>;
};

function createColorIds(mask: ColorizeMask): Map<string, number> {
  const ids = new Map<string, number>();
  for (const stroke of mask.strokes) addColorId(ids, stroke.color);
  return ids;
}

function addColorId(ids: Map<string, number>, color: string): void {
  const normalized = color.toLowerCase();
  if (ids.has(normalized)) return;
  ids.set(normalized, ids.size);
}

function seedStroke(stroke: ColorizeMask['strokes'][number], state: SeedState): void {
  const colorId = state.colorIds.get(stroke.color.toLowerCase());
  if (colorId === undefined) return;
  for (const point of stroke.points) seedPoint(point, colorId, state);
}

function seedPoint(point: { x: number; y: number }, colorId: number, state: SeedState): void {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  if (!isPointInBounds(x, y, state.bounds)) return;
  const pixel = y * state.width + x;
  if (state.barrier[pixel] || state.owner[pixel] !== -1) return;
  state.owner[pixel] = colorId;
  state.queue[state.tail++] = pixel;
}

function isPointInBounds(x: number, y: number, bounds: PixelRegion): boolean {
  return x >= bounds.left && x < bounds.left + bounds.width
    && y >= bounds.top && y < bounds.top + bounds.height;
}

function spreadColorizeColors(queue: Int32Array, tail: number, owner: Int32Array, barrier: Uint8Array, bounds: PixelRegion, width: number): void {
  const state = { head: 0, tail, queue, owner, barrier, bounds, width };
  while (state.head < state.tail) spreadNextPixel(state);
}

type SpreadState = {
  head: number;
  tail: number;
  queue: Int32Array;
  owner: Int32Array;
  barrier: Uint8Array;
  bounds: PixelRegion;
  width: number;
};

function spreadNextPixel(state: SpreadState): void {
  const pixel = state.queue[state.head++];
  const x = pixel % state.width;
  const y = Math.floor(pixel / state.width);
  const right = state.bounds.left + state.bounds.width - 1;
  const bottom = state.bounds.top + state.bounds.height - 1;
  state.tail = enqueueHorizontalNeighbors(pixel, x, right, state);
  state.tail = enqueueVerticalNeighbors(pixel, y, bottom, state);
}

function enqueueHorizontalNeighbors(pixel: number, x: number, right: number, state: SpreadState): number {
  let tail = state.tail;
  if (x > state.bounds.left) tail = enqueueNeighbor(pixel - 1, state.owner[pixel], state.owner, state.barrier, state.queue, tail);
  if (x < right) tail = enqueueNeighbor(pixel + 1, state.owner[pixel], state.owner, state.barrier, state.queue, tail);
  return tail;
}

function enqueueVerticalNeighbors(pixel: number, y: number, bottom: number, state: SpreadState): number {
  let tail = state.tail;
  if (y > state.bounds.top) tail = enqueueNeighbor(pixel - state.width, state.owner[pixel], state.owner, state.barrier, state.queue, tail);
  if (y < bottom) tail = enqueueNeighbor(pixel + state.width, state.owner[pixel], state.owner, state.barrier, state.queue, tail);
  return tail;
}

function enqueueNeighbor(pixel: number, colorId: number, owner: Int32Array, barrier: Uint8Array, queue: Int32Array, tail: number): number {
  if (barrier[pixel] || owner[pixel] !== -1) return tail;
  owner[pixel] = colorId;
  queue[tail] = pixel;
  return tail + 1;
}

function applyColorizePalette(source: Uint8Array, owner: Int32Array, palette: PaletteColor[], total: number): Uint8Array {
  const output = new Uint8Array(source);
  for (let pixel = 0; pixel < total; pixel++) applyPalettePixel(source, output, owner, palette, pixel);
  return output;
}

function applyPalettePixel(source: Uint8Array, output: Uint8Array, owner: Int32Array, palette: PaletteColor[], pixel: number): void {
  const colorId = owner[pixel];
  if (colorId === -1) return;
  const offset = pixel * 4;
  const color = palette[colorId];
  if (!color) {
    output.fill(0, offset, offset + 4);
    return;
  }
  const luminance = getLuminance(source[offset], source[offset + 1], source[offset + 2]) / 255;
  output[offset] = Math.round(color[0] * luminance);
  output[offset + 1] = Math.round(color[1] * luminance);
  output[offset + 2] = Math.round(color[2] * luminance);
  output[offset + 3] = 255;
}
