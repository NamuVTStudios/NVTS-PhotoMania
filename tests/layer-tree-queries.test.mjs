import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let containsEnabledMask;
let containsLayerType;
let findTopRasterLayer;

before(async () => {
  vite = await createViteTestServer();
  ({ containsEnabledMask, containsLayerType, findTopRasterLayer } = await vite.ssrLoadModule('/packages/ui/src/LayerTreeQueries.ts'));
});

after(async () => {
  await vite?.close();
});

function layer(type, id, options = {}) {
  return { id, type, children: [], masks: [], ...options };
}

test('prioriza la capa de pintura superior antes que otras capas de píxeles', () => {
  const layers = [layer('paint', 'paint-bottom'), layer('file', 'file-top')];
  assert.equal(findTopRasterLayer(layers)?.id, 'paint-bottom');
});

test('busca capas de píxeles dentro de grupos cuando no hay pintura', () => {
  const group = layer('group', 'group', { children: [layer('file', 'nested-file')] });
  assert.equal(findTopRasterLayer([group])?.id, 'nested-file');
});

test('consulta tipos de capa y máscaras habilitadas a través del árbol', () => {
  const nested = layer('vector', 'vector', { masks: [{ id: 'mask', type: 'transform', enabled: true }] });
  const layers = [layer('group', 'group', { children: [nested] })];
  assert.equal(containsLayerType(layers, 'vector'), true);
  assert.equal(containsLayerType(layers, 'filter'), false);
  assert.equal(containsEnabledMask(layers, 'transform'), true);
  assert.equal(containsEnabledMask(layers, 'filter'), false);
});
