import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let AnimationFrameLayerManager;

before(async () => {
  vite = await createViteTestServer();
  ({ AnimationFrameLayerManager } = await vite.ssrLoadModule('/packages/ui/src/managers/AnimationFrameLayerManager.ts'));
});

after(async () => {
  await vite?.close();
});

function createFakeDocument(documentId = 'animation-test-document', includeSavedFrameTwo = false) {
  const layers = [
    { id: 'background', name: 'Fondo', type: 'paint', visible: true, children: [] },
    { id: 'paint-1', name: 'Capa 1', type: 'paint', visible: true, children: [] },
  ];
  if (includeSavedFrameTwo) layers.push({ id: 'saved-frame-2', name: 'Fotograma 2', type: 'paint', visible: false, children: [] });
  const nodes = new Map(layers.map((layer) => [layer.id, layer]));
  return {
    doc: { id: documentId, layers },
    comp: { invalidateAll() {} },
    find(id) { return nodes.get(id); },
    setProps(id, patch) { Object.assign(nodes.get(id), patch); },
    addLayerAbove(_type, name, referenceId) {
      const layer = { id: `${documentId}-frame-${nodes.size}`, name, type: 'paint', visible: true, children: [] };
      const index = layers.findIndex((item) => item.id === referenceId);
      layers.splice(index + 1, 0, layer);
      nodes.set(layer.id, layer);
      return layer;
    },
    addRaster(name) {
      const layer = { id: `${documentId}-frame-${nodes.size}`, name, type: 'paint', visible: true, children: [] };
      layers.push(layer);
      nodes.set(layer.id, layer);
      return layer;
    },
  };
}

test('timeline frames activate independent paint layers and keep the background visible', () => {
  const document = createFakeDocument();
  let activeLayerId = 'paint-1';
  const manager = new AnimationFrameLayerManager(() => document, () => activeLayerId, (id) => { activeLayerId = id; });
  assert.equal(manager.initialize().id, 'paint-1');
  const frameTwo = manager.selectFrame(2);
  assert.ok(frameTwo);
  assert.notEqual(frameTwo.id, 'paint-1');
  assert.equal(document.find('paint-1').visible, false);
  assert.equal(frameTwo.visible, true);
  assert.equal(document.find('background').visible, true);
  assert.equal(manager.selectFrame(1).id, 'paint-1');
  assert.equal(document.find('paint-1').visible, true);
  assert.equal(frameTwo.visible, false);
});


test('timeline manager refreshes its document mapping after a project is replaced', () => {
  let document = createFakeDocument('first-document');
  let activeLayerId = 'paint-1';
  const manager = new AnimationFrameLayerManager(() => document, () => activeLayerId, (id) => { activeLayerId = id; });
  manager.initialize();
  manager.selectFrame(2);
  const firstFrameTwo = manager.selectFrame(2);

  document = createFakeDocument('second-document');
  activeLayerId = 'paint-1';
  const secondFrameTwo = manager.selectFrame(2);

  assert.ok(secondFrameTwo);
  assert.notEqual(secondFrameTwo.id, firstFrameTwo.id);
  assert.equal(document.find('paint-1').visible, false);
  assert.equal(secondFrameTwo.visible, true);
});


test('timeline manager restores named frame layers from the native project without browser storage', () => {
  const document = createFakeDocument('saved-project', true);
  let activeLayerId = 'paint-1';
  const manager = new AnimationFrameLayerManager(() => document, () => activeLayerId, (id) => { activeLayerId = id; });
  manager.initialize();
  const frameTwo = manager.selectFrame(2);

  assert.equal(frameTwo.id, 'saved-frame-2');
  assert.equal(document.find('saved-frame-2').visible, true);
  assert.equal(document.find('paint-1').visible, false);
});


test('timeline does not map an already numbered layer to frame one after opening a project', () => {
  const document = createFakeDocument('opened-project', true);
  let activeLayerId = 'saved-frame-2';
  const manager = new AnimationFrameLayerManager(() => document, () => activeLayerId, (id) => { activeLayerId = id; });
  const frameOne = manager.selectFrame(1);
  assert.equal(frameOne.id, 'paint-1');
  assert.equal(manager.selectFrame(2).id, 'saved-frame-2');
  assert.equal(document.find('paint-1').visible, false);
  assert.equal(document.find('saved-frame-2').visible, true);
});
