import type { VectorKind, VectorShape } from '@nvts/shared';

type PaintOptions = { fill: boolean; stroke: boolean; strokeWidth: number };
type PathPainter = (close?: boolean) => void;
type VectorPoint = NonNullable<VectorShape['points']>[number];
type GeometryRenderer = (ctx: CanvasRenderingContext2D, shape: VectorShape, paint: PaintOptions, finish: PathPainter) => void;

const UNFILLED_KINDS = new Set<VectorKind>(['line', 'polyline', 'bezier', 'freehand', 'spiral']);

const GEOMETRY_RENDERERS: Record<VectorKind, GeometryRenderer> = {
  rectangle: (ctx, shape, _paint, finish) => { ctx.beginPath(); ctx.rect(shape.x, shape.y, shape.width, shape.height); finish(); },
  'rounded-rectangle': drawRoundedRectangle,
  ellipse: (ctx, shape, _paint, finish) => {
    ctx.beginPath();
    ctx.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, Math.abs(shape.width / 2), Math.abs(shape.height / 2), 0, 0, Math.PI * 2);
    finish();
  },
  line: (ctx, shape, _paint, finish) => {
    ctx.beginPath(); ctx.moveTo(shape.x, shape.y); ctx.lineTo(shape.x + shape.width, shape.y + shape.height); finish(false);
  },
  polygon: drawPath,
  polyline: drawPath,
  bezier: drawPath,
  freehand: drawPath,
  star: drawStar,
  spiral: drawSpiral,
  text: drawText,
};

export function renderVectorShape(ctx: CanvasRenderingContext2D, shape: VectorShape): void {
  const paint = getPaintOptions(shape);
  ctx.save();
  applyShapeStyles(ctx, shape);
  GEOMETRY_RENDERERS[shape.kind](ctx, shape, paint, (close = true) => finishPath(ctx, paint, close));
  ctx.restore();
}

function getPaintOptions(shape: VectorShape): PaintOptions {
  return {
    fill: shape.fillEnabled ?? !UNFILLED_KINDS.has(shape.kind),
    stroke: shape.strokeEnabled ?? UNFILLED_KINDS.has(shape.kind),
    strokeWidth: shape.strokeWidth,
  };
}

function applyShapeStyles(ctx: CanvasRenderingContext2D, shape: VectorShape): void {
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  ctx.globalAlpha = Math.max(0, Math.min(1, shape.opacity));
  ctx.translate(centerX, centerY);
  ctx.rotate(((shape.rotation ?? 0) * Math.PI) / 180);
  ctx.translate(-centerX, -centerY);
  ctx.fillStyle = shape.fillColor ?? shape.color ?? '#e03030';
  ctx.strokeStyle = shape.strokeColor ?? shape.color ?? '#e03030';
  ctx.lineWidth = Math.max(0, shape.strokeWidth);
  ctx.lineCap = shape.lineCap ?? 'round';
  ctx.lineJoin = shape.lineJoin ?? 'round';
  ctx.setLineDash(getLineDash(shape));
}

function getLineDash(shape: VectorShape): number[] {
  const width = shape.strokeWidth;
  const dashPatterns = {
    solid: () => [],
    dash: () => [Math.max(4, width * 3), Math.max(3, width * 2)],
    dot: () => [1, Math.max(3, width * 2)],
  };
  return dashPatterns[shape.strokeDash ?? 'solid']();
}

function finishPath(ctx: CanvasRenderingContext2D, paint: PaintOptions, close: boolean): void {
  if (close) ctx.closePath();
  if (paint.fill) ctx.fill();
  if (paint.stroke && paint.strokeWidth > 0) ctx.stroke();
}

function drawRoundedRectangle(ctx: CanvasRenderingContext2D, shape: VectorShape, _paint: PaintOptions, finish: PathPainter): void {
  const { x, y, width, height } = shape;
  const radius = Math.max(0, Math.min(shape.cornerRadius ?? 20, Math.abs(width) / 2, Math.abs(height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y); ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius); ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height); ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); finish();
}

function drawPath(ctx: CanvasRenderingContext2D, shape: VectorShape, _paint: PaintOptions, finish: PathPainter): void {
  const points = getPathPoints(shape);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) drawPathSegment(ctx, shape, points[index - 1], points[index]);
  finish(shape.kind === 'polygon');
}

function getPathPoints(shape: VectorShape): VectorPoint[] {
  if (shape.points?.length) return shape.points;
  return [{ x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y + shape.height }];
}

function drawPathSegment(ctx: CanvasRenderingContext2D, shape: VectorShape, previous: VectorPoint, next: VectorPoint): void {
  const hasBezierHandles = previous.outX !== undefined || next.inX !== undefined;
  if (shape.kind !== 'bezier' || !hasBezierHandles) { ctx.lineTo(next.x, next.y); return; }
  ctx.bezierCurveTo(previous.outX ?? previous.x, previous.outY ?? previous.y, next.inX ?? next.x, next.inY ?? next.y, next.x, next.y);
}

function drawStar(ctx: CanvasRenderingContext2D, shape: VectorShape, _paint: PaintOptions, finish: PathPainter): void {
  const spikes = Math.max(3, Math.min(64, Math.round(shape.starPoints ?? 5)));
  const outer = Math.min(Math.abs(shape.width), Math.abs(shape.height)) / 2;
  drawPolarPath(ctx, shape, spikes * 2, (index) => index % 2 === 0 ? outer : outer * 0.44, (index) => Math.PI * index / spikes - Math.PI / 2);
  finish();
}

function drawSpiral(ctx: CanvasRenderingContext2D, shape: VectorShape, _paint: PaintOptions, finish: PathPainter): void {
  const radius = Math.min(Math.abs(shape.width), Math.abs(shape.height)) / 2;
  ctx.beginPath();
  for (let index = 0; index <= 360; index++) {
    const progress = index / 360;
    const angle = progress * Math.PI * 9;
    const distance = radius * progress;
    const x = shape.x + shape.width / 2 + Math.cos(angle) * distance;
    const y = shape.y + shape.height / 2 + Math.sin(angle) * distance;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  finish(false);
}

function drawPolarPath(ctx: CanvasRenderingContext2D, shape: VectorShape, count: number, getRadius: (index: number) => number, getAngle: (index: number) => number): void {
  ctx.beginPath();
  for (let index = 0; index < count; index++) {
    const radius = getRadius(index);
    const angle = getAngle(index);
    const x = shape.x + shape.width / 2 + Math.cos(angle) * radius;
    const y = shape.y + shape.height / 2 + Math.sin(angle) * radius;
    if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}

function drawText(ctx: CanvasRenderingContext2D, shape: VectorShape, paint: PaintOptions): void {
  ctx.font = `${shape.fontStyle ?? 'normal'} ${shape.fontWeight ?? 'normal'} ${Math.max(1, shape.fontSize ?? 64)}px ${shape.fontFamily ?? 'Arial'}`;
  ctx.textAlign = shape.textAlign ?? 'left';
  ctx.textBaseline = 'top';
  const text = shape.text ?? 'Texto vectorial';
  const width = Math.max(1, shape.width);
  if (paint.fill) ctx.fillText(text, shape.x, shape.y, width);
  if (paint.stroke && paint.strokeWidth > 0) ctx.strokeText(text, shape.x, shape.y, width);
}
