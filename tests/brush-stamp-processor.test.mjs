import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let applyBrushStamp;

before(async () => {
  vite = await createViteTestServer();
  ({ applyBrushStamp } = await vite.ssrLoadModule('/packages/image-processing/src/brush/BrushStampProcessor.ts'));
});

after(async () => {
  await vite?.close();
});

function operation(overrides = {}) {
  return {
    region: { left: 0, top: 0, width: 1, height: 1 },
    centerX: 0.5, centerY: 0.5, radius: 2, hardEdge: 2, fadeWidth: 0.5,
    erase: false, color: [220, 40, 20], opacity: 1, ...overrides,
  };
}

test('pinta una capa transparente con el color y cobertura esperados', () => {
  const pixels = new Uint8Array(4);
  assert.equal(applyBrushStamp(pixels, operation()), true);
  assert.deepEqual([...pixels], [220, 40, 20, 255]);
});

test('mezcla el pincel con el alfa existente y aplica el borde suave', () => {
  const pixels = new Uint8Array([0, 0, 255, 255]);
  applyBrushStamp(pixels, operation({ centerX: 1.5, hardEdge: 0, fadeWidth: 2.5, color: [255, 0, 0] }));
  assert.ok(pixels[0] > 0 && pixels[0] < 255);
  assert.ok(pixels[2] > 0 && pixels[2] < 255);
  assert.equal(pixels[3], 255);
});

test('el borrador reduce alfa y limpia el color al volverlo transparente', () => {
  const pixels = new Uint8Array([30, 60, 90, 255]);
  applyBrushStamp(pixels, operation({ erase: true, opacity: 0.5 }));
  assert.equal(pixels[3], 128);
  applyBrushStamp(pixels, operation({ erase: true }));
  assert.deepEqual([...pixels], [0, 0, 0, 0]);
});

test('no reporta cambios para un sello fuera del radio', () => {
  const pixels = new Uint8Array([20, 40, 60, 255]);
  assert.equal(applyBrushStamp(pixels, operation({ centerX: 20, centerY: 20 })), false);
  assert.deepEqual([...pixels], [20, 40, 60, 255]);
});
