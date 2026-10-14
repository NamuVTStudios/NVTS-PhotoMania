import { defineConfig, loadEnv } from 'vite';

// COOP/COEP: necesarios para SharedArrayBuffer (hilos Wasm / Workers a futuro).
// OJO: solo aplican en `pnpm dev` y `pnpm preview`. GitHub Pages no permite configurar headers;
// si algún día los necesitas en producción, hay que usar coi-serviceworker (o cambiar de hosting).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    // GitHub Pages sirve el sitio en /<repo>/ (el workflow define BASE_PATH).
    // En local queda '/'. Con dominio propio o repo <usuario>.github.io, también '/'.
    base: env.BASE_PATH || '/',
    server: { headers: isolation },
    preview: { headers: isolation },
    build: { target: 'es2022' },
  };
});
