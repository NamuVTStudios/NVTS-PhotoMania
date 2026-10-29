import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let preserveEditorPanels;

before(async () => {
  vite = await createViteTestServer();
  ({ preserveEditorPanels } = await vite.ssrLoadModule('/packages/ui/src/managers/DockLayoutManager.ts'));
});

after(async () => {
  await vite?.close();
});

test('reconstruir el dock conserva los paneles de edición como hijos', () => {
  const filtersPanel = { id: 'filters-panel' };
  const effectsPanel = { id: 'effects-panel' };
  const layerSlot = { id: 'layers-slot' };
  const dock = {
    querySelectorAll(selector) {
      assert.equal(selector, ':scope > .editor-panel');
      return [filtersPanel, effectsPanel];
    },
  };

  assert.deepEqual(preserveEditorPanels(dock, [layerSlot]), [layerSlot, filtersPanel, effectsPanel]);
});
