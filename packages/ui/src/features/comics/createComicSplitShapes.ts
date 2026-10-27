import type { VectorShape } from '@nvts/shared';

export interface ComicSplitPoint {
  x: number;
  y: number;
}

type DividerLine = { point: ComicSplitPoint; direction: ComicSplitPoint };
type LineIntersection = ComicSplitPoint & { t: number };

/** Creates one straight divider or two straight, parallel dividers across the document. */
export function createComicSplitShapes(
  documentWidth: number,
  documentHeight: number,
  gesture: ComicSplitPoint[],
  lineCount: 1 | 2,
  lineDistance: number,
  strokeWidth: number,
): VectorShape[] {
  if (gesture.length < 2 || documentWidth < 1 || documentHeight < 1) return [];
  const gestureLine = createGestureLine(gesture, documentWidth, documentHeight);
  if (!gestureLine) return [];
  const offsets = getDividerOffsets(lineCount, lineDistance, documentWidth, documentHeight);
  return offsets.map((offset) => createDividerShape(gestureLine, offset, documentWidth, documentHeight, strokeWidth)).filter(isValidShape);
}

function createGestureLine(
  gesture: ComicSplitPoint[],
  width: number,
  height: number,
): DividerLine | null {
  const start = clampPoint(gesture[0], width, height);
  const end = clampPoint(gesture[gesture.length - 1], width, height);
  const direction = { x: end.x - start.x, y: end.y - start.y };
  if (Math.hypot(direction.x, direction.y) < 1) return null;
  return { point: start, direction };
}

function getDividerOffsets(count: 1 | 2, distance: number, width: number, height: number): number[] {
  if (count === 1) return [0];
  const halfDistance = clamp(distance, 1, Math.max(width, height)) / 2;
  return [-halfDistance, halfDistance];
}

function createDividerShape(
  baseLine: DividerLine,
  offset: number,
  width: number,
  height: number,
  strokeWidth: number,
): VectorShape | null {
  const line = offsetLine(baseLine, offset);
  const points = clipLineToDocument(line, width, height);
  if (points.length !== 2) return null;
  return createLineShape(points, strokeWidth);
}

function offsetLine(line: DividerLine, offset: number): DividerLine {
  const length = Math.hypot(line.direction.x, line.direction.y);
  const normal = { x: -line.direction.y / length, y: line.direction.x / length };
  return {
    point: { x: line.point.x + normal.x * offset, y: line.point.y + normal.y * offset },
    direction: line.direction,
  };
}

function clipLineToDocument(line: DividerLine, width: number, height: number): ComicSplitPoint[] {
  const intersections: LineIntersection[] = [];
  addVerticalIntersections(line, width, height, intersections);
  addHorizontalIntersections(line, width, height, intersections);
  const unique = uniqueIntersections(intersections);
  unique.sort((first, second) => first.t - second.t);
  if (unique.length < 2) return [];
  return [unique[0], unique[unique.length - 1]].map(({ x, y }) => ({ x, y }));
}

function addVerticalIntersections(
  line: DividerLine,
  width: number,
  height: number,
  target: LineIntersection[],
): void {
  [0, width].forEach((x) => addVerticalIntersection(line, x, height, target));
}

function addVerticalIntersection(line: DividerLine, x: number, height: number, target: LineIntersection[]): void {
  const dx = line.direction.x;
  if (dx === 0) return;
  const t = (x - line.point.x) / dx;
  const y = line.point.y + line.direction.y * t;
  if (y < -0.000001 || y > height + 0.000001) return;
  target.push({ x, y: clamp(y, 0, height), t });
}

function addHorizontalIntersections(
  line: DividerLine,
  width: number,
  height: number,
  target: LineIntersection[],
): void {
  [0, height].forEach((y) => addHorizontalIntersection(line, y, width, target));
}

function addHorizontalIntersection(line: DividerLine, y: number, width: number, target: LineIntersection[]): void {
  const dy = line.direction.y;
  if (dy === 0) return;
  const t = (y - line.point.y) / dy;
  const x = line.point.x + line.direction.x * t;
  if (x < -0.000001 || x > width + 0.000001) return;
  target.push({ x: clamp(x, 0, width), y, t });
}

function uniqueIntersections(points: LineIntersection[]): LineIntersection[] {
  return points.filter((point, index, source) => source.findIndex((candidate) => (
    Math.abs(candidate.x - point.x) < 0.000001 && Math.abs(candidate.y - point.y) < 0.000001
  )) === index);
}

function createLineShape(points: ComicSplitPoint[], strokeWidth: number): VectorShape {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    id: crypto.randomUUID(),
    kind: 'freehand',
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: points.map((point) => ({ ...point })),
    color: '#000000',
    opacity: 1,
    strokeWidth: clamp(strokeWidth, 1, 20),
    fillEnabled: false,
    strokeEnabled: true,
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeDash: 'solid',
    lineCap: 'butt',
    lineJoin: 'miter',
  };
}

function isValidShape(shape: VectorShape | null): shape is VectorShape {
  return shape !== null;
}

function clampPoint(point: ComicSplitPoint, width: number, height: number): ComicSplitPoint {
  return { x: clamp(point.x, 0, width), y: clamp(point.y, 0, height) };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
