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

test('normalizes and renders all ten standard layer-style families with repeatable effects', () => {
  const normalized = normalizeLayerStyles({
    innerGlow: { enabled: true, color: '#ffeeaa', size: 22, choke: 15, opacity: 0.65 },
    satin: { enabled: true, color: '#111111', size: 7, distance: 17, angle: 25, opacity: 0.45, invert: true },
    colorOverlay: { enabled: true, color: '#ff0088', opacity: 0.75, blendMode: 'screen' },
    patternOverlay: { enabled: true, pattern: 'crosshatch', color: '#ffffff', backgroundColor: '#202020', scale: 150, angle: 40, opacity: 0.8, blendMode: 'overlay' },
    innerGlows: [{ enabled: true, color: '#00ffff', size: 18, choke: 20, opacity: 0.7 }],
    satins: [{ enabled: true, color: '#222222', size: 6, distance: 10, angle: -20, opacity: 0.4, invert: false }],
    colorOverlays: [{ enabled: true, color: '#00ff00', opacity: 0.35, blendMode: 'multiply' }],
    patternOverlays: [{ enabled: true, pattern: 'dots', color: '#ffcc00', backgroundColor: '#000000', scale: 80, angle: 15, opacity: 0.55, blendMode: 'normal' }],
  });
  assert.equal(normalized.innerGlow.choke, 15);
  assert.equal(normalized.satin.invert, true);
  assert.equal(normalized.colorOverlay.blendMode, 'screen');
  assert.equal(normalized.patternOverlay.pattern, 'crosshatch');
  assert.equal(normalized.innerGlows[0].color, '#00ffff');
  assert.equal(normalized.satins[0].distance, 10);
  assert.equal(normalized.colorOverlays[0].blendMode, 'multiply');
  assert.equal(normalized.patternOverlays[0].pattern, 'dots');
});

test('clones additional effect instances without sharing object references', () => {
  const original = {
    strokes: [{ enabled: true, color: '#ff0000', size: 4, opacity: 1 }],
    outerGlows: [{ enabled: true, color: '#00ff00', size: 14, opacity: 0.6 }],
    dropShadows: [{ enabled: true, color: '#000000', size: 9, distance: 12, angle: 30, opacity: 0.5 }],
    bevelEmbosses: [{ enabled: true, size: 5, depth: 7, angle: 60, altitude: 35, highlightColor: '#ffffff', shadowColor: '#222222', opacity: 0.7 }],
  };
  original.innerGlows = [{ enabled: true, color: '#00ff00', size: 5, choke: 5, opacity: 0.6 }];
  original.satins = [{ enabled: true, color: '#000000', size: 5, distance: 8, angle: 10, opacity: 0.5, invert: true }];
  original.colorOverlays = [{ enabled: true, color: '#ffffff', opacity: 0.5, blendMode: 'screen' }];
  original.patternOverlays = [{ enabled: true, pattern: 'grid', color: '#ffffff', backgroundColor: '#000000', scale: 100, angle: 0, opacity: 0.5, blendMode: 'normal' }];
  const fullClone = cloneLayerStyles(original);
  for (const key of ['strokes', 'outerGlows', 'dropShadows', 'bevelEmbosses', 'innerGlows', 'satins', 'colorOverlays', 'patternOverlays']) {
    const source = key in original && original[key] ? original[key] : undefined;
    const target = fullClone[key];
    assert.notEqual(target, source);
    assert.notEqual(target[0], source[0]);
  }
});
