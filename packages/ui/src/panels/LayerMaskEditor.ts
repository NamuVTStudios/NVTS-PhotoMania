import { getLayerMaskLabel, type FilterKind, type LayerMask } from '@nvts/shared';

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

export function renderLayerMaskEditor(container: HTMLElement, mask: LayerMask | undefined, options: MaskEditorOptions): void {
  container.replaceChildren();
  if (!mask) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Seleccioná una máscara dentro de una capa para editarla.';
    container.append(hint);
    return;
  }
  container.append(createMaskEditor(mask, options));
}

function createMaskEditor(mask: LayerMask, options: MaskEditorOptions): HTMLElement {
  const section = document.createElement('section');
  section.className = 'layer-mask-entry';
  section.dataset.maskId = mask.id;
  const header = document.createElement('header');
  const title = document.createElement('strong');
  title.textContent = `Máscara de ${maskLabel(mask)}`;
  const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Eliminar' });
  remove.dataset.deleteMask = mask.id;
  header.append(title, remove);
  section.append(header);
  renderMaskControls(section, mask, options);
  return section;
}

function maskLabel(mask: LayerMask): string {
  return getLayerMaskLabel(mask.type);
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
  for (const [key, value, label] of fields) {
    const input = Object.assign(document.createElement('input'), { type: 'number', value: String(value), step: '0.1' });
    setMaskControlData(input, mask.id, `transform.${key}`);
    section.append(fieldLabel(label, input));
  }
}

function appendColorizeControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'colorize' }>): void {
  appendCheckbox(section, mask.id, 'colorize.editStrokes', 'Editar trazos', mask.editStrokes);
  appendCheckbox(section, mask.id, 'colorize.showOutput', 'Mostrar resultado', mask.showOutput);
  appendCheckbox(section, mask.id, 'colorize.limitToLayerBounds', 'Limitar a los bordes de la capa', mask.limitToLayerBounds);
  appendNumber(section, mask.id, 'colorize.gapClose', 'Cerrar huecos', mask.gapClose, 0, 100);
  appendNumber(section, mask.id, 'colorize.threshold', 'Umbral', Math.round(mask.threshold * 100), 0, 100);
  appendTransparentColorControls(section, mask);
  appendColorizeActions(section, mask);
}

function appendTransparentColorControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'colorize' }>): void {
  for (const color of new Set(mask.strokes.map((stroke) => stroke.color))) {
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: mask.transparentColors.includes(color) });
    setMaskControlData(input, mask.id, 'colorize.transparentColor');
    input.dataset.maskColor = color;
    section.append(fieldLabel(`Transparente ${color}`, input));
  }
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
  mask.filters.forEach((filter, index) => {
    const select = document.createElement('select');
    select.dataset.maskId = mask.id;
    select.dataset.filterIndex = String(index);
    for (const kind of options.filterKinds) {
      const option = Object.assign(document.createElement('option'), { value: kind, textContent: options.filterLabel(kind) });
      option.selected = kind === filter.kind;
      select.append(option);
    }
    section.append(fieldLabel('Filtro', select));
    appendNumber(section, mask.id, `filter.${index}`, 'Intensidad', Math.round(filter.strength * 100), 0, 100, index);
    const edit = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Editar en ventana de filtros' });
    edit.dataset.editMaskFilter = mask.id;
    edit.dataset.filterIndex = String(index);
    const remove = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Quitar filtro' });
    remove.dataset.removeMaskFilter = mask.id;
    remove.dataset.filterIndex = String(index);
    section.append(edit, remove);
  });
  const add = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Añadir filtro' });
  add.dataset.addMaskFilter = mask.id;
  section.append(add);
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

function appendStyleMaskControls(section: HTMLElement, mask: Extract<LayerMask, { type: 'styles' }>): void {
  const note = document.createElement('p');
  note.className = 'hint';
  note.textContent = 'Esta máscara guarda los estilos de capa editables sin modificar los píxeles originales.';
  const edit = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Editar estilos de capa' });
  edit.dataset.editStyleMask = mask.id;
  section.append(note, edit);
}
