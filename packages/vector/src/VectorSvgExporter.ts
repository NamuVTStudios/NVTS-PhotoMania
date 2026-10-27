import type { VectorShape } from '@nvts/shared';

function escapeSvgText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getShapeTransform(shape: VectorShape): string {
  if (!shape.rotation) return '';
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;
  return ` transform="rotate(${shape.rotation} ${centerX} ${centerY})"`;
}

function getShapeStyle(shape: VectorShape, forceNoFill = false): string {
  const fill = getShapeFill(shape, forceNoFill);
  const stroke = getShapeStroke(shape);
  const dash = getShapeDash(shape);
  return `fill="${escapeSvgText(fill)}" stroke="${escapeSvgText(stroke)}" stroke-width="${shape.strokeWidth}" stroke-linecap="${shape.lineCap ?? 'round'}" stroke-linejoin="${shape.lineJoin ?? 'round'}"${dash} opacity="${shape.opacity}"`;
}

function getShapeFill(shape: VectorShape, forceNoFill: boolean): string {
  if (forceNoFill) return 'none';
  const noFillKinds: VectorShape['kind'][] = ['line', 'polyline', 'bezier', 'freehand', 'spiral'];
  if (shape.fillEnabled ?? !noFillKinds.includes(shape.kind)) return shape.fillColor ?? shape.color;
  return 'none';
}

function getShapeStroke(shape: VectorShape): string {
  const defaultStrokeKinds: VectorShape['kind'][] = ['line', 'polyline', 'bezier', 'freehand', 'spiral'];
  if (!(shape.strokeEnabled ?? defaultStrokeKinds.includes(shape.kind)) || shape.strokeWidth <= 0) return 'none';
  return shape.strokeColor ?? shape.color;
}

function getShapeDash(shape: VectorShape): string {
  if (shape.strokeDash === 'dash') return ` stroke-dasharray="${Math.max(4, shape.strokeWidth * 3)} ${Math.max(3, shape.strokeWidth * 2)}"`;
  if (shape.strokeDash === 'dot') return ` stroke-dasharray="1 ${Math.max(3, shape.strokeWidth * 2)}"`;
  return '';
}

function starPoints(shape: VectorShape, centerX: number, centerY: number): string {
  const count = Math.max(3, Math.min(64, shape.starPoints ?? 5));
  const outer = Math.min(Math.abs(shape.width), Math.abs(shape.height)) / 2;
  const inner = outer * 0.44;
  return Array.from({ length: count * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = Math.PI * index / count - Math.PI / 2;
    return `${centerX + Math.cos(angle) * radius},${centerY + Math.sin(angle) * radius}`;
  }).join(' ');
}

function spiralPath(shape: VectorShape, centerX: number, centerY: number): string {
  return Array.from({ length: 361 }, (_, index) => {
    const t = index / 360;
    const angle = t * Math.PI * 9;
    const radius = Math.min(Math.abs(shape.width), Math.abs(shape.height)) / 2 * t;
    return `${index ? 'L' : 'M'} ${centerX + Math.cos(angle) * radius} ${centerY + Math.sin(angle) * radius}`;
  }).join(' ');
}

function pathData(shape: VectorShape): string {
  const points = shape.points ?? [{ x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y + shape.height }];
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index++) path += getPathSegment(shape, points[index - 1], points[index]);
  return closePolygonPath(path, shape.kind);
}

function getPathSegment(shape: VectorShape, previous: NonNullable<VectorShape['points']>[number], next: NonNullable<VectorShape['points']>[number]): string {
  if (!hasBezierHandles(shape, previous, next)) return ` L ${next.x} ${next.y}`;
  return ` C ${previous.outX ?? previous.x} ${previous.outY ?? previous.y} ${next.inX ?? next.x} ${next.inY ?? next.y} ${next.x} ${next.y}`;
}

function hasBezierHandles(shape: VectorShape, previous: NonNullable<VectorShape['points']>[number], next: NonNullable<VectorShape['points']>[number]): boolean {
  return shape.kind === 'bezier' && (previous.outX !== undefined || next.inX !== undefined);
}

function closePolygonPath(path: string, kind: VectorShape['kind']): string {
  if (kind !== 'polygon') return path;
  return `${path} Z`;
}

type SvgContext = { centerX: number; centerY: number; style: string; transform: string };
type ShapeRenderer = (shape: VectorShape, context: SvgContext) => string;

function renderPath(shape: VectorShape, context: SvgContext): string {
  return `<path d="${pathData(shape)}" ${context.style}${context.transform}/>`;
}

function renderText(shape: VectorShape, style: string, transform: string): string {
  const fontSize = shape.fontSize ?? 64;
  const fontFamily = escapeSvgText(shape.fontFamily ?? 'Arial');
  const text = escapeSvgText(shape.text ?? 'Texto vectorial');
  const anchor = getTextAnchor(shape.textAlign);
  return `<text x="${shape.x}" y="${shape.y + Math.max(1, fontSize)}" font-family="${fontFamily}" font-size="${fontSize}" font-weight="${shape.fontWeight ?? 'normal'}" font-style="${shape.fontStyle ?? 'normal'}" text-anchor="${anchor}" ${style}${transform}>${text}</text>`;
}

function getTextAnchor(alignment: VectorShape['textAlign']): string {
  if (alignment === 'center') return 'middle';
  if (alignment === 'right') return 'end';
  return 'start';
}

const SHAPE_RENDERERS: Record<VectorShape['kind'], ShapeRenderer> = {
  rectangle: (shape, { style, transform }) => `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" ${style}${transform}/>`,
  'rounded-rectangle': (shape, { style, transform }) => `<rect x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" rx="${shape.cornerRadius ?? 20}" ${style}${transform}/>`,
  ellipse: (shape, { centerX, centerY, style, transform }) => `<ellipse cx="${centerX}" cy="${centerY}" rx="${Math.abs(shape.width / 2)}" ry="${Math.abs(shape.height / 2)}" ${style}${transform}/>`,
  line: (shape, { style, transform }) => `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + shape.width}" y2="${shape.y + shape.height}" ${style}${transform}/>`,
  polygon: renderPath,
  polyline: renderPath,
  bezier: renderPath,
  freehand: renderPath,
  star: (shape, { centerX, centerY, style, transform }) => `<polygon points="${starPoints(shape, centerX, centerY)}" ${style}${transform}/>`,
  spiral: (shape, { centerX, centerY, transform }) => `<path d="${spiralPath(shape, centerX, centerY)}" ${getShapeStyle(shape, true)}${transform}/>`,
  text: (shape, { style, transform }) => renderText(shape, style, transform),
};

/** Serializes one native vector shape as SVG while dispatching by its shape strategy. */
export function exportVectorShapeToSvg(shape: VectorShape): string {
  const context = {
    centerX: shape.x + shape.width / 2,
    centerY: shape.y + shape.height / 2,
    transform: getShapeTransform(shape),
    style: getShapeStyle(shape),
  };
  return SHAPE_RENDERERS[shape.kind](shape, context);
}
