import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createRequire } from 'node:module';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

const requireStorageDependency = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const { strFromU8, strToU8, unzipSync, zipSync } = requireStorageDependency('fflate');
let vite;
let packNvtsPhoto;
let unpackNvtsPhoto;
let colorizePixels;

before(async () => {
  vite = await createViteTestServer();
  ({ packNvtsPhoto, unpackNvtsPhoto } = await vite.ssrLoadModule('/packages/storage/src/NvtsPhotoIO.ts'));
  ({ colorizePixels } = await vite.ssrLoadModule('/packages/image-processing/src/colorize/ColorizeProcessor.ts'));
});

after(async () => { await vite?.close(); });

function makeDocument(masks) {
  return {
    id: 'mask-document', name: 'Máscaras', width: 2, height: 2,
    layers: [{
      id: 'layer-1', engineId: 1, type: 'paint', name: 'Pintura', visible: true,
      locked: false, opacity: 1, blendMode: 'normal', children: [], masks,
    }],
  };
}

function changeManifest(bytes, update) {
  const archive = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(archive['manifest.json']));
  update(manifest);
  archive['manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(archive);
}

test('native projects round-trip transformation, colorization and filter masks', () => {
  const masks = [
    { id: 'transform-1', type: 'transform', enabled: true, offsetX: 12, offsetY: -4, scaleX: 1.2, scaleY: 0.8, rotation: 0.3, shearX: 0.1, shearY: 0 },
    { id: 'colorize-1', type: 'colorize', enabled: true, editStrokes: false, showOutput: true, gapClose: 8, threshold: 0.4, limitToLayerBounds: true, transparentColors: ['#00ffff'], strokes: [{ color: '#ff6600', radius: 5, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }] },
    { id: 'filter-1', type: 'filter', enabled: true, filters: [{ kind: 'grayscale', strength: 0.8 }, { kind: 'blur', strength: 0.25 }] },
  ];
  const archive = packNvtsPhoto(makeDocument(masks), () => null);
  const restored = unpackNvtsPhoto(archive).doc.layers[0].masks;

  assert.deepEqual(restored, masks);
});

test('older native projects without mask metadata still load', () => {
  const archive = packNvtsPhoto(makeDocument(undefined), () => null);
  assert.deepEqual(unpackNvtsPhoto(archive).doc.layers[0].masks, []);
});

test('invalid mask metadata is rejected without accepting unknown filters', () => {
  const archive = packNvtsPhoto(makeDocument([]), () => null);
  const malformed = changeManifest(archive, (manifest) => {
    manifest.layers[0].masks = [{ id: 'filter-1', type: 'filter', enabled: true, filters: [{ kind: 'not-a-filter', strength: 1 }] }];
  });

  assert.throws(() => unpackNvtsPhoto(malformed), /Filtros de máscara inválidos/);
});

test('colorization respects dark line barriers and only recolors the seeded region', () => {
  const source = Uint8Array.from([
    255, 255, 255, 255,
    0, 0, 0, 255,
    255, 255, 255, 255,
  ]);
  const mask = {
    id: 'colorize-1', type: 'colorize', enabled: true, editStrokes: true, showOutput: true,
    gapClose: 0, threshold: 0.4, limitToLayerBounds: true, transparentColors: [],
    strokes: [{ color: '#ff0000', radius: 1, points: [{ x: 0, y: 0 }] }],
  };

  const result = colorizePixels(source, 3, 1, mask);

  assert.deepEqual([...result], [255, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
});

test('transparent colorization strokes clear their seeded regions', () => {
  const source = new Uint8Array(4 * 4).fill(255);
  const mask = {
    id: 'colorize-2', type: 'colorize', enabled: true, editStrokes: true, showOutput: true,
    gapClose: 0, threshold: 0.4, limitToLayerBounds: true, transparentColors: ['#00ffff'],
    strokes: [{ color: '#00ffff', radius: 1, points: [{ x: 0, y: 0 }] }],
  };

  const result = colorizePixels(source, 2, 2, mask);

  assert.deepEqual([...result], new Array(16).fill(0));
});
