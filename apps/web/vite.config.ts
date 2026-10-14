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
    alias: {
      // Usamos URLs relativas web estándar para evitar depender de 'path' de Node
      '@nvts-photomania/wasm-bindings': fileURLToPath(
        new URL('../../packages/wasm-bindings/src', import.meta.url)
      ),

      '@nvts/document-model': fileURLToPath(
        new URL('../../packages/document-model/src/index.ts', import.meta.url)
      ),
    }
  },

  optimizeDeps: {
    exclude: ['@nvts-photomania/wasm-bindings']
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext'
  }
});
