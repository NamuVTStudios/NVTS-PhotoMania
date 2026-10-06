// Toolbar.ts — Barra de herramientas mínima (DOM puro, sin framework).
// La UI solo emite eventos; no conoce el motor. Quien la usa decide qué hacer (ver apps/web/src/main.ts).

import { BlendMode } from '@nvts/wasm-bindings';

export interface ToolbarHandlers {
  onBrush(rgb: [number, number, number], size: number): void;
  onBrightness(delta: number): void;
  onLayerProps(opacity: number, blendMode: number): void;
  onUndo(): void;
  onRedo(): void;
}

export interface HistoryUiState {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
}

export interface ToolbarApi {
  setHistoryState(s: HistoryUiState): void;
}

export function createToolbar(root: HTMLElement, h: ToolbarHandlers): ToolbarApi {
  // Marcado estático (sin contenido del usuario), por eso innerHTML es seguro aquí.
  root.innerHTML = `
    <label>Color <input id="tb-color" type="color" value="#e03030"></label>
    <label>Tamaño <input id="tb-size" type="range" min="2" max="96" value="24"></label>
    <button id="tb-dark">Brillo −</button>
    <button id="tb-light">Brillo +</button>
    <label>Opacidad <input id="tb-opacity" type="range" min="0" max="100" value="100"></label>
    <label>Modo
      <select id="tb-blend">
        <option value="${BlendMode.Normal}">Normal</option>
        <option value="${BlendMode.Multiply}">Multiplicar</option>
        <option value="${BlendMode.Screen}">Trama (Screen)</option>
        <option value="${BlendMode.Overlay}">Superponer</option>
      </select>
    </label>
    <button id="tb-undo">Deshacer</button>
    <button id="tb-redo">Rehacer</button>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const color = $<HTMLInputElement>('tb-color');
  const size = $<HTMLInputElement>('tb-size');
  const opacity = $<HTMLInputElement>('tb-opacity');
  const blend = $<HTMLSelectElement>('tb-blend');
  const undoBtn = $<HTMLButtonElement>('tb-undo');
  const redoBtn = $<HTMLButtonElement>('tb-redo');

  const emitBrush = () => {
    const v = color.value; // "#rrggbb"
    h.onBrush(
      [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)],
      Number(size.value),
    );
  };
  const emitProps = () => h.onLayerProps(Number(opacity.value) / 100, Number(blend.value));

  color.oninput = emitBrush;
  size.oninput = emitBrush;
  opacity.oninput = emitProps;
  blend.onchange = emitProps;
  $('tb-dark').onclick = () => h.onBrightness(-20);
  $('tb-light').onclick = () => h.onBrightness(20);
  undoBtn.onclick = () => h.onUndo();
  redoBtn.onclick = () => h.onRedo();

  emitBrush(); // sincroniza el estado inicial del pincel
  undoBtn.disabled = redoBtn.disabled = true;

  return {
    setHistoryState(s) {
      undoBtn.disabled = !s.canUndo;
      redoBtn.disabled = !s.canRedo;
      undoBtn.textContent = s.canUndo ? `Deshacer ${s.undoLabel}` : 'Deshacer';
      redoBtn.textContent = s.canRedo ? `Rehacer ${s.redoLabel}` : 'Rehacer';
    },
  };
}
