import type { VectorShape } from './nvtsphoto';

export function cloneVectorShape(shape: VectorShape): VectorShape {
  return { ...shape, points: shape.points?.map((point) => ({ ...point })) };
}

export function cloneVectorShapes(shapes: readonly VectorShape[] | undefined): VectorShape[] {
  return (shapes ?? []).map(cloneVectorShape);
}

export type VectorBounds = { x: number; y: number; width: number; height: number };

const POINT_BOUNDS_KINDS = new Set<VectorShape['kind']>(['line', 'polygon', 'polyline', 'bezier', 'freehand']);

/** Returns a normalized frame for the rendered path, not a stale x/y/width/height cache. */
export function getVectorShapeBounds(shape: VectorShape): VectorBounds {
  if (shape.kind === 'bezier' && shape.points?.length) return boundsFromBezier(shape.points, shape);
  if (POINT_BOUNDS_KINDS.has(shape.kind) && shape.points?.length) {
    return boundsFromPoints(shape.points.map(({ x, y }) => ({ x, y })), shape);
  }
  if (shape.kind === 'line') {
    return boundsFromPoints([
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.width, y: shape.y + shape.height },
    ], shape);
  }
  return boundsFromShapeGeometry(shape);
}

function boundsFromBezier(points: NonNullable<VectorShape['points']>, shape: VectorShape): VectorBounds {
  const coordinates = [{ x: points[0].x, y: points[0].y }];
  for (let index = 1; index < points.length; index++) {
    appendBezierSegmentBounds(coordinates, points[index - 1], points[index]);
  }
  return boundsFromPoints(coordinates, shape);
}

function appendBezierSegmentBounds(
  coordinates: Array<{ x: number; y: number }>,
  previous: NonNullable<VectorShape['points']>[number],
  next: NonNullable<VectorShape['points']>[number],
): void {
  if (!hasBezierHandles(previous, next)) {
    coordinates.push({ x: next.x, y: next.y });
    return;
  }
  const start = { x: previous.x, y: previous.y };
  const control1 = { x: previous.outX ?? previous.x, y: previous.outY ?? previous.y };
  const control2 = { x: next.inX ?? next.x, y: next.inY ?? next.y };
  const end = { x: next.x, y: next.y };
  appendCubicBounds(coordinates, start, control1, control2, end);
}

function hasBezierHandles(previous: NonNullable<VectorShape['points']>[number], next: NonNullable<VectorShape['points']>[number]): boolean {
  return previous.outX !== undefined || next.inX !== undefined;
}

function appendCubicBounds(
  coordinates: Array<{ x: number; y: number }>,
  start: { x: number; y: number },
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  end: { x: number; y: number },
): void {
  coordinates.push(end);
  const extrema = [
    ...getCubicExtremaParameters(start.x, control1.x, control2.x, end.x),
    ...getCubicExtremaParameters(start.y, control1.y, control2.y, end.y),
  ];
  extrema.forEach((t) => coordinates.push(cubicPoint(start, control1, control2, end, t)));
}

function getCubicExtremaParameters(start: number, control1: number, control2: number, end: number): number[] {
  const a = -start + 3 * control1 - 3 * control2 + end;
  const b = 2 * (start - 2 * control1 + control2);
  const c = control1 - start;
  if (Math.abs(a) < 1e-9) return linearExtremum(b, c);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b + root) / (2 * a), (-b - root) / (2 * a)].filter(isInteriorBezierParameter);
}

function linearExtremum(b: number, c: number): number[] {
  if (Math.abs(b) < 1e-9) return [];
  const t = -c / b;
  return isInteriorBezierParameter(t) ? [t] : [];
}

function isInteriorBezierParameter(t: number): boolean {
  return Number.isFinite(t) && t > 0 && t < 1;
}

function cubicPoint(
  start: { x: number; y: number },
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const inverse = 1 - t;
  const startWeight = inverse ** 3;
  const control1Weight = 3 * inverse ** 2 * t;
  const control2Weight = 3 * inverse * t ** 2;
  const endWeight = t ** 3;
  return {
    x: start.x * startWeight + control1.x * control1Weight + control2.x * control2Weight + end.x * endWeight,
    y: start.y * startWeight + control1.y * control1Weight + control2.y * control2Weight + end.y * endWeight,
  };
}

function boundsFromPoints(points: Array<{ x: number; y: number }>, shape: VectorShape): VectorBounds {
  const valid = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length === 0) return boundsFromShapeGeometry(shape);
  let left = valid[0].x;
  let right = valid[0].x;
  let top = valid[0].y;
  let bottom = valid[0].y;
  for (const point of valid) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function boundsFromShapeGeometry(shape: VectorShape): VectorBounds {
  const left = Math.min(shape.x, shape.x + shape.width);
  const top = Math.min(shape.y, shape.y + shape.height);
  return { x: left, y: top, width: Math.max(1, Math.abs(shape.width)), height: Math.max(1, Math.abs(shape.height)) };
}

export function getVectorShapeCenter(shape: VectorShape): { x: number; y: number } {
  const bounds = getVectorShapeBounds(shape);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** Remaps vector nodes and Bézier handles from one frame into another without mutating inputs. */
export function remapVectorPoints(
  points: VectorShape['points'],
  source: VectorBounds,
  target: VectorBounds,
): VectorShape['points'] {
  if (!points) return undefined;
  const scaleX = target.width / Math.max(1, source.width);
  const scaleY = target.height / Math.max(1, source.height);
  return points.map((point) => ({
    ...point,
    x: target.x + (point.x - source.x) * scaleX,
    y: target.y + (point.y - source.y) * scaleY,
    ...(point.inX !== undefined ? { inX: target.x + (point.inX - source.x) * scaleX } : {}),
    ...(point.inY !== undefined ? { inY: target.y + (point.inY - source.y) * scaleY } : {}),
    ...(point.outX !== undefined ? { outX: target.x + (point.outX - source.x) * scaleX } : {}),
    ...(point.outY !== undefined ? { outY: target.y + (point.outY - source.y) * scaleY } : {}),
  }));
}
