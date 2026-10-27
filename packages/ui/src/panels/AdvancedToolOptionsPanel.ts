import { uiIcon } from '../components/ShellTemplates';
import type { TextLayerAlign } from '@nvts/shared';

// Panel template. Event behavior lives in its panel renderer/controller.

export const ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE = `
    <section class="dock-panel advanced-tool-panel"><header><strong>Opciones avanzadas de herramienta</strong><div class="panel-spacer"></div></header><div id="advanced-tool-options" class="advanced-tool-options"></div></section>
`;


export interface AdvancedBrushSettings {
  hardness: number; spacing: number; smoothing: number; contiguous: boolean; sampleMerged: boolean;
  lineCap: CanvasLineCap; lineJoin: CanvasLineJoin;
}
export interface AdvancedTextSettings {
  align: 'left' | 'center' | 'right'; lineHeight: number; letterSpacing: number;
  strokeColor: string; strokeWidth: number; backgroundColor: string;
}
export interface AdvancedToolOptionsCallbacks {
  adjustActiveLayerBrightness(delta: number): void;
  applyTextSettingsToSelectedLayer(): void;
  editVectorLayer(): void;
}

/** Rebuilds the advanced panel controls for the currently selected tool. */
export function renderAdvancedToolOptionsPanel(
  host: HTMLElement,
  tool: string,
  brush: AdvancedBrushSettings,
  textSettings: AdvancedTextSettings,
  callbacks: AdvancedToolOptionsCallbacks,
): void {
  host.innerHTML = getAdvancedToolMarkup(tool, brush, textSettings);
  bindBrushControls(host, brush);
  bindShapeControls(host, brush);
  bindTextControls(host, textSettings, callbacks);
  bindAdvancedActions(host, callbacks);
}

function getAdvancedToolMarkup(tool: string, brush: AdvancedBrushSettings, text: AdvancedTextSettings): string {
  if (tool === 'brush') return getBrushMarkup(brush);
  if (tool === 'eraser') return getEraserMarkup(brush);
  if (tool === 'eyedropper') return getEyedropperMarkup(brush);
  if (tool === 'fill') return getFillMarkup(brush);
  if (['line', 'rectangle', 'ellipse'].includes(tool)) return getShapeMarkup(brush);
  if (tool === 'text') return getTextMarkup(text);
  if (tool === 'vector-select') return getVectorMarkup();
  return '<p class="hint">El desplazamiento no modifica los píxeles. Ajustá el zoom con los controles de la parte inferior del lienzo.</p>';
}

function getBrushMarkup(brush: AdvancedBrushSettings): string {
  return `<label class="advanced-setting">Dureza <output id="advanced-hardness-value">${brush.hardness}%</output><input id="advanced-hardness" type="range" min="0" max="100" value="${brush.hardness}"/></label><label class="advanced-setting">Espaciado <output id="advanced-spacing-value">${brush.spacing}%</output><input id="advanced-spacing" type="range" min="1" max="100" value="${brush.spacing}"/></label><label class="advanced-setting">Suavizado del trazo <output id="advanced-smoothing-value">${brush.smoothing}%</output><input id="advanced-smoothing" type="range" min="0" max="100" value="${brush.smoothing}"/></label><p class="hint">La dureza controla el borde del pincel; el espaciado cambia la frecuencia de las pinceladas y el suavizado reduce temblores.</p><div class="advanced-tool-actions"><strong>Ajustes rápidos de la capa</strong><div><button id="advanced-brightness-down" type="button">${uiIcon('brightness-down')}<span>Brillo −</span></button><button id="advanced-brightness-up" type="button">${uiIcon('brightness-up')}<span>Brillo +</span></button></div><p class="hint">Ajusta los píxeles de la capa de pintura activa y se registra en el historial.</p></div>`;
}

function getEraserMarkup(brush: AdvancedBrushSettings): string {
  return `<label class="advanced-setting">Dureza <output id="advanced-hardness-value">${brush.hardness}%</output><input id="advanced-hardness" type="range" min="0" max="100" value="${brush.hardness}"/></label><label class="advanced-setting">Espaciado <output id="advanced-spacing-value">${brush.spacing}%</output><input id="advanced-spacing" type="range" min="1" max="100" value="${brush.spacing}"/></label><p class="hint">Un borde suave permite borrar gradualmente los píxeles.</p>`;
}

