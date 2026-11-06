import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const layerPanelPath = resolve(root, 'packages/ui/src/panels/LayersPanel.ts');
const layerPanelStylesPath = resolve(root, 'apps/web/src/styles.css');
const layerPanelFeaturesPath = resolve(root, 'packages/ui/src/app/AppLayerPanelFeatures.ts');

test('the New Layer menu offers a style mask', async () => {
  const source = await readFile(layerPanelPath, 'utf8');
  assert.match(source, /data-mask-type="styles"/);
  assert.match(source, /Máscara de estilos/);
});

test('layer masks render beneath their owning layer and open on a left double-click', async () => {
  const source = await readFile(layerPanelPath, 'utf8');
  const styles = await readFile(layerPanelStylesPath, 'utf8');
  const features = await readFile(layerPanelFeaturesPath, 'utf8');
  assert.match(source, /layer-mask-row/);
  assert.match(source, /layer-mask-children/);
  assert.match(styles, /\.layer-mask-row/);
  assert.match(styles, /\.layer-mask-children/);
  assert.match(features, /onSelectMask:/);
  assert.match(features, /onToggleMask:/);
  assert.match(features, /renderLayerMaskEditor/);
});

test('double-clicking FX is not interrupted by the layer row selection handler', async () => {
  const source = await readFile(layerPanelPath, 'utf8');
  assert.match(source, /button\.onclick = \(event\) => event\.stopPropagation\(\)/);
  assert.match(source, /button\.ondblclick = \(event\) =>/);
});

test('layer style editor stages styles in a mask and previews changes before applying', async () => {
  const features = await readFile(layerPanelFeaturesPath, 'utf8');
  const panel = await readFile(resolve(root, 'packages/ui/src/panels/LayerEffectsPanel.ts'), 'utf8');
  assert.match(features, /previewLayerStyleSettings/);
  assert.match(features, /createMaskForLayer\(layer, 'styles'\)/);
  assert.match(features, /replaceLayerMasks/);
  assert.match(panel, /bindPreviewChanges/);
  assert.match(panel, /this\.onPreview\(this\.getStyle\(\)\)/);
});


test('style-mask commits are atomic for undo and never write layer style pixels', async () => {
  const controller = await readFile(resolve(root, 'packages/document-model/src/DocumentController.ts'), 'utf8');
  const features = await readFile(layerPanelFeaturesPath, 'utf8');
  assert.match(controller, /replaceLayerMasksAndProps\(/);
  assert.match(controller, /this\.recordStructure\(/);
  assert.match(features, /replaceLayerMasksAndProps\(/);
  assert.doesNotMatch(features, /this\.ctl\.setLayerAppearance/);
});


test('the shared layer-mask editor requires a double-click to open a mask entry', async () => {
  const features = await readFile(layerPanelFeaturesPath, 'utf8');
  assert.match(features, /editor\.addEventListener\('dblclick', \(event\) => this\.handleMaskDoubleClick\(event\)\)/);
  assert.match(features, /private handleMaskDoubleClick\(event: MouseEvent\)/);
  assert.match(features, /this\.openLayerMaskEditor\(selectedLayer, maskId\)/);
});


test('all ten layer-style families expose repeatable additional instances', async () => {
  const panel = await readFile(resolve(root, 'packages/ui/src/panels/LayerEffectsPanel.ts'), 'utf8');
  const model = await readFile(resolve(root, 'packages/shared/src/nvtsphoto.ts'), 'utf8');
  const renderer = await readFile(resolve(root, 'packages/image-processing/src/effects/LayerStyleRenderer.ts'), 'utf8');
  const stacks = [
    ['stroke', 'strokes'], ['glow', 'outerGlows'], ['shadow', 'dropShadows'],
    ['bevel', 'bevelEmbosses'], ['gradient', 'gradientOverlays'],
    ['inner-shadow', 'innerShadows'], ['inner-glow', 'innerGlows'],
    ['satin', 'satins'], ['color-overlay', 'colorOverlays'], ['pattern', 'patternOverlays'],
  ];
  for (const [uiName, modelName] of stacks) {
    assert.match(panel, new RegExp(`effects-${uiName}-add`), `${uiName} should offer an add button`);
    assert.match(panel, new RegExp(`effects-${uiName}-stack`), `${uiName} should render an instance list`);
    assert.match(model, new RegExp(`\\b${modelName}\\?`), `${modelName} should be persisted in the model`);
    assert.match(renderer, new RegExp(modelName), `${modelName} should be rendered`);
  }
});
