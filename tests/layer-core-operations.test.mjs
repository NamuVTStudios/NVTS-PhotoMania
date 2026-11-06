import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createTestEngine } from './helpers/create-test-engine.mjs';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let engine;
let DocumentController;
const controllers = [];

before(async () => {
  vite = await createViteTestServer();
  ({ DocumentController } = await vite.ssrLoadModule('/packages/document-model/src/DocumentController.ts'));
  engine = await createTestEngine();
});

after(async () => {
  for (const controller of controllers) controller.dispose();
  await vite?.close();
});

function createController() {
  const controller = DocumentController.create(engine, 16, 16, 'Layer operation tests', 2);
  controllers.push(controller);
  return controller;
}

function writePixel(controller, layer, x, y, rgba) {
  const surface = controller.layerPixels(layer);
  assert.ok(surface, 'expected the layer to expose a pixel surface');
  assert.equal(surface.writeRectFromJS(x, y, 1, 1, Uint8Array.from(rgba)), true);
}

function readPixel(controller, layer, x, y) {
  const surface = controller.layerPixels(layer);
  assert.ok(surface, 'expected the layer to expose a pixel surface');
  const pixel = new Uint8Array(4);
  assert.equal(surface.readRectToJS(x, y, 1, 1, pixel), true);
  return [...pixel];
}

test('layer command routing guards missing selections and allows create without a selection', async () => {
  const { routeLayerMenuAction } = await vite.ssrLoadModule('/packages/ui/src/app/LayerMenuCommandRouter.ts');
  const calls = [];
  const handlers = {
    createPaintLayer: () => calls.push('create'),
    reportMissingSelection: () => calls.push('missing'),
    selectedLayerActions: { duplicate: () => calls.push('duplicate') },
  };

  routeLayerMenuAction('new-paint', false, handlers);
  assert.deepEqual(calls, ['create']);

  calls.length = 0;
  routeLayerMenuAction('duplicate', false, handlers);
  assert.deepEqual(calls, ['missing']);

  calls.length = 0;
  routeLayerMenuAction('duplicate', true, handlers);
  assert.deepEqual(calls, ['duplicate']);

  calls.length = 0;
  routeLayerMenuAction('unknown-command', true, handlers);
  assert.deepEqual(calls, []);
});

test('stale or unknown layer IDs are rejected without mutating the document', () => {
  const controller = createController();
  const layer = controller.addRaster('Existing layer');
  controller.clearHistory();
  const layerIdsBefore = controller.doc.layers.map((item) => item.id);

  assert.equal(controller.setProps('missing-layer', { name: 'Ghost' }), false);
  assert.equal(controller.duplicateLayer('missing-layer'), null);
  assert.equal(controller.removeLayer('missing-layer'), false);
  assert.equal(controller.moveLayer('missing-layer', 1), false);
  assert.match(controller.getLayerDeletionBlockReason('missing-layer') ?? '', /no existe/i);
  assert.deepEqual(controller.doc.layers.map((item) => item.id), layerIdsBefore);
  assert.equal(controller.find(layer.id)?.name, 'Existing layer');
  assert.equal(controller.historyEntries.length, 0);
});

test('new layers are inserted immediately above the selected layer in the same group', () => {
  const controller = createController();
  const group = controller.addGroup('Layer group');
  controller.addRaster('Lower sibling', group.id);
  const selected = controller.addRaster('Selected sibling', group.id);
  controller.clearHistory();

  const created = controller.addLayerAbove('paint', 'New above selected', selected.id);

  assert.deepEqual(group.children.map((layer) => layer.name), [
    'Lower sibling', 'Selected sibling', 'New above selected',
  ]);
  assert.equal(group.children.at(-1)?.id, created.id);
  assert.deepEqual([...group.children].reverse().map((layer) => layer.name), [
    'New above selected', 'Selected sibling', 'Lower sibling',
  ]);
  assert.equal(controller.undo(), 'structure');
  assert.deepEqual(group.children.map((layer) => layer.name), ['Lower sibling', 'Selected sibling']);
  assert.equal(controller.redo(), 'structure');
  assert.deepEqual(group.children.map((layer) => layer.name), [
    'Lower sibling', 'Selected sibling', 'New above selected',
  ]);
});

