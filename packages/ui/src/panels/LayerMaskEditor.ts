import { getLayerMaskLabel, type FilterKind, type LayerMask } from '@nvts/shared';
import { uiIcon } from '../components/ShellTemplates';

export const LAYER_MASK_PANEL_TEMPLATE = `
<section id="masks-panel" class="editor-panel" hidden>
  <header><strong id="mask-editor-title" class="panel-title-icon">${uiIcon('layer')}<span class="mask-editor-title-text">Máscaras de capa</span></strong><span id="mask-editor-layer-name"></span><button class="panel-close" data-close="masks-panel" type="button" aria-label="Cerrar panel de máscaras de capa">${uiIcon('close')}</button></header>
  <div id="layer-mask-list" class="editor-content layer-mask-content" aria-live="polite"></div>
  <footer class="layer-mask-footer">
    <span id="mask-edit-status" role="status">Las modificaciones todavía no se aplicaron.</span>
    <button id="mask-cancel-changes" type="button">Cancelar</button>
    <button id="mask-apply-changes" class="primary" type="button" disabled>Aplicar cambios</button>
  </footer>
</section>`;

export type MaskEditorOptions = {
  filterKinds: FilterKind[];
  filterLabel(kind: FilterKind): string;
};

type MaskRendererMap = {
  [Type in LayerMask['type']]: (
    section: HTMLElement,
    mask: Extract<LayerMask, { type: Type }>,
    options: MaskEditorOptions,
  ) => void;
};

const MASK_RENDERERS: MaskRendererMap = {
  transform: (section, mask) => appendTransformControls(section, mask),
  colorize: (section, mask) => appendColorizeControls(section, mask),
  filter: (section, mask, options) => appendFilterControls(section, mask, options),
  styles: (section, mask) => appendStyleMaskControls(section, mask),
};

export function renderLayerMaskEditor(
  container: HTMLElement,
  masks: readonly LayerMask[],
  activeMaskId: string,
  options: MaskEditorOptions,
): void {
  container.replaceChildren();
  if (masks.length === 0) return appendEmptyMaskState(container);
  container.append(...masks.map((mask) => createMaskCard(mask, activeMaskId, options)));
}

function appendEmptyMaskState(container: HTMLElement): void {
  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'La capa seleccionada no tiene máscaras. Añadí una desde el menú Nueva capa.';
  container.append(hint);
}

function createMaskCard(mask: LayerMask, activeMaskId: string, options: MaskEditorOptions): HTMLDetailsElement {
  const card = document.createElement('details');
  card.className = `layer-mask-entry${mask.id === activeMaskId ? ' active' : ''}`;
  card.dataset.maskId = mask.id;
  card.open = mask.id === activeMaskId;
  card.append(createMaskSummary(mask), createMaskProperties(mask, options));
  return card;
}

function createMaskSummary(mask: LayerMask): HTMLElement {
  const summary = document.createElement('summary');
  summary.className = 'layer-mask-entry__summary';
  summary.title = 'Doble clic izquierdo para abrir o editar esta máscara';
  const enabled = Object.assign(document.createElement('input'), { type: 'checkbox', checked: mask.enabled });
  enabled.dataset.maskId = mask.id;
  enabled.dataset.maskField = 'enabled';
  enabled.setAttribute('aria-label', `Activar máscara de ${getLayerMaskLabel(mask.type)}`);
  enabled.onclick = (event) => event.stopPropagation();
  const icon = document.createElement('span');
  icon.className = `tool-icon tool-icon--${getMaskIcon(mask)}`;
  icon.setAttribute('aria-hidden', 'true');
  const title = document.createElement('strong');
  title.textContent = `Máscara de ${getLayerMaskLabel(mask.type)}`;
  summary.append(enabled, icon, title);
  return summary;
}

function getMaskIcon(mask: LayerMask): string {
  if (mask.type === 'transform') return 'vector-select';
  if (mask.type === 'colorize') return 'fill-layer';
  if (mask.type === 'styles') return 'style-mask';
  return 'filter-layer';
}

function createMaskProperties(mask: LayerMask, options: MaskEditorOptions): HTMLElement {
  const content = document.createElement('div');
  content.className = 'layer-mask-entry__properties';
  content.append(createDeleteMaskButton(mask.id));
  renderMaskControls(content, mask, options);
  return content;
}

function createDeleteMaskButton(maskId: string): HTMLButtonElement {
  const button = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Eliminar máscara' });
  button.className = 'layer-mask-entry__delete';
  button.dataset.deleteMask = maskId;
  return button;
}

