import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';

const read = (path) => readFile(resolve(path), 'utf8');

test('WebGPU clears the canvas with transparent pixels around the fitted document', async () => {
  const source = await read('packages/renderer/webgpu/WebGPURenderer.ts');
  assert.match(source, /clearValue:\s*\{\s*r:\s*0,\s*g:\s*0,\s*b:\s*0,\s*a:\s*0\s*\}/);
});

test('WebGL2 clears the canvas with transparent pixels around the fitted document', async () => {
  const source = await read('packages/renderer/webgl2/WebGL2Renderer.ts');
  assert.match(source, /clearColor\(0,\s*0,\s*0,\s*0\)/);
});

test('the canvas stage reveals the workspace background instead of painting grey letterbox bars', async () => {
  const source = await read('apps/web/src/styles.css');
  assert.match(source, /\.canvas-stage\s*\{[^}]*background:\s*transparent/s);
  assert.match(source, /#mask-before-preview\s*\{[^}]*object-fit:\s*contain/s);
});
