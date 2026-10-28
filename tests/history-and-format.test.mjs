import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createViteTestServer } from './helpers/vite-test-server.mjs';
import createEngine from '../packages/wasm-bindings/build/engine.js';

const requireStorageDependency = createRequire(new URL('../packages/storage/package.json', import.meta.url));
const { strFromU8, strToU8, unzipSync, zipSync } = requireStorageDependency('fflate');

let vite;
let engine;
let DocumentController;
let packNvtsPhoto;
let unpackNvtsPhoto;
const controllers = [];

before(async () => {
  vite = await createViteTestServer();

  ({ DocumentController } = await vite.ssrLoadModule('/packages/document-model/src/DocumentController.ts'));
  ({ packNvtsPhoto, unpackNvtsPhoto } = await vite.ssrLoadModule('/packages/storage/src/NvtsPhotoIO.ts'));

  const wasmPath = fileURLToPath(new URL('../packages/wasm-bindings/build/engine.wasm', import.meta.url));
  engine = await createEngine({ wasmBinary: readFileSync(wasmPath), locateFile: () => wasmPath });
});

after(async () => {
  for (const controller of controllers) controller.dispose();
  await vite?.close();
});

function createController(width = 16, height = 16, historyMB = 1) {
  const controller = DocumentController.create(engine, width, height, 'Prueba', historyMB);
  controllers.push(controller);
  return controller;
}

function writePixel(controller, layer, x, y, rgba) {
  const surface = controller.layerPixels(layer);
  assert.ok(surface);
  assert.equal(surface.writeRectFromJS(x, y, 1, 1, Uint8Array.from(rgba)), true);
}

function readPixel(controller, layer, x, y) {
  const surface = controller.layerPixels(layer);
  assert.ok(surface);
  const pixel = new Uint8Array(4);
  assert.equal(surface.readRectToJS(x, y, 1, 1, pixel), true);
  return [...pixel];
}

function recordPixelAction(controller, layer, edits, label = 'Prueba') {
  assert.equal(controller.history.beginAction(layer.engineId), true);
  edits();
  assert.ok(controller.history.saveState(label) > 0);
  controller.recordPixelAction(label);
}

function makeDocument() {
  return {
    id: 'document-1',
    name: 'Documento de prueba',
    width: 1,
    height: 1,
    layers: [{
      id: 'layer-1',
      engineId: 1,
      type: 'paint',
      name: 'Capa',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      children: [],
    }],
  };
}

function rewriteManifest(bytes, update) {
  const files = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  update(manifest);
  files['manifest.json'] = strToU8(JSON.stringify(manifest));
  return zipSync(files);
}

function writePixelGrid(controller, layer, color) {
  for (let y = 0; y < 2; y++) writePixelGridRow(controller, layer, y, color);
}

function writePixelGridRow(controller, layer, y, color) {
  for (let x = 0; x < 4; x++) writePixel(controller, layer, x * 256, y * 256, color);
}

