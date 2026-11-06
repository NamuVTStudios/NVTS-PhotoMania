import test from 'node:test';
import assert from 'node:assert/strict';
import { createGapClosedMatchMask } from '../packages/ui/src/tools/GapClosure.ts';

test('gap closure blocks a one-pixel opening in a fill boundary without changing mask size', () => {
  const width = 7;
  const height = 7;
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4 + 3] = 255;
  }
  // A red frame around a black interior, with a single-pixel opening at the top.
  for (let x = 1; x <= 5; x += 1) {
    const offset = (1 * width + x) * 4;
    pixels[offset] = 255;
    pixels[offset + 3] = 255;
  }
  for (let y = 1; y <= 5; y += 1) {
    for (const x of [1, 5]) {
      const offset = (y * width + x) * 4;
      pixels[offset] = 255;
      pixels[offset + 3] = 255;
    }
  }
  for (let x = 1; x <= 5; x += 1) {
    const offset = (5 * width + x) * 4;
    pixels[offset] = 255;
    pixels[offset + 3] = 255;
  }
  // Open the middle pixel in the upper border.
  pixels[(1 * width + 3) * 4] = 0;
  pixels[(1 * width + 3) * 4 + 1] = 0;
  pixels[(1 * width + 3) * 4 + 2] = 0;
  const result = createGapClosedMatchMask(pixels, width, height, [0, 0, 0, 255], 0, 1);
  assert.equal(result.length, width * height);
  assert.equal(result[1 * width + 3], 0, 'gap in the red barrier is closed');
  assert.equal(result[3 * width + 3], 1, 'interior remains matching the fill seed');
  assert.equal(result[0], 1, 'outside area remains fillable only when seed matches it');
  assert.ok([...result].every((value) => value === 0 || value === 1));
});
