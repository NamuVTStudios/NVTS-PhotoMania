import type { PixelShapeToolId } from '../tools/ToolsBase';

export type RasterPoint = { x: number; y: number };

export interface RasterShapeSettings {
  color: string;
  opacity: number;
  size: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  shapeFill: boolean;
  shapeCornerRadius: number;
  polygonSides: number;
  starPoints: number;
  spiralTurns: number;
}

/** Draws a rasterized counterpart of an editable vector shape into the supplied canvas. */
export function renderRasterShape(
  context: CanvasRenderingContext2D,
  tool: PixelShapeToolId,
  start: RasterPoint,
  end: RasterPoint,
  settings: RasterShapeSettings,
  points: readonly RasterPoint[] = [],
  scale = 1,
): void {
  context.save();
  applyRasterShapeStyle(context, settings, scale);
  traceRasterShape(context, tool, start, end, settings, points, scale);
  context.restore();
}

function applyRasterShapeStyle(context: CanvasRenderingContext2D, settings: RasterShapeSettings, scale: number): void {
  context.globalAlpha = clamp(settings.opacity / 100, 0, 1);
  context.strokeStyle = settings.color;
  context.fillStyle = settings.color;
  context.lineWidth = Math.max(1, settings.size * scale);
  context.lineCap = settings.lineCap;
  context.lineJoin = settings.lineJoin;
}

function traceRasterShape(
  context: CanvasRenderingContext2D,
  tool: PixelShapeToolId,
  start: RasterPoint,
  end: RasterPoint,
  settings: RasterShapeSettings,
  points: readonly RasterPoint[],
  scale: number,
): void {
  if (tool === 'pixel-rounded-rectangle') return drawRoundedRectangle(context, start, end, settings.shapeCornerRadius * scale, settings.shapeFill);
  if (tool === 'pixel-polyline') return drawPolyline(context, points.length > 1 ? points : [start, end]);
  if (tool === 'pixel-bezier') return drawBezier(context, start, end);
  if (tool === 'pixel-polygon') return drawPolygon(context, start, end, settings.polygonSides, settings.shapeFill);
  if (tool === 'pixel-star') return drawStar(context, start, end, settings.starPoints, settings.shapeFill);
  drawSpiral(context, start, end, settings.spiralTurns);
}

function drawRoundedRectangle(
  context: CanvasRenderingContext2D,
  start: RasterPoint,
  end: RasterPoint,
  requestedRadius: number,
  fill: boolean,
): void {
  const bounds = getBounds(start, end);
  const radius = clamp(requestedRadius, 0, Math.min(bounds.width / 2, bounds.height / 2));
  context.beginPath();
  context.moveTo(bounds.left + radius, bounds.top);
  context.lineTo(bounds.right - radius, bounds.top);
  context.quadraticCurveTo(bounds.right, bounds.top, bounds.right, bounds.top + radius);
  context.lineTo(bounds.right, bounds.bottom - radius);
  context.quadraticCurveTo(bounds.right, bounds.bottom, bounds.right - radius, bounds.bottom);
  context.lineTo(bounds.left + radius, bounds.bottom);
  context.quadraticCurveTo(bounds.left, bounds.bottom, bounds.left, bounds.bottom - radius);
  context.lineTo(bounds.left, bounds.top + radius);
  context.quadraticCurveTo(bounds.left, bounds.top, bounds.left + radius, bounds.top);
  context.closePath();
  paintPath(context, fill);
}

function drawPolyline(context: CanvasRenderingContext2D, points: readonly RasterPoint[]): void {
  if (points.length < 2) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.stroke();
}

function drawBezier(context: CanvasRenderingContext2D, start: RasterPoint, end: RasterPoint): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const curve = Math.min(160, distance * 0.24);
  const normalX = (-dy / distance) * curve;
  const normalY = (dx / distance) * curve;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.bezierCurveTo(
    start.x + dx / 3 + normalX,
    start.y + dy / 3 + normalY,
    start.x + (dx * 2) / 3 + normalX,
    start.y + (dy * 2) / 3 + normalY,
    end.x,
    end.y,
  );
  context.stroke();
}

function drawPolygon(context: CanvasRenderingContext2D, start: RasterPoint, end: RasterPoint, sides: number, fill: boolean): void {
  drawRegularShape(context, start, end, clamp(Math.round(sides), 3, 64), false, fill);
}

function drawStar(context: CanvasRenderingContext2D, start: RasterPoint, end: RasterPoint, pointCount: number, fill: boolean): void {
  drawRegularShape(context, start, end, clamp(Math.round(pointCount), 3, 64), true, fill);
}

function drawRegularShape(
  context: CanvasRenderingContext2D,
  start: RasterPoint,
  end: RasterPoint,
  count: number,
  star: boolean,
  fill: boolean,
): void {
  const bounds = getBounds(start, end);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const radiusX = Math.max(0.5, bounds.width / 2);
  const radiusY = Math.max(0.5, bounds.height / 2);
  const vertexCount = star ? count * 2 : count;
  context.beginPath();
  const firstPoint = getRegularShapePoint(0, vertexCount, centerX, centerY, radiusX, radiusY, star);
  context.moveTo(firstPoint.x, firstPoint.y);
  for (let index = 1; index < vertexCount; index++) {
    const point = getRegularShapePoint(index, vertexCount, centerX, centerY, radiusX, radiusY, star);
    context.lineTo(point.x, point.y);
  }
  context.closePath();
  paintPath(context, fill);
}

function getRegularShapePoint(
  index: number,
  vertexCount: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  star: boolean,
): RasterPoint {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / vertexCount;
  const radius = star && index % 2 === 1 ? 0.48 : 1;
  return { x: centerX + Math.cos(angle) * radiusX * radius, y: centerY + Math.sin(angle) * radiusY * radius };
}

function drawSpiral(context: CanvasRenderingContext2D, start: RasterPoint, end: RasterPoint, requestedTurns: number): void {
  const bounds = getBounds(start, end);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const radiusX = Math.max(0.5, bounds.width / 2);
  const radiusY = Math.max(0.5, bounds.height / 2);
  const turns = clamp(requestedTurns, 1, 12);
  const samples = Math.max(48, Math.min(576, turns * 48));
  context.beginPath();
  context.moveTo(centerX, centerY);
  for (let index = 1; index <= samples; index++) {
    const progress = index / samples;
    const angle = progress * turns * Math.PI * 2;
    const point = {
      x: centerX + Math.cos(angle) * radiusX * progress,
      y: centerY + Math.sin(angle) * radiusY * progress,
    };
    context.lineTo(point.x, point.y);
  }
  context.stroke();
}

function paintPath(context: CanvasRenderingContext2D, fill: boolean): void {
  if (fill) context.fill();
  context.stroke();
}

function getBounds(start: RasterPoint, end: RasterPoint): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
