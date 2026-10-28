import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let catalog;
let strategies;
let toolClasses;

before(async () => {
  vite = await createViteTestServer();
  catalog = await vite.ssrLoadModule('/packages/ui/src/tools/ToolCatalog.ts');
  toolClasses = await Promise.all([
    vite.ssrLoadModule('/packages/ui/src/tools/ToolsBase.ts'),
    vite.ssrLoadModule('/packages/ui/src/tools/ToolsRaster.ts'),
    vite.ssrLoadModule('/packages/ui/src/tools/ToolsVectors.ts'),
  ]);
  strategies = await vite.ssrLoadModule('/packages/ui/src/app/EditorStrategies.ts');
});

after(async () => {
  await vite?.close();
});

test('el catálogo registra todas las herramientas y sus clases base correspondientes', () => {
  const tools = catalog.createToolCatalog();
  const [base, raster, vectors] = toolClasses;
  assert.deepEqual([...tools.keys()].sort(), [
    'brush', 'clone-stamp', 'comic-panel', 'ellipse', 'eraser', 'eyedropper',
    'fill', 'gradient', 'hand', 'line', 'liquify', 'rectangle', 'smudge', 'text',
    'vector-select', 'vector-rectangle', 'vector-rounded-rectangle', 'vector-ellipse', 'vector-line',
    'vector-pen', 'vector-polygon', 'vector-star', 'vector-freehand', 'vector-polyline', 'vector-spiral',
    'pixel-rounded-rectangle', 'pixel-polyline', 'pixel-bezier', 'pixel-polygon', 'pixel-star', 'pixel-spiral',
  ].sort());
  assert.ok(tools.get('clone-stamp') instanceof raster.ToolsRaster);
  assert.ok(tools.get('comic-panel') instanceof vectors.ToolsVectors);
  assert.ok(tools.get('vector-rectangle') instanceof vectors.ToolsVectors);
  assert.ok(tools.get('vector-star') instanceof vectors.ToolsVectors);
  assert.ok(tools.get('vector-rounded-rectangle') instanceof vectors.ToolsVectors);
  assert.ok(tools.get('vector-polyline') instanceof vectors.ToolsVectors);
  assert.ok(tools.get('vector-spiral') instanceof vectors.ToolsVectors);
  assert.ok(tools.get('pixel-rounded-rectangle') instanceof raster.ToolsRaster);
  assert.ok(tools.get('pixel-polyline') instanceof raster.ToolsRaster);
  assert.ok(tools.get('pixel-bezier') instanceof raster.ToolsRaster);
  assert.ok(tools.get('pixel-polygon') instanceof raster.ToolsRaster);
  assert.ok(tools.get('pixel-star') instanceof raster.ToolsRaster);
  assert.ok(tools.get('pixel-spiral') instanceof raster.ToolsRaster);
  assert.equal(tools.get('pixel-spiral').canUseLayer('paint'), true);
  assert.equal(tools.get('pixel-spiral').canUseLayer('vector'), false);
  assert.ok(tools.get('brush') instanceof base.ToolsBase);
  assert.equal(tools.get('clone-stamp').canUseLayer('paint'), true);
  assert.equal(tools.get('clone-stamp').canUseLayer('vector'), false);
  assert.equal(tools.get('comic-panel').canUseLayer('vector'), true);
  assert.equal(tools.get('comic-panel').canUseLayer('paint'), false);
  assert.equal(tools.get('vector-ellipse').canUseLayer('vector'), true);
  assert.equal(tools.get('vector-ellipse').canUseLayer('paint'), false);
  assert.equal(tools.get('eyedropper').canUseLayer('vector'), true);
});

test('el Tampón de clonar copia píxeles muestreados en el destino', () => {
  const strategy = new strategies.CloneStampStrategy();
  const target = new Uint8Array([0, 0, 0, 0]);
  const changed = strategy.apply(target, {
    region: { left: 1, top: 0, width: 1, height: 1 },
    centerX: 1.5, centerY: 0.5, radius: 2, hardEdge: 2, fadeWidth: 0.5,
    erase: false, color: [0, 0, 0], opacity: 1,
  }, {
    sourcePixels: new Uint8Array([220, 40, 20, 255]),
    sourceLeft: 0, sourceTop: 0, sourceWidth: 1, sourceHeight: 1,
    documentWidth: 3, documentHeight: 1,
    sourcePoint: { x: 0, y: 0 }, destinationStart: { x: 1, y: 0 },
  });
  assert.equal(changed, true);
  assert.deepEqual([...target], [220, 40, 20, 255]);
});

test('el Tampón de clonar no cambia píxeles si el origen queda fuera del documento', () => {
  const strategy = new strategies.CloneStampStrategy();
  const target = new Uint8Array([10, 20, 30, 255]);
  const changed = strategy.apply(target, {
    region: { left: 0, top: 0, width: 1, height: 1 },
    centerX: 0.5, centerY: 0.5, radius: 2, hardEdge: 2, fadeWidth: 0.5,
    erase: false, color: [0, 0, 0], opacity: 1,
  }, {
    sourcePixels: new Uint8Array([220, 40, 20, 255]),
    sourceLeft: 0, sourceTop: 0, sourceWidth: 1, sourceHeight: 1,
    documentWidth: 1, documentHeight: 1,
    sourcePoint: { x: 0, y: 0 }, destinationStart: { x: 10, y: 0 },
  });
  assert.equal(changed, false);
  assert.deepEqual([...target], [10, 20, 30, 255]);
});
