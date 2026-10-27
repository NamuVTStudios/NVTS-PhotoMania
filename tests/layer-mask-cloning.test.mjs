import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let cloneLayerMasks;
let getLayerMaskLabel;
let createLayerMask;

before(async () => {
  vite = await createViteTestServer();
  ({ cloneLayerMasks } = await vite.ssrLoadModule('/packages/shared/src/layerMasks.ts'));
  ({ createLayerMask } = await vite.ssrLoadModule('/packages/shared/src/layerMasks.ts'));
  ({ getLayerMaskLabel } = await vite.ssrLoadModule('/packages/shared/src/layerMaskLabels.ts'));
});

after(async () => {
  await vite?.close();
});

test('clona cada tipo de máscara y sus datos editables sin compartir referencias', () => {
  const masks = [
    { id: 'transform', type: 'transform', enabled: true, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, shearX: 0, shearY: 0 },
    { id: 'colorize', type: 'colorize', enabled: true, editStrokes: false, showOutput: true, limitToLayerBounds: true, gapClose: 0, threshold: 0.5, transparentColors: ['#ffffff'], strokes: [{ color: '#ff0000', radius: 3, points: [{ x: 1, y: 2 }] }] },
    { id: 'filter', type: 'filter', enabled: true, filters: [{ kind: 'blur', strength: 0.4 }] },
  ];

  const clones = cloneLayerMasks(masks);
  assert.deepEqual(clones, masks);
  assert.notEqual(clones[0], masks[0]);
  assert.notEqual(clones[1].transparentColors, masks[1].transparentColors);
  assert.notEqual(clones[1].strokes, masks[1].strokes);
  assert.notEqual(clones[1].strokes[0].points[0], masks[1].strokes[0].points[0]);
  assert.notEqual(clones[2].filters, masks[2].filters);
  assert.notEqual(clones[2].filters[0], masks[2].filters[0]);
});

test('devuelve una lista vacía cuando no hay máscaras', () => {
  assert.deepEqual(cloneLayerMasks(undefined), []);
});

test('mantiene una etiqueta exhaustiva para cada tipo de máscara', () => {
  assert.deepEqual(
    ['transform', 'colorize', 'filter'].map(getLayerMaskLabel),
    ['transformación', 'colorización', 'filtro'],
  );
});

test('crea cada máscara con sus valores iniciales explícitos', () => {
  const transform = createLayerMask('transform', 't');
  const colorize = createLayerMask('colorize', 'c');
  const filter = createLayerMask('filter', 'f');
  assert.deepEqual(transform, { id: 't', type: 'transform', enabled: true, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, shearX: 0, shearY: 0 });
  assert.deepEqual(colorize, { id: 'c', type: 'colorize', enabled: true, editStrokes: true, showOutput: true, gapClose: 0, threshold: 0.4, limitToLayerBounds: true, transparentColors: [], strokes: [] });
  assert.deepEqual(filter, { id: 'f', type: 'filter', enabled: true, filters: [{ kind: 'grayscale', strength: 1 }] });
});
