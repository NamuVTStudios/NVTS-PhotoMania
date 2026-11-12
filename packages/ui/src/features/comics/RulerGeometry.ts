export type RulerMode = 'none' | 'linear' | 'curved' | 'perspective' | 'fisheye' | 'parallel' | 'radial' | 'concentric';
export type RulerPoint = { x: number; y: number };
export type RulerPath = { points: RulerPoint[]; closed?: boolean };
export type RulerGeometry = { paths: RulerPath[] };

export function createRulerGeometry(
  mode: RulerMode,
  width: number,
  height: number,
  centerX = width / 2,
  centerY = height / 2,
): RulerGeometry {
  const bounds = { width: Math.max(1, width), height: Math.max(1, height) };
  const center = { x: clamp(centerX, 0, bounds.width), y: clamp(centerY, 0, bounds.height) };
  switch (mode) {
    case 'linear': return { paths: createLinearPaths(bounds, center) };
    case 'curved': return { paths: createCurvedPaths(bounds, center) };
    case 'perspective': return { paths: createPerspectivePaths(bounds, center) };
    case 'fisheye': return { paths: [...createConcentricPaths(bounds, center, 9), ...createRadialPaths(bounds, center, 16)] };
    case 'parallel': return { paths: createParallelPaths(bounds, 48) };
    case 'radial': return { paths: createRadialPaths(bounds, center, 24) };
    case 'concentric': return { paths: createConcentricPaths(bounds, center, 14) };
    default: return { paths: [] };
  }
}

function createLinearPaths(bounds: { width: number; height: number }, center: RulerPoint): RulerPath[] {
  return [
    createPath([{ x: center.x, y: 0 }, { x: center.x, y: bounds.height }]),
    createPath([{ x: 0, y: center.y }, { x: bounds.width, y: center.y }]),
  ];
}

function createCurvedPaths(bounds: { width: number; height: number }, center: RulerPoint): RulerPath[] {
  const result: RulerPath[] = [];
  const count = 7;
  for (let index = 0; index < count; index += 1) {
    const offset = (index - (count - 1) / 2) * Math.min(bounds.height, bounds.width) * 0.09;
    const curve = sampleQuadraticCurve(
      { x: 0, y: center.y + offset },
      { x: center.x, y: center.y - offset * 1.5 },
      { x: bounds.width, y: center.y + offset },
      32,
    );
    result.push(createPath(curve));
  }
  return result;
}

function createPerspectivePaths(bounds: { width: number; height: number }, center: RulerPoint): RulerPath[] {
  const leftVanishing = { x: bounds.width * 0.22, y: center.y };
  const rightVanishing = { x: bounds.width * 0.78, y: center.y };
  const corners = [
    { x: 0, y: 0 }, { x: bounds.width, y: 0 },
    { x: bounds.width, y: bounds.height }, { x: 0, y: bounds.height },
  ];
  const paths = [createPath([{ x: 0, y: center.y }, { x: bounds.width, y: center.y }])];
  paths.push(...corners.map((corner) => createPath([leftVanishing, corner])));
  paths.push(...corners.map((corner) => createPath([rightVanishing, corner])));
  paths.push(createPath([{ x: center.x, y: 0 }, { x: center.x, y: bounds.height }]));
  return paths;
}

function createParallelPaths(bounds: { width: number; height: number }, spacing: number): RulerPath[] {
  return [...createHorizontalParallelPaths(bounds, spacing), ...createVerticalParallelPaths(bounds, spacing)];
}

function createHorizontalParallelPaths(bounds: { width: number; height: number }, spacing: number): RulerPath[] {
  const paths: RulerPath[] = [];
  for (let y = spacing; y < bounds.height; y += spacing) {
    paths.push(createPath([{ x: 0, y }, { x: bounds.width, y }]));
  }
  return paths;
}