function renderMaskControls(section: HTMLElement, mask: LayerMask, options: MaskEditorOptions): void {
  const renderer = MASK_RENDERERS[mask.type] as (
    target: HTMLElement,
    selectedMask: LayerMask,
    editorOptions: MaskEditorOptions,
  ) => void;
  renderer(section, mask, options);
}

function appendTransformControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'transform' }>): void {
  const fields: Array<[string, number, string]> = [
    ['offsetX', mask.offsetX, 'Desplazamiento X'], ['offsetY', mask.offsetY, 'Desplazamiento Y'],
    ['scaleX', mask.scaleX, 'Escala X'], ['scaleY', mask.scaleY, 'Escala Y'],
    ['rotation', mask.rotation, 'Rotación (grados)'], ['shearX', mask.shearX, 'Sesgo X (grados)'], ['shearY', mask.shearY, 'Sesgo Y (grados)'],
  ];
  fields.forEach(([key, value, label]) => section.append(createTransformField(mask.id, key, value, label)));
}

function createTransformField(maskId: string, key: string, value: number, label: string): HTMLLabelElement {
  const input = Object.assign(document.createElement('input'), { type: 'number', value: String(value), step: '0.1' });
  setMaskControlData(input, maskId, `transform.${key}`);
  return fieldLabel(label, input);
}

function appendColorizeControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'colorize' }>): void {
  appendColorizeBehaviorControls(section, mask);
  appendColorizeBoundaryControls(section, mask);
  appendColorizeActions(section, mask);
}

function appendColorizeBehaviorControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'colorize' }>): void {
  appendCheckbox(section, mask.id, 'colorize.editStrokes', 'Editar trazos', mask.editStrokes);
  appendCheckbox(section, mask.id, 'colorize.showOutput', 'Mostrar resultado', mask.showOutput);
  appendCheckbox(section, mask.id, 'colorize.limitToLayerBounds', 'Limitar a los bordes de la capa', mask.limitToLayerBounds);
}

function appendColorizeBoundaryControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'colorize' }>): void {
  appendNumber(section, mask.id, 'colorize.gapClose', 'Cerrar huecos', mask.gapClose, 0, 100);
  appendNumber(section, mask.id, 'colorize.threshold', 'Umbral', Math.round(mask.threshold * 100), 0, 100);
  appendTransparentColorControls(section, mask);
}

function appendTransparentColorControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'colorize' }>): void {
  const colors = new Set(mask.strokes.map((stroke) => stroke.color));
  colors.forEach((color) => section.append(createTransparentColorControl(mask, color)));
}

function createTransparentColorControl(mask: Extract<LayerMask, { type: 'colorize' }>, color: string): HTMLLabelElement {
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: mask.transparentColors.includes(color) });
  setMaskControlData(input, mask.id, 'colorize.transparentColor');
  input.dataset.maskColor = color;
  return fieldLabel(`Transparente ${color}`, input);
}

function appendColorizeActions(section: HTMLElement, mask: Extract<LayerMask, { type: 'colorize' }>): void {
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = `Trazos de color guardados: ${mask.strokes.length}.`;
  const update = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Actualizar colorización' });
  update.dataset.updateColorize = mask.id;
  const clear = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Borrar trazos' });
  clear.dataset.clearColorize = mask.id;
  section.append(note, update, clear);
}

function appendFilterControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'filter' }>, options: MaskEditorOptions): void {
  mask.filters.forEach((filter, index) => appendFilterControlsForItem(section, mask.id, filter, index, options));
  const add = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Añadir filtro' });
  add.dataset.addMaskFilter = mask.id;
  section.append(add);
}

function appendFilterControlsForItem(
  section: HTMLElement,
  maskId: string,
  filter: Extract<LayerMask, { type: 'filter' }>['filters'][number],
  index: number,
  options: MaskEditorOptions,
): void {
  const select = createFilterSelect(maskId, filter.kind, index, options);
  section.append(fieldLabel('Filtro', select));
  appendNumber(section, maskId, `filter.${index}`, 'Intensidad', Math.round(filter.strength * 100), 0, 100, index);
  section.append(createRemoveFilterButton(maskId, index));
}

function createFilterSelect(maskId: string, selectedKind: FilterKind, index: number, options: MaskEditorOptions): HTMLSelectElement {
  const select = document.createElement('select');
  select.dataset.maskId = maskId;
  select.dataset.filterIndex = String(index);
  options.filterKinds.forEach((kind) => select.append(createFilterOption(kind, selectedKind, options)));
  return select;
}