function getEyedropperMarkup(brush: AdvancedBrushSettings): string {
  return `<label class="advanced-check"><input id="advanced-sample-merged" type="checkbox" ${brush.sampleMerged ? 'checked' : ''}/> Muestrear todas las capas visibles</label><p class="hint">Desactivado: toma el color de la capa activa. Activado: toma el color compuesto visible del documento.</p>`;
}

function getFillMarkup(brush: AdvancedBrushSettings): string {
  return `<label class="advanced-check"><input id="advanced-contiguous" type="checkbox" ${brush.contiguous ? 'checked' : ''}/> Solo píxeles contiguos</label><label class="advanced-check"><input id="advanced-sample-merged" type="checkbox" ${brush.sampleMerged ? 'checked' : ''}/> Muestrear todas las capas visibles</label><p class="hint">Con contiguos desactivado, se rellenan todas las zonas que coinciden con el color inicial dentro de la tolerancia.</p>`;
}

function getShapeMarkup(brush: AdvancedBrushSettings): string {
  return `<label class="advanced-setting">Extremos de línea<select id="advanced-line-cap"><option value="round" ${brush.lineCap === 'round' ? 'selected' : ''}>Redondos</option><option value="butt" ${brush.lineCap === 'butt' ? 'selected' : ''}>Rectos</option><option value="square" ${brush.lineCap === 'square' ? 'selected' : ''}>Cuadrados</option></select></label><label class="advanced-setting">Uniones<select id="advanced-line-join"><option value="round" ${brush.lineJoin === 'round' ? 'selected' : ''}>Redondeadas</option><option value="miter" ${brush.lineJoin === 'miter' ? 'selected' : ''}>En punta</option><option value="bevel" ${brush.lineJoin === 'bevel' ? 'selected' : ''}>Biseladas</option></select></label><p class="hint">Estas opciones afectan a los extremos y esquinas de las formas que dibujes.</p>`;
}

function getTextMarkup(text: AdvancedTextSettings): string {
  return `<label class="advanced-setting">Alineación<select id="advanced-text-align"><option value="left" ${text.align === 'left' ? 'selected' : ''}>Izquierda</option><option value="center" ${text.align === 'center' ? 'selected' : ''}>Centrada</option><option value="right" ${text.align === 'right' ? 'selected' : ''}>Derecha</option></select></label><label class="advanced-setting">Interlineado <output id="advanced-text-line-height-value">${text.lineHeight.toFixed(1)}×</output><input id="advanced-text-line-height" type="range" min="0.8" max="3" step="0.1" value="${text.lineHeight}"/></label><label class="advanced-setting">Espaciado entre letras <output id="advanced-text-letter-spacing-value">${text.letterSpacing}px</output><input id="advanced-text-letter-spacing" type="range" min="-2" max="20" step="0.5" value="${text.letterSpacing}"/></label><label class="advanced-setting">Color del contorno <input id="advanced-text-stroke-color" type="color" value="${text.strokeColor}"/></label><label class="advanced-setting">Grosor del contorno <output id="advanced-text-stroke-width-value">${text.strokeWidth}px</output><input id="advanced-text-stroke-width" type="range" min="0" max="24" step="0.5" value="${text.strokeWidth}"/></label><label class="advanced-setting">Fondo del texto <select id="advanced-text-background"><option value="transparent" ${text.backgroundColor === 'transparent' ? 'selected' : ''}>Transparente</option><option value="#ffffff" ${text.backgroundColor === '#ffffff' ? 'selected' : ''}>Blanco</option><option value="#000000" ${text.backgroundColor === '#000000' ? 'selected' : ''}>Negro</option><option value="#e03030" ${text.backgroundColor === '#e03030' ? 'selected' : ''}>Rojo</option></select></label><p class="hint">Cada texto se crea en su propia capa y conserva el contenido y los estilos para poder editarlo más tarde.</p>`;
}