function createVerticalParallelPaths(bounds: { width: number; height: number }, spacing: number): RulerPath[] {
  const paths: RulerPath[] = [];
  for (let x = spacing; x < bounds.width; x += spacing) {
    paths.push(createPath([{ x, y: 0 }, { x, y: bounds.height }]));
  }
  return paths;
}

function createRadialPaths(bounds: { width: number; height: number }, center: RulerPoint, count: number): RulerPath[] {
  const radius = Math.hypot(bounds.width, bounds.height);
  const paths: RulerPath[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2;
    const end = {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
    paths.push(createPath([getRayStart(center, end, bounds), getRayEnd(center, end, bounds)]));
  }
  return paths;
}

function getRayStart(center: RulerPoint, end: RulerPoint, bounds: { width: number; height: number }): RulerPoint {
  const factor = rayBoundaryFactor(center, end, bounds, true);
  return { x: center.x + (end.x - center.x) * factor, y: center.y + (end.y - center.y) * factor };
}

function getRayEnd(center: RulerPoint, end: RulerPoint, bounds: { width: number; height: number }): RulerPoint {
  const factor = rayBoundaryFactor(center, end, bounds, false);
  return { x: center.x + (end.x - center.x) * factor, y: center.y + (end.y - center.y) * factor };
}

function rayBoundaryFactor(center: RulerPoint, end: RulerPoint, bounds: { width: number; height: number }, forward: boolean): number {
  const dx = end.x - center.x;
  const dy = end.y - center.y;
  const factors = [
    dx > 0 ? (bounds.width - center.x) / dx : dx < 0 ? -center.x / dx : Number.POSITIVE_INFINITY,
    dy > 0 ? (bounds.height - center.y) / dy : dy < 0 ? -center.y / dy : Number.POSITIVE_INFINITY,
  ].filter(Number.isFinite).filter((factor) => forward ? factor >= 0 : factor <= 0);
  return factors.length ? (forward ? Math.min(...factors) : Math.max(...factors)) : 0;
}

function createConcentricPaths(bounds: { width: number; height: number }, center: RulerPoint, count: number): RulerPath[] {
  const maximumRadius = Math.hypot(bounds.width, bounds.height);
  const paths: RulerPath[] = [];
  for (let index = 1; index <= count; index += 1) {
    const radius = maximumRadius * index / count;
    paths.push({ points: createCirclePoints(center, radius, 64), closed: true });
  }
  return paths;
}

function createCirclePoints(center: RulerPoint, radius: number, steps: number): RulerPoint[] {
  const points: RulerPoint[] = [];
  for (let index = 0; index < steps; index += 1) {
    const angle = index / steps * Math.PI * 2;
    points.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
  }
  return points;
}

function sampleQuadraticCurve(start: RulerPoint, control: RulerPoint, end: RulerPoint, steps: number): RulerPoint[] {
  const points: RulerPoint[] = [];
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    const inverse = 1 - t;
    points.push({
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    });
  }
  return points;
}

function createPath(points: RulerPoint[]): RulerPath { return { points }; }
function clamp(value: number, minimum: number, maximum: number): number { return Math.max(minimum, Math.min(maximum, value)); }


export function snapPointToRuler(
  point: RulerPoint,
  geometry: RulerGeometry,
  tolerance: number,
): RulerPoint {
  let closest = point;
  let closestDistance = tolerance;
  for (const path of geometry.paths) {
    const segments = path.points.length - 1 + (path.closed ? 1 : 0);
    for (let index = 0; index < segments; index += 1) {
      const start = path.points[index];
      const end = path.points[(index + 1) % path.points.length];
      const candidate = projectPointToSegment(point, start, end);
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    }
  }
  return closest;
}

function projectPointToSegment(point: RulerPoint, start: RulerPoint, end: RulerPoint): RulerPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 0.0001) return start;
  const progress = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  return { x: start.x + dx * progress, y: start.y + dy * progress };
}
