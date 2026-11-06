import test from 'node:test';
import assert from 'node:assert/strict';
import { createRulerGeometry } from '../packages/ui/src/features/comics/RulerGeometry.ts';

const modes = ['linear', 'curved', 'perspective', 'fisheye', 'parallel', 'radial', 'concentric'];

test('every ruler mode returns drawable finite paths', () => {
  for (const mode of modes) {
    const geometry = createRulerGeometry(mode, 1280, 720);
    assert.ok(geometry.paths.length > 0, `${mode} should provide paths`);
    assert.ok(geometry.paths.every((path) => path.points.length > 1), `${mode} paths need at least two points`);
    assert.ok(geometry.paths.every((path) => path.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))), `${mode} points must be finite`);
  }
});

test('perspective, fisheye, radial and concentric modes provide their expected guides', () => {
  assert.equal(createRulerGeometry('linear', 1000, 800).paths.length, 2);
  assert.equal(createRulerGeometry('curved', 1000, 800).paths.length, 7);
  assert.ok(createRulerGeometry('perspective', 1000, 800).paths.length >= 8);
  assert.ok(createRulerGeometry('fisheye', 1000, 800).paths.length > createRulerGeometry('radial', 1000, 800).paths.length);
  assert.ok(createRulerGeometry('concentric', 1000, 800).paths.every((path) => path.closed === true));
});

test('ruler center is clamped to document bounds', () => {
  const geometry = createRulerGeometry('radial', 320, 240, -50, 999);
  const originPoints = geometry.paths.map((path) => path.points[0]);
  assert.ok(originPoints.every((point) => point.x >= 0 && point.x <= 320));
  assert.ok(originPoints.every((point) => point.y >= 0 && point.y <= 240));
});
