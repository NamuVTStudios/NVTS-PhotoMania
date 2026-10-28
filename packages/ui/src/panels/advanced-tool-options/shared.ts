import type { AdvancedBrushSettings, AdvancedToolOptionsContext } from './types';

export function renderBrushDynamics(brush: AdvancedBrushSettings): string {
  return `<label class="advanced-setting">Dureza <output id="advanced-hardness-value">${brush.hardness}%</output><input id="advanced-hardness" type="range" min="0" max="100" value="${brush.hardness}"/></label><label class="advanced-setting">Espaciado <output id="advanced-spacing-value">${brush.spacing}%</output><input id="advanced-spacing" type="range" min="1" max="100" value="${brush.spacing}"/></label><label class="advanced-setting">Suavizado del trazo <output id="advanced-smoothing-value">${brush.smoothing}%</output><input id="advanced-smoothing" type="range" min="0" max="100" value="${brush.smoothing}"/></label><p class="hint">Dureza = borde; espaciado = frecuencia de las pinceladas; suavizado = estabilidad del recorrido.</p>`;
}

export function bindBrushDynamics(host: HTMLElement, brush: AdvancedBrushSettings): void {
  bindBrushRange(host, brush, 'advanced-hardness', 'hardness', '%');
  bindBrushRange(host, brush, 'advanced-spacing', 'spacing', '%');
  bindBrushRange(host, brush, 'advanced-smoothing', 'smoothing', '%');
}

export function renderStrokeOptions(brush: AdvancedBrushSettings): string {
  return `<label class="advanced-setting">Extremos de línea<select id="advanced-line-cap"><option value="round" ${brush.lineCap === 'round' ? 'selected' : ''}>Redondos</option><option value="butt" ${brush.lineCap === 'butt' ? 'selected' : ''}>Rectos</option><option value="square" ${brush.lineCap === 'square' ? 'selected' : ''}>Cuadrados</option></select></label><label class="advanced-setting">Uniones<select id="advanced-line-join"><option value="round" ${brush.lineJoin === 'round' ? 'selected' : ''}>Redondeadas</option><option value="miter" ${brush.lineJoin === 'miter' ? 'selected' : ''}>En punta</option><option value="bevel" ${brush.lineJoin === 'bevel' ? 'selected' : ''}>Biseladas</option></select></label>`;
}

export function bindStrokeOptions(host: HTMLElement, brush: AdvancedBrushSettings): void {
  host.querySelector<HTMLSelectElement>('#advanced-line-cap')?.addEventListener('change', (event) => {
    brush.lineCap = (event.currentTarget as HTMLSelectElement).value as CanvasLineCap;
  });
  host.querySelector<HTMLSelectElement>('#advanced-line-join')?.addEventListener('change', (event) => {
    brush.lineJoin = (event.currentTarget as HTMLSelectElement).value as CanvasLineJoin;
  });
}

export function bindCheckbox(host: HTMLElement, selector: string, onChange: (checked: boolean) => void): void {
  host.querySelector<HTMLInputElement>(selector)?.addEventListener('change', (event) => {
    onChange((event.currentTarget as HTMLInputElement).checked);
  });
}

export function bindRange(
  host: HTMLElement,
  selector: string,
  onChange: (value: number) => void,
  suffix = '',
): void {
  host.querySelector<HTMLInputElement>(selector)?.addEventListener('input', (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    onChange(value);
    if (suffix) setOutput(host, `${selector}-value`, `${value}${suffix}`);
  });
}

export function bindBrushRange(
  host: HTMLElement,
  brush: AdvancedBrushSettings,
  id: string,
  key: 'hardness' | 'spacing' | 'smoothing' | 'tolerance',
  suffix: string,
): void {
  host.querySelector<HTMLInputElement>(`#${id}`)?.addEventListener('input', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    brush[key] = Number(input.value);
    setOutput(host, `#${id}-value`, `${input.value}${suffix}`);
  });
}

export function bindShapeFill(context: AdvancedToolOptionsContext): void {
  const { host, brush } = context;
  bindCheckbox(host, '#advanced-shape-fill', (checked) => {
    brush.shapeFill = checked;
    mirrorControl(host, '#advanced-shape-fill', '#tool-shape-fill');
  });
}

export function bindSampleMerged(host: HTMLElement, brush: AdvancedBrushSettings): void {
  bindCheckbox(host, '#advanced-sample-merged', (checked) => { brush.sampleMerged = checked; });
}

export function bindSampleRadius(host: HTMLElement, brush: AdvancedBrushSettings): void {
  host.querySelector<HTMLSelectElement>('#advanced-sample-radius')?.addEventListener('change', (event) => {
    brush.sampleRadius = normalizeSampleRadius(Number((event.currentTarget as HTMLSelectElement).value));
  });
}

export function bindTolerance(host: HTMLElement, brush: AdvancedBrushSettings): void {
  bindBrushRange(host, brush, 'advanced-tolerance', 'tolerance', '');
  bindMirrorRange(host, '#advanced-tolerance', '#tool-tolerance', '#tool-tolerance-value', '');
}

