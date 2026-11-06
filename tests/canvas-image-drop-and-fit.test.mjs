import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dropping image files on the canvas stage is intercepted and imported as file layers', async () => {
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  assert.match(events, /stage\.addEventListener\('dragover'/);
  assert.match(events, /stage\.addEventListener\('drop'/);
  assert.match(events, /event\.preventDefault\(\);[\s\S]{0,120}getDroppedImageFiles/);
  assert.match(events, /createFileLayerFromSource\(\{ file, handle: null \}\)/);
  assert.match(events, /Array\.from\(dataTransfer\?\.files/);
  assert.match(events, /image\//);
});

test('canvas fit derives the CSS page size from stage and document aspect ratios', async () => {
  const state = await read('packages/ui/src/app/AppLayerStateFeatures.ts');
  const geometry = await read('packages/ui/src/tools/CanvasViewGeometry.ts');
  assert.match(state, /getCanvasFitSize\(stage\.clientWidth, stage\.clientHeight, this\.ctl\.doc\.width, this\.ctl\.doc\.height\)/);
  assert.match(state, /this\.canvas\.style\.width = `\$\{fit\.width\}px`/);
  assert.match(state, /this\.canvas\.style\.height = `\$\{fit\.height\}px`/);
  assert.match(geometry, /Math\.min\(availableWidth \/ documentWidth, availableHeight \/ documentHeight\)/);
  assert.match(geometry, /documentWidth \* scale/);
  assert.match(geometry, /documentHeight \* scale/);
});

test('canvas view recalculates after document replacement and stage resize', async () => {
  const documentFeatures = await read('packages/ui/src/app/AppDocumentFeatures.ts');
  const events = await read('packages/ui/src/app/AppEventFeatures.ts');
  assert.match(documentFeatures, /this\.refreshAfterDocumentReplacement\(\);\s*this\.applyCanvasView\(\);/);
  assert.match(events, /new ResizeObserver\(\(\) => \{\s*this\.applyCanvasView\(\);/);
});


test('selection preview is an absolute overlay and cannot shift the document canvas in the stage flex layout', async () => {
  const styles = await read('apps/web/src/styles.css');
  const overlay = styles.match(/\.canvas-stage>\#selection-preview\s*\{([^}]+)\}/);
  assert.ok(overlay, 'selection preview must have a dedicated canvas-stage overlay rule');
  assert.match(overlay[1], /position:\s*absolute/);
  assert.match(overlay[1], /inset:\s*0/);
  assert.match(overlay[1], /flex:\s*none/);
  assert.match(styles, /\.canvas-stage>\#canvas\s*\{[^}]*position:\s*relative/);
});
