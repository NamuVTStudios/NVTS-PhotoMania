import type { VectorShape } from '@nvts/shared';
import { uiIcon } from '../components/ShellTemplates';

// Panel template. Editor interactions are wired by the application controller.

export const VECTOR_EDITOR_PANEL_TEMPLATE = `
<section id="vector-panel" class="editor-panel vector-panel" hidden>
  <header><span class="tool-icon tool-icon--vector-layer" aria-hidden="true"></span><strong>Editor vectorial</strong><span id="vector-layer-name"></span><button class="panel-close" id="vector-close" type="button" aria-label="Cerrar editor vectorial">${uiIcon('close')}</button></header>
  <div class="vector-editor-grid">
    <aside class="editor-list" id="vector-shape-list" aria-label="Objetos vectoriales"></aside>
    <div class="editor-settings">
      <div class="vector-add-row">
        <button type="button" data-vector-add="rectangle"><span class="tool-icon tool-icon--shape-rectangle" aria-hidden="true"></span><span>Rectángulo</span></button><button type="button" data-vector-add="rounded-rectangle"><span class="tool-icon tool-icon--shape-rounded-rectangle" aria-hidden="true"></span><span>Rect. redondeado</span></button><button type="button" data-vector-add="ellipse"><span class="tool-icon tool-icon--shape-ellipse" aria-hidden="true"></span><span>Elipse</span></button><button type="button" data-vector-add="line"><span class="tool-icon tool-icon--shape-line" aria-hidden="true"></span><span>Línea</span></button>
        <button type="button" data-vector-add="polygon"><span class="tool-icon tool-icon--shape-polygon" aria-hidden="true"></span><span>Polígono</span></button><button type="button" data-vector-add="polyline"><span class="tool-icon tool-icon--shape-polyline" aria-hidden="true"></span><span>Polilínea</span></button><button type="button" data-vector-add="bezier"><span class="tool-icon tool-icon--shape-bezier" aria-hidden="true"></span><span>Curva Bézier</span></button><button type="button" data-vector-add="freehand"><span class="tool-icon tool-icon--shape-freehand" aria-hidden="true"></span><span>Trazo libre</span></button>
        <button type="button" data-vector-add="star"><span class="tool-icon tool-icon--shape-star" aria-hidden="true"></span><span>Estrella</span></button><button type="button" data-vector-add="spiral"><span class="tool-icon tool-icon--shape-spiral" aria-hidden="true"></span><span>Espiral</span></button><button type="button" data-vector-add="text"><span class="tool-icon tool-icon--shape-text" aria-hidden="true"></span><span>Texto artístico</span></button>
      </div>
      <p class="hint">Los objetos mantienen sus datos vectoriales editables; el rasterizado se usa como vista previa del compositor. Seleccioná un objeto para editar geometría, nodos, colores, trazo y texto.</p>
      <div class="vector-fields">
        <label>Tipo <select id="vector-kind"><option value="rectangle">Rectángulo</option><option value="rounded-rectangle">Rectángulo redondeado</option><option value="ellipse">Elipse</option><option value="line">Línea</option><option value="polygon">Polígono</option><option value="polyline">Polilínea</option><option value="bezier">Curva Bézier</option><option value="freehand">Trazo libre</option><option value="star">Estrella</option><option value="spiral">Espiral</option><option value="text">Texto artístico</option></select></label>
        <label>X <input id="vector-x" type="number" step="1"/></label><label>Y <input id="vector-y" type="number" step="1"/></label><label>Ancho <input id="vector-width" type="number" min="1" step="1"/></label><label>Alto <input id="vector-height" type="number" min="1" step="1"/></label><label>Rotación (°) <input id="vector-rotation" type="number" min="-360" max="360" step="1"/></label>
        <label>Relleno <input id="vector-color" type="color" value="#e03030"/></label><label>Trazo <input id="vector-stroke-color" type="color" value="#e03030"/></label><label>Opacidad <input id="vector-opacity" type="range" min="0" max="100" value="100"/><output id="vector-opacity-value">100%</output></label><label>Grosor (px) <input id="vector-stroke" type="number" min="0" max="500" value="4"/></label>
        <label>Relleno <select id="vector-fill-enabled"><option value="yes">Activado</option><option value="no">Sin relleno</option></select></label><label>Trazo <select id="vector-stroke-enabled"><option value="yes">Activado</option><option value="no">Sin trazo</option></select></label><label>Estilo de trazo <select id="vector-dash"><option value="solid">Continuo</option><option value="dash">Guiones</option><option value="dot">Punteado</option></select></label><label>Extremos de línea <select id="vector-line-cap"><option value="round">Redondeados</option><option value="butt">Rectos</option><option value="square">Cuadrados</option></select></label><label>Unión de línea <select id="vector-line-join"><option value="round">Redondeada</option><option value="miter">En punta</option><option value="bevel">Biselada</option></select></label><label>Radio de esquina <input id="vector-corner-radius" type="number" min="0" max="500" value="20"/></label><label>Puntas de estrella <input id="vector-star-points" type="number" min="3" max="64" value="5"/></label>
        <label>Texto <input id="vector-text" type="text" value="Texto vectorial" maxlength="500"/></label><label>Familia tipográfica <select id="vector-font-family"><option>Arial</option><option>Inter</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option><option>monospace</option></select></label><label>Tamaño de letra <input id="vector-font-size" type="number" min="1" max="2000" value="64"/></label><label>Estilo <select id="vector-font-style"><option value="normal">Normal</option><option value="italic">Itálica</option></select></label><label>Grosor tipográfico <select id="vector-font-weight"><option value="normal">Normal</option><option value="bold">Negrita</option></select></label><label>Alineación <select id="vector-text-align"><option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label>
        <label class="vector-points-field">Nodos / puntos (JSON) <textarea id="vector-points" rows="5" spellcheck="false" placeholder='[{"x":100,"y":100},{"x":300,"y":200}]'></textarea></label>
      </div>
      <div class="vector-object-actions"><button type="button" id="vector-duplicate-shape">${uiIcon('duplicate')}<span>Duplicar objeto</span></button><button type="button" id="vector-shape-up">${uiIcon('move-up')}<span>Subir objeto</span></button><button type="button" id="vector-shape-down">${uiIcon('move-down')}<span>Bajar objeto</span></button><button type="button" id="vector-export-svg">${uiIcon('export')}<span>Exportar SVG…</span></button><button id="vector-delete-shape" type="button" class="danger-button">${uiIcon('delete')}<span>Eliminar objeto</span></button></div>
    </div>
  </div>
  <footer><span>Las modificaciones se registran como una acción de historial al aplicar.</span><button id="vector-cancel" type="button">${uiIcon('close')}<span>Cancelar</span></button><button id="vector-clear" type="button">${uiIcon('clear')}<span>Vaciar capa</span></button><button id="vector-apply" class="primary" type="button">${uiIcon('apply')}<span>Aplicar cambios</span></button></footer>
</section>
`;


