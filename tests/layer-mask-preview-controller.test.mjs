import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let LayerMaskPreviewController;

before(async () => {
  vite = await createViteTestServer();
  ({ LayerMaskPreviewController } = await vite.ssrLoadModule('/packages/ui/src/panels/LayerMaskPreviewController.ts'));
});

after(async () => {
  await vite?.close();
});

function createClassList() {
  const values = new Set();
  return {
    toggle(name, enabled) {
      if (enabled) values.add(name);
      else values.delete(name);
    },
    add(name) { values.add(name); },
    remove(name) { values.delete(name); },
    contains(name) { return values.has(name); },
  };
}

function restoreCreateImageBitmap(originalDescriptor) {
  if (originalDescriptor) Object.defineProperty(globalThis, 'createImageBitmap', originalDescriptor);
  else Reflect.deleteProperty(globalThis, 'createImageBitmap');
}

function createPreviewHarness(snapshotProvider) {
  const calls = [];
  const context = {
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    putImageData: (...args) => calls.push(['putImageData', ...args]),
  };
  const modeControl = {
    value: 'after', disabled: false,
    addEventListener(_name, handler) { this.changeHandler = handler; },
  };
  const sourceCanvas = { width: 320, height: 180, style: { width: '240px', height: '135px', transform: 'translate(4px, 2px) scale(1.5)', transformOrigin: 'center center', visibility: '' } };
  const previewCanvas = { width: 0, height: 0, style: { visibility: 'hidden' }, getContext: () => context };
  const previewClip = { hidden: true, style: { setProperty(name, value) { this[name] = value; } }, classList: createClassList() };
  const divider = { hidden: true };
  const beforeLabel = { hidden: true };
  const afterLabel = { hidden: true };
  const toolbar = { hidden: true };
  const stage = { classList: createClassList() };
  const status = { textContent: '' };
  const elements = new Map([
    ['#mask-preview-mode', modeControl],
    ['#canvas-preview-toolbar', toolbar],
    ['#mask-before-preview-clip', previewClip],
    ['#mask-before-preview', previewCanvas],
    ['#mask-preview-divider', divider],
    ['#mask-preview-before-label', beforeLabel],
    ['#mask-preview-after-label', afterLabel],
    ['.canvas-stage', stage],
    ['#status', status],
  ]);
  const root = { querySelector: (selector) => elements.get(selector) ?? null };
  return { controller: new LayerMaskPreviewController(root, sourceCanvas, snapshotProvider), sourceCanvas, previewCanvas, previewClip, divider, beforeLabel, afterLabel, toolbar, stage, modeControl, calls, status };
}

