import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('pixel and vector shape tools are grouped without changing their tool IDs', async () => {
  const template = await read('packages/ui/src/components/EditorTemplate.ts');
  const pixelGroup = template.split('id="pixel-shapes-group"')[1]?.split('</details>')[0] ?? '';
  const vectorGroup = template.split('id="vector-shapes-group"')[1]?.split('</details>')[0] ?? '';
  assert.ok(pixelGroup.includes('id="rail-line"'));
  assert.ok(pixelGroup.includes('id="rail-pixel-rounded-rectangle"'));
  assert.ok(vectorGroup.includes('id="rail-vector-rectangle"'));
  assert.ok(vectorGroup.includes('id="rail-vector-freehand"'));
  assert.ok(template.includes('id="rail-move"'));
});


test('drawing tools create a visible compatible layer instead of refusing incompatible selections', async () => {
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  const state = await read('packages/ui/src/app/AppLayerStateFeatures.ts');
  assert.ok(events.includes('ensureToolTargetLayer(t, definition.target)'));
  assert.ok(events.includes("this.ctl.addLayerAbove(type, name, active.id)"));
  assert.ok(events.includes('this.ctl.addLayer(type, name)'));
  assert.ok(events.includes('No reutilizar una capa compatible que pueda estar debajo de la capa activa'));
  for (const selector of ["'#rail-brush'", "'#rail-eraser'", "'#rail-line'"]) {
    assert.ok(state.includes(selector), `missing disabled-state binding for ${selector}`);
  }
  assert.ok(state.includes("], false);"));
  assert.ok(state.includes("'#rail-vector-rectangle', '#rail-vector-rounded-rectangle'"));
});

test('undo and redo finish queued pointer-up edits before navigating history', async () => {
  const drawing = await read('packages/ui/src/app/AppDrawingFeatures.ts');
  const file = await read('packages/ui/src/app/AppFileFeatures.ts');
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  assert.ok(drawing.includes('protected prepareHistoryNavigation(): boolean'));
  assert.ok(drawing.includes('while (this.hasPendingBrushDabs()) this.processNextBrushDab()'));
  assert.ok(file.includes('!this.prepareHistoryNavigation()'));
  assert.ok(events.includes("(key === 'z' || key === 'y') && this.isTypingTarget"));
});

test('new text and standard layers are not inserted into hidden or locked groups', async () => {
  const state = await read('packages/ui/src/app/AppLayerStateFeatures.ts');
  const layers = await read('packages/ui/src/app/AppLayerPanelFeatures.ts');
  assert.ok(state.includes('const canInsertAbove = Boolean(active'));
  assert.ok(state.includes("this.ctl.addLayer('text', name)"));
  assert.ok(layers.includes("this.ctl.addLayer(type, name)"));
});

test('import and raster export shortcuts call the same commands as the file menu', async () => {
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  const menu = await read('packages/ui/src/components/ShellTemplates.ts');
  assert.ok(events.includes("key === 'i' && event.altKey"));
  assert.ok(events.includes("void this.createFileLayer()"));
  assert.ok(events.includes("key === 'e' && event.altKey && event.shiftKey"));
  assert.ok(events.includes("void this.exportVisibleImage('image/jpeg')"));
  assert.ok(events.includes("key === 'e' && event.shiftKey"));
  assert.ok(events.includes("void this.exportVisibleImage('image/png')"));
  assert.ok(menu.includes('Ctrl+Alt+I'));
  assert.ok(menu.includes('Ctrl+Shift+E'));
  assert.ok(menu.includes('Ctrl+Alt+Shift+E'));
});

test('text tool exposes an action to create additional independent text layers', async () => {
  const state = await read('packages/ui/src/app/AppLayerStateFeatures.ts');
  assert.ok(state.includes('id="tool-text-new-layer"'));
  assert.ok(state.includes('void this.createTextAt(point)'));
});

test('vector editor removes the generic list divider', async () => {
  const css = await read('apps/web/src/styles.css');
  const rules = css.split('.vector-editor-grid>.editor-list');
  assert.ok(rules.length > 1);
  assert.ok(rules[1].split('}')[0].includes('border-right: 0;'));
});

test('mask visibility checkbox stops row click propagation and only updates the mask state', async () => {
  const panel = await read('packages/ui/src/panels/LayersPanel.ts');
  const app = await read('packages/ui/src/app/AppLayerPanelFeatures.ts');
  const toggle = app.split('onToggleMask: (layer, mask, enabled) => {')[1]?.split('},')[0] ?? '';
  assert.ok(panel.includes("enabled.addEventListener('click', (event) => event.stopPropagation())"));
  assert.ok(toggle.includes('updateMaskField'));
  assert.equal(toggle.includes('openLayerEffectsEditor'), false);
});


test('initial document is installed before editor bindings read document state', async () => {
  const app = await read('packages/ui/src/App.ts');
  const initializeEditor = app.split('async initializeEditor')[1]?.split('\n  }')[0] ?? '';
  const createDocumentIndex = initializeEditor.indexOf('this.newDocument(');
  const bindControlsIndex = initializeEditor.indexOf('this.bind()');
  assert.ok(createDocumentIndex >= 0, 'initializeEditor must create the initial document');
  assert.ok(bindControlsIndex >= 0, 'initializeEditor must bind editor controls');
  assert.ok(createDocumentIndex < bindControlsIndex, 'the document must exist before tool synchronization runs');
});


