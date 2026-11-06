import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFile(resolve(root, path), 'utf8');

const [toolsBase, events, drawing, preferences, layersPanel, layerController, editorTemplate, styles, presets, overlay, rulerGeometry] = await Promise.all([
  read('packages/ui/src/tools/ToolsBase.ts'),
  read('packages/ui/src/app/AppEventFeatures.ts'),
  read('packages/ui/src/app/AppDrawingFeatures.ts'),
  read('packages/ui/src/panels/PreferencesPanel.ts'),
  read('packages/ui/src/panels/LayersPanel.ts'),
  read('packages/ui/src/app/AppLayerPanelFeatures.ts'),
  read('packages/ui/src/components/EditorTemplate.ts'),
  read('apps/web/src/styles.css'),
  read('packages/ui/src/tools/BrushPresetCatalog.ts'),
  read('packages/ui/src/features/comics/ComicGuideOverlay.ts'),
  read('packages/ui/src/features/comics/RulerGeometry.ts'),
]);

function toolIds(source) {
  const union = source.split('export type VectorDrawingToolId')[0];
  return [...new Set([...union.matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]))];
}

function toolShortcutMap(source) {
  const start = source.indexOf('const tools: Record<string, Tool>');
  const end = source.indexOf('};', start);
  return [...source.slice(start, end).matchAll(/(?:^|[,\s])([^:,]+): '([a-z0-9-]+)'/g)].map((match) => ({ shortcut: match[1].trim(), tool: match[2] }));
}

test('Delete preferences expose remove/clear behavior for both layers and masks', () => {
  assert.match(preferences, /id="pref-layer-delete-behavior"/);
  assert.match(preferences, /id="pref-mask-delete-behavior"/);
  assert.match(events, /preferences\.layerDeleteBehavior === 'remove'/);
  assert.match(events, /preferences\.maskDeleteBehavior === 'clear'/);
  assert.match(events, /clearLayerContent\(layer\.id\)/);
  assert.match(events, /clearMaskContent\(layer\.id, maskId\)/);
});

test('all tools have a keyboard shortcut and each mapping resolves to a registered tool', () => {
  const ids = toolIds(toolsBase);
  const mappings = toolShortcutMap(events);
  const covered = new Set(mappings.map((mapping) => mapping.tool));
  assert.deepEqual(ids.filter((id) => !covered.has(id)), []);
  assert.equal(new Set(mappings.map((mapping) => mapping.shortcut)).size, mappings.length, 'shortcuts must not collide');
});

test('layers and masks are draggable and are reordered through document-controller methods', () => {
  assert.match(layersPanel, /row\.draggable = true/);
  assert.match(layersPanel, /bindLayerTreeDragAndDrop\(list, callbacks\)/);
  assert.match(layersPanel, /onMoveLayer\?\./);
  assert.match(layersPanel, /onMoveMask\?\./);
  assert.match(layerController, /moveLayerRelative\(sourceId, targetId, position\)/);
  assert.match(layerController, /moveMaskRelative\(sourceLayerId, maskId, targetLayerId, targetMaskId, position\)/);
});

test('normal Move does not open a transform session or create a transform mask', () => {
  const start = drawing.indexOf('protected beginElementMove(');
  const end = drawing.indexOf('private reportMoveUnavailable(', start);
  const moveMethod = drawing.slice(start, end);
  assert.match(moveMethod, /moveOperation = 'content-only'/);
  assert.doesNotMatch(moveMethod, /beginLayerTransformSession|createLayerMask/);
  const transformStart = drawing.indexOf('protected startLayerTransform(');
  const transformEnd = drawing.indexOf('protected handleTransformSessionKey(', transformStart);
  const transformMethod = drawing.slice(transformStart, transformEnd);
  assert.doesNotMatch(transformMethod, /this\.tool === 'move'/);
  assert.match(transformMethod, /beginLayerTransformSession\(layer, false\)/);
});

test('all brush families are populated with at least 10 presets each', () => {
  const matches = [...presets.matchAll(/category: '(sketch|inking|decoration|texture)'/g)].map((match) => match[1]);
  for (const category of ['sketch', 'inking', 'decoration', 'texture']) {
    assert.ok(matches.filter((item) => item === category).length >= 10, `${category} preset family is too small`);
  }
});

test('new selection and correction tools are grouped in the editor rail', () => {
  for (const id of ['rail-select-polygon', 'rail-selection-brush', 'rail-selection-erase', 'rail-vector-line-correction']) {
    assert.ok(editorTemplate.includes(`id="${id}"`), `missing button ${id}`);
  }
  assert.match(editorTemplate, /selection-tools-group/);
  assert.match(editorTemplate, /correction-tools-group/);
});

test('both themes use contrasted layer and effect icons; light option controls have no card border', () => {
  assert.match(styles, /:root\[data-theme="light"\] \.layer-type-icon/);
  assert.match(styles, /:root:not\(\[data-theme="light"\]\) \.layer-type-icon/);
  assert.match(styles, /:root\[data-theme=\"light\"\] \.tool-options \.tool-setting,/);
  assert.match(styles, /:root\[data-theme=\"light\"\] \.tool-options \.advanced-setting,/);
  assert.match(styles, /:root\[data-theme=\"light\"\] \.tool-options \.advanced-check/);
});


test('ruler guide controls and modes render only through the non-exported overlay', () => {
  for (const mode of ['linear', 'curved', 'perspective', 'fisheye', 'parallel', 'radial', 'concentric']) {
    assert.ok(rulerGeometry.includes(`'${mode}'`), `missing ruler geometry mode ${mode}`);
  }
  assert.match(editorTemplate, /id=\"ruler-guide-mode\"/);
  assert.match(editorTemplate, /id=\"toggle-ruler-guides\"/);
  assert.match(overlay, /createRulerGeometry\(mode/);
  assert.match(overlay, /canvas\.id = 'comic-guide-overlay'/);
});

test('vector eraser routes line strokes through intersection-aware path erasure', async () => {
  const helper = await read('packages/ui/src/app/VectorStrokeEraser.ts');
  assert.match(drawing, /eraseVectorStrokeAt\(shapes, point/);
  assert.match(helper, /findTargetIntersections/);
  assert.match(helper, /splitPathAroundRange/);
});