function getVectorMarkup(): string {
  return '<p class="hint">Selección directa de objetos vectoriales. Arrastrá el interior del objeto para moverlo. Arrastrá el control de la esquina inferior derecha para redimensionarlo. Las curvas y sus puntos de control se transforman junto con el objeto.</p><button type="button" id="advanced-vector-edit">Abrir editor de objetos vectoriales…</button>';
}

function bindBrushControls(host: HTMLElement, brush: AdvancedBrushSettings): void {
  bindBrushRange(host, brush, 'advanced-hardness', 'hardness');
  bindBrushRange(host, brush, 'advanced-spacing', 'spacing');
  bindBrushRange(host, brush, 'advanced-smoothing', 'smoothing');
}

function bindBrushRange(host: HTMLElement, brush: AdvancedBrushSettings, id: string, key: 'hardness' | 'spacing' | 'smoothing'): void {
  const input = host.querySelector<HTMLInputElement>(`#${id}`);
  input?.addEventListener('input', () => {
    brush[key] = Number(input.value);
    const output = host.querySelector<HTMLOutputElement>(`#${id}-value`);
    if (output) output.value = `${input.value}%`;
  });
}

function bindShapeControls(host: HTMLElement, brush: AdvancedBrushSettings): void {
  host.querySelector<HTMLInputElement>('#advanced-contiguous')?.addEventListener('change', (event) => {
    brush.contiguous = (event.currentTarget as HTMLInputElement).checked;
  });
  host.querySelector<HTMLInputElement>('#advanced-sample-merged')?.addEventListener('change', (event) => {
    brush.sampleMerged = (event.currentTarget as HTMLInputElement).checked;
  });
  host.querySelector<HTMLSelectElement>('#advanced-line-cap')?.addEventListener('change', (event) => {
    brush.lineCap = (event.currentTarget as HTMLSelectElement).value as CanvasLineCap;
  });
  host.querySelector<HTMLSelectElement>('#advanced-line-join')?.addEventListener('change', (event) => {
    brush.lineJoin = (event.currentTarget as HTMLSelectElement).value as CanvasLineJoin;
  });
}

function bindTextControls(host: HTMLElement, text: AdvancedTextSettings, callbacks: AdvancedToolOptionsCallbacks): void {
  const commitText = () => callbacks.applyTextSettingsToSelectedLayer();
  host.querySelector<HTMLSelectElement>('#advanced-text-align')?.addEventListener('change', (event) => {
    text.align = (event.currentTarget as HTMLSelectElement).value as TextLayerAlign;
    commitText();
  });
  bindTextRange(host, text, 'advanced-text-line-height', 'lineHeight', '×', commitText);
  bindTextRange(host, text, 'advanced-text-letter-spacing', 'letterSpacing', 'px', commitText);
  bindTextRange(host, text, 'advanced-text-stroke-width', 'strokeWidth', 'px', commitText);
  host.querySelector<HTMLInputElement>('#advanced-text-stroke-color')?.addEventListener('change', (event) => {
    text.strokeColor = (event.currentTarget as HTMLInputElement).value;
    commitText();
  });
  host.querySelector<HTMLSelectElement>('#advanced-text-background')?.addEventListener('change', (event) => {
    text.backgroundColor = (event.currentTarget as HTMLSelectElement).value;
    commitText();
  });
}

function bindTextRange(
  host: HTMLElement,
  text: AdvancedTextSettings,
  id: string,
  key: 'lineHeight' | 'letterSpacing' | 'strokeWidth',
  suffix: string,
  commitText: () => void,
): void {
  host.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    text[key] = value;
    const output = host.querySelector<HTMLOutputElement>(`#${id}-value`);
    if (output) output.value = `${value}${suffix}`;
    commitText();
  });
}

function bindAdvancedActions(host: HTMLElement, callbacks: AdvancedToolOptionsCallbacks): void {
  host.querySelector<HTMLButtonElement>('#advanced-brightness-down')?.addEventListener('click', () => callbacks.adjustActiveLayerBrightness(-20));
  host.querySelector<HTMLButtonElement>('#advanced-brightness-up')?.addEventListener('click', () => callbacks.adjustActiveLayerBrightness(20));
  host.querySelector<HTMLButtonElement>('#advanced-vector-edit')?.addEventListener('click', () => callbacks.editVectorLayer());
}
