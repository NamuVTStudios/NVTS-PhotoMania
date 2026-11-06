export type SelectionBrushPoint = { x: number; y: number };

export function paintSelectionMask(
  source: Uint8Array | null, width: number, height: number,
  from: SelectionBrushPoint, to: SelectionBrushPoint, radius: number, erase: boolean,
): Uint8Array {
  const size = width * height;
  const mask = source && source.length === size ? source.slice() : new Uint8Array(size);
  if (width <= 0 || height <= 0 || radius <= 0 || (erase && !source)) return mask;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, radius * 0.35);
  const count = Math.max(1, Math.ceil(distance / step));
  for (let index = 0; index <= count; index++) {
    const ratio = index / count;
    paintSelectionDisk(mask, width, height, from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio, radius, erase);
  }
  return mask;
}

function paintSelectionDisk(mask: Uint8Array, width: number, height: number, x: number, y: number, radius: number, erase: boolean): void {
  const left = Math.max(0, Math.floor(x - radius));
  const right = Math.min(width - 1, Math.ceil(x + radius));
  const top = Math.max(0, Math.floor(y - radius));
  const bottom = Math.min(height - 1, Math.ceil(y + radius));
  const radiusSquared = radius * radius;
  for (let row = top; row <= bottom; row++) paintSelectionRow(mask, width, row, left, right, x, y, radiusSquared, erase);
}

function paintSelectionRow(mask: Uint8Array, width: number, row: number, left: number, right: number, centerX: number, centerY: number, radiusSquared: number, erase: boolean): void {
  for (let column = left; column <= right; column++) {
    const dx = column + 0.5 - centerX;
    const dy = row + 0.5 - centerY;
    if (dx * dx + dy * dy > radiusSquared) continue;
    mask[row * width + column] = erase ? 0 : 1;
  }
}
