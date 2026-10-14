import { defineConfig } from 'vite';

export default defineConfig({
  // Reemplazamos resolve(__dirname) por rutas relativas directas que Vite entiende nativamente
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
      '@nvts-photomania/wasm-bindings': new URL('../../packages/wasm-bindings/src', import.meta.url).pathname,
      '@nvts/document-model': new URL('../../packages/document-model/src', import.meta.url).pathname
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
