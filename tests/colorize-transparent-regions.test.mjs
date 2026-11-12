import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let colorizePixels;

before(async () => {
  vite = await createViteTestServer();
  ({ colorizePixels } = await vite.ssrLoadModule('/packages/image-processing/src/colorize/ColorizeProcessor.ts'));
});

after(async () => {
  await vite?.close();
});

test('colorization fills transparent enclosed pixels with the seed color without blackening transparent exterior', () => {
  const width = 7;
  const height = 7;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 1; y <= 5; y++) {
    for (let x = 1; x <= 5; x++) {
      if (x !== 1 && x !== 5 && y !== 1 && y !== 5) continue;
      const offset = (y * width + x) * 4;
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 255;
    }
  }
  const mask = {
    id: 'color-mask', type: 'colorize', enabled: true, editStrokes: true, showOutput: true,
    gapClose: 0, threshold: 0.4, limitToLayerBounds: true, transparentColors: [],
    strokes: [{ color: '#ef3040', radius: 1, points: [{ x: 3, y: 3 }] }],
  };
  const output = colorizePixels(pixels, width, height, mask);
  const center = (3 * width + 3) * 4;
  assert.deepEqual([...output.slice(center, center + 4)], [239, 48, 64, 255]);
  const exterior = 0;
  assert.deepEqual([...output.slice(exterior, exterior + 4)], [0, 0, 0, 0]);
  const outline = (1 * width + 3) * 4;
  assert.deepEqual([...output.slice(outline, outline + 4)], [0, 0, 0, 255]);
});
