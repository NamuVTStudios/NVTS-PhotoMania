import test from 'node:test';
import assert from 'node:assert/strict';
import { eraseVectorStrokeAt } from '../packages/ui/src/app/VectorStrokeEraser.ts';

const line = (id, x1, y1, x2, y2) => ({ id, kind: 'line', x: x1, y: y1, width: x2 - x1, height: y2 - y1, color: '#000000', opacity: 1, strokeWidth: 2 });

test('vector eraser removes only the portion between nearest intersections', () => {
  const shapes = [line('target', 0, 10, 100, 10), line('cross-left', 30, 0, 30, 20), line('cross-right', 70, 0, 70, 20)];
  const result = eraseVectorStrokeAt(shapes, { x: 50, y: 10 }, 3, () => 'suffix');
  assert.ok(result);
  assert.equal(result.erasedBetweenIntersections, true);
  assert.deepEqual(result.shapes.map((shape) => shape.id), ['target', 'suffix', 'cross-left', 'cross-right']);
  assert.equal(result.shapes[0].kind, 'polyline');
  assert.deepEqual(result.shapes[0].points, [{ x: 0, y: 10 }, { x: 30, y: 10 }]);
  assert.deepEqual(result.shapes[1].points, [{ x: 70, y: 10 }, { x: 100, y: 10 }]);
});

test('vector eraser removes a complete isolated stroke when there are no intersections', () => {
  const result = eraseVectorStrokeAt([line('isolated', 0, 0, 100, 0)], { x: 40, y: 0 }, 4);
  assert.ok(result);
  assert.deepEqual(result.shapes, []);
  assert.equal(result.erasedBetweenIntersections, false);
});

test('vector eraser does not touch shapes when pointer is outside stroke radius', () => {
  assert.equal(eraseVectorStrokeAt([line('isolated', 0, 0, 100, 0)], { x: 40, y: 40 }, 3), null);
});
