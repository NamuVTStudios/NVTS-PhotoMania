import type { VectorShape, VectorPoint } from '@nvts/shared';

export interface ComicSplitPoint {
  x: number;
  y: number;
}

/** Builds one freehand divider or two parallel offset dividers from a drawn path. */
export function createComicSplitShapes(
  documentWidth: number,
  documentHeight: number,
  path: ComicSplitPoint[],
  lineCount: 1 | 2,
  lineDistance: number,
  strokeWidth: number,
): VectorShape[] {
  const points = simplifyPath(path.map((point) => ({
    x: clamp(point.x, 0, documentWidth),
    y: clamp(point.y, 0, documentHeight),
  })));
  if (points.length < 2) return [];
  const offsets = lineCount === 2 ? [-clamp(lineDistance, 1, Math.max(documentWidth, documentHeight)) / 2,
    clamp(lineDistance, 1, Math.max(documentWidth, documentHeight)) / 2] : [0];
  return offsets.map((offset) => createPathShape(
    extendPathToDocumentBounds(offsetPath(points, offset), documentWidth, documentHeight),
    strokeWidth,
  ));
}

function simplifyPath(points: ComicSplitPoint[]): ComicSplitPoint[] {
  return points.filter((point, index) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) >= 1);
}

function extendPathToDocumentBounds(points: ComicSplitPoint[], width: number, height: number): ComicSplitPoint[] {
  const first = extendEndpoint(points[0], points[1], width, height);
  const lastIndex = points.length - 1;
  const last = extendEndpoint(points[lastIndex], points[lastIndex - 1], width, height);
  return [first, ...points.slice(1, -1), last];
}

function extendEndpoint(endpoint: ComicSplitPoint, neighbor: ComicSplitPoint, width: number, height: number): ComicSplitPoint {
  const direction = getEndpointDirection(endpoint, neighbor, width, height);
  const intersections: Array<{ t: number; x: number; y: number }> = [];
  collectVerticalIntersections(endpoint, direction, width, height, intersections);
  collectHorizontalIntersections(endpoint, direction, width, height, intersections);
  intersections.sort((a, b) => a.t - b.t);
  return intersections[0] ? { x: intersections[0].x, y: intersections[0].y } : clampPoint(endpoint, width, height);
}

function getEndpointDirection(endpoint: ComicSplitPoint, neighbor: ComicSplitPoint, width: number, height: number): ComicSplitPoint {
  const inside = endpoint.x >= 0 && endpoint.x <= width && endpoint.y >= 0 && endpoint.y <= height;
  if (inside) return { x: endpoint.x - neighbor.x, y: endpoint.y - neighbor.y };
  return { x: neighbor.x - endpoint.x, y: neighbor.y - endpoint.y };
}

function collectVerticalIntersections(
  endpoint: ComicSplitPoint, direction: ComicSplitPoint, width: number, height: number,
  intersections: Array<{ t: number; x: number; y: number }>,
): void {
  if (direction.x === 0) return;
  for (const x of [0, width]) addVerticalIntersection(endpoint, direction, x, height, intersections);
}

function addVerticalIntersection(
  endpoint: ComicSplitPoint, direction: ComicSplitPoint, x: number, height: number,
  intersections: Array<{ t: number; x: number; y: number }>,
): void {
  const t = (x - endpoint.x) / direction.x;
  const y = endpoint.y + direction.y * t;
  if (y < 0 || y > height || t < 0) return;
  intersections.push({ t, x, y });
}

function collectHorizontalIntersections(
  endpoint: ComicSplitPoint, direction: ComicSplitPoint, width: number, height: number,
  intersections: Array<{ t: number; x: number; y: number }>,
): void {
  if (direction.y === 0) return;
  for (const y of [0, height]) addHorizontalIntersection(endpoint, direction, y, width, intersections);
}

function addHorizontalIntersection(
  endpoint: ComicSplitPoint, direction: ComicSplitPoint, y: number, width: number,
  intersections: Array<{ t: number; x: number; y: number }>,
): void {
  const t = (y - endpoint.y) / direction.y;
  const x = endpoint.x + direction.x * t;
  if (x < 0 || x > width || t < 0) return;
  intersections.push({ t, x, y });
}

function clampPoint(point: ComicSplitPoint, width: number, height: number): ComicSplitPoint {
  return { x: clamp(point.x, 0, width), y: clamp(point.y, 0, height) };
}

function offsetPath(points: ComicSplitPoint[], offset: number): ComicSplitPoint[] {
  if (offset === 0) return points;
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dy = next.y - previous.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: point.x - (dy / length) * offset, y: point.y + (dx / length) * offset };
  });
}

function createPathShape(points: ComicSplitPoint[], strokeWidth: number): VectorShape {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const vectorPoints: VectorPoint[] = points.map((point) => ({ ...point }));
  return {
    id: crypto.randomUUID(),
    kind: 'freehand',
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: vectorPoints,
    color: '#000000',
    opacity: 1,
    strokeWidth: clamp(strokeWidth, 1, 20),
    fillEnabled: false,
    strokeEnabled: true,
    strokeColor: '#000000',
    fillColor: 'transparent',
    strokeDash: 'solid',
    lineCap: 'butt',
    lineJoin: 'round',
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
