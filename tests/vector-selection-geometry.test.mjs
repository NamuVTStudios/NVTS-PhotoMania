import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let getVectorSelectionFrame;
let findVectorSelectionTarget;
let isPointInsideVectorSelectionFrame;
let isPointNearVectorResizeHandle;
let getVectorShapeBounds;
let remapVectorPoints;

before(async () => {
  vite = await createViteTestServer();
  ({ getVectorSelectionFrame, findVectorSelectionTarget, isPointInsideVectorSelectionFrame, isPointNearVectorResizeHandle } =
    await vite.ssrLoadModule('/packages/ui/src/app/VectorSelectionGeometry.ts'));
  ({ getVectorShapeBounds, remapVectorPoints } = await vite.ssrLoadModule('/packages/shared/src/vectorShapes.ts'));
});

after(async () => {
  await vite?.close();
});

const bezierShape = (rotation = 0) => ({
  id: 'curve-1', kind: 'bezier', x: 10, y: 20, width: 40, height: 30,
  color: '#111111', opacity: 1, strokeWidth: 2, rotation,
  points: [
    { x: 100, y: 80, outX: 120, outY: 70 },
    { x: 150, y: 110, inX: 155, inY: 120 },
  ],
});

test('centra el cuadro de selección con respecto a los nodos reales y manejadores Bezier', () => {
  const shape = bezierShape();
  const frame = getVectorSelectionFrame(shape);
  const bounds = getVectorShapeBounds(shape);
  assert.equal(bounds.x, 100);
  assert.ok(bounds.y > 78.6 && bounds.y < 78.8, 'La cota superior debe seguir la curva, no los manejadores.');
  assert.ok(bounds.width > 50 && bounds.width < 51);
  assert.ok(bounds.height > 32 && bounds.height < 33);
  assert.equal(frame.centerX, frame.x + frame.width / 2);
  assert.equal(frame.centerY, frame.y + frame.height / 2);
  assert.ok(frame.centerX > 125, 'El centro debe basarse en la geometría real de la curva.');
  assert.equal(isPointInsideVectorSelectionFrame({ x: frame.centerX, y: frame.centerY }, shape), true);
});

test('mantiene el tirador inferior derecho alineado después de rotar la forma', () => {
  const shape = bezierShape(90);
  const frame = getVectorSelectionFrame(shape);
  const radians = Math.PI / 2;
  const handle = {
    x: frame.centerX + (frame.width / 2) * Math.cos(radians) - (frame.height / 2) * Math.sin(radians),
    y: frame.centerY + (frame.width / 2) * Math.sin(radians) + (frame.height / 2) * Math.cos(radians),
  };
  assert.equal(isPointNearVectorResizeHandle(handle, shape, 1), true);
});

test('redimensiona nodos y manejadores sin mutar los puntos originales', () => {
  const points = bezierShape().points;
  const original = structuredClone(points);
  const resized = remapVectorPoints(points, { x: 100, y: 70, width: 55, height: 50 }, { x: 20, y: 30, width: 110, height: 100 });
  assert.deepEqual(points, original);
  assert.deepEqual(resized?.[0], { x: 20, y: 50, outX: 60, outY: 30 });
  assert.deepEqual(resized?.[1], { x: 120, y: 110, inX: 130, inY: 130 });
});


test('prioriza el objeto superior sobre un tirador de un objeto que queda detrás', () => {
  const bottom = { id: 'bottom', kind: 'rectangle', x: 0, y: 0, width: 100, height: 100, color: '#000000', opacity: 1, strokeWidth: 1 };
  const top = { id: 'top', kind: 'rectangle', x: 90, y: 90, width: 30, height: 30, color: '#ffffff', opacity: 1, strokeWidth: 1 };
  const target = findVectorSelectionTarget({ x: 100, y: 100 }, [bottom, top], () => 0, 14);
  assert.equal(target?.shape.id, 'top');
  assert.equal(target?.mode, 'move');
});

test('selecciona el tirador de redimensionamiento si no hay otro objeto bajo el puntero', () => {
  const shape = { id: 'solo', kind: 'rectangle', x: 10, y: 20, width: 80, height: 40, color: '#000000', opacity: 1, strokeWidth: 1 };
  const target = findVectorSelectionTarget({ x: 90, y: 60 }, [shape], () => 0, 1);
  assert.equal(target?.shape.id, 'solo');
  assert.equal(target?.mode, 'resize');
});
