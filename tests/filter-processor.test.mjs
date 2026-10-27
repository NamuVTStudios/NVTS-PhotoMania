import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let applyCustomFilter;
let blendImageData;
let getCssFilter;
let isCustomFilter;
let renderFilteredImage;

before(async () => {
  vite = await createViteTestServer();
  ({ applyCustomFilter, blendImageData, getCssFilter, isCustomFilter, renderFilteredImage } = await vite.ssrLoadModule('/packages/image-processing/src/filters/FilterProcessor.ts'));
});

after(async () => {
  await vite?.close();
});

function image(width = 4, height = 4) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = (index * 7) % 256;
    data[index + 1] = (index * 11) % 256;
    data[index + 2] = (index * 13) % 256;
    data[index + 3] = 255;
  }
  return { data, width, height };
}

test('despacha los filtros CSS y limita la intensidad al rango permitido', () => {
  assert.equal(getCssFilter('grayscale', 0.5), 'grayscale(50%)');
  assert.equal(getCssFilter('blur', 0.5), 'blur(6px)');
  assert.equal(getCssFilter('brightness', 2), 'brightness(200%)');
  assert.equal(getCssFilter('hue-rotate', -1), 'hue-rotate(0deg)');
  assert.equal(getCssFilter('posterize', 0.5), 'none');
});

test('el registro marca y procesa todas las estrategias personalizadas', () => {
  const customKinds = ['posterize', 'threshold', 'pixelate', 'solarize', 'noise', 'vignette', 'duotone', 'sharpen', 'edge-detect'];

  for (const kind of customKinds) {
    const pixels = image();
    assert.equal(isCustomFilter(kind), true, `${kind} debe ser un filtro personalizado`);
    assert.equal(applyCustomFilter(pixels, kind, 0.7, 1, 1, 4, 4), pixels);
  }

  const pixels = image();
  const original = new Uint8ClampedArray(pixels.data);
  assert.equal(isCustomFilter('grayscale'), false);
  assert.equal(applyCustomFilter(pixels, 'grayscale', 0.7), pixels);
  assert.deepEqual(pixels.data, original);
});

test('mezcla imágenes filtradas por opacidad reutilizando el buffer original', () => {
  const original = { data: Uint8ClampedArray.from([10, 20, 30, 40]) };
  const filtered = { data: Uint8ClampedArray.from([110, 120, 130, 140]) };
  assert.equal(blendImageData(original, filtered, 0.5), original);
  assert.deepEqual([...original.data], [60, 70, 80, 90]);
  assert.deepEqual([...blendImageData(original, filtered, 0).data], [60, 70, 80, 90]);
  assert.deepEqual([...blendImageData(original, filtered, 1).data], [110, 120, 130, 140]);
});

test('aplica el filtro Canvas y procesa el área solicitada con el orden esperado', () => {
  const events = [];
  let activeFilter = '';
  const outputContext = {
    set filter(value) { activeFilter = value; events.push(`filter:${value}`); },
    get filter() { return activeFilter; },
    drawImage(source, x, y) { events.push(`draw:${source.id}:${x}:${y}:${activeFilter}`); },
    getImageData(x, y, width, height) {
      events.push(`read:${x}:${y}:${width}:${height}`);
      return image(width, height);
    },
  };
  const result = renderFilteredImage({ id: 'source' }, outputContext, 'grayscale', 0.5, {
    x: 3, y: 4, width: 2, height: 1, fullWidth: 10, fullHeight: 8,
  });
  assert.deepEqual(events, [
    'filter:grayscale(50%)',
    'draw:source:0:0:grayscale(50%)',
    'filter:none',
    'read:0:0:2:1',
  ]);
  assert.equal(result.width, 2);
  assert.equal(result.height, 1);
});
