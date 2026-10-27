import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let createComicSplitShapes;

before(async () => {
  vite = await createViteTestServer();
  ({ createComicSplitShapes } = await vite.ssrLoadModule('/packages/ui/src/features/comics/createComicSplitShapes.ts'));
});

after(async () => {
  await vite?.close();
});

test('creates a freehand divider from a drawn path and extends it to page edges', () => {
  const shapes = createComicSplitShapes(100, 200, [{ x: 20, y: 40 }, { x: 45, y: 90 }, { x: 70, y: 150 }], 1, 48, 5);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].kind, 'freehand');
  assert.ok((shapes[0].points?.length ?? 0) >= 3);
  assert.ok(shapes[0].points?.[0].x === 0 || shapes[0].points?.[0].x === 100 || shapes[0].points?.[0].y === 0 || shapes[0].points?.[0].y === 200);
  const last = shapes[0].points.at(-1);
  assert.ok(last.x === 0 || last.x === 100 || last.y === 0 || last.y === 200);
});

test('creates two parallel curved dividers with matching point counts', () => {
  const path = [{ x: 0, y: 20 }, { x: 30, y: 40 }, { x: 60, y: 80 }, { x: 100, y: 120 }];
  const shapes = createComicSplitShapes(100, 140, path, 2, 20, 5);
  assert.equal(shapes.length, 2);
  assert.ok(shapes.every((shape) => shape.kind === 'freehand'));
  assert.equal(shapes[0].points.length, shapes[1].points.length);
  assert.notDeepEqual(shapes[0].points, shapes[1].points);
});

test('clamps path points to the document and ignores duplicate points', () => {
  const shapes = createComicSplitShapes(100, 100, [{ x: -20, y: 50 }, { x: -20, y: 50 }, { x: 120, y: 60 }], 1, 48, 5);
  assert.equal(shapes.length, 1);
  assert.ok(shapes[0].points.every((point) => point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100));
});
