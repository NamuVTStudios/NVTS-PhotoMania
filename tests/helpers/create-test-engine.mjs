import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import createEngine from '../../packages/wasm-bindings/build/engine.js';

const wasmPath = fileURLToPath(new URL('../../packages/wasm-bindings/build/engine.wasm', import.meta.url));
const wasmBinary = readFileSync(wasmPath);

/** Initializes the generated Emscripten module with local Wasm bytes in Node.js. */
export function createTestEngine() {
  return createEngine({
    instantiateWasm(imports, onInstanceReady) {
      const wasmModule = new WebAssembly.Module(wasmBinary);
      const instance = new WebAssembly.Instance(wasmModule, imports);
      onInstanceReady(instance);
      return instance.exports;
    },
  });
}