export interface VectorEditorPanelCallbacks {
  addShape(kind: VectorShape['kind']): void;
  deleteShape(): void;
  duplicateShape(): void;
  moveShape(delta: number): void;
  exportSvg(): void;
  apply(): void;
  cancel(): void;
  clear(): void;
  updateFromFields(): void;
}

/** Owns the vector editor's static control wiring; document/object mutations are delegated to App. */
export function wireVectorEditorPanel(root: HTMLElement, callbacks: VectorEditorPanelCallbacks): void {
  const panel = root.querySelector<HTMLElement>('#vector-panel');
  if (!panel) return;
  bindVectorPanelKeyboard(panel, callbacks);
  bindVectorCreationButtons(panel, callbacks);
  bindVectorActionButtons(root, callbacks);
  bindVectorFieldChanges(root, callbacks);
}

function bindVectorPanelKeyboard(panel: HTMLElement, callbacks: VectorEditorPanelCallbacks): void {
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') callbacks.cancel();
  });
}

function bindVectorCreationButtons(panel: HTMLElement, callbacks: VectorEditorPanelCallbacks): void {
  panel.querySelectorAll<HTMLButtonElement>('[data-vector-add]').forEach((button) => {
    button.onclick = () => callbacks.addShape(button.dataset.vectorAdd as VectorShape['kind']);
  });
}

function bindVectorActionButtons(root: HTMLElement, callbacks: VectorEditorPanelCallbacks): void {
  root.querySelector<HTMLButtonElement>('#vector-delete-shape')?.addEventListener('click', () => callbacks.deleteShape());
  root.querySelector<HTMLButtonElement>('#vector-duplicate-shape')?.addEventListener('click', () => callbacks.duplicateShape());
  root.querySelector<HTMLButtonElement>('#vector-shape-up')?.addEventListener('click', () => callbacks.moveShape(+1));
  root.querySelector<HTMLButtonElement>('#vector-shape-down')?.addEventListener('click', () => callbacks.moveShape(-1));
  root.querySelector<HTMLButtonElement>('#vector-export-svg')?.addEventListener('click', () => callbacks.exportSvg());
  root.querySelector<HTMLButtonElement>('#vector-apply')?.addEventListener('click', () => callbacks.apply());
  root.querySelector<HTMLButtonElement>('#vector-cancel')?.addEventListener('click', () => callbacks.cancel());
  root.querySelector<HTMLButtonElement>('#vector-close')?.addEventListener('click', () => callbacks.cancel());
  root.querySelector<HTMLButtonElement>('#vector-clear')?.addEventListener('click', () => callbacks.clear());
}