test('new layers default to the top of the visible layer stack', () => {
  const controller = createController();
  controller.addRaster('Bottom layer');
  controller.addRaster('Previous top layer');

  const created = controller.addLayerAbove('paint', 'New top layer');

  assert.equal(controller.doc.layers.at(-1)?.id, created.id);
  assert.deepEqual([...controller.doc.layers].reverse().map((layer) => layer.name), [
    'New top layer', 'Previous top layer', 'Bottom layer',
  ]);
});

test('layer masks share one right-side panel that lists every mask on the selected layer', async () => {
  const { LAYER_MASK_PANEL_TEMPLATE, renderLayerMaskEditor } = await vite.ssrLoadModule('/packages/ui/src/panels/LayerMaskEditor.ts');
  const { EDITOR_TEMPLATE } = await vite.ssrLoadModule('/packages/ui/src/components/EditorTemplate.ts');
  const { createLayerMask } = await vite.ssrLoadModule('/packages/shared/src/layerMasks.ts');
  assert.match(LAYER_MASK_PANEL_TEMPLATE, /id="masks-panel"/);
  assert.match(LAYER_MASK_PANEL_TEMPLATE, /Máscaras de capa/);
  assert.match(LAYER_MASK_PANEL_TEMPLATE, /id="layer-mask-list"/);
  assert.match(LAYER_MASK_PANEL_TEMPLATE, /data-close="masks-panel"/);
  assert.match(LAYER_MASK_PANEL_TEMPLATE, /id="mask-apply-changes"/);
  assert.match(LAYER_MASK_PANEL_TEMPLATE, /id="mask-cancel-changes"/);
  assert.match(EDITOR_TEMPLATE, /id="masks-panel"/);
  assert.match(EDITOR_TEMPLATE, /id="mask-preview-mode"/);
  assert.match(EDITOR_TEMPLATE, /value="before"/);
  assert.match(EDITOR_TEMPLATE, /value="split"/);
  assert.match(EDITOR_TEMPLATE, /value="after"/);

  const previousDocument = globalThis.document;
  class FakeElement {
    children = [];
    dataset = {};
    attributes = {};
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    setAttribute(name, value) { this.attributes[name] = value; }
    add(node) { this.children.push(node); }
  }
  globalThis.document = {
    createElement: (tagName) => Object.assign(new FakeElement(), { tagName }),
    createTextNode: (text) => ({ textContent: text }),
  };
  try {
    const firstMask = createLayerMask('transform', 'mask-transform');
    const secondMask = createLayerMask('colorize', 'mask-colorize');
    const styleMask = createLayerMask('styles', 'mask-styles');
    const container = new FakeElement();
    renderLayerMaskEditor(container, [firstMask, secondMask, styleMask], styleMask.id, {
      filterKinds: ['grayscale'], filterLabel: (kind) => kind,
    });
    assert.equal(container.children.length, 3);
    assert.equal(container.children[0].dataset.maskId, firstMask.id);
    assert.equal(container.children[1].dataset.maskId, secondMask.id);
    assert.equal(container.children[2].dataset.maskId, styleMask.id);
    assert.equal(container.children[2].open, true);
    assert.equal(container.children[0].open, false);
    const styleProperties = container.children[2].children[1];
    const styleFieldsets = styleProperties.children.filter((child) => child.tagName === 'fieldset');
    assert.equal(styleFieldsets.length, 10, 'all ten style effect options should remain in the same mask card');
    assert.equal(styleFieldsets[0].children[1].children[1].dataset.maskField, 'style.stroke.color');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('mask canvas preview switches between before, split, and after without editing pixels', async () => {
  const { LayerMaskPreviewController } = await vite.ssrLoadModule('/packages/ui/src/panels/LayerMaskPreviewController.ts');
  class FakeClassList {
    values = new Set();
    toggle(name, force) { if (force) this.values.add(name); else this.values.delete(name); }
    remove(...names) { names.forEach((name) => this.values.delete(name)); }
    contains(name) { return this.values.has(name); }
  }
  class FakeElement {
    hidden = true;
    value = 'after';
    width = 0;
    height = 0;
    style = { setProperty() {} };
    listeners = {};
    classList = new FakeClassList();
    addEventListener(name, callback) { this.listeners[name] = callback; }
    getContext() { return { clearRect() {}, drawImage() {} }; }
  }
  const selectors = [
    '#mask-preview-mode', '#canvas-preview-toolbar', '#mask-before-preview-clip', '#mask-before-preview',
    '#mask-preview-divider', '#mask-preview-before-label', '#mask-preview-after-label',
    '.canvas-stage', '#mask-preview-control',
  ];
  const elements = new Map(selectors.map((selector) => [selector, new FakeElement()]));
  elements.get('#mask-preview-control').hidden = false;
  const root = { querySelector: (selector) => elements.get(selector) ?? null };
  const canvas = new FakeElement();
  canvas.width = 128;
  canvas.height = 64;
  canvas.style = { transform: 'translate(0px, 0px) scale(1)', transformOrigin: 'center center', visibility: '' };
  const controller = new LayerMaskPreviewController(root, canvas);
  controller.mount();

  assert.equal(controller.captureBefore(), true);
  const mode = elements.get('#mask-preview-mode');
  const clip = elements.get('#mask-before-preview-clip');
  const divider = elements.get('#mask-preview-divider');
  const beforeLabel = elements.get('#mask-preview-before-label');
  const afterLabel = elements.get('#mask-preview-after-label');
  const stage = elements.get('.canvas-stage');
  const previewControl = elements.get('#mask-preview-control');
  const toolbar = elements.get('#canvas-preview-toolbar');
  assert.equal(toolbar.hidden, false);
  assert.equal(previewControl.hidden, false);

  controller.setMode('before');
  assert.equal(canvas.style.visibility, 'hidden');
  assert.equal(clip.hidden, false);

  controller.setMode('split');
  assert.equal(canvas.style.visibility, '');
  assert.equal(clip.hidden, false);
  assert.equal(clip.classList.contains('is-split'), true);
  assert.equal(divider.hidden, false);
  assert.equal(beforeLabel.hidden, false);
  assert.equal(afterLabel.hidden, false);
  assert.equal(stage.classList.contains('mask-preview-split'), true);

  controller.setMode('after');
  assert.equal(clip.hidden, true);
  assert.equal(divider.hidden, true);
  assert.equal(beforeLabel.hidden, true);
  assert.equal(afterLabel.hidden, true);

  controller.hide();
  // The control is nested inside the toolbar; hiding its parent hides the
  // complete toolbar without changing the child's own `hidden` property.
  assert.equal(toolbar.hidden, true);
  assert.equal(canvas.style.visibility, '');
  assert.equal(stage.classList.contains('mask-preview-split'), false);
});

test('mask panel applies a collection of mask edits as one undoable action', () => {
  const controller = createController();
  const layer = controller.addRaster('Mask transaction layer');
  const mask = controller.addMask(layer.id, 'transform');
  assert.ok(mask);
  controller.clearHistory();

  const draftMasks = layer.masks.map((current) => ({ ...current, offsetX: 24 }));
  assert.equal(controller.replaceLayerMasks(layer.id, draftMasks), true);
  assert.equal(controller.find(layer.id)?.masks?.[0]?.offsetX, 24);
  assert.equal(controller.historyEntries.length, 1);

  assert.equal(controller.undo(), 'structure');
  assert.equal(controller.find(layer.id)?.masks?.[0]?.offsetX, 0);
  assert.equal(controller.redo(), 'structure');
  assert.equal(controller.find(layer.id)?.masks?.[0]?.offsetX, 24);
});

test('replacing masks with identical values does not create a history step', () => {
  const controller = createController();
  const layer = controller.addRaster('Unchanged mask layer');
  controller.addMask(layer.id, 'transform');
  controller.clearHistory();

  assert.equal(controller.replaceLayerMasks(layer.id, layer.masks), true);
  assert.equal(controller.historyEntries.length, 0);
});

test('layer creation and duplication preserve nested structure, pixels, and undo/redo', () => {
  const controller = createController();
  const group = controller.addGroup('Original group');
  const source = controller.addRaster('Original child', group.id);
  writePixel(controller, source, 2, 3, [30, 80, 120, 255]);
  controller.clearHistory();

  const duplicate = controller.duplicateLayer(group.id);
  assert.ok(duplicate);
  assert.notEqual(duplicate.id, group.id);
  assert.equal(duplicate.name, 'Original group');
  assert.equal(duplicate.children.length, 1);

  const duplicatedChild = duplicate.children[0];
  assert.notEqual(duplicatedChild.id, source.id);
  assert.equal(duplicatedChild.name, 'Original child');
  assert.deepEqual(readPixel(controller, duplicatedChild, 2, 3), [30, 80, 120, 255]);

  assert.equal(controller.undo(), 'structure');
  assert.equal(controller.find(duplicate.id), undefined);
  assert.equal(controller.redo(), 'structure');
  assert.ok(controller.find(duplicate.id));
  assert.deepEqual(readPixel(controller, controller.find(duplicatedChild.id), 2, 3), [30, 80, 120, 255]);
});


test('grouping a selected layer is one reversible history action', () => {
  const controller = createController();
  const parent = controller.addGroup('Parent');
  const lower = controller.addRaster('Lower', parent.id);
  const selected = controller.addRaster('Selected', parent.id);
  const upper = controller.addRaster('Upper', parent.id);
  controller.clearHistory();

  const group = controller.groupLayer(selected.id);
  assert.ok(group);
  assert.deepEqual(parent.children.map((layer) => layer.name), ['Lower', 'Grupo', 'Upper']);
  assert.equal(group.children[0]?.id, selected.id);

  assert.equal(controller.undo(), 'structure');
  assert.equal(controller.find(selected.id)?.name, 'Selected');
  assert.deepEqual(parent.children.map((layer) => layer.name), ['Lower', 'Selected', 'Upper']);
  assert.equal(controller.find(group.id), undefined);

  assert.equal(controller.redo(), 'structure');
  assert.deepEqual(parent.children.map((layer) => layer.name), ['Lower', 'Grupo', 'Upper']);
  assert.equal(controller.find(group.id)?.children[0]?.id, selected.id);
  assert.equal(controller.find(lower.id)?.name, 'Lower');
});

test('layer transform geometry snaps movement and resize to document edges and center', async () => {
  const geometry = await vite.ssrLoadModule('/packages/ui/src/tools/LayerTransformGeometry.ts');
  const moved = geometry.snapMoveRect({ x: 5, y: 6, width: 20, height: 20 }, 100, 100, 8);
  assert.deepEqual(moved.rect, { x: 0, y: 0, width: 20, height: 20 });
  assert.deepEqual(moved.guides, { vertical: [0], horizontal: [0] });

  const resized = geometry.resizeRect({ x: 10, y: 10, width: 20, height: 10 }, 'se', 20, 10, true);
  assert.equal(resized.width / resized.height, 2);
  const snapped = geometry.snapResizeRect({ x: 10, y: 10, width: 39, height: 20 }, 'e', 50, 50, 2);
  assert.equal(snapped.rect.x + snapped.rect.width, 50);
  assert.deepEqual(snapped.guides.vertical, [50]);
});

test('layer renaming and deletion are safe, reversible, and preserve the last layer', () => {
  const controller = createController();
  const original = controller.addRaster('Original name');
  const removable = controller.addRaster('Removable layer');
  controller.clearHistory();

  assert.equal(controller.setProps(original.id, { name: 'Renamed layer' }), true);
  assert.equal(controller.find(original.id)?.name, 'Renamed layer');
  assert.equal(controller.undo(), 'structure');
  assert.equal(controller.find(original.id)?.name, 'Original name');
  assert.equal(controller.redo(), 'structure');
  assert.equal(controller.find(original.id)?.name, 'Renamed layer');

  assert.equal(controller.removeLayer(removable.id), true);
  assert.equal(controller.find(removable.id), undefined);
  assert.equal(controller.undo(), 'structure');
  assert.equal(controller.find(removable.id)?.name, 'Removable layer');
  assert.equal(controller.redo(), 'structure');
  assert.equal(controller.find(removable.id), undefined);

  assert.match(controller.getLayerDeletionBlockReason(original.id) ?? '', /al menos una capa/i);
  assert.equal(controller.removeLayer(original.id), false);
  assert.ok(controller.find(original.id));
});
