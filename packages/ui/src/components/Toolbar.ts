// Toolbar.ts — Barra de herramientas mínima (DOM puro, sin framework).
// Los comandos de historial se mantienen accesibles mediante Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y.

import { BlendMode } from '@nvts/wasm-bindings';
import { uiIcon } from './ShellTemplates';

export interface ToolbarHandlers {
  onBrush(rgb: [number, number, number], size: number): void;
  onBrightness(delta: number): void;
  onLayerProps(opacity: number, blendMode: number): void;
}

export function createToolbar(root: HTMLElement, handlers: ToolbarHandlers): void {
  renderToolbarMarkup(root);
  connectToolbarEvents(root, handlers);
}

function renderToolbarMarkup(root: HTMLElement): void {
  // Marcado estático (sin contenido del usuario), por eso innerHTML es seguro aquí.
  root.innerHTML = `
    <label>Color <input id="tb-color" type="color" value="#e03030"></label>
    <label>Tamaño <input id="tb-size" type="range" min="2" max="96" value="24"></label>
    <button id="tb-dark">${uiIcon('brightness-down')}<span>Brillo −</span></button>
    <button id="tb-light">${uiIcon('brightness-up')}<span>Brillo +</span></button>
    <label>Opacidad <input id="tb-opacity" type="range" min="0" max="100" value="100"></label>
    <label>Modo
      <select id="tb-blend">
        <option value="${BlendMode.Normal}">Normal</option>
        <option value="${BlendMode.Multiply}">Multiplicar</option>
        <option value="${BlendMode.Screen}">Trama (Screen)</option>
        <option value="${BlendMode.Overlay}">Superponer</option>
      </select>
    </label>`;
}

function connectToolbarEvents(root: HTMLElement, handlers: ToolbarHandlers): void {
  const color = getToolbarElement<HTMLInputElement>(root, 'tb-color');
  const size = getToolbarElement<HTMLInputElement>(root, 'tb-size');
  const opacity = getToolbarElement<HTMLInputElement>(root, 'tb-opacity');
  const blend = getToolbarElement<HTMLSelectElement>(root, 'tb-blend');
  const emitBrush = () => handlers.onBrush(readToolbarColor(color.value), Number(size.value));
  const emitProps = () => handlers.onLayerProps(Number(opacity.value) / 100, Number(blend.value));
  bindBrushControls(color, size, emitBrush);
  bindPropertyControls(root, opacity, blend, emitProps, handlers);
  emitBrush();
}

function getToolbarElement<T extends HTMLElement>(root: HTMLElement, id: string): T {
  const element = root.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`No se encontró el control de barra #${id}.`);
  return element;
}

function readToolbarColor(value: string): [number, number, number] {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function bindBrushControls(color: HTMLInputElement, size: HTMLInputElement, emitBrush: () => void): void {
  color.oninput = emitBrush;
  size.oninput = emitBrush;
}

function bindPropertyControls(
  root: HTMLElement,
  opacity: HTMLInputElement,
  blend: HTMLSelectElement,
  emitProps: () => void,
  handlers: ToolbarHandlers,
): void {
  opacity.oninput = emitProps;
  blend.onchange = emitProps;
  getToolbarElement<HTMLButtonElement>(root, 'tb-dark').onclick = () => handlers.onBrightness(-20);
  getToolbarElement<HTMLButtonElement>(root, 'tb-light').onclick = () => handlers.onBrightness(20);
}