function bindVectorFieldChanges(root: HTMLElement, callbacks: VectorEditorPanelCallbacks): void {
  const inputIds = [
    'vector-kind','vector-x','vector-y','vector-width','vector-height','vector-rotation','vector-color','vector-stroke-color',
    'vector-opacity','vector-stroke','vector-fill-enabled','vector-stroke-enabled','vector-dash','vector-line-cap','vector-line-join',
    'vector-corner-radius','vector-star-points','vector-text','vector-font-family','vector-font-size','vector-font-style',
    'vector-font-weight','vector-text-align',
  ];
  inputIds.forEach((id) => bindVectorFieldChange(root, id, callbacks));
  root.querySelector<HTMLTextAreaElement>('#vector-points')?.addEventListener('change', () => callbacks.updateFromFields());
}

function bindVectorFieldChange(root: HTMLElement, id: string, callbacks: VectorEditorPanelCallbacks): void {
  const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  input?.addEventListener(id === 'vector-opacity' ? 'input' : 'change', () => callbacks.updateFromFields());
}

/** Renders the editable vector object list and selected-object fields. */
export function renderVectorEditorPanel(
  root: HTMLElement,
  shapes: VectorShape[],
  selectedId: string | null,
  labelForKind: (kind: VectorShape['kind']) => string,
  onSelectShape: (id: string) => void,
): void {
  const host = root.querySelector<HTMLElement>('#vector-shape-list');
  if (!host) return;
  renderVectorShapeList(host, shapes, selectedId, labelForKind, onSelectShape);
  syncSelectedVectorShape(root, shapes, selectedId);
}

function renderVectorShapeList(
  host: HTMLElement,
  shapes: VectorShape[],
  selectedId: string | null,
  labelForKind: (kind: VectorShape['kind']) => string,
  onSelectShape: (id: string) => void,
): void {
  host.replaceChildren();
  if (!shapes.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Todavía no hay objetos. Elegí una herramienta vectorial para crear uno.';
    host.append(empty);
    return;
  }
  shapes.forEach((shape) => host.append(createVectorShapeButton(shape, selectedId, labelForKind, onSelectShape)));
}

function createVectorShapeButton(
  shape: VectorShape,
  selectedId: string | null,
  labelForKind: (kind: VectorShape['kind']) => string,
  onSelectShape: (id: string) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.toggle('active', shape.id === selectedId);
  const icon = document.createElement('span');
  icon.className = `tool-icon tool-icon--${getVectorShapeIconName(shape.kind)}`;
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = `${labelForKind(shape.kind)} · ${Math.round(shape.x)}, ${Math.round(shape.y)}`;
  button.replaceChildren(icon, label);
  button.onclick = () => onSelectShape(shape.id);
  return button;
}

function getVectorShapeIconName(kind: VectorShape['kind']): string {
  return ({
    rectangle: 'shape-rectangle', 'rounded-rectangle': 'shape-rounded-rectangle', ellipse: 'shape-ellipse',
    line: 'shape-line', polygon: 'shape-polygon', polyline: 'shape-polyline', bezier: 'shape-bezier',
    freehand: 'shape-freehand', star: 'shape-star', spiral: 'shape-spiral', text: 'shape-text',
  } as const)[kind];
}

function syncSelectedVectorShape(root: HTMLElement, shapes: VectorShape[], selectedId: string | null): void {
  const shape = shapes.find((item) => item.id === selectedId);
  updateVectorFieldAvailability(root, Boolean(shape));
  if (!shape) return;
  setVectorGeometryFields(root, shape);
  setVectorPaintFields(root, shape);
  setVectorTextFields(root, shape);
  updateVectorStackControls(root, shapes, shape);
}

function updateVectorFieldAvailability(root: HTMLElement, hasSelection: boolean): void {
  const ids = [
    'vector-kind','vector-x','vector-y','vector-width','vector-height','vector-rotation','vector-color','vector-stroke-color',
    'vector-opacity','vector-stroke','vector-fill-enabled','vector-stroke-enabled','vector-dash','vector-line-cap','vector-line-join',
    'vector-corner-radius','vector-star-points','vector-text','vector-font-family','vector-font-size','vector-font-style',
    'vector-font-weight','vector-text-align','vector-points','vector-delete-shape','vector-duplicate-shape','vector-shape-up',
    'vector-shape-down','vector-export-svg',
  ];
  ids.forEach((id) => {
    const element = getVectorField<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(root, id);
    if (element) element.disabled = !hasSelection;
  });
}