test('normal Move never starts or commits a transform-mask session', async () => {
  const drawing = await read('packages/ui/src/app/AppDrawingFeatures.ts');
  const moveMethod = drawing.split('private commitLayerContentMove(')[1]?.split('private commitTextLayerMove(')[0] ?? '';
  const beginMove = drawing.split('protected beginElementMove(')[1]?.split('private reportMoveUnavailable(')[0] ?? '';
  assert.ok(beginMove.includes('rasterMoveGesture'));
  assert.equal(beginMove.includes('beginLayerTransformSession'), false);
  assert.equal(moveMethod.includes('createLayerMask'), false);
  assert.equal(moveMethod.includes('replaceLayerMasks'), false);
});

test('all available Clip Studio-inspired tools are exposed and have keyboard shortcuts', async () => {
  const template = await read('packages/ui/src/components/EditorTemplate.ts');
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  const state = await read('packages/ui/src/app/AppLayerStateFeatures.ts');
  for (const id of ['rail-vector-eraser', 'rail-dust-removal', 'rail-speech-bubble', 'rail-flash', 'rail-vector-parallel-lines', 'rail-vector-radial-lines']) {
    assert.ok(template.includes(`id="${id}"`), `missing toolbar button ${id}`);
    assert.ok(events.includes(`#${id}`), `missing event binding ${id}`);
    assert.ok(state.includes(`#${id}`), `missing state mapping ${id}`);
  }
  for (const shortcut of ["'shift+e': 'vector-eraser'", "'shift+u': 'dust-removal'", "'shift+w': 'speech-bubble'", "'shift+f': 'flash'", "'shift+o': 'vector-parallel-lines'", "'shift+p': 'vector-radial-lines'"]) {
    assert.ok(events.includes(shortcut), `missing shortcut ${shortcut}`);
  }
});

test('Delete preferences preserve separate layer and mask behavior', async () => {
  const preferences = await read('packages/ui/src/panels/PreferencesPanel.ts');
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  assert.ok(preferences.includes('layerDeleteBehavior'));
  assert.ok(preferences.includes('maskDeleteBehavior'));
  assert.ok(events.includes("preferences.maskDeleteBehavior === 'clear'"));
  assert.ok(events.includes("preferences.layerDeleteBehavior === 'remove'"));
});

test('tool presets include sketch, inking, decoration, and texture groups with additional presets', async () => {
  const presets = await read('packages/ui/src/tools/BrushPresetCatalog.ts');
  for (const category of ['sketch', 'inking', 'decoration', 'texture']) assert.ok(presets.includes(`category: '${category}'`));
  for (const id of ['soft-graphite-6b', 'blue-pencil-rough', 'comic-hatching', 'fine-liner', 'stippling', 'petal-chain', 'sponge-grain', 'sand-grain']) assert.ok(presets.includes(`id: '${id}'`));
});


test('selection tools are grouped, wired, and have distinct keyboard shortcuts', async () => {
  const template = await read('packages/ui/src/components/EditorTemplate.ts');
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  const drawing = await read('packages/ui/src/app/AppDrawingFeatures.ts');
  const tools = await read('packages/ui/src/tools/ToolsBase.ts');
  for (const id of ['select-rectangle', 'select-ellipse', 'select-lasso', 'magic-wand', 'selection-clear']) {
    assert.ok(tools.includes(`'${id}'`));
    assert.ok(template.includes(`id="rail-${id}"`));
    assert.ok(events.includes(`#rail-${id}`));
  }
  assert.ok(drawing.includes('createMagicWandMask'));
  assert.ok(drawing.includes('restoreOutsideSelection'));
  for (const shortcut of ["'shift+r': 'select-rectangle'", "'shift+q': 'select-ellipse'", "'shift+l': 'select-lasso'", "'shift+m': 'magic-wand'", "'shift+x': 'selection-clear'"]) assert.ok(events.includes(shortcut));
});

test('normal move flow does not use transform masks and transform remains an explicit layer command', async () => {
  const drawing = await read('packages/ui/src/app/AppDrawingFeatures.ts');
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  const moveMethod = drawing.split('private commitLayerContentMove(')[1]?.split('private commitTextLayerMove(')[0] ?? '';
  const beginMove = drawing.split('protected beginElementMove(')[1]?.split('private reportMoveUnavailable(')[0] ?? '';
  assert.equal(beginMove.includes('beginLayerTransformSession'), false);
  assert.equal(moveMethod.includes('createLayerMask'), false);
  assert.equal(moveMethod.includes('replaceLayerMasks'), false);
  assert.ok(events.includes("if (key === 't' && event.shiftKey && !event.altKey && !this.isTypingTarget(event.target as HTMLElement | null))"));
  assert.ok(events.includes("this.runLayerMenuAction('transform')"));
});

test('mask rows do not wrap their draggable content in a blocking button', async () => {
  const panel = await read('packages/ui/src/panels/LayersPanel.ts');
  const row = panel.split('function createLayerMaskRow(')[1]?.split('function getLayerMaskIcon(')[0] ?? '';
  assert.ok(row.includes("document.createElement('div')"));
  assert.ok(row.includes("select.setAttribute('role', 'button')"));
  assert.equal(row.includes("document.createElement('button')"), false);
});
