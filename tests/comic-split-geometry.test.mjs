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

function getEndpoints(shape) {
  if (shape.points?.length >= 2) return [shape.points[0], shape.points[shape.points.length - 1]];
  return [
    { x: shape.x, y: shape.y },
    { x: shape.x + shape.width, y: shape.y + shape.height },
  ];
}

function slope(points) {
  return (points[1].y - points[0].y) / (points[1].x - points[0].x);
}

function onPageEdge(point, width, height) {
  return Math.abs(point.x) < 0.000001 || Math.abs(point.x - width) < 0.000001
    || Math.abs(point.y) < 0.000001 || Math.abs(point.y - height) < 0.000001;
}

function distanceBetweenParallelLines(first, second) {
  const dx = first[1].x - first[0].x;
  const dy = first[1].y - first[0].y;
  return Math.abs(dx * (first[0].y - second[0].y) - (first[0].x - second[0].x) * dy)
    / Math.hypot(dx, dy);
}

test('creates a straight divider from the gesture endpoints and extends it to page edges', () => {
  const shapes = createComicSplitShapes(100, 200, [{ x: 20, y: 40 }, { x: 45, y: 90 }, { x: 70, y: 150 }], 1, 48, 5);
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].kind, 'freehand');
  const [start, end] = getEndpoints(shapes[0]);
  assert.ok(onPageEdge(start, 100, 200));
  assert.ok(onPageEdge(end, 100, 200));
  assert.ok(Math.abs((end.y - start.y) / (end.x - start.x) - 2.2) < 0.000001);
});

test('creates two straight parallel dividers separated by the configured distance', () => {
  const path = [{ x: 0, y: 20 }, { x: 30, y: 40 }, { x: 60, y: 80 }, { x: 100, y: 120 }];
  const shapes = createComicSplitShapes(100, 140, path, 2, 20, 5);
  assert.equal(shapes.length, 2);
  assert.ok(shapes.every((shape) => shape.kind === 'freehand' && shape.points.length === 2));
  const first = getEndpoints(shapes[0]);
  const second = getEndpoints(shapes[1]);
  assert.ok(onPageEdge(first[0], 100, 140));
  assert.ok(onPageEdge(first[1], 100, 140));
  assert.ok(onPageEdge(second[0], 100, 140));
  assert.ok(onPageEdge(second[1], 100, 140));
  assert.ok(Math.abs(slope(first) - slope(second)) < 0.000001);
  assert.ok(Math.abs(distanceBetweenParallelLines(first, second) - 20) < 0.000001);
});

test('clamps path points to the document and ignores duplicate points', () => {
  const shapes = createComicSplitShapes(100, 100, [{ x: -20, y: 50 }, { x: -20, y: 50 }, { x: 120, y: 60 }], 1, 48, 5);
  assert.equal(shapes.length, 1);
  const endpoints = getEndpoints(shapes[0]);
  assert.ok(endpoints.every((point) => point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100));
});
