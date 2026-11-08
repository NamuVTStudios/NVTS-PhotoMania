import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { getSharedPackageFsAllow } from '../../../NVTS-Shared-Core/tooling/vite/shared-package-fs.mjs';

const appRoot = fileURLToPath(new URL('.', import.meta.url));
const sharedPackageFsAllow = getSharedPackageFsAllow(appRoot);

export default defineConfig({
  base: '/NVTS-PhotoMania/',
  root: '.',
  publicDir: 'public',

  server: {
    fs: {
      allow: sharedPackageFsAllow,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  resolve: {
    // Prioriza las fuentes TypeScript frente a artefactos JavaScript antiguos junto a ellas.
    extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.json'],
    alias: {
      '@nvts/shared-core/templates': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/packages/templates/src/index.mjs', import.meta.url)
      ),
      // Resolver directamente los paquetes del monorepo evita fallos cuando Vite
      // analiza imports internos antes de que pnpm cree enlaces en node_modules.
      '@nvts/wasm-bindings': fileURLToPath(
        new URL('../../packages/wasm-bindings/index.ts', import.meta.url)
      ),
      // Resolve Shared Core runtimes to their real ESM entrypoints. The package
      // exports expose both short public names and physical-layout compatibility paths.
      '@nvts/shared-core/libraries/pixijs': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/libraries/rendering/pixijs/index.mjs', import.meta.url)
      ),
      '@nvts/shared-core/libraries/rendering/pixijs': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/libraries/rendering/pixijs/index.mjs', import.meta.url)
      ),
      '@nvts/shared-core/libraries/canvaskit': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/libraries/rendering/canvaskit/index.mjs', import.meta.url)
      ),
      '@nvts/shared-core/libraries/rendering/canvaskit': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/libraries/rendering/canvaskit/index.mjs', import.meta.url)
      ),
      '@nvts/shared-core/libraries/openimageio': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/libraries/imaging/openimageio/index.mjs', import.meta.url)
      ),
      '@nvts/shared-core/libraries/imaging/openimageio': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/libraries/imaging/openimageio/index.mjs', import.meta.url)
      ),
      '@nvts/shared-core/libraries/opencolorio': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/libraries/imaging/opencolorio/index.mjs', import.meta.url)
      ),
      '@nvts/shared-core/libraries/imaging/opencolorio': fileURLToPath(
        new URL('../../../NVTS-Shared-Core/libraries/imaging/opencolorio/index.mjs', import.meta.url)
      ),
      '@nvts/renderer': fileURLToPath(
        new URL('../../packages/renderer/index.ts', import.meta.url)
      ),
      '@nvts/document-model': fileURLToPath(
        new URL('../../packages/document-model/src/index.ts', import.meta.url)
      ),
      '@nvts/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url)
      ),
      '@nvts/image-processing': fileURLToPath(
        new URL('../../packages/image-processing/src/index.ts', import.meta.url)
      ),
      '@nvts/vector': fileURLToPath(
        new URL('../../packages/vector/src/index.ts', import.meta.url)
      ),
      '@nvts/storage': fileURLToPath(
        new URL('../../packages/storage/src/index.ts', import.meta.url)
      ),
      '@nvts/templates': fileURLToPath(
        new URL('../../packages/templates/src/index.ts', import.meta.url)
      ),
    }
  },

  optimizeDeps: {
    exclude: ['@nvts/wasm-bindings']
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext'
  }
});