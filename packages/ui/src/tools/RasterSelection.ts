export type SelectionKind = 'rectangle' | 'ellipse' | 'lasso' | 'polygon';
export type SelectionPoint = { x: number; y: number };

export function createSelectionMask(
  width: number,
  height: number,
  kind: SelectionKind,
  points: readonly SelectionPoint[],
): Uint8Array {
  const mask = new Uint8Array(width * height);
  if (width <= 0 || height <= 0 || points.length < 2) return mask;
  if (kind === 'rectangle') return createRectangleMask(mask, width, height, points[0], points[points.length - 1]);
  if (kind === 'ellipse') return createEllipseMask(mask, width, height, points[0], points[points.length - 1]);
  return createLassoMask(mask, width, height, points);
}

function createRectangleMask(mask: Uint8Array, width: number, height: number, start: SelectionPoint, end: SelectionPoint): Uint8Array {
  const bounds = getPointBounds(start, end, width, height);
  for (let y = bounds.top; y < bounds.bottom; y++) fillMaskRow(mask, width, y, bounds.left, bounds.right);
  return mask;
}

function createEllipseMask(mask: Uint8Array, width: number, height: number, start: SelectionPoint, end: SelectionPoint): Uint8Array {
  const bounds = getPointBounds(start, end, width, height);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const radiusX = Math.max(0.5, (bounds.right - bounds.left) / 2);
  const radiusY = Math.max(0.5, (bounds.bottom - bounds.top) / 2);
  for (let y = bounds.top; y < bounds.bottom; y++) fillEllipseMaskRow(mask, width, y, bounds.left, bounds.right, centerX, centerY, radiusX, radiusY);
  return mask;
}

function fillMaskRow(mask: Uint8Array, width: number, y: number, left: number, right: number): void {
  mask.fill(1, y * width + left, y * width + right);
}

function fillEllipseMaskRow(mask: Uint8Array, width: number, y: number, left: number, right: number, centerX: number, centerY: number, radiusX: number, radiusY: number): void {
  for (let x = left; x < right; x++) mask[y * width + x] = isInsideEllipse(x + 0.5, y + 0.5, centerX, centerY, radiusX, radiusY) ? 1 : 0;
}

function isInsideEllipse(x: number, y: number, centerX: number, centerY: number, radiusX: number, radiusY: number): boolean {
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  return dx * dx + dy * dy <= 1;
}

function createLassoMask(mask: Uint8Array, width: number, height: number, points: readonly SelectionPoint[]): Uint8Array {
  const bounds = getPointsBounds(points, width, height);
  for (let y = bounds.top; y < bounds.bottom; y++) fillLassoMaskRow(mask, width, y, bounds.left, bounds.right, points);
  return mask;
}

function fillLassoMaskRow(mask: Uint8Array, width: number, y: number, left: number, right: number, points: readonly SelectionPoint[]): void {
  for (let x = left; x < right; x++) mask[y * width + x] = isPointInsidePolygon(x + 0.5, y + 0.5, points) ? 1 : 0;
}

function isPointInsidePolygon(x: number, y: number, points: readonly SelectionPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index++) {
    const a = points[index];
    const b = points[previous];
    if ((a.y > y) === (b.y > y)) continue;
    const intersectionX = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (x < intersectionX) inside = !inside;
  }
  return inside;
}

export function createMagicWandMask(
  width: number,
  height: number,
  pixels: Uint8Array,
  seedX: number,
  seedY: number,
  tolerance: number,
): Uint8Array {
  const total = width * height;
  const mask = new Uint8Array(total);
  if (!isValidRasterSelection(width, height, pixels, total)) return mask;
  const startX = clampCoordinate(seedX, width);
  const startY = clampCoordinate(seedY, height);
  const seedOffset = (startY * width + startX) * 4;
  const seed = pixels.subarray(seedOffset, seedOffset + 4);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const state = { head: 0, tail: 1 };
  queue[0] = startY * width + startX;
  visited[queue[0]] = 1;
  while (state.head < state.tail) processMagicWandQueue(queue, state, mask, visited, pixels, seed, width, height, tolerance);
  return mask;
}

