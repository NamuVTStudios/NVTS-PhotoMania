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
    { id: 'styles', type: 'styles', enabled: true, styles: { stroke: { enabled: true, color: '#ff0000', size: 4, opacity: 1 }, outerGlow: { enabled: false, color: '#fff2a8', size: 12, opacity: 0.75 }, dropShadow: { enabled: false, color: '#000000', size: 8, distance: 6, angle: 45, opacity: 0.55 }, bevelEmboss: { enabled: false, size: 4, depth: 5, angle: 45, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', opacity: 0.7 }, gradientOverlay: { enabled: false, startColor: '#ff5e62', endColor: '#6a5af9', angle: 90, opacity: 1 }, innerShadow: { enabled: false, color: '#000000', size: 8, distance: 4, angle: 45, opacity: 0.55 } } },
  ];

  const clones = cloneLayerMasks(masks);
  assert.deepEqual(clones, masks);
  assert.notEqual(clones[0], masks[0]);
  assert.notEqual(clones[1].transparentColors, masks[1].transparentColors);
  assert.notEqual(clones[1].strokes, masks[1].strokes);
  assert.notEqual(clones[1].strokes[0].points[0], masks[1].strokes[0].points[0]);
  assert.notEqual(clones[2].filters, masks[2].filters);
  assert.notEqual(clones[2].filters[0], masks[2].filters[0]);
  assert.notEqual(clones[3].styles, masks[3].styles);
  assert.notEqual(clones[3].styles.stroke, masks[3].styles.stroke);
});

test('devuelve una lista vacía cuando no hay máscaras', () => {
  assert.deepEqual(cloneLayerMasks(undefined), []);
});

test('mantiene una etiqueta exhaustiva para cada tipo de máscara', () => {
  assert.deepEqual(
    ['transform', 'colorize', 'filter', 'styles'].map(getLayerMaskLabel),
    ['transformación', 'colorización', 'filtro', 'estilos'],
  );
});

test('crea cada máscara con sus valores iniciales explícitos', () => {
  const transform = createLayerMask('transform', 't');
  const colorize = createLayerMask('colorize', 'c');
  const filter = createLayerMask('filter', 'f');
  const styles = createLayerMask('styles', 's');
  assert.deepEqual(transform, { id: 't', type: 'transform', enabled: true, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, shearX: 0, shearY: 0 });
  assert.deepEqual(colorize, { id: 'c', type: 'colorize', enabled: true, editStrokes: true, showOutput: true, gapClose: 0, threshold: 0.4, limitToLayerBounds: true, transparentColors: [], strokes: [] });
  assert.deepEqual(filter, { id: 'f', type: 'filter', enabled: true, filters: [{ kind: 'grayscale', strength: 1 }] });
  assert.equal(styles.id, 's');
  assert.equal(styles.type, 'styles');
  assert.equal(styles.enabled, true);
  assert.deepEqual(Object.keys(styles.styles), ['stroke', 'outerGlow', 'dropShadow', 'bevelEmboss', 'gradientOverlay', 'innerShadow']);
});
