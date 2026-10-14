import { App } from '@nvts/ui';
import './styles.css';

const root = document.getElementById('app')!;
// BASE_URL respeta el `base` de Vite (p. ej. /nombre-repo/ en GitHub Pages) para encontrar el .wasm.
App.start(root, import.meta.env.BASE_URL + 'wasm/').catch((e) => {
  root.textContent = `No se pudo iniciar NVTS Photomania: ${e instanceof Error ? e.message : e}`;
  console.error(e);
});
