import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let translateVectorShapes;

before(async () => {
  vite = await createViteTestServer();
  ({ translateVectorShapes } = await vite.ssrLoadModule('/packages/ui/src/tools/LayerTransformGeometry.ts'));
});

after(async () => {
  await vite?.close();
});

test('moves vector shapes and their absolute Bézier handles without mutating the original', () => {
  const original = [{
    id: 'shape-1', kind: 'path', x: 10, y: 20, width: 30, height: 40,
    color: '#000000', opacity: 1, strokeWidth: 1,
    points: [{ x: 12, y: 22, inX: 8, inY: 18, outX: 16, outY: 26 }],
  }];
  const moved = translateVectorShapes(original, 5, -3);

  assert.deepEqual(
    { x: moved[0].x, y: moved[0].y, point: moved[0].points[0] },
    { x: 15, y: 17, point: { x: 17, y: 19, inX: 13, inY: 15, outX: 21, outY: 23 } },
  );
  assert.equal(original[0].x, 10);
  assert.equal(original[0].points[0].outX, 16);
});

test('keeps optional vector points absent when moving primitive shapes', () => {
  const moved = translateVectorShapes([{
    id: 'shape-2', kind: 'rectangle', x: 4, y: 7, width: 10, height: 12,
    color: '#000000', opacity: 1, strokeWidth: 1,
  }], -2, 6);
  assert.equal(moved[0].x, 2);
  assert.equal(moved[0].y, 13);
  assert.equal(moved[0].points, undefined);
});
