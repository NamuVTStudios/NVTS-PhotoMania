// Toolbar.ts — Barra de herramientas mínima (DOM puro, sin framework).
// Los comandos de historial se mantienen accesibles mediante Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y.

import { BlendMode } from '@nvts/wasm-bindings';

export interface ToolbarHandlers {
  onBrush(rgb: [number, number, number], size: number): void;
  onBrightness(delta: number): void;
  onLayerProps(opacity: number, blendMode: number): void;
}

export function createToolbar(root: HTMLElement, h: ToolbarHandlers): void {
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
    </label>`;

  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!;
  const color = $<HTMLInputElement>('tb-color');
  const size = $<HTMLInputElement>('tb-size');
  const opacity = $<HTMLInputElement>('tb-opacity');
  const blend = $<HTMLSelectElement>('tb-blend');

  const emitBrush = () => {
    const v = color.value;
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

  emitBrush();
}
