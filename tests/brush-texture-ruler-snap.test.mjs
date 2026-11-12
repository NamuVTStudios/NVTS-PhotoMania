import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let BRUSH_PRESETS;
let getBrushTextureSample;
let applyBrushStamp;
let createRulerGeometry;
let snapPointToRuler;

before(async () => {
    vite = await createViteTestServer();
    ({ BRUSH_PRESETS } = await vite.ssrLoadModule('/packages/ui/src/tools/BrushPresetCatalog.ts'));
    ({ getBrushTextureSample } = await vite.ssrLoadModule('/packages/image-processing/src/brush/BrushTexture.ts'));
    ({ applyBrushStamp } = await vite.ssrLoadModule('/packages/image-processing/src/brush/BrushStampProcessor.ts'));
    ({ createRulerGeometry, snapPointToRuler } = await vite.ssrLoadModule('/packages/ui/src/features/comics/RulerGeometry.ts'));
});

after(async () => {
    await vite?.close();
});

test('todos los preajustes tienen textura asignada y una variante determinista propia', () => {
    assert.ok(BRUSH_PRESETS.length >= 90);
    assert.ok(BRUSH_PRESETS.every((preset) => preset.texturePattern && Number.isInteger(preset.textureSeed)));
    assert.equal(new Set(BRUSH_PRESETS.map((preset) => preset.textureSeed)).size, BRUSH_PRESETS.length);
});

test('dos preajustes de óleo producen depósitos diferentes', () => {
    const oilA = new Uint8Array(40 * 40 * 4);
    const oilB = new Uint8Array(40 * 40 * 4);
    const operation = (preset) => ({
        region: { left: 0, top: 0, width: 40, height: 40 },
        centerX: 20,
        centerY: 20,
        radius: 12,
        hardEdge: 4,
        fadeWidth: 8,
        erase: false,
        color: [20, 90, 140],
        opacity: 0.9,
        texture: 0.9,
        material: 'oil',
        texturePattern: preset.texturePattern,
        textureSeed: preset.textureSeed,
    });
    applyBrushStamp(oilA, operation(BRUSH_PRESETS.find((preset) => preset.id === 'oil-paint')));
    applyBrushStamp(oilB, operation(BRUSH_PRESETS.find((preset) => preset.id === 'wet-oil-blend')));
    assert.notDeepEqual(oilA, oilB);
});

test('los tramados manga generan rellenos de papel distintos y estables', () => {
    const fine = BRUSH_PRESETS.find((preset) => preset.id === 'manga-screentone-fine');
    const coarse = BRUSH_PRESETS.find((preset) => preset.id === 'manga-screentone-coarse');
    const sampleGrid = (preset) => Array.from({ length: 64 }, (_, index) => getBrushTextureSample(
        index % 8 + 0.5,
        Math.floor(index / 8) + 0.5,
        preset.texturePattern,
        0.35,
        preset.textureSeed,
    ));
    const fineSamples = sampleGrid(fine);
    assert.deepEqual(fineSamples, sampleGrid(fine));
    assert.notDeepEqual(fineSamples, sampleGrid(coarse));
});

test('las herramientas se ajustan a las reglas activas dentro de la tolerancia', () => {
    const geometry = createRulerGeometry('linear', 200, 120, 100, 60);
    assert.deepEqual(snapPointToRuler({ x: 103, y: 21 }, geometry, 5), { x: 100, y: 21 });
    assert.deepEqual(snapPointToRuler({ x: 130, y: 21 }, geometry, 5), { x: 130, y: 21 });
});