export function bindGradientSettings(host: HTMLElement, brush: AdvancedBrushSettings): void {
  host.querySelector<HTMLSelectElement>('#advanced-gradient-type')?.addEventListener('change', (event) => {
    brush.gradientType = (event.currentTarget as HTMLSelectElement).value === 'radial' ? 'radial' : 'linear';
  });
  bindCheckbox(host, '#advanced-gradient-reverse', (checked) => { brush.gradientReverse = checked; });
  host.querySelector<HTMLInputElement>('#advanced-gradient-opacity')?.addEventListener('input', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    brush.opacity = Number(input.value);
    setOutput(host, '#advanced-gradient-opacity-value', `${input.value}%`);
    mirrorControl(host, '#advanced-gradient-opacity', '#tool-opacity');
    mirrorRangeOutput(host, '#advanced-gradient-opacity', '#tool-opacity-value', '%');
    mirrorControl(host, '#advanced-gradient-opacity', '#tb-opacity');
    mirrorRangeOutput(host, '#advanced-gradient-opacity', '#tb-opacity-value', '%');
  });
}

export function bindNavigationSettings(host: HTMLElement, brush: AdvancedBrushSettings): void {
  bindRange(host, '#advanced-pan-sensitivity', (value) => { brush.panSensitivity = value; }, '%');
  bindRange(host, '#advanced-zoom-increment', (value) => { brush.zoomIncrement = value; });
  host.querySelector<HTMLInputElement>('#advanced-zoom-increment')?.addEventListener('input', (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    setOutput(host, '#advanced-zoom-increment-value', `${Math.round((value - 1) * 100)}%`);
  });
}

export function bindVectorAspect(host: HTMLElement, brush: AdvancedBrushSettings): void {
  bindCheckbox(host, '#advanced-vector-aspect', (checked) => { brush.vectorKeepAspectRatio = checked; });
}

export function bindComicSettings(context: AdvancedToolOptionsContext): void {
  const { host, comicSettings: comic, callbacks } = context;
  const commit = (settings: Partial<typeof comic>) => callbacks.updateComicSettings(settings);
  host.querySelector<HTMLSelectElement>('#advanced-comic-mode')?.addEventListener('change', (event) => {
    const mode = (event.currentTarget as HTMLSelectElement).value;
    comic.mode = mode === 'panel' || mode === 'split' ? mode : 'frame';
    host.querySelector<HTMLElement>('#advanced-comic-split-options')?.toggleAttribute('hidden', comic.mode !== 'split');
    commit({ mode: comic.mode });
  });
  host.querySelector<HTMLInputElement>('#advanced-comic-border')?.addEventListener('input', (event) => {
    comic.borderWidth = clamp(Number((event.currentTarget as HTMLInputElement).value), 1, 20);
    setOutput(host, '#advanced-comic-border-value', `${comic.borderWidth}px`);
    commit({ borderWidth: comic.borderWidth });
  });
  host.querySelector<HTMLSelectElement>('#advanced-comic-split-count')?.addEventListener('change', (event) => {
    comic.splitLineCount = (event.currentTarget as HTMLSelectElement).value === '2' ? 2 : 1;
    const distance = host.querySelector<HTMLInputElement>('#advanced-comic-split-distance');
    if (distance) distance.disabled = comic.splitLineCount !== 2;
    commit({ splitLineCount: comic.splitLineCount });
  });
  host.querySelector<HTMLInputElement>('#advanced-comic-split-distance')?.addEventListener('input', (event) => {
    comic.splitDistance = clamp(Number((event.currentTarget as HTMLInputElement).value), 4, 240);
    setOutput(host, '#advanced-comic-split-distance-value', `${comic.splitDistance}px`);
    commit({ splitDistance: comic.splitDistance });
  });
}

export function setOutput(host: HTMLElement, selector: string, value: string): void {
  const output = host.querySelector<HTMLOutputElement>(selector);
  if (output) output.value = value;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function safeColor(value: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
}

export function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeSampleRadius(value: number): 1 | 3 | 5 {
  if (value === 5) return 5;
  if (value === 3) return 3;
  return 1;
}

function bindMirrorRange(host: HTMLElement, sourceSelector: string, targetSelector: string, targetOutputSelector: string, suffix: string): void {
  host.querySelector<HTMLInputElement>(sourceSelector)?.addEventListener('input', (event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    const target = host.ownerDocument.querySelector<HTMLInputElement>(targetSelector);
    if (target) target.value = value;
    const output = host.ownerDocument.querySelector<HTMLOutputElement>(targetOutputSelector);
    if (output) output.value = `${value}${suffix}`;
  });
}

function mirrorControl(host: HTMLElement, sourceSelector: string, targetSelector: string): void {
  const source = host.querySelector<HTMLInputElement>(sourceSelector);
  const target = host.ownerDocument.querySelector<HTMLInputElement>(targetSelector);
  if (source && target) target.value = source.value;
}

function mirrorRangeOutput(host: HTMLElement, sourceSelector: string, targetOutputSelector: string, suffix: string): void {
  const source = host.querySelector<HTMLInputElement>(sourceSelector);
  const output = host.ownerDocument.querySelector<HTMLOutputElement>(targetOutputSelector);
  if (source && output) output.value = `${source.value}${suffix}`;
}
