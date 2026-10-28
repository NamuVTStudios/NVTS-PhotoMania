import type { TextLayerAlign } from '@nvts/shared';
import { clamp, escapeAttribute, safeColor, setOutput } from '../shared';
import type { AdvancedTextSettings, ToolAdvancedOptionsDefinition } from '../types';

export const TextToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ textSettings }) => renderTextOptions(textSettings),
  bind: (context) => bindTextOptions(context.host, context.textSettings, context.callbacks.applyTextSettingsToSelectedLayer),
};

function renderTextOptions(text: AdvancedTextSettings): string {
  const fonts = ['Arial', 'Inter', 'Georgia', 'Times New Roman', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New', 'monospace', 'serif', 'sans-serif'];
  const fontOptions = fonts.map((font) => `<option value="${escapeAttribute(font)}" ${text.fontFamily === font ? 'selected' : ''}>${font}</option>`).join('');
  const styles = [['normal', 'Normal'], ['bold', 'Negrita'], ['italic', 'Cursiva'], ['bold-italic', 'Negrita cursiva']];
  const styleOptions = styles.map(([value, label]) => `<option value="${value}" ${text.style === value ? 'selected' : ''}>${label}</option>`).join('');
  return `<label class="advanced-setting">Fuente<select id="advanced-text-font">${fontOptions}</select></label><label class="advanced-setting">Estilo<select id="advanced-text-style">${styleOptions}</select></label><label class="advanced-setting">Tamaño <output id="advanced-text-font-size-value">${text.fontSize}px</output><input id="advanced-text-font-size" type="range" min="1" max="1000" value="${text.fontSize}"/></label><label class="advanced-setting">Color<input id="advanced-text-color" type="color" value="${safeColor(text.color)}"/></label><label class="advanced-setting">Alineación<select id="advanced-text-align"><option value="left" ${text.align === 'left' ? 'selected' : ''}>Izquierda</option><option value="center" ${text.align === 'center' ? 'selected' : ''}>Centrada</option><option value="right" ${text.align === 'right' ? 'selected' : ''}>Derecha</option></select></label><label class="advanced-setting">Interlineado <output id="advanced-text-line-height-value">${text.lineHeight.toFixed(1)}×</output><input id="advanced-text-line-height" type="range" min="0.8" max="3" step="0.1" value="${text.lineHeight}"/></label><label class="advanced-setting">Espaciado entre letras <output id="advanced-text-letter-spacing-value">${text.letterSpacing}px</output><input id="advanced-text-letter-spacing" type="range" min="-2" max="20" step="0.5" value="${text.letterSpacing}"/></label><label class="advanced-setting">Color del contorno<input id="advanced-text-stroke-color" type="color" value="${safeColor(text.strokeColor)}"/></label><label class="advanced-setting">Grosor del contorno <output id="advanced-text-stroke-width-value">${text.strokeWidth}px</output><input id="advanced-text-stroke-width" type="range" min="0" max="24" step="0.5" value="${text.strokeWidth}"/></label><label class="advanced-setting">Fondo del texto<select id="advanced-text-background"><option value="transparent" ${text.backgroundColor === 'transparent' ? 'selected' : ''}>Transparente</option><option value="#ffffff" ${text.backgroundColor === '#ffffff' ? 'selected' : ''}>Blanco</option><option value="#000000" ${text.backgroundColor === '#000000' ? 'selected' : ''}>Negro</option><option value="#e03030" ${text.backgroundColor === '#e03030' ? 'selected' : ''}>Rojo</option></select></label><p class="hint">Los cambios se aplican a la capa de texto seleccionada. El contenido permanece editable.</p>`;
}

function bindTextOptions(host: HTMLElement, text: AdvancedTextSettings, applyTextSettings: () => void): void {
  bindTextSelect(host, '#advanced-text-font', (value) => { text.fontFamily = value; }, applyTextSettings);
  bindTextSelect(host, '#advanced-text-style', (value) => { text.style = value; }, applyTextSettings);
  bindTextSelect(host, '#advanced-text-align', (value) => { text.align = value as TextLayerAlign; }, applyTextSettings);
  bindTextSelect(host, '#advanced-text-background', (value) => { text.backgroundColor = value; }, applyTextSettings);
  bindTextColor(host, '#advanced-text-color', (value) => { text.color = value; }, applyTextSettings);
  bindTextColor(host, '#advanced-text-stroke-color', (value) => { text.strokeColor = value; }, applyTextSettings);
  bindTextFontSize(host, text, applyTextSettings);
  bindTextRange(host, text, 'advanced-text-line-height', 'lineHeight', '×', applyTextSettings);
  bindTextRange(host, text, 'advanced-text-letter-spacing', 'letterSpacing', 'px', applyTextSettings);
  bindTextRange(host, text, 'advanced-text-stroke-width', 'strokeWidth', 'px', applyTextSettings);
}

function bindTextSelect(host: HTMLElement, selector: string, update: (value: string) => void, commit: () => void): void {
  host.querySelector<HTMLSelectElement>(selector)?.addEventListener('change', (event) => {
    update((event.currentTarget as HTMLSelectElement).value);
    commit();
  });
}

function bindTextColor(host: HTMLElement, selector: string, update: (value: string) => void, commit: () => void): void {
  host.querySelector<HTMLInputElement>(selector)?.addEventListener('change', (event) => {
    update((event.currentTarget as HTMLInputElement).value);
    commit();
  });
}

function bindTextFontSize(host: HTMLElement, text: AdvancedTextSettings, commit: () => void): void {
  host.querySelector<HTMLInputElement>('#advanced-text-font-size')?.addEventListener('change', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    text.fontSize = clamp(Number(input.value) || 1, 1, 1000);
    input.value = String(text.fontSize);
    setOutput(host, '#advanced-text-font-size-value', `${text.fontSize}px`);
    commit();
  });
}

function bindTextRange(
  host: HTMLElement,
  text: AdvancedTextSettings,
  id: string,
  key: 'lineHeight' | 'letterSpacing' | 'strokeWidth',
  suffix: string,
  commit: () => void,
): void {
  host.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    text[key] = value;
    setOutput(host, `#${id}-value`, `${value}${suffix}`);
  });
  host.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('change', commit);
}
