import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

const requireStorageDependency = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const { strFromU8, strToU8, unzipSync, zipSync } = requireStorageDependency('fflate');
let vite;
let packNvtsPhoto;
let unpackNvtsPhoto;
let normalizeLayerStyles;
let createDefaultLayerStyles;
let getLayerStylePadding;
let hasEnabledLayerStyles;
let getRenderableLayerStyles;

before(async () => {
  vite = await createViteTestServer();
  ({ packNvtsPhoto, unpackNvtsPhoto } = await vite.ssrLoadModule('/packages/storage/src/NvtsPhotoIO.ts'));
  ({ normalizeLayerStyles, createDefaultLayerStyles } = await vite.ssrLoadModule('/packages/shared/src/nvtsphoto.ts'));
  ({ getLayerStylePadding, hasEnabledLayerStyles } = await vite.ssrLoadModule('/packages/image-processing/src/effects/LayerStyleRenderer.ts'));
  ({ getRenderableLayerStyles } = await vite.ssrLoadModule('/packages/shared/src/layerMasks.ts'));
});

after(async () => {
  await vite?.close();
});

function makeDocument(layerStyles, masks = []) {
  return {
    id: 'style-document', name: 'Style document', width: 1, height: 1,
    layers: [{ id: 'style-layer', engineId: 1, type: 'paint', name: 'Styled layer', visible: true, locked: false, opacity: 1, blendMode: 'normal', layerStyles, masks, children: [] }],
  };
}

function replaceManifest(bytes, edit) {
  const files = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  edit(manifest);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(files);
}

test('layer styles survive a native .nvtsphoto round trip', () => {
  const styles = {
    stroke: { enabled: true, color: '#e03030', size: 7, opacity: 0.8 },
    outerGlow: { enabled: true, color: '#ffcc00', size: 14, opacity: 0.6 },
    dropShadow: { enabled: true, color: '#101010', size: 9, distance: 11, angle: 120, opacity: 0.45 },
    bevelEmboss: { enabled: true, size: 5, depth: 8, angle: 35, altitude: 55, highlightColor: '#ffffff', shadowColor: '#000000', opacity: 0.72 },
  };
  const packed = packNvtsPhoto(makeDocument(styles), () => null);
  const restored = unpackNvtsPhoto(packed).doc.layers[0].layerStyles;
  assert.deepEqual(restored, styles);
});

test('legacy native projects without layer styles remain valid', () => {
  const archive = packNvtsPhoto(makeDocument(undefined), () => null);
  const legacyArchive = replaceManifest(archive, (manifest) => delete manifest.layers[0].layerStyles);
  const restored = unpackNvtsPhoto(legacyArchive).doc.layers[0];
  assert.equal(restored.layerStyles, undefined);
});

test('layer style normalization clamps numeric values and rejects invalid colors', () => {
  const normalized = normalizeLayerStyles({
    stroke: { enabled: true, color: 'red', size: 500, opacity: 8 },
    dropShadow: { enabled: true, color: '#123456', distance: -9, size: 500, angle: 999, opacity: -2 },
  });
  assert.ok(normalized);
  assert.equal(normalized.stroke.color, '#ffffff');
  assert.equal(normalized.stroke.size, 64);
  assert.equal(normalized.stroke.opacity, 1);
  assert.equal(normalized.dropShadow.distance, 0);
  assert.equal(normalized.dropShadow.size, 64);
  assert.equal(normalized.dropShadow.angle, 180);
  assert.equal(normalized.dropShadow.opacity, 0);
});

test('effect activation and tile padding account for enabled styles only', () => {
  const styles = createDefaultLayerStyles();
  assert.equal(hasEnabledLayerStyles(styles), false);
  assert.equal(getLayerStylePadding(styles), 0);
  styles.dropShadow.enabled = true;
  styles.dropShadow.size = 10;
  styles.dropShadow.distance = 5;
  assert.equal(hasEnabledLayerStyles(styles), true);
  assert.equal(getLayerStylePadding(styles), 37);
});

test('style mask survives native .nvtsphoto round trip and becomes the rendering source', () => {
  const styles = createDefaultLayerStyles();
  styles.stroke.enabled = true;
  styles.stroke.color = '#ff3300';
  styles.stroke.size = 6;
  const mask = { id: 'styles-mask', type: 'styles', enabled: true, styles };
  const packed = packNvtsPhoto(makeDocument(undefined, [mask]), () => null);
  const restored = unpackNvtsPhoto(packed).doc.layers[0];
  assert.deepEqual(restored.masks, [mask]);
  assert.equal(restored.layerStyles, undefined);
  assert.deepEqual(getRenderableLayerStyles(restored), styles);
});

test('disabled style mask suppresses legacy layer styles until the mask is removed', () => {
  const legacyStyles = createDefaultLayerStyles();
  legacyStyles.stroke.enabled = true;
  const maskStyles = createDefaultLayerStyles();
  maskStyles.dropShadow.enabled = true;
  assert.equal(getRenderableLayerStyles({ layerStyles: legacyStyles, masks: [{ id: 's', type: 'styles', enabled: false, styles: maskStyles }] }), undefined);
  assert.deepEqual(getRenderableLayerStyles({ layerStyles: legacyStyles, masks: [{ id: 's', type: 'styles', enabled: true, styles: maskStyles }] }), maskStyles);
  assert.deepEqual(getRenderableLayerStyles({ layerStyles: legacyStyles, masks: [] }), legacyStyles);
});


test('multiple stroke instances normalize independently and survive native project serialization', () => {
  const styles = {
    stroke: { enabled: false, color: '#ffffff', size: 3, opacity: 1 },
    strokes: [
      { enabled: true, color: '#ff0000', size: 4, opacity: 0.8 },
      { enabled: true, color: '#0000ff', size: 12, opacity: 0.45 },
      { enabled: false, color: '#00ff00', size: 8, opacity: 1 },
    ],
    outerGlow: { enabled: false, color: '#fff2a8', size: 12, opacity: 0.75 },
    dropShadow: { enabled: false, color: '#000000', size: 8, distance: 6, angle: 45, opacity: 0.55 },
    bevelEmboss: { enabled: false, size: 4, depth: 5, angle: 45, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', opacity: 0.7 },
  };
  const normalized = normalizeLayerStyles(styles);
  assert.equal(normalized.strokes.length, 3);
  assert.equal(normalized.strokes[0].color, '#ff0000');
  assert.equal(normalized.strokes[1].size, 12);
  assert.equal(normalized.strokes[2].enabled, false);
  const packed = packNvtsPhoto(makeDocument(styles), () => null);
  const restored = unpackNvtsPhoto(packed).doc.layers[0].layerStyles;
  assert.deepEqual(restored.strokes, normalized.strokes);
});
