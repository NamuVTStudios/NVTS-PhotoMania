import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let movePixelSurface;

before(async () => {
  vite = await createViteTestServer();
  ({ movePixelSurface } = await vite.ssrLoadModule('/packages/ui/src/tools/PixelLayerMover.ts'));
});

after(async () => {
  await vite?.close();
});

class MemorySurface {
  constructor(width, height, values) {
    this.w = width;
    this.h = height;
    this.pixels = new Uint8Array(width * height * 4);
    values.forEach((value, index) => {
      this.pixels[index * 4] = value;
      this.pixels[index * 4 + 3] = value ? 255 : 0;
    });
  }
  width() { return this.w; }
  height() { return this.h; }
  readRectToJS(x, y, width, height, target) {
    for (let row = 0; row < height; row++) {
      const start = ((y + row) * this.w + x) * 4;
      target.set(this.pixels.subarray(start, start + width * 4), row * width * 4);
    }
    return true;
  }
  writeRectFromJS(x, y, width, height, source) {
    for (let row = 0; row < height; row++) {
      const start = ((y + row) * this.w + x) * 4;
      this.pixels.set(source.subarray(row * width * 4, (row + 1) * width * 4), start);
    }
    return true;
  }
  values() {
    return Array.from({ length: this.w * this.h }, (_, index) => this.pixels[index * 4]);
  }
}

test('moves raster pixels horizontally without wrapping and clears the exposed edge', () => {
  const surface = new MemorySurface(4, 1, [1, 2, 3, 4]);
  movePixelSurface(surface, 1, 0);
  assert.deepEqual(surface.values(), [0, 1, 2, 3]);
});

test('moves raster pixels vertically without overwriting source rows', () => {
  const surface = new MemorySurface(2, 3, [1, 2, 3, 4, 5, 6]);
  movePixelSurface(surface, 0, 1);
  assert.deepEqual(surface.values(), [0, 0, 1, 2, 3, 4]);
});

test('clears all pixels when the translation moves the layer outside the document', () => {
  const surface = new MemorySurface(2, 2, [1, 2, 3, 4]);
  movePixelSurface(surface, 2, 0);
  assert.deepEqual(surface.values(), [0, 0, 0, 0]);
});
