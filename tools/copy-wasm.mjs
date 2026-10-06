// copy-wasm.mjs — Copia engine.wasm a apps/web/public/wasm/ (donde lo busca EngineClient).
// Ejecutar desde la raíz del repo (lo hace `pnpm build:wasm`).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const src = 'packages/wasm-bindings/build/engine.wasm';
const dstDir = 'apps/web/public/wasm';

if (!existsSync(src)) {
  console.error(`No existe ${src}. Compila primero el motor (packages/engine/build.sh).`);
  process.exit(1);
}
mkdirSync(dstDir, { recursive: true });
copyFileSync(src, `${dstDir}/engine.wasm`);
console.log('engine.wasm copiado a', dstDir);
