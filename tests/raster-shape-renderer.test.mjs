import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { before, test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
let renderRasterShape;

before(async () => {
  const source = readFileSync(resolve('packages/ui/src/app/RasterShapeRenderer.ts'), 'utf8');
  const { outputText, diagnostics = [] } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(diagnostics.length, 0, 'El renderizador raster debe transpilar sin errores sintácticos.');
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
  ({ renderRasterShape } = await import(moduleUrl));
});

function createContext() {
  const calls = [];
  const context = {
    calls,
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    beginPath: () => calls.push('beginPath'),
    moveTo: () => calls.push('moveTo'),
    lineTo: () => calls.push('lineTo'),
    quadraticCurveTo: () => calls.push('quadraticCurveTo'),
    bezierCurveTo: () => calls.push('bezierCurveTo'),
    closePath: () => calls.push('closePath'),
    fill: () => calls.push('fill'),
    stroke: () => calls.push('stroke'),
  };
  return context;
}

const settings = {
  color: '#e03030', opacity: 100, size: 4, lineCap: 'round', lineJoin: 'round',
  shapeFill: true, shapeCornerRadius: 12, polygonSides: 6, starPoints: 5, spiralTurns: 4,
};

const cases = [
  ['pixel-rounded-rectangle', 'quadraticCurveTo'],
  ['pixel-polyline', 'lineTo'],
  ['pixel-bezier', 'bezierCurveTo'],
  ['pixel-polygon', 'lineTo'],
  ['pixel-star', 'lineTo'],
  ['pixel-spiral', 'lineTo'],
];

for (const [tool, expectedCall] of cases) {
  test(`${tool} renders a raster path`, () => {
    const context = createContext();
    renderRasterShape(
      context,
      tool,
      { x: 10, y: 10 },
      { x: 80, y: 60 },
      settings,
      [{ x: 10, y: 10 }, { x: 40, y: 20 }, { x: 80, y: 60 }],
    );
    assert.ok(context.calls.includes(expectedCall));
    assert.ok(context.calls.includes('stroke'));
    assert.equal(context.calls[0], 'save');
    assert.equal(context.calls.at(-1), 'restore');
  });
}
