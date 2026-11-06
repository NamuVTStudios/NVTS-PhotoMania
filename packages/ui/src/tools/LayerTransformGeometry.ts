import type { VectorShape } from '@nvts/shared';

export type LayerRect = { x: number; y: number; width: number; height: number };
export type SnapGuides = { vertical: number[]; horizontal: number[] };
export type SnapResult = { rect: LayerRect; guides: SnapGuides };

const MIN_SIZE = 1;

export function normalizeRect(rect: LayerRect): LayerRect {
  return {
    x: rect.x,
    y: rect.y,
    width: Math.max(MIN_SIZE, rect.width),
    height: Math.max(MIN_SIZE, rect.height),
  };
}

export function moveRect(rect: LayerRect, dx: number, dy: number): LayerRect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

/** Moves editable vector geometry, including absolute Bézier control handles. */
export function translateVectorShapes(shapes: readonly VectorShape[], dx: number, dy: number): VectorShape[] {
  return shapes.map((shape) => ({
    ...shape,
    x: shape.x + dx,
    y: shape.y + dy,
    points: shape.points?.map((point) => ({
      ...point,
      x: point.x + dx,
      y: point.y + dy,
      ...(point.inX !== undefined ? { inX: point.inX + dx } : {}),
      ...(point.inY !== undefined ? { inY: point.inY + dy } : {}),
      ...(point.outX !== undefined ? { outX: point.outX + dx } : {}),
      ...(point.outY !== undefined ? { outY: point.outY + dy } : {}),
    })),
  }));
}

export function resizeRect(
  start: LayerRect,
  handle: string,
  dx: number,
  dy: number,
  keepAspectRatio = false,
): LayerRect {
  const next = { ...start };
  const left = handle.includes('w');
  const right = handle.includes('e');
  const top = handle.includes('n');
  const bottom = handle.includes('s');
  resizeHorizontal(next, start, dx, left, right);
  resizeVertical(next, start, dy, top, bottom);
  if (!keepAspectRatio) return normalizeRect(next);
  return keepResizeAspectRatio(next, start, handle);
}

function resizeHorizontal(next: LayerRect, start: LayerRect, dx: number, left: boolean, right: boolean): void {
  if (left) {
    const edge = Math.min(start.x + start.width - MIN_SIZE, start.x + dx);
    next.width = start.x + start.width - edge;
    next.x = edge;
  }
  if (right) next.width = Math.max(MIN_SIZE, start.width + dx);
}

function resizeVertical(next: LayerRect, start: LayerRect, dy: number, top: boolean, bottom: boolean): void {
  if (top) {
    const edge = Math.min(start.y + start.height - MIN_SIZE, start.y + dy);
    next.height = start.y + start.height - edge;
    next.y = edge;
  }
  if (bottom) next.height = Math.max(MIN_SIZE, start.height + dy);
}

function keepResizeAspectRatio(next: LayerRect, start: LayerRect, handle: string): LayerRect {
  const ratio = start.width / Math.max(MIN_SIZE, start.height);
  const widthDelta = Math.abs(next.width / start.width - 1);
  const heightDelta = Math.abs(next.height / start.height - 1);
  const widthDriven = widthDelta >= heightDelta;
  const width = Math.max(MIN_SIZE, widthDriven ? next.width : next.height * ratio);
  const height = Math.max(MIN_SIZE, widthDriven ? width / ratio : next.height);
  return anchorResize(start, handle, width, height);
}

function anchorResize(start: LayerRect, handle: string, width: number, height: number): LayerRect {
  const x = handle.includes('w') ? start.x + start.width - width : start.x;
  const y = handle.includes('n') ? start.y + start.height - height : start.y;
  return { x, y, width, height };
}

export function snapMoveRect(rect: LayerRect, documentWidth: number, documentHeight: number, threshold = 8): SnapResult {
  const horizontal = snapAxis([
    { value: rect.x, target: 0 },
    { value: rect.x + rect.width / 2, target: documentWidth / 2 },
    { value: rect.x + rect.width, target: documentWidth },
  ], threshold);
  const vertical = snapAxis([
    { value: rect.y, target: 0 },
    { value: rect.y + rect.height / 2, target: documentHeight / 2 },
    { value: rect.y + rect.height, target: documentHeight },
  ], threshold);
  return {
    rect: { ...rect, x: rect.x + horizontal.delta, y: rect.y + vertical.delta },
    guides: { vertical: horizontal.guide, horizontal: vertical.guide },
  };
}

export function snapResizeRect(
  rect: LayerRect,
  handle: string,
  documentWidth: number,
  documentHeight: number,
  threshold = 8,
): SnapResult {
  const next = { ...rect };
  const verticalGuides: number[] = [];
  const horizontalGuides: number[] = [];
  if (handle.includes('w')) applyWestSnap(next, documentWidth, threshold, verticalGuides);
  if (handle.includes('e')) applyEastSnap(next, documentWidth, threshold, verticalGuides);
  if (handle.includes('n')) applyNorthSnap(next, documentHeight, threshold, horizontalGuides);
  if (handle.includes('s')) applySouthSnap(next, documentHeight, threshold, horizontalGuides);
  return { rect: normalizeRect(next), guides: { vertical: verticalGuides, horizontal: horizontalGuides } };
}

