import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let Panel;

before(async () => {
  vite = await createViteTestServer();
  ({ Panel } = await vite.ssrLoadModule('/packages/ui/src/panels/Panel.ts'));
});

after(async () => {
  await vite?.close();
});

test('Panel encapsula visibilidad y ofrece la API compartida show/hide', () => {
  const attributes = new Map();
  const element = {
    id: 'test-panel',
    hidden: true,
    setAttribute(name, value) { attributes.set(name, value); },
  };
  const root = { querySelector(selector) { return selector === '#test-panel' ? element : null; } };
  class TestPanel extends Panel {
    mount() {}
  }

  const panel = new TestPanel(root, '#test-panel');
  assert.equal(panel.id, 'test-panel');
  assert.equal(panel.visible, false);
  panel.show();
  assert.equal(panel.visible, true);
  assert.equal(attributes.get('aria-hidden'), 'false');
  panel.hide();
  assert.equal(panel.visible, false);
  assert.equal(attributes.get('aria-hidden'), 'true');
});

test('Panel falla rápido cuando no encuentra el elemento raíz', () => {
  class TestPanel extends Panel {
    mount() {}
  }
  assert.throws(() => new TestPanel({ querySelector() { return null; } }, '#missing'), /No se encontró el panel requerido/);
});