test('non-destructive layer style edits are undoable without changing source pixels', () => {
  const controller = createController();
  const layer = controller.addRaster('Capa con estilos');
  writePixel(controller, layer, 3, 4, [80, 100, 120, 255]);
  const sourceBefore = readPixel(controller, layer, 3, 4);
  controller.clearHistory();
  const styles = {
    stroke: { enabled: true, color: '#e03030', size: 7, opacity: 0.8 },
    outerGlow: { enabled: false, color: '#fff2a8', size: 12, opacity: 0.75 },
    dropShadow: { enabled: true, color: '#000000', size: 8, distance: 6, angle: 45, opacity: 0.55 },
    bevelEmboss: { enabled: false, size: 4, depth: 5, angle: 45, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', opacity: 0.7 },
  };
  controller.setProps(layer.id, { layerStyles: styles });
  styles.stroke.size = 25;
  assert.equal(controller.find(layer.id).layerStyles.stroke.size, 7);
  assert.deepEqual(readPixel(controller, layer, 3, 4), sourceBefore);
  assert.equal(controller.undo(), 'structure');
  assert.equal(controller.find(layer.id).layerStyles, undefined);
  assert.deepEqual(readPixel(controller, layer, 3, 4), sourceBefore);
  assert.equal(controller.redo(), 'structure');
  assert.equal(controller.find(layer.id).layerStyles.stroke.size, 7);
  assert.deepEqual(readPixel(controller, layer, 3, 4), sourceBefore);
});

test('applying layer appearance creates a style mask and is one undoable action', () => {
  const controller = createController();
  const layer = controller.addRaster('Máscara de estilos');
  controller.clearHistory();
  const styles = {
    stroke: { enabled: true, color: '#ff3300', size: 6, opacity: 0.9 },
    outerGlow: { enabled: false, color: '#fff2a8', size: 12, opacity: 0.75 },
    dropShadow: { enabled: false, color: '#000000', size: 8, distance: 6, angle: 45, opacity: 0.55 },
    bevelEmboss: { enabled: false, size: 4, depth: 5, angle: 45, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', opacity: 0.7 },
  };
  assert.equal(controller.setLayerAppearance(layer.id, { opacity: 0.75, blendMode: 'multiply', layerStyles: styles }), true);
  const applied = controller.find(layer.id);
  const styleMask = applied.masks.find((mask) => mask.type === 'styles');
  assert.ok(styleMask);
  assert.equal(styleMask.enabled, true);
  assert.deepEqual(styleMask.styles, styles);
  assert.equal(applied.layerStyles, undefined);
  assert.equal(applied.opacity, 0.75);
  assert.equal(applied.blendMode, 'multiply');
  assert.equal(controller.historyEntries.length, 1);

  assert.equal(controller.undo(), 'structure');
  assert.equal(controller.find(layer.id).masks.some((mask) => mask.type === 'styles'), false);
  assert.equal(controller.find(layer.id).opacity, 1);
  assert.equal(controller.find(layer.id).blendMode, 'normal');
  assert.equal(controller.redo(), 'structure');
  assert.deepEqual(controller.find(layer.id).masks.find((mask) => mask.type === 'styles').styles, styles);
  assert.equal(controller.find(layer.id).opacity, 0.75);
});

test('layer styles survive the complete native-file and controller restoration path', () => {
  const source = createController(8, 8);
  const layer = source.addRaster('Estilos persistentes');
  const styles = {
    stroke: { enabled: true, color: '#e03030', size: 6, opacity: 0.85 },
    outerGlow: { enabled: true, color: '#fff2a8', size: 12, opacity: 0.7 },
    dropShadow: { enabled: true, color: '#000000', size: 8, distance: 9, angle: 35, opacity: 0.5 },
    bevelEmboss: { enabled: true, size: 4, depth: 6, angle: 45, altitude: 50, highlightColor: '#ffffff', shadowColor: '#000000', opacity: 0.6 },
  };
  source.setProps(layer.id, { layerStyles: styles });
  const archive = packNvtsPhoto(source.doc, (candidate) => source.readPixels(candidate));
  const restored = DocumentController.fromUnpacked(engine, unpackNvtsPhoto(archive));
  controllers.push(restored);
  assert.deepEqual(restored.find(layer.id)?.layerStyles, styles);
});

test('property changes publish a properties event and listeners can unsubscribe', () => {
  const controller = createController();
  const layer = controller.addRaster('Observer');
  const events = [];
  const unsubscribe = controller.subscribe((event) => events.push(event));
  controller.setProps(layer.id, { opacity: 0.5 });
  assert.equal(events.at(-1)?.kind, 'properties');
  unsubscribe();
  const eventCount = events.length;
  controller.setProps(layer.id, { opacity: 0.75 });
  assert.equal(events.length, eventCount);
});

test('pixel undo and redo restore the exact RGBA value', () => {
  const controller = createController();
  const layer = controller.addRaster('Píxeles');

  recordPixelAction(controller, layer, () => writePixel(controller, layer, 2, 3, [20, 40, 60, 255]));
  assert.deepEqual(readPixel(controller, layer, 2, 3), [20, 40, 60, 255]);
  assert.equal(controller.undo(), 'pixels');
  assert.deepEqual(readPixel(controller, layer, 2, 3), [0, 0, 0, 0]);
  assert.equal(controller.redo(), 'pixels');
  assert.deepEqual(readPixel(controller, layer, 2, 3), [20, 40, 60, 255]);
});

test('new structural edits discard pixel redo from both history stacks', () => {
  const controller = createController();
  const layer = controller.addRaster('Píxeles');
  controller.clearHistory();

  recordPixelAction(controller, layer, () => writePixel(controller, layer, 1, 1, [1, 2, 3, 255]));
  assert.equal(controller.undo(), 'pixels');
  assert.equal(controller.canRedo, true);

  controller.addRaster('Nueva capa');
  assert.equal(controller.canRedo, false);
  assert.equal(controller.history.redoCount(), 0);
});

test('the pixel budget remains enforced when undo moves new tiles to redo', () => {
  const controller = createController(1024, 512, 1);
  const layer = controller.addRaster('Lienzo grande');
  controller.clearHistory();

  recordPixelAction(controller, layer, () => writePixelGrid(controller, layer, [5, 6, 7, 255]), 'Trazo grande');

  assert.equal(controller.undo(), 'pixels');
  assert.ok(controller.history.memoryBytes() <= 1024 * 1024);
  assert.equal(controller.canRedo, false);
  assert.equal(controller.historyEntries.length, 0);
});

test('a single pixel action larger than the cap is removed and not shown as undoable', () => {
  const controller = createController(1024, 512, 1);
  const layer = controller.addRaster('Lienzo grande');
  assert.equal(controller.layerPixels(layer).loadFromRGBA(new Uint8Array(1024 * 512 * 4).fill(255)), true);
  controller.clearHistory();

  recordPixelAction(controller, layer, () => writePixelGrid(controller, layer, [8, 9, 10, 255]), 'Acción grande');

  assert.equal(controller.canUndo, false);
  assert.equal(controller.historyEntries.length, 0);
  assert.ok(controller.history.memoryBytes() <= 1024 * 1024);
});

test('structural snapshots obey the configured memory budget', () => {
  const controller = createController(16, 16, 0);
  controller.addRaster('Capa limitada');

  assert.equal(controller.canUndo, false);
  assert.equal(controller.historyEntries.length, 0);
});

test('a native document round-trips its manifest and RGBA layer data', () => {
  const doc = makeDocument();
  const sourcePixels = Uint8Array.from([12, 34, 56, 255]);
  const archive = packNvtsPhoto(doc, (layer) => layer.id === 'layer-1' ? sourcePixels : null);
  const unpacked = unpackNvtsPhoto(archive);

  assert.equal(unpacked.doc.name, doc.name);
  assert.equal(unpacked.doc.width, 1);
  assert.equal(unpacked.doc.layers[0].type, 'paint');
  assert.deepEqual([...unpacked.pixels.get('layer-1')], [...sourcePixels]);
});

test('the loader normalizes legacy raster layers and rejects incompatible major versions', () => {
  const archive = packNvtsPhoto(makeDocument(), () => Uint8Array.from([1, 2, 3, 4]));
  const legacyArchive = rewriteManifest(archive, (manifest) => { manifest.layers[0].type = 'raster'; });
  const incompatibleArchive = rewriteManifest(archive, (manifest) => { manifest.version = '1.0.0'; });

  assert.equal(unpackNvtsPhoto(legacyArchive).doc.layers[0].type, 'paint');
  assert.throws(() => unpackNvtsPhoto(incompatibleArchive), /Versión 1\.0\.0 no soportada/);
});

test('the loader rejects invalid dimensions and archives without a manifest', () => {
  const archive = packNvtsPhoto(makeDocument(), () => null);
  const invalidDimensions = rewriteManifest(archive, (manifest) => { manifest.document.width = 0; });

  assert.throws(() => unpackNvtsPhoto(invalidDimensions), /Dimensiones de documento inválidas/);
  assert.throws(() => unpackNvtsPhoto(zipSync({ 'not-manifest.txt': strToU8('x') })), /Falta manifest.json/);
});