test('mask preview keeps a captured before image and correctly switches before, split and after modes', async () => {
  const originalCreateImageBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const bitmap = { width: 320, height: 180, close() {} };
  globalThis.createImageBitmap = async () => bitmap;
  const harness = createPreviewHarness();
  try {
    harness.controller.mount();
    harness.controller.setPanelVisible(true);
    assert.equal(harness.controller.captureBefore(), true);
    assert.equal(harness.toolbar.hidden, false);
    assert.equal(harness.modeControl.disabled, false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(harness.modeControl.disabled, false);
    assert.equal(harness.previewCanvas.width, 320);
    assert.equal(harness.previewCanvas.height, 180);
    assert.equal(harness.previewCanvas.style.width, '240px');
    assert.equal(harness.previewCanvas.style.height, '135px');
    assert.equal(harness.previewCanvas.style.left, '50%');
    assert.equal(harness.previewCanvas.style.top, '50%');
    assert.equal(harness.previewCanvas.style.marginLeft, '-120px');
    assert.equal(harness.previewCanvas.style.marginTop, '-67.5px');
    assert.equal(harness.previewCanvas.style.transform, harness.sourceCanvas.style.transform);
    assert.equal(harness.calls.some(([name]) => name === 'drawImage'), true);

    harness.modeControl.value = 'before';
    harness.modeControl.changeHandler();
    assert.equal(harness.sourceCanvas.style.visibility, 'hidden');
    assert.equal(harness.previewClip.hidden, false);
    assert.equal(harness.previewCanvas.style.visibility, 'visible');
    assert.equal(harness.previewClip.style.clipPath, 'none');
    assert.equal(harness.beforeLabel.hidden, false);
    assert.equal(harness.stage.classList.contains('mask-preview-before'), true);

    harness.modeControl.value = 'split';
    harness.modeControl.changeHandler();
    assert.equal(harness.sourceCanvas.style.visibility, '');
    assert.equal(harness.previewClip.hidden, false);
    assert.equal(harness.previewCanvas.style.visibility, 'visible');
    assert.equal(harness.previewClip.classList.contains('is-split'), true);
    assert.equal(harness.previewClip.style.clipPath, 'inset(0 50% 0 0)');
    assert.equal(harness.divider.hidden, false);
    assert.equal(harness.beforeLabel.hidden, false);
    assert.equal(harness.afterLabel.hidden, false);

    harness.modeControl.value = 'after';
    harness.modeControl.changeHandler();
    assert.equal(harness.sourceCanvas.style.visibility, '');
    assert.equal(harness.previewClip.hidden, true);
    assert.equal(harness.previewCanvas.style.visibility, 'hidden');
    assert.equal(harness.previewClip.style.clipPath, 'none');
    assert.equal(harness.divider.hidden, true);
    assert.equal(harness.afterLabel.hidden, false);
  } finally {
    restoreCreateImageBitmap(originalCreateImageBitmap);
  }
});

test('renderer snapshot is drawn in before and split modes and the after label remains visible', async () => {
  const snapshotProvider = async () => ({ width: 2, height: 1, pixels: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) });
  const harness = createPreviewHarness(snapshotProvider);
  harness.controller.mount();
  harness.controller.setPanelVisible(true);
  assert.equal(harness.controller.captureBefore(), true);
  assert.equal(harness.modeControl.disabled, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.modeControl.disabled, false);
  assert.equal(harness.previewCanvas.width, 2);
  assert.equal(harness.calls.some(([name]) => name === 'putImageData'), true);

  harness.modeControl.value = 'before';
  harness.modeControl.changeHandler();
  assert.equal(harness.sourceCanvas.style.visibility, 'hidden');
  assert.equal(harness.previewClip.hidden, false);
  assert.equal(harness.beforeLabel.hidden, false);
  assert.equal(harness.afterLabel.hidden, true);

  harness.modeControl.value = 'split';
  harness.modeControl.changeHandler();
  assert.equal(harness.sourceCanvas.style.visibility, '');
  assert.equal(harness.previewClip.hidden, false);
  assert.equal(harness.beforeLabel.hidden, false);
  assert.equal(harness.afterLabel.hidden, false);
  assert.equal(harness.divider.hidden, false);

  harness.modeControl.value = 'after';
  harness.modeControl.changeHandler();
  assert.equal(harness.previewClip.hidden, true);
  assert.equal(harness.sourceCanvas.style.visibility, '');
  assert.equal(harness.afterLabel.hidden, false);
});


test('mask preview controls and comparisons stay hidden until the masks panel is open', async () => {
  const snapshotProvider = async () => ({ width: 2, height: 1, pixels: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255]) });
  const harness = createPreviewHarness(snapshotProvider);
  harness.controller.mount();
  assert.equal(harness.controller.captureBefore(), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.toolbar.hidden, true);
  harness.modeControl.value = 'before';
  harness.modeControl.changeHandler();
  assert.equal(harness.previewClip.hidden, true);
  assert.equal(harness.sourceCanvas.style.visibility, '');
  assert.equal(harness.divider.hidden, true);

  harness.controller.setPanelVisible(true);
  assert.equal(harness.toolbar.hidden, false);
  assert.equal(harness.previewClip.hidden, false);
  assert.equal(harness.sourceCanvas.style.visibility, 'hidden');
  assert.equal(harness.beforeLabel.hidden, false);

  harness.controller.setPanelVisible(false);
  assert.equal(harness.toolbar.hidden, true);
  assert.equal(harness.previewClip.hidden, true);
  assert.equal(harness.sourceCanvas.style.visibility, '');
  assert.equal(harness.divider.hidden, true);
});

test('mask preview toolbar is positioned above the canvas stage', async () => {
  const { readFile } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const template = await readFile(resolve('packages/ui/src/components/EditorTemplate.ts'), 'utf8');
  const toolbarIndex = template.indexOf('id="canvas-preview-toolbar"');
  const stageIndex = template.indexOf('<div class="canvas-stage">');
  const zoomIndex = template.indexOf('<div class="zoom-controls">');
  assert.notEqual(toolbarIndex, -1);
  assert.ok(toolbarIndex < stageIndex);
  assert.ok(stageIndex < zoomIndex);
  assert.equal(template.slice(zoomIndex).includes('mask-preview-mode'), false);
});
