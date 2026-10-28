import { getVectorShapeBounds, type VectorShape } from '@nvts/shared';

export type VectorPoint2D = { x: number; y: number };
export type VectorRect = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
export type DocumentDisplayTransform = { left: number; top: number; scale: number };
export type VectorSelectionFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  rotation: number;
};

/** Computes the selection frame from the object's own center, independent of viewport zoom and letterboxing. */
export function getVectorSelectionFrame(shape: VectorShape): VectorSelectionFrame {
  const bounds = getVectorShapeBounds(shape);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  return { ...bounds, centerX, centerY, rotation: shape.rotation ?? 0 };
}

/** Converts a document point into the object's unrotated selection-frame coordinates. */
export function vectorPointToFrame(point: VectorPoint2D, frame: VectorSelectionFrame): VectorPoint2D {
  const radians = -frame.rotation * Math.PI / 180;
  const dx = point.x - frame.centerX;
  const dy = point.y - frame.centerY;
  return {
    x: frame.centerX + dx * Math.cos(radians) - dy * Math.sin(radians),
    y: frame.centerY + dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

/** Uses the same rotated frame for hit testing and painting the selection outline. */
export function isPointInsideVectorSelectionFrame(point: VectorPoint2D, shape: VectorShape, padding = 0): boolean {
  const frame = getVectorSelectionFrame(shape);
  const local = vectorPointToFrame(point, frame);
  return local.x >= frame.x - padding
    && local.x <= frame.x + frame.width + padding
    && local.y >= frame.y - padding
    && local.y <= frame.y + frame.height + padding;
}

/** Tests the lower-right resize handle after the shape's own rotation is applied. */
export function isPointNearVectorResizeHandle(point: VectorPoint2D, shape: VectorShape, tolerance = 12): boolean {
  const frame = getVectorSelectionFrame(shape);
  const radians = frame.rotation * Math.PI / 180;
  const localX = frame.width / 2;
  const localY = frame.height / 2;
  const handle = {
    x: frame.centerX + localX * Math.cos(radians) - localY * Math.sin(radians),
    y: frame.centerY + localX * Math.sin(radians) + localY * Math.cos(radians),
  };
  return Math.hypot(point.x - handle.x, point.y - handle.y) <= tolerance;
}


export type VectorSelectionTarget = { shape: VectorShape; mode: 'move' | 'resize' };

/** Resolves the topmost object under the pointer before considering handles from objects behind it. */
export function findVectorSelectionTarget(
  point: VectorPoint2D,
  shapes: readonly VectorShape[],
  paddingForShape: (shape: VectorShape) => number = () => 0,
  handleTolerance = 14,
): VectorSelectionTarget | null {
  const candidates = [...shapes].reverse();
  const bodyHit = candidates.find((shape) =>
    isPointInsideVectorSelectionFrame(point, shape, paddingForShape(shape)),
  );
  if (bodyHit) {
    return { shape: bodyHit, mode: isPointNearVectorResizeHandle(point, bodyHit, handleTolerance) ? 'resize' : 'move' };
  }
  const handleHit = candidates.find((shape) => isPointNearVectorResizeHandle(point, shape, handleTolerance));
  if (!handleHit) return null;
  return { shape: handleHit, mode: 'resize' };
}

/** Converts a drag delta to the object's local coordinate system before resizing a rotated shape. */
export function vectorDeltaToLocal(dx: number, dy: number, rotation: number): VectorPoint2D {
  const radians = -rotation * Math.PI / 180;
  return {
    x: dx * Math.cos(radians) - dy * Math.sin(radians),
    y: dx * Math.sin(radians) + dy * Math.cos(radians),
  };
}

/** Matches pointer-to-document coordinate conversion, including centered object-fit letterboxing. */
export function getDocumentDisplayTransform(
  stageRect: VectorRect,
  canvasRect: VectorRect,
  documentWidth: number,
  documentHeight: number,
): DocumentDisplayTransform {
  const scale = Math.min(canvasRect.width / documentWidth, canvasRect.height / documentHeight);
  return {
    left: canvasRect.left - stageRect.left + (canvasRect.width - documentWidth * scale) / 2,
    top: canvasRect.top - stageRect.top + (canvasRect.height - documentHeight * scale) / 2,
    scale,
  };
}
