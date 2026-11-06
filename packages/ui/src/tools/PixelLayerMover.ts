export interface PixelMoveSurface {
  width(): number;
  height(): number;
  readRectToJS(x: number, y: number, width: number, height: number, target: Uint8Array): boolean;
  writeRectFromJS(x: number, y: number, width: number, height: number, pixels: Uint8Array): boolean;
}

const DEFAULT_TILE_SIZE = 256;

/** Moves a raster surface without wrapping pixels or allocating empty tiles. */
export function movePixelSurface(
  surface: PixelMoveSurface,
  deltaX: number,
  deltaY: number,
  tileSize = DEFAULT_TILE_SIZE,
): void {
  const width = surface.width();
  const height = surface.height();
  if (width <= 0 || height <= 0) return;
  const dx = Math.trunc(deltaX);
  const dy = Math.trunc(deltaY);
  if (dx === 0 && dy === 0) return;
  if (Math.abs(dx) >= width || Math.abs(dy) >= height) return clearSurface(surface, width, height, tileSize);
  const rowBytes = width * 4;
  const source = new Uint8Array(rowBytes);
  const shifted = new Uint8Array(rowBytes);
  const tilesX = Math.ceil(width / tileSize);
  const originalChunks = new Uint8Array(height * tilesX);
  const start = dy > 0 ? height - 1 : 0;
  const end = dy > 0 ? -1 : height;
  const step = dy > 0 ? -1 : 1;
  for (let y = start; y !== end; y += step) {
    moveRow(surface, y, dx, dy, source, shifted, width, tileSize, tilesX, originalChunks);
  }
  clearExposedRows(surface, width, height, dy, tileSize, tilesX, originalChunks);
}

function moveRow(
  surface: PixelMoveSurface,
  y: number,
  dx: number,
  dy: number,
  source: Uint8Array,
  shifted: Uint8Array,
  width: number,
  tileSize: number,
  tilesX: number,
  originalChunks: Uint8Array,
): void {
  if (!surface.readRectToJS(0, y, width, 1, source)) throw new Error('No se pudo leer una fila de la capa.');
  markOriginalRow(source, y, width, tileSize, tilesX, originalChunks);
  shifted.fill(0);
  const copyWidth = width - Math.abs(dx);
  const sourceX = dx < 0 ? -dx : 0;
  const targetX = dx > 0 ? dx : 0;
  shifted.set(source.subarray(sourceX * 4, (sourceX + copyWidth) * 4), targetX * 4);
  const targetY = y + dy;
  if (targetY < 0 || targetY >= surface.height()) return;
  writeShiftedChunks(surface, targetY, shifted, width, tileSize, tilesX, originalChunks);
}

function markOriginalRow(
  source: Uint8Array,
  y: number,
  width: number,
  tileSize: number,
  tilesX: number,
  originalChunks: Uint8Array,
): void {
  for (let tileX = 0; tileX < tilesX; tileX++) {
    markOriginalChunk(source, y, width, tileSize, tileX, tilesX, originalChunks);
  }
}

function markOriginalChunk(
  source: Uint8Array,
  y: number,
  width: number,
  tileSize: number,
  tileX: number,
  tilesX: number,
  originalChunks: Uint8Array,
): void {
  const startX = tileX * tileSize;
  const chunkWidth = Math.min(tileSize, width - startX);
  originalChunks[y * tilesX + tileX] = hasPixelData(source, startX * 4, chunkWidth * 4) ? 1 : 0;
}

function writeShiftedChunks(
  surface: PixelMoveSurface,
  targetY: number,
  shifted: Uint8Array,
  width: number,
  tileSize: number,
  tilesX: number,
  originalChunks: Uint8Array,
): void {
  for (let tileX = 0; tileX < tilesX; tileX++) {
    writeShiftedChunk(surface, targetY, shifted, width, tileSize, tileX, tilesX, originalChunks);
  }
}

function writeShiftedChunk(
  surface: PixelMoveSurface,
  targetY: number,
  shifted: Uint8Array,
  width: number,
  tileSize: number,
  tileX: number,
  tilesX: number,
  originalChunks: Uint8Array,
): void {
  const startX = tileX * tileSize;
  const chunkWidth = Math.min(tileSize, width - startX);
  const offset = startX * 4;
  const byteLength = chunkWidth * 4;
  const hasOutput = hasPixelData(shifted, offset, byteLength);
  const hadDestination = originalChunks[targetY * tilesX + tileX] === 1;
  if (!hasOutput && !hadDestination) return;
  const row = shifted.subarray(offset, offset + byteLength);
  if (!surface.writeRectFromJS(startX, targetY, chunkWidth, 1, row)) {
    throw new Error('No se pudo escribir una fila movida de la capa.');
  }
}

function clearExposedRows(
  surface: PixelMoveSurface,
  width: number,
  height: number,
  dy: number,
  tileSize: number,
  tilesX: number,
  originalChunks: Uint8Array,
): void {
  const clearCount = Math.abs(dy);
  const firstY = dy > 0 ? 0 : height - clearCount;
  const emptyRow = new Uint8Array(width * 4);
  for (let index = 0; index < clearCount; index++) {
    clearOriginalRow(surface, firstY + index, width, tileSize, tilesX, originalChunks, emptyRow);
  }
}

function clearOriginalRow(
  surface: PixelMoveSurface,
  y: number,
  width: number,
  tileSize: number,
  tilesX: number,
  originalChunks: Uint8Array,
  emptyRow: Uint8Array,
): void {
  for (let tileX = 0; tileX < tilesX; tileX++) {
    clearOriginalChunk(surface, y, width, tileSize, tileX, tilesX, originalChunks, emptyRow);
  }
}

function clearOriginalChunk(
  surface: PixelMoveSurface,
  y: number,
  width: number,
  tileSize: number,
  tileX: number,
  tilesX: number,
  originalChunks: Uint8Array,
  emptyRow: Uint8Array,
): void {
  if (originalChunks[y * tilesX + tileX] === 0) return;
  const startX = tileX * tileSize;
  const chunkWidth = Math.min(tileSize, width - startX);
  const emptyChunk = emptyRow.subarray(0, chunkWidth * 4);
  if (!surface.writeRectFromJS(startX, y, chunkWidth, 1, emptyChunk)) {
    throw new Error('No se pudo limpiar el borde de la capa.');
  }
}

function clearSurface(surface: PixelMoveSurface, width: number, height: number, tileSize: number): void {
  const tilesX = Math.ceil(width / tileSize);
  const originalChunks = new Uint8Array(height * tilesX);
  const source = new Uint8Array(width * 4);
  for (let y = 0; y < height; y++) {
    readOriginalRow(surface, y, width, source);
    markOriginalRow(source, y, width, tileSize, tilesX, originalChunks);
  }
  const emptyRow = new Uint8Array(width * 4);
  for (let row = 0; row < height; row++) {
    clearOriginalRow(surface, row, width, tileSize, tilesX, originalChunks, emptyRow);
  }
}

function hasPixelData(source: Uint8Array, start: number, length: number): boolean {
  return source.subarray(start, start + length).some((value) => value !== 0);
}

function readOriginalRow(surface: PixelMoveSurface, y: number, width: number, source: Uint8Array): void {
  if (!surface.readRectToJS(0, y, width, 1, source)) throw new Error('No se pudo leer una fila de la capa.');
}