function processMagicWandQueue(
  queue: Int32Array,
  state: { head: number; tail: number },
  mask: Uint8Array,
  visited: Uint8Array,
  pixels: Uint8Array,
  seed: Uint8Array,
  width: number,
  height: number,
  tolerance: number,
): void {
  const index = queue[state.head++];
  if (!matchesSeedColor(pixels, index * 4, seed, tolerance)) return;
  mask[index] = 1;
  const x = index % width;
  const y = Math.floor(index / width);
  if (x > 0) enqueueMagicWand(index - 1, queue, state, visited, pixels, seed, tolerance);
  if (x + 1 < width) enqueueMagicWand(index + 1, queue, state, visited, pixels, seed, tolerance);
  if (y > 0) enqueueMagicWand(index - width, queue, state, visited, pixels, seed, tolerance);
  if (y + 1 < height) enqueueMagicWand(index + width, queue, state, visited, pixels, seed, tolerance);
}

function enqueueMagicWand(index: number, queue: Int32Array, state: { head: number; tail: number }, visited: Uint8Array, pixels: Uint8Array, seed: Uint8Array, tolerance: number): void {
  if (visited[index]) return;
  visited[index] = 1;
  if (!matchesSeedColor(pixels, index * 4, seed, tolerance)) return;
  queue[state.tail++] = index;
}

function matchesSeedColor(pixels: Uint8Array, offset: number, seed: Uint8Array, tolerance: number): boolean {
  return Math.max(
    Math.abs(pixels[offset] - seed[0]),
    Math.abs(pixels[offset + 1] - seed[1]),
    Math.abs(pixels[offset + 2] - seed[2]),
    Math.abs(pixels[offset + 3] - seed[3]),
  ) <= tolerance;
}

function isValidRasterSelection(width: number, height: number, pixels: Uint8Array, total: number): boolean {
  return width > 0 && height > 0 && total <= 8_000_000 && pixels.length >= total * 4;
}

export function getSelectionBounds(mask: Uint8Array, width: number, height: number): { left: number; top: number; right: number; bottom: number } | null {
  if (width <= 0 || height <= 0 || mask.length !== width * height) return null;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < mask.length; index++) updateSelectionBounds(mask, index, width, { left, top, right, bottom });
  for (let y = 0; y < height; y++) scanSelectionRow(mask, width, y, (x) => {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  });
  if (right < left || bottom < top) return null;
  return { left, top, right: right + 1, bottom: bottom + 1 };
}

function updateSelectionBounds(_mask: Uint8Array, _index: number, _width: number, _bounds: { left: number; top: number; right: number; bottom: number }): void {}
function scanSelectionRow(mask: Uint8Array, width: number, y: number, visit: (x: number) => void): void {
  for (let x = 0; x < width; x++) if (mask[y * width + x]) visit(x);
}

function getPointBounds(start: SelectionPoint, end: SelectionPoint, width: number, height: number): { left: number; top: number; right: number; bottom: number } {
  return {
    left: clampCoordinate(Math.floor(Math.min(start.x, end.x)), width),
    top: clampCoordinate(Math.floor(Math.min(start.y, end.y)), height),
    right: clampCoordinate(Math.ceil(Math.max(start.x, end.x)) + 1, width),
    bottom: clampCoordinate(Math.ceil(Math.max(start.y, end.y)) + 1, height),
  };
}

function getPointsBounds(points: readonly SelectionPoint[], width: number, height: number): { left: number; top: number; right: number; bottom: number } {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    left: clampCoordinate(Math.floor(Math.min(...xs)), width),
    top: clampCoordinate(Math.floor(Math.min(...ys)), height),
    right: clampCoordinate(Math.ceil(Math.max(...xs)) + 1, width),
    bottom: clampCoordinate(Math.ceil(Math.max(...ys)) + 1, height),
  };
}

function clampCoordinate(value: number, limit: number): number {
  return Math.max(0, Math.min(limit, value));
}
