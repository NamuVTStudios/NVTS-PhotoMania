// copy-wasm.mjs — Copia engine.wasm a apps/web/public/wasm/ (donde lo busca EngineClient).
// Ejecutar desde la raíz del repo (lo hace `pnpm build:wasm`).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(repoRoot, 'packages/wasm-bindings/build/engine.wasm');
const dstDir = resolve(repoRoot, 'apps/web/public/wasm');

if (!existsSync(src)) {
  console.error(`No existe ${src}. Compila primero el motor (packages/engine/build.sh).`);
  process.exit(1);
}
mkdirSync(dstDir, { recursive: true });
copyFileSync(src, resolve(dstDir, 'engine.wasm'));
console.log('engine.wasm copiado a', dstDir);
