import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let createFilterCanvasPools;
let expandFilterTile;
let forEachFilterTile;
let readFilterTilePixels;

before(async () => {
  vite = await createViteTestServer();
  ({ createFilterCanvasPools, expandFilterTile, forEachFilterTile, readFilterTilePixels } = await vite.ssrLoadModule('/packages/image-processing/src/filters/FilterTileLayout.ts'));
});

after(async () => {
  await vite?.close();
});

function addTileCoverage(coverage, tile, documentWidth) {
  for (let y = tile.y; y < tile.y + tile.height; y++) addTileCoverageRow(coverage, tile, documentWidth, y);
}

function addTileCoverageRow(coverage, tile, documentWidth, y) {
  for (let x = tile.x; x < tile.x + tile.width; x++) coverage[y * documentWidth + x]++;
}

test('divide el documento en mosaicos sin huecos ni solapamientos', () => {
  const tiles = [];
  forEachFilterTile(5, 3, 2, (tile) => tiles.push(tile));
  assert.deepEqual(tiles, [
    { x: 0, y: 0, width: 2, height: 2 }, { x: 2, y: 0, width: 2, height: 2 }, { x: 4, y: 0, width: 1, height: 2 },
    { x: 0, y: 2, width: 2, height: 1 }, { x: 2, y: 2, width: 2, height: 1 }, { x: 4, y: 2, width: 1, height: 1 },
  ]);
  const coverage = new Array(15).fill(0);
  for (const tile of tiles) addTileCoverage(coverage, tile, 5);
  assert.ok(coverage.every((count) => count === 1));
});

test('expande mosaicos con padding y limita los bordes al documento', () => {
  assert.deepEqual(expandFilterTile({ x: 4, y: 2, width: 1, height: 1 }, 2, 5, 3), { x: 2, y: 0, width: 3, height: 3 });
  assert.deepEqual(expandFilterTile({ x: 2, y: 2, width: 2, height: 2 }, 1, 10, 10), { x: 1, y: 1, width: 4, height: 4 });
});

test('recorta el área original desde el mosaico expandido y crea pools aislados', () => {
  let requested;
  const pixels = Uint8ClampedArray.from({ length: 16 }, (_, index) => index);
  const context = { getImageData: (x, y, width, height) => { requested = { x, y, width, height }; return { data: pixels }; } };
  const tile = { x: 4, y: 3, width: 2, height: 2 };
  const expanded = { x: 3, y: 2, width: 4, height: 4 };
  const poolsA = createFilterCanvasPools();
  const poolsB = createFilterCanvasPools();
  assert.deepEqual([...readFilterTilePixels(context, tile, expanded)], [...pixels]);
  assert.deepEqual(requested, { x: 1, y: 1, width: 2, height: 2 });
  assert.notEqual(poolsA.target, poolsB.target);
  assert.deepEqual(Object.keys(poolsA), ['target', 'layer', 'filterSource', 'filterResult']);
});
