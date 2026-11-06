import type { VectorPoint, VectorShape } from '@nvts/shared';

export function simplifyVectorLine(shape: VectorShape, tolerance: number): VectorShape | null {
  const points = shape.points ?? [];
  if (points.length < 3 || hasBezierHandles(points)) return null;
  const simplified = simplifyPath(points, Math.max(0.1, tolerance));
  if (simplified.length >= points.length) return null;
  return { ...shape, points: simplified, x: minX(simplified), y: minY(simplified), width: spanX(simplified), height: spanY(simplified) };
}

function hasBezierHandles(points: readonly VectorPoint[]): boolean {
  return points.some((point) => point.inX !== undefined || point.inY !== undefined || point.outX !== undefined || point.outY !== undefined);
}

function simplifyPath(points: readonly VectorPoint[], tolerance: number): VectorPoint[] {
  if (points.length <= 2) return points.map(copyPoint);
  const split = findFarthestPoint(points);
  if (split.distance <= tolerance) return [copyPoint(points[0]), copyPoint(points[points.length - 1])];
  const first = simplifyPath(points.slice(0, split.index + 1), tolerance);
  const second = simplifyPath(points.slice(split.index), tolerance);
  return [...first.slice(0, -1), ...second];
}

function findFarthestPoint(points: readonly VectorPoint[]): { index: number; distance: number } {
  const first = points[0];
  const last = points[points.length - 1];
  return points.slice(1, -1).reduce((result, point, index) => {
    const distance = distanceToSegment(point, first, last);
    return distance > result.distance ? { index: index + 1, distance } : result;
  }, { index: 1, distance: -1 });
}

function distanceToSegment(point: VectorPoint, start: VectorPoint, end: VectorPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared);
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function copyPoint(point: VectorPoint): VectorPoint { return { ...point }; }
function minX(points: readonly VectorPoint[]): number { return Math.min(...points.map((point) => point.x)); }
function minY(points: readonly VectorPoint[]): number { return Math.min(...points.map((point) => point.y)); }
function spanX(points: readonly VectorPoint[]): number { return Math.max(1, Math.max(...points.map((point) => point.x)) - minX(points)); }
function spanY(points: readonly VectorPoint[]): number { return Math.max(1, Math.max(...points.map((point) => point.y)) - minY(points)); }
