import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let BlendMode;
let blendModeFromManifest;
let blendModeToManifest;

before(async () => {
  vite = await createViteTestServer();
  ({ BlendMode, blendModeFromManifest, blendModeToManifest } = await vite.ssrLoadModule('/packages/wasm-bindings/ts-wrapper/BlendMode.ts'));
});

after(async () => {
  await vite?.close();
});

test('mantiene un mapeo reversible entre el motor y el manifest', () => {
  const modes = [
    ['normal', BlendMode.Normal],
    ['multiply', BlendMode.Multiply],
    ['screen', BlendMode.Screen],
    ['overlay', BlendMode.Overlay],
  ];

  for (const [name, value] of modes) {
    assert.equal(blendModeFromManifest(name), value);
    assert.equal(blendModeToManifest(value), name);
  }
});

test('conserva el modo normal como fallback de valores desconocidos', () => {
  assert.equal(blendModeFromManifest('unexpected-mode'), BlendMode.Normal);
  assert.equal(blendModeToManifest(99), 'normal');
});
