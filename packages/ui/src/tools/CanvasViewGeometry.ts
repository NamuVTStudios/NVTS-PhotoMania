export type CanvasFitSize = { width: number; height: number; scale: number };

/** Returns a centered document size that fits inside the stage without changing its aspect ratio. */
export function getCanvasFitSize(
  stageWidth: number,
  stageHeight: number,
  documentWidth: number,
  documentHeight: number,
  inset = 24,
): CanvasFitSize | null {
  if (![stageWidth, stageHeight, documentWidth, documentHeight, inset].every(Number.isFinite)) return null;
  if (stageWidth <= 0 || stageHeight <= 0 || documentWidth <= 0 || documentHeight <= 0) return null;
  const availableWidth = Math.max(1, stageWidth - inset * 2);
  const availableHeight = Math.max(1, stageHeight - inset * 2);
  const scale = Math.min(availableWidth / documentWidth, availableHeight / documentHeight);
  return { width: documentWidth * scale, height: documentHeight * scale, scale };
}
