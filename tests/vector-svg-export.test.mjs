import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let exportVectorShapeToSvg;

before(async () => {
  vite = await createViteTestServer();
  ({ exportVectorShapeToSvg } = await vite.ssrLoadModule('/packages/vector/src/VectorSvgExporter.ts'));
});

after(async () => {
  await vite?.close();
});

function shape(kind, overrides = {}) {
  return {
    id: 'shape-1', kind, x: 10, y: 20, width: 40, height: 30,
    color: '#112233', opacity: 1, strokeWidth: 2, ...overrides,
  };
}

test('serializa cada tipo de figura vectorial usando su estrategia', () => {
  const expectedTags = {
    rectangle: '<rect ', 'rounded-rectangle': '<rect ', ellipse: '<ellipse ', line: '<line ',
    polygon: '<path ', polyline: '<path ', bezier: '<path ', freehand: '<path ',
    star: '<polygon ', spiral: '<path ', text: '<text ',
  };

  for (const [kind, expectedTag] of Object.entries(expectedTags)) {
    assert.ok(exportVectorShapeToSvg(shape(kind)).startsWith(expectedTag), `La figura ${kind} debe generar ${expectedTag}`);
  }
});

test('preserva cierre de polígonos, manejadores Bezier y transformaciones', () => {
  const polygon = exportVectorShapeToSvg(shape('polygon', {
    points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 10, y: 12 }],
  }));
  const bezier = exportVectorShapeToSvg(shape('bezier', {
    points: [{ x: 0, y: 0, outX: 5, outY: 8 }, { x: 20, y: 10, inX: 15, inY: 2 }],
    rotation: 45,
  }));

  assert.match(polygon, /Z"/);
  assert.match(bezier, / C 5 8 15 2 20 10/);
  assert.match(bezier, /rotate\(45 10 5\)/);
});

test('escapa texto y valores de color antes de insertarlos en SVG', () => {
  const svg = exportVectorShapeToSvg(shape('text', {
    text: '<script>&', fontFamily: 'A&B', color: '" onload="alert(1)',
  }));

  assert.match(svg, /&lt;script&gt;&amp;/);
  assert.match(svg, /A&amp;B/);
  assert.match(svg, /&quot; onload=&quot;alert\(1\)/);
  assert.doesNotMatch(svg, /<script>/);
});
