import { defineConfig } from 'vite';

// COOP/COEP: necesarios para SharedArrayBuffer (hilos Wasm / Workers a futuro).
// Con COEP "require-corp" todo recurso externo debe servirse con CORP/CORS.
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  server: { headers: isolation },
  preview: { headers: isolation },
  build: { target: 'es2022' },
});