function createFilterOption(kind: FilterKind, selectedKind: FilterKind, options: MaskEditorOptions): HTMLOptionElement {
  const option = Object.assign(document.createElement('option'), { value: kind, textContent: options.filterLabel(kind) });
  option.selected = kind === selectedKind;
  return option;
}

function createRemoveFilterButton(maskId: string, index: number): HTMLButtonElement {
  const button = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Quitar filtro' });
  button.dataset.removeMaskFilter = maskId;
  button.dataset.filterIndex = String(index);
  return button;
}

function appendCheckbox(section: HTMLElement, maskId: string, field: string, label: string, checked: boolean): void {
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked });
  setMaskControlData(input, maskId, field);
  section.append(fieldLabel(label, input));
}

function appendNumber(section: HTMLElement, maskId: string, field: string, label: string, value: number, min: number, max: number, filterIndex?: number): void {
  const input = Object.assign(document.createElement('input'), { type: 'number', value: String(value), min: String(min), max: String(max) });
  setMaskControlData(input, maskId, field);
  if (filterIndex !== undefined) input.dataset.filterIndex = String(filterIndex);
  section.append(fieldLabel(label, input));
}

function setMaskControlData(control: HTMLElement, maskId: string, field: string): void {
  control.dataset.maskId = maskId;
  control.dataset.maskField = field;
}

function fieldLabel(label: string, control: HTMLElement): HTMLLabelElement {
  const element = document.createElement('label');
  element.append(document.createTextNode(`${label} `), control);
  return element;
}

type StyleMaskGroup = 'stroke' | 'outerGlow' | 'dropShadow' | 'bevelEmboss' | 'gradientOverlay' | 'innerShadow' | 'innerGlow' | 'satin' | 'colorOverlay' | 'patternOverlay';
type StyleMaskField = { key: string; label: string; type: 'color' | 'range' | 'select' | 'checkbox'; min?: number; max?: number; step?: number; scale?: number; options?: Array<[string, string]> };

const STYLE_MASK_GROUPS: readonly StyleMaskGroup[] = [
  'stroke', 'outerGlow', 'dropShadow', 'bevelEmboss', 'gradientOverlay', 'innerShadow', 'innerGlow', 'satin', 'colorOverlay', 'patternOverlay',
];

const STYLE_MASK_GROUP_LABELS: Record<StyleMaskGroup, string> = {
  stroke: 'Trazo',
  outerGlow: 'Resplandor exterior',
  dropShadow: 'Sombra paralela',
  bevelEmboss: 'Bisel y relieve',
  gradientOverlay: 'Superposición de degradado',
  innerShadow: 'Sombra interior',
  innerGlow: 'Resplandor interior',
  satin: 'Satinado',
  colorOverlay: 'Superposición de color',
  patternOverlay: 'Superposición de motivo',
};

