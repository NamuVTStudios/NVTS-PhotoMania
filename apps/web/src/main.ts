import { App } from '@nvts/ui';
import './styles.css';

const root = document.getElementById('app')!;
App.start(root).catch((e) => {
  root.textContent = `No se pudo iniciar NVTS Photomania: ${e instanceof Error ? e.message : e}`;
  console.error(e);
});
