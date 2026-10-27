import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let cloneVectorShape;
let cloneVectorShapes;

before(async () => {
  vite = await createViteTestServer();
  ({ cloneVectorShape, cloneVectorShapes } = await vite.ssrLoadModule('/packages/shared/src/vectorShapes.ts'));
});

after(async () => {
  await vite?.close();
});

test('clona puntos y manejadores Bezier sin compartir referencias', () => {
  const shape = {
    id: 'bezier', kind: 'bezier', x: 1, y: 2, width: 30, height: 40,
    color: '#000000', opacity: 1, strokeWidth: 2,
    points: [{ x: 3, y: 4, inX: 2, inY: 3, outX: 5, outY: 6 }],
  };
  const clone = cloneVectorShape(shape);
  assert.deepEqual(clone, shape);
  assert.notEqual(clone.points, shape.points);
  assert.notEqual(clone.points[0], shape.points[0]);
  clone.points[0].outX = 99;
  assert.equal(shape.points[0].outX, 5);
});

test('clona listas de formas y normaliza una lista ausente a vacía', () => {
  const shapes = [{ id: 'rect', kind: 'rectangle', x: 0, y: 0, width: 1, height: 1, color: '#000', opacity: 1, strokeWidth: 0 }];
  const clones = cloneVectorShapes(shapes);
  assert.deepEqual(clones, [{ ...shapes[0], points: undefined }]);
  assert.notEqual(clones[0], shapes[0]);
  assert.deepEqual(cloneVectorShapes(undefined), []);
});
