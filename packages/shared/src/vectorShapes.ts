import type { VectorShape } from './nvtsphoto';

export function cloneVectorShape(shape: VectorShape): VectorShape {
  return { ...shape, points: shape.points?.map((point) => ({ ...point })) };
}

export function cloneVectorShapes(shapes: readonly VectorShape[] | undefined): VectorShape[] {
  return (shapes ?? []).map(cloneVectorShape);
}
