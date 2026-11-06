import type { VectorShape } from '@nvts/shared';

type Point = { x: number; y: number };
type PathSegment = { start: Point; end: Point; index: number; length: number; distanceStart: number };
type PathData = { shape: VectorShape; points: Point[]; segments: PathSegment[]; totalLength: number };
export type VectorStrokeEraseResult = { shapes: VectorShape[]; erasedShapeId: string; erasedBetweenIntersections: boolean };

/** Removes the path portion under the cursor, extending to the nearest intersections on either side. */
export function eraseVectorStrokeAt(
  shapes: readonly VectorShape[],
  point: Point,
  radius: number,
  createId: () => string = () => crypto.randomUUID(),
): VectorStrokeEraseResult | null {
  const paths = shapes.map(toPathData).filter(isPathData);
  const hit = findClosestStrokeHit(paths, point, Math.max(1, radius));
  if (!hit) return null;
  const intersections = findTargetIntersections(hit.path, paths);
  const previous = intersections.filter((value) => value < hit.distance - 0.5).sort((a, b) => b - a)[0] ?? 0;
  const next = intersections.filter((value) => value > hit.distance + 0.5).sort((a, b) => a - b)[0] ?? hit.path.totalLength;
  const remaining = splitPathAroundRange(hit.path, previous, next);
  const replacements = createReplacementShapes(hit.path.shape, remaining, createId);
  const shapesWithoutTarget = shapes.filter((shape) => shape.id !== hit.path.shape.id);
  const targetIndex = shapes.findIndex((shape) => shape.id === hit.path.shape.id);
  shapesWithoutTarget.splice(Math.max(0, targetIndex), 0, ...replacements);
  return {
    shapes: shapesWithoutTarget,
    erasedShapeId: hit.path.shape.id,
    erasedBetweenIntersections: intersections.length > 0,
  };
}

function toPathData(shape: VectorShape): PathData | null {
  if (!['line', 'polyline', 'freehand'].includes(shape.kind)) return null;
  const points = getShapePoints(shape);
  if (points.length < 2) return null;
  const segments = createSegments(points);
  return { shape, points, segments, totalLength: segments.reduce((total, segment) => total + segment.length, 0) };
}

function isPathData(value: PathData | null): value is PathData { return value !== null; }

function getShapePoints(shape: VectorShape): Point[] {
  if (shape.points?.length) return shape.points.map(({ x, y }) => ({ x, y }));
  if (shape.kind !== 'line') return [];
  return [{ x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y + shape.height }];
}

function createSegments(points: readonly Point[]): PathSegment[] {
  const result: PathSegment[] = [];
  let distanceStart = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    result.push({ start, end, index, length, distanceStart });
    distanceStart += length;
  }
  return result;
}

function findClosestStrokeHit(paths: readonly PathData[], point: Point, radius: number): { path: PathData; distance: number; distanceToStroke: number } | null {
  const candidates = paths.flatMap((path, order) => path.segments.map((segment) => {
    const projection = projectPointToSegment(point, segment.start, segment.end);
    return {
      path,
      distance: segment.distanceStart + segment.length * projection.t,
      distanceToStroke: projection.distance,
      order,
    };
  }));
  const best = candidates
    .filter((candidate) => candidate.distanceToStroke <= radius)
    .sort((first, second) => first.distanceToStroke - second.distanceToStroke || second.order - first.order)[0];
  if (!best) return null;
  return { path: best.path, distance: best.distance, distanceToStroke: best.distanceToStroke };
}

function projectPointToSegment(point: Point, start: Point, end: Point): { t: number; distance: number } {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return { t, distance: Math.hypot(point.x - (start.x + dx * t), point.y - (start.y + dy * t)) };
}

function findTargetIntersections(target: PathData, paths: readonly PathData[]): number[] {
  const values: number[] = [];
  paths.filter((path) => path.shape.id !== target.shape.id).forEach((other) => {
    target.segments.forEach((targetSegment) => {
      other.segments.forEach((otherSegment) => {
        const intersection = intersectSegments(targetSegment.start, targetSegment.end, otherSegment.start, otherSegment.end);
        if (intersection === null) return;
        values.push(targetSegment.distanceStart + targetSegment.length * intersection);
      });
    });
  });
  return uniqueSorted(values);
}

function intersectSegments(a: Point, b: Point, c: Point, d: Point): number | null {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denominator) < 1e-8) return null;
  const numeratorA = (c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x);
  const numeratorB = (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
  const t = numeratorA / denominator;
  const u = numeratorB / denominator;
  if (t < -1e-5 || t > 1 + 1e-5 || u < 0 || u > 1) return null;
  return t;
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
}

function splitPathAroundRange(path: PathData, start: number, end: number): Point[][] {
  const prefix = slicePath(path, 0, start);
  const suffix = slicePath(path, end, path.totalLength);
  return [prefix, suffix].filter((segment) => segment.length >= 2 && pathLength(segment) > 0.5);
}

function slicePath(path: PathData, start: number, end: number): Point[] {
  if (end - start <= 0.5) return [];
  const points = [pointAtDistance(path, start)];
  path.segments.filter((segment) => segment.distanceStart + segment.length > start && segment.distanceStart + segment.length < end)
    .forEach((segment) => points.push(segment.end));
  points.push(pointAtDistance(path, end));
  return deduplicatePoints(points);
}

function pointAtDistance(path: PathData, distance: number): Point {
  const safeDistance = clamp(distance, 0, path.totalLength);
  const segment = path.segments.find((item) => safeDistance <= item.distanceStart + item.length) ?? path.segments.at(-1)!;
  const t = segment.length === 0 ? 0 : clamp((safeDistance - segment.distanceStart) / segment.length, 0, 1);
  return { x: segment.start.x + (segment.end.x - segment.start.x) * t, y: segment.start.y + (segment.end.y - segment.start.y) * t };
}

function deduplicatePoints(points: Point[]): Point[] {
  return points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > 0.01);
}

function pathLength(points: readonly Point[]): number {
  return createSegments(points).reduce((total, segment) => total + segment.length, 0);
}

function createReplacementShapes(source: VectorShape, segments: Point[][], createId: () => string): VectorShape[] {
  return segments.map((points, index) => createPolylineShape(source, points, index === 0 ? source.id : createId()));
}

function createPolylineShape(source: VectorShape, points: Point[], id: string): VectorShape {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    ...source,
    id,
    kind: 'polyline',
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    points: points.map((point) => ({ ...point })),
    fillEnabled: false,
  };
}

function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