const STYLE_MASK_FIELDS: Record<StyleMaskGroup, readonly StyleMaskField[]> = {
  stroke: [
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'size', label: 'Tamaño', type: 'range', min: 1, max: 32 },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
  ],
  outerGlow: [
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'size', label: 'Tamaño', type: 'range', min: 0, max: 64 },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
  ],
  dropShadow: [
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'size', label: 'Desenfoque', type: 'range', min: 0, max: 64 },
    { key: 'distance', label: 'Distancia', type: 'range', min: 0, max: 128 },
    { key: 'angle', label: 'Ángulo', type: 'range', min: -180, max: 180 },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
  ],
  bevelEmboss: [
    { key: 'size', label: 'Tamaño', type: 'range', min: 1, max: 32 },
    { key: 'depth', label: 'Profundidad', type: 'range', min: 1, max: 10 },
    { key: 'angle', label: 'Ángulo de luz', type: 'range', min: -180, max: 180 },
    { key: 'altitude', label: 'Altitud', type: 'range', min: 0, max: 90 },
    { key: 'highlightColor', label: 'Color de luz', type: 'color' },
    { key: 'shadowColor', label: 'Color de sombra', type: 'color' },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
  ],
  gradientOverlay: [
    { key: 'startColor', label: 'Color inicial', type: 'color' },
    { key: 'endColor', label: 'Color final', type: 'color' },
    { key: 'angle', label: 'Ángulo', type: 'range', min: -180, max: 180 },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
  ],
  innerShadow: [
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'size', label: 'Desenfoque', type: 'range', min: 0, max: 64 },
    { key: 'distance', label: 'Distancia', type: 'range', min: 0, max: 128 },
    { key: 'angle', label: 'Ángulo', type: 'range', min: -180, max: 180 },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
  ],
  innerGlow: [
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'size', label: 'Tamaño', type: 'range', min: 0, max: 128 },
    { key: 'choke', label: 'Contracción', type: 'range', min: 0, max: 100 },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
  ],
  satin: [
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'size', label: 'Tamaño', type: 'range', min: 0, max: 128 },
    { key: 'distance', label: 'Distancia', type: 'range', min: 0, max: 256 },
    { key: 'angle', label: 'Ángulo', type: 'range', min: -180, max: 180 },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
    { key: 'invert', label: 'Invertir', type: 'checkbox' },
  ],
  colorOverlay: [
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
    { key: 'blendMode', label: 'Fusión', type: 'select', options: [['normal', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Trama'], ['overlay', 'Superponer']] },
  ],
  patternOverlay: [
    { key: 'pattern', label: 'Motivo', type: 'select', options: [['diagonal', 'Diagonal'], ['grid', 'Cuadrícula'], ['dots', 'Puntos'], ['checkerboard', 'Damero'], ['crosshatch', 'Trama cruzada']] },
    { key: 'color', label: 'Color principal', type: 'color' },
    { key: 'backgroundColor', label: 'Color de fondo', type: 'color' },
    { key: 'scale', label: 'Escala', type: 'range', min: 10, max: 500 },
    { key: 'angle', label: 'Ángulo', type: 'range', min: -180, max: 180 },
    { key: 'opacity', label: 'Opacidad', type: 'range', min: 0, max: 100, scale: 100 },
    { key: 'blendMode', label: 'Fusión', type: 'select', options: [['normal', 'Normal'], ['multiply', 'Multiplicar'], ['screen', 'Trama'], ['overlay', 'Superponer']] },
  ],
};

function appendStyleMaskControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'styles' }>): void {
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'Ajustá todos los estilos en esta máscara. Aplicar confirma los cambios; Cancelar los descarta.';
  section.append(note);
  STYLE_MASK_GROUPS.forEach((group) => appendStyleMaskGroup(section, mask, group));
}

function appendStyleMaskGroup(
  section: HTMLElement,
  mask: Extract<LayerMask, { type: 'styles' }>,
  group: StyleMaskGroup,
): void {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'layer-style-effect layer-mask-style-group';
  const legend = document.createElement('legend');
  const enabled = Object.assign(document.createElement('input'), { type: 'checkbox', checked: mask.styles[group].enabled });
  setMaskControlData(enabled, mask.id, `style.${group}.enabled`);
  legend.append(enabled, document.createTextNode(` ${STYLE_MASK_GROUP_LABELS[group]}`));
  fieldset.append(legend);
  const values = mask.styles[group] as unknown as Record<string, string | number | boolean>;
  STYLE_MASK_FIELDS[group].forEach((config) => fieldset.append(createStyleMaskField(mask.id, group, values, config)));
  section.append(fieldset);
}

function createStyleMaskField(
  maskId: string,
  group: StyleMaskGroup,
  values: Record<string, string | number | boolean>,
  config: StyleMaskField,
): HTMLLabelElement {
  const input = createStyleMaskInput(values, config);
  setMaskControlData(input, maskId, `style.${group}.${config.key}`);
  return fieldLabel(config.label, input);
}

function createStyleMaskInput(
  values: Record<string, string | number | boolean>,
  config: StyleMaskField,
): HTMLInputElement | HTMLSelectElement {
  if (config.type === 'select') return createStyleMaskSelect(values, config);
  return createStyleMaskInputElement(values, config);
}

function createStyleMaskSelect(
  values: Record<string, string | number | boolean>,
  config: StyleMaskField,
): HTMLSelectElement {
  const select = document.createElement('select');
  (config.options ?? []).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    select.add(option);
  });
  select.value = String(values[config.key]);
  return select;
}

function createStyleMaskInputElement(
  values: Record<string, string | number | boolean>,
  config: StyleMaskField,
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = config.type === 'checkbox' ? 'checkbox' : config.type;
  if (config.type === 'checkbox') {
    input.checked = values[config.key] === true;
    return input;
  }
  input.value = String(config.scale ? Number(values[config.key]) * config.scale : values[config.key]);
  if (config.min !== undefined) input.min = String(config.min);
  if (config.max !== undefined) input.max = String(config.max);
  if (config.step !== undefined) input.step = String(config.step);
  return input;
}
