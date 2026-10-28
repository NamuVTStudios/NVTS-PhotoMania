export type FilterCanvasPools = {
  target: HTMLCanvasElement[];
  layer: HTMLCanvasElement[];
  filterSource: HTMLCanvasElement[];
  filterResult: HTMLCanvasElement[];
};

export type FilterTile = { x: number; y: number; width: number; height: number };

export function createFilterCanvasPools(): FilterCanvasPools {
  return { target: [], layer: [], filterSource: [], filterResult: [] };
}

export function forEachFilterTile(
  width: number,
  height: number,
  tileSize: number,
  visit: (tile: FilterTile) => void,
): void {
  for (let y = 0; y < height; y += tileSize) visitFilterTileRow(width, height, y, tileSize, visit);
}

function visitFilterTileRow(width: number, height: number, y: number, tileSize: number, visit: (tile: FilterTile) => void): void {
  for (let x = 0; x < width; x += tileSize) visit(createFilterTile(x, y, tileSize, width, height));
}

function createFilterTile(x: number, y: number, tileSize: number, width: number, height: number): FilterTile {
  return { x, y, width: Math.min(tileSize, width - x), height: Math.min(tileSize, height - y) };
}

export function expandFilterTile(
  tile: FilterTile,
  padding: number,
  documentWidth: number,
  documentHeight: number,
): FilterTile {
  const x = Math.max(0, tile.x - padding);
  const y = Math.max(0, tile.y - padding);
  const right = Math.min(documentWidth, tile.x + tile.width + padding);
  const bottom = Math.min(documentHeight, tile.y + tile.height + padding);
  return { x, y, width: right - x, height: bottom - y };
}

export function readFilterTilePixels(
  context: CanvasRenderingContext2D,
  tile: FilterTile,
  expanded: FilterTile,
): Uint8Array {
  const image = context.getImageData(tile.x - expanded.x, tile.y - expanded.y, tile.width, tile.height);
  return new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
}


