import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let applyBrushStamp;
let brushPresets;
let resolveBrushMaterial;
let readBrushPointerSample;
let getPressureScale;
let interpolateBrushPointerSample;
let shouldUsePointerUpSample;
let isCurrentStrokePointer;
let isPenContactSample;

before(async () => {
  vite = await createViteTestServer();
  ({ applyBrushStamp } = await vite.ssrLoadModule('/packages/image-processing/src/brush/BrushStampProcessor.ts'));
  ({ BRUSH_PRESETS: brushPresets, resolveBrushMaterial } = await vite.ssrLoadModule('/packages/ui/src/tools/BrushPresetCatalog.ts'));
  ({ readBrushPointerSample, getPressureScale, interpolateBrushPointerSample, shouldUsePointerUpSample, isCurrentStrokePointer, isPenContactSample } = await vite.ssrLoadModule('/packages/ui/src/tools/TabletInput.ts'));
});

after(async () => { await vite?.close(); });

function stamp(material, texture = 0.7) {
  const width = 32;
  const pixels = new Uint8Array(width * width * 4);
  applyBrushStamp(pixels, {
    region: { left: 0, top: 0, width, height: width },
    centerX: 16, centerY: 16, radius: 14, hardEdge: 12, fadeWidth: 2.5,
    erase: false, color: [190, 75, 45], opacity: 0.94, tipShape: 'round', texture, material, materialAngle: 0.7,
  });
  return pixels;
}

test('los preajustes de papel existen y cada uno declara un material', () => {
  const paper = brushPresets.filter((preset) => preset.category === 'paper');
  assert.ok(paper.length >= 10);
  assert.ok(paper.every((preset) => resolveBrushMaterial(preset) !== 'generic'));
});

test('los materiales de óleo, acuarela y grafito generan depósitos distintos', () => {
  const oil = stamp('oil');
  const watercolor = stamp('watercolor');
  const graphite = stamp('graphite');
  assert.notDeepEqual([...oil], [...watercolor]);
  assert.notDeepEqual([...oil], [...graphite]);
  assert.notDeepEqual([...watercolor], [...graphite]);
});

test('la presión del lápiz afecta el tamaño y se interpola entre muestras', () => {
  const low = readBrushPointerSample({ pointerType: 'pen', pressure: 0.15, tiltX: 20, tiltY: 10 });
  const high = readBrushPointerSample({ pointerType: 'pen', pressure: 0.9, tiltX: 60, tiltY: -20 });
  assert.ok(getPressureScale(high, 1) > getPressureScale(low, 1));
  const middle = interpolateBrushPointerSample(low, high, 0.5);
  assert.equal(middle.pointerType, 'pen');
  assert.ok(middle.pressure > low.pressure && middle.pressure < high.pressure);
});

test('el mouse conserva un tamaño constante aunque informe presión variable', () => {
  const mouse = readBrushPointerSample({ pointerType: 'mouse', pressure: 0.2, tiltX: 0, tiltY: 0 });
  assert.equal(getPressureScale(mouse, 1), 1);
});

test('los eventos pointerup de lápiz no se usan como punto final del trazo', () => {
  assert.equal(shouldUsePointerUpSample('pen'), false);
  assert.equal(shouldUsePointerUpSample('mouse'), true);
  assert.equal(shouldUsePointerUpSample('touch'), true);
});

test('el trazo solo acepta muestras del lápiz que lo inició y se detiene al levantarlo', () => {
  assert.equal(isCurrentStrokePointer(7, 7), true);
  assert.equal(isCurrentStrokePointer(7, 8), false);
  assert.equal(isCurrentStrokePointer(7, 7, true), false);
  assert.equal(isCurrentStrokePointer(null, 8), true);
});

test('los movimientos de hover del lápiz no se interpretan como trazo', () => {
  assert.equal(isPenContactSample('pen', 0, 0), false);
  assert.equal(isPenContactSample('pen', 1, 0.2), true);
  assert.equal(isPenContactSample('pen', 1, 0), true);
  assert.equal(isPenContactSample('mouse', 0, 0), true);
});