function setVectorGeometryFields(root: HTMLElement, shape: VectorShape): void {
  getVectorField<HTMLSelectElement>(root, 'vector-kind')!.value = shape.kind;
  getVectorField<HTMLInputElement>(root, 'vector-x')!.value = String(Math.round(shape.x));
  getVectorField<HTMLInputElement>(root, 'vector-y')!.value = String(Math.round(shape.y));
  getVectorField<HTMLInputElement>(root, 'vector-width')!.value = String(Math.round(shape.width));
  getVectorField<HTMLInputElement>(root, 'vector-height')!.value = String(Math.round(shape.height));
  getVectorField<HTMLInputElement>(root, 'vector-rotation')!.value = String(Math.round(shape.rotation ?? 0));
  getVectorField<HTMLInputElement>(root, 'vector-corner-radius')!.value = String(shape.cornerRadius ?? 20);
  getVectorField<HTMLInputElement>(root, 'vector-star-points')!.value = String(shape.starPoints ?? 5);
  getVectorField<HTMLTextAreaElement>(root, 'vector-points')!.value = shape.points ? JSON.stringify(shape.points, null, 2) : '';
}

function setVectorPaintFields(root: HTMLElement, shape: VectorShape): void {
  const fillColor = shape.fillColor ?? shape.color;
  const strokeColor = shape.strokeColor ?? shape.color;
  getVectorField<HTMLInputElement>(root, 'vector-color')!.value = isVectorColor(fillColor) ? fillColor : '#e03030';
  getVectorField<HTMLInputElement>(root, 'vector-stroke-color')!.value = isVectorColor(strokeColor) ? strokeColor : '#e03030';
  getVectorField<HTMLInputElement>(root, 'vector-opacity')!.value = String(Math.round(shape.opacity * 100));
  const opacityOutput = getVectorField<HTMLElement>(root, 'vector-opacity-value');
  if (opacityOutput) opacityOutput.textContent = `${Math.round(shape.opacity * 100)}%`;
  getVectorField<HTMLInputElement>(root, 'vector-stroke')!.value = String(Math.max(0, Math.round(shape.strokeWidth)));
  const defaultFill = !['line','polyline','bezier','freehand','spiral'].includes(shape.kind);
  getVectorField<HTMLSelectElement>(root, 'vector-fill-enabled')!.value = (shape.fillEnabled ?? defaultFill) ? 'yes' : 'no';
  const defaultStroke = ['line','polyline','bezier','freehand','spiral'].includes(shape.kind);
  getVectorField<HTMLSelectElement>(root, 'vector-stroke-enabled')!.value = (shape.strokeEnabled ?? defaultStroke) ? 'yes' : 'no';
  getVectorField<HTMLSelectElement>(root, 'vector-dash')!.value = shape.strokeDash ?? 'solid';
  getVectorField<HTMLSelectElement>(root, 'vector-line-cap')!.value = shape.lineCap ?? 'round';
  getVectorField<HTMLSelectElement>(root, 'vector-line-join')!.value = shape.lineJoin ?? 'round';
}

function setVectorTextFields(root: HTMLElement, shape: VectorShape): void {
  getVectorField<HTMLInputElement>(root, 'vector-text')!.value = shape.text ?? 'Texto vectorial';
  getVectorField<HTMLSelectElement>(root, 'vector-font-family')!.value = shape.fontFamily ?? 'Arial';
  getVectorField<HTMLInputElement>(root, 'vector-font-size')!.value = String(shape.fontSize ?? 64);
  getVectorField<HTMLSelectElement>(root, 'vector-font-style')!.value = shape.fontStyle ?? 'normal';
  getVectorField<HTMLSelectElement>(root, 'vector-font-weight')!.value = shape.fontWeight ?? 'normal';
  getVectorField<HTMLSelectElement>(root, 'vector-text-align')!.value = shape.textAlign ?? 'left';
}

function updateVectorStackControls(root: HTMLElement, shapes: VectorShape[], selectedShape: VectorShape): void {
  const index = shapes.findIndex((item) => item.id === selectedShape.id);
  const up = getVectorField<HTMLButtonElement>(root, 'vector-shape-up');
  const down = getVectorField<HTMLButtonElement>(root, 'vector-shape-down');
  if (up) up.disabled = index >= shapes.length - 1;
  if (down) down.disabled = index <= 0;
}

function getVectorField<T extends HTMLElement>(root: HTMLElement, id: string): T | null {
  return root.querySelector<T>(`#${id}`);
}

function isVectorColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}
