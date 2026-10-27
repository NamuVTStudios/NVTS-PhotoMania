import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: '/NVTS-PhotoMania/',
  root: '.',
  publicDir: 'public',

  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  resolve: {
    // Prioriza las fuentes TypeScript frente a artefactos JavaScript antiguos junto a ellas.
    extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.json'],
    alias: {
      // Resolver directamente los paquetes del monorepo evita fallos cuando Vite
      // analiza imports internos antes de que pnpm cree enlaces en node_modules.
      '@nvts/wasm-bindings': fileURLToPath(
        new URL('../../packages/wasm-bindings/index.ts', import.meta.url)
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
