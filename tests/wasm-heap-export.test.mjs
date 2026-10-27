import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const buildScript = await readFile(new URL('../packages/engine/build.sh', import.meta.url), 'utf8');
const engineClient = await readFile(new URL('../packages/wasm-bindings/ts-wrapper/EngineClient.ts', import.meta.url), 'utf8');

test('Emscripten exporta HEAPU8 para los wrappers TypeScript', () => {
  assert.match(buildScript, /-s EXPORTED_RUNTIME_METHODS=HEAPU8/);
});

test('el runtime valida HEAPU8 y muestra una causa legible si falta', () => {
  assert.match(engineClient, /function validateHeapExport\(mod: NvtsEngineModule\)/);
  assert.match(engineClient, /no expone HEAPU8/);
});
