import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let cloneLayerStyles;
let normalizeLayerStyles;

before(async () => {
  vite = await createViteTestServer();
  ({ cloneLayerStyles, normalizeLayerStyles } = await vite.ssrLoadModule('/packages/shared/src/nvtsphoto.ts'));
});

after(async () => {
  await vite?.close();
});

test('normalizes multiple instances of every supported layer style', () => {
  const normalized = normalizeLayerStyles({
    strokes: [{ enabled: true, color: '#ff0000', size: 4, opacity: 0.8 }],
    outerGlows: [{ enabled: true, color: '#00ff00', size: 14, opacity: 0.6 }],
    dropShadows: [{ enabled: true, color: '#000000', size: 9, distance: 12, angle: 30, opacity: 0.5 }],
    bevelEmbosses: [{ enabled: true, size: 5, depth: 7, angle: 60, altitude: 35, highlightColor: '#ffffff', shadowColor: '#222222', opacity: 0.7 }],
  });
  assert.equal(normalized.strokes[0].color, '#ff0000');
  assert.equal(normalized.outerGlows[0].size, 14);
  assert.equal(normalized.dropShadows[0].distance, 12);
  assert.equal(normalized.bevelEmbosses[0].depth, 7);
});

test('clones additional effect instances without sharing object references', () => {
  const original = {
    strokes: [{ enabled: true, color: '#ff0000', size: 4, opacity: 1 }],
    outerGlows: [{ enabled: true, color: '#00ff00', size: 14, opacity: 0.6 }],
    dropShadows: [{ enabled: true, color: '#000000', size: 9, distance: 12, angle: 30, opacity: 0.5 }],
    bevelEmbosses: [{ enabled: true, size: 5, depth: 7, angle: 60, altitude: 35, highlightColor: '#ffffff', shadowColor: '#222222', opacity: 0.7 }],
  };
  const clone = cloneLayerStyles(original);
  for (const key of ['strokes', 'outerGlows', 'dropShadows', 'bevelEmbosses']) {
    assert.notEqual(clone[key], original[key]);
    assert.notEqual(clone[key][0], original[key][0]);
  }
});