function applyWestSnap(rect: LayerRect, documentWidth: number, threshold: number, guides: number[]): void {
  const snap = nearestSnap(rect.x, [0, documentWidth / 2, documentWidth], threshold);
  if (snap === null) return;
  if (snap >= rect.x + rect.width - MIN_SIZE) return;
  rect.width += rect.x - snap;
  rect.x = snap;
  guides.push(snap);
}

function applyEastSnap(rect: LayerRect, documentWidth: number, threshold: number, guides: number[]): void {
  const edge = rect.x + rect.width;
  const snap = nearestSnap(edge, [0, documentWidth / 2, documentWidth], threshold);
  if (snap === null || snap <= rect.x + MIN_SIZE) return;
  rect.width = snap - rect.x;
  guides.push(snap);
}

function applyNorthSnap(rect: LayerRect, documentHeight: number, threshold: number, guides: number[]): void {
  const snap = nearestSnap(rect.y, [0, documentHeight / 2, documentHeight], threshold);
  if (snap === null || snap >= rect.y + rect.height - MIN_SIZE) return;
  rect.height += rect.y - snap;
  rect.y = snap;
  guides.push(snap);
}

function applySouthSnap(rect: LayerRect, documentHeight: number, threshold: number, guides: number[]): void {
  const edge = rect.y + rect.height;
  const snap = nearestSnap(edge, [0, documentHeight / 2, documentHeight], threshold);
  if (snap === null || snap <= rect.y + MIN_SIZE) return;
  rect.height = snap - rect.y;
  guides.push(snap);
}

type AxisCandidate = { value: number; target: number };
type AxisSnap = { delta: number; guide: number[] };

function snapAxis(candidates: AxisCandidate[], threshold: number): AxisSnap {
  const matches = candidates
    .map((candidate) => ({ ...candidate, delta: candidate.target - candidate.value }))
    .filter((candidate) => Math.abs(candidate.delta) <= threshold)
    .sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta));
  const best = matches[0];
  return best ? { delta: best.delta, guide: [best.target] } : { delta: 0, guide: [] };
}

function nearestSnap(value: number, targets: number[], threshold: number): number | null {
  const matches = targets
    .map((target) => ({ target, distance: Math.abs(target - value) }))
    .filter((candidate) => candidate.distance <= threshold)
    .sort((left, right) => left.distance - right.distance);
  return matches[0]?.target ?? null;
}

export function transformRectWithMask(
  rect: LayerRect,
  mask: { offsetX: number; offsetY: number; scaleX: number; scaleY: number; rotation: number; shearX: number; shearY: number },
  documentWidth: number,
  documentHeight: number,
): LayerRect {
  const points = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x, y: rect.y + rect.height },
    { x: rect.x + rect.width, y: rect.y + rect.height },
  ].map((point) => transformPointWithMask(point, mask, documentWidth, documentHeight));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(MIN_SIZE, Math.max(...xs) - x), height: Math.max(MIN_SIZE, Math.max(...ys) - y) };
}

function transformPointWithMask(
  point: { x: number; y: number },
  mask: { offsetX: number; offsetY: number; scaleX: number; scaleY: number; rotation: number; shearX: number; shearY: number },
  documentWidth: number,
  documentHeight: number,
): { x: number; y: number } {
  const centerX = documentWidth / 2;
  const centerY = documentHeight / 2;
  let x = (point.x - centerX) * mask.scaleX;
  let y = (point.y - centerY) * mask.scaleY;
  y += Math.tan(mask.shearY * Math.PI / 180) * x;
  x += Math.tan(mask.shearX * Math.PI / 180) * y;
  const angle = mask.rotation * Math.PI / 180;
  const rotatedX = x * Math.cos(angle) - y * Math.sin(angle);
  const rotatedY = x * Math.sin(angle) + y * Math.cos(angle);
  return { x: centerX + mask.offsetX + rotatedX, y: centerY + mask.offsetY + rotatedY };
}

export function createTransformMaskValues(
  source: LayerRect,
  target: LayerRect,
  documentWidth: number,
  documentHeight: number,
): { offsetX: number; offsetY: number; scaleX: number; scaleY: number } {
  const scaleX = Math.max(0.001, target.width / Math.max(MIN_SIZE, source.width));
  const scaleY = Math.max(0.001, target.height / Math.max(MIN_SIZE, source.height));
  return {
    scaleX,
    scaleY,
    offsetX: target.x - documentWidth / 2 - (source.x - documentWidth / 2) * scaleX,
    offsetY: target.y - documentHeight / 2 - (source.y - documentHeight / 2) * scaleY,
  };
}
