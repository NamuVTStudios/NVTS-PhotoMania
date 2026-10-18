import type { VectorShape } from '@nvts/shared';

// Panel template. Editor interactions are wired by the application controller.

export const VECTOR_EDITOR_PANEL_TEMPLATE = `
<section id="vector-panel" class="editor-panel vector-panel" hidden>
  <header><span class="tool-icon tool-icon--vector-layer" aria-hidden="true"></span><strong>Editor vectorial</strong><span id="vector-layer-name"></span><button class="panel-close" id="vector-close" type="button" aria-label="Cerrar editor vectorial">×</button></header>
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
      <div class="vector-object-actions"><button type="button" id="vector-duplicate-shape">Duplicar objeto</button><button type="button" id="vector-shape-up">Subir objeto</button><button type="button" id="vector-shape-down">Bajar objeto</button><button type="button" id="vector-export-svg">Exportar SVG…</button><button id="vector-delete-shape" type="button" class="danger-button">Eliminar objeto</button></div>
    </div>
  </div>
  <footer><span>Las modificaciones se registran como una acción de historial al aplicar.</span><button id="vector-cancel" type="button">Cancelar</button><button id="vector-clear" type="button">Vaciar capa</button><button id="vector-apply" class="primary" type="button">Aplicar cambios</button></footer>
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
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') callbacks.cancel(); });
  panel.querySelectorAll<HTMLButtonElement>('[data-vector-add]').forEach((button) => {
    button.onclick = () => callbacks.addShape(button.dataset.vectorAdd as VectorShape['kind']);
  });
  root.querySelector<HTMLButtonElement>('#vector-delete-shape')?.addEventListener('click', () => callbacks.deleteShape());
  root.querySelector<HTMLButtonElement>('#vector-duplicate-shape')?.addEventListener('click', () => callbacks.duplicateShape());
  root.querySelector<HTMLButtonElement>('#vector-shape-up')?.addEventListener('click', () => callbacks.moveShape(+1));
  root.querySelector<HTMLButtonElement>('#vector-shape-down')?.addEventListener('click', () => callbacks.moveShape(-1));
  root.querySelector<HTMLButtonElement>('#vector-export-svg')?.addEventListener('click', () => callbacks.exportSvg());
  root.querySelector<HTMLButtonElement>('#vector-apply')?.addEventListener('click', () => callbacks.apply());
  root.querySelector<HTMLButtonElement>('#vector-cancel')?.addEventListener('click', () => callbacks.cancel());
  root.querySelector<HTMLButtonElement>('#vector-close')?.addEventListener('click', () => callbacks.cancel());
  root.querySelector<HTMLButtonElement>('#vector-clear')?.addEventListener('click', () => callbacks.clear());

  [
    'vector-kind','vector-x','vector-y','vector-width','vector-height','vector-rotation','vector-color','vector-stroke-color','vector-opacity','vector-stroke',
    'vector-fill-enabled','vector-stroke-enabled','vector-dash','vector-line-cap','vector-line-join','vector-corner-radius','vector-star-points',
    'vector-text','vector-font-family','vector-font-size','vector-font-style','vector-font-weight','vector-text-align',
  ].forEach((id) => {
    const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
    input?.addEventListener(id === 'vector-opacity' ? 'input' : 'change', () => callbacks.updateFromFields());
  });
  root.querySelector<HTMLTextAreaElement>('#vector-points')?.addEventListener('change', () => callbacks.updateFromFields());
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
  host.replaceChildren();
  if (!shapes.length) {
    const empty = document.createElement('p'); empty.className = 'hint';
    empty.textContent = 'Todavía no hay objetos. Elegí una herramienta vectorial para crear uno.';
    host.append(empty);
  }
  for (const shape of shapes) {
    const button = document.createElement('button'); button.type = 'button';
    button.classList.toggle('active', shape.id === selectedId);
    const iconName = ({ rectangle: 'shape-rectangle', 'rounded-rectangle': 'shape-rounded-rectangle', ellipse: 'shape-ellipse', line: 'shape-line', polygon: 'shape-polygon', polyline: 'shape-polyline', bezier: 'shape-bezier', freehand: 'shape-freehand', star: 'shape-star', spiral: 'shape-spiral', text: 'shape-text' } as const)[shape.kind];
    const icon = document.createElement('span'); icon.className = `tool-icon tool-icon--${iconName}`; icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span'); label.textContent = `${labelForKind(shape.kind)} · ${Math.round(shape.x)}, ${Math.round(shape.y)}`;
    button.replaceChildren(icon, label);
    button.onclick = () => onSelectShape(shape.id);
    host.append(button);
  }

  const shape = shapes.find((item) => item.id === selectedId);
  const field = <T extends HTMLElement>(id: string): T | null => root.querySelector<T>(`#${id}`);
  const ids = [
    'vector-kind','vector-x','vector-y','vector-width','vector-height','vector-rotation','vector-color','vector-stroke-color',
    'vector-opacity','vector-stroke','vector-fill-enabled','vector-stroke-enabled','vector-dash','vector-line-cap','vector-line-join',
    'vector-corner-radius','vector-star-points','vector-text','vector-font-family','vector-font-size','vector-font-style',
    'vector-font-weight','vector-text-align','vector-points','vector-delete-shape','vector-duplicate-shape','vector-shape-up','vector-shape-down','vector-export-svg',
  ];
  ids.forEach((id) => { const element = field<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>(id); if (element) element.disabled = !shape; });
  if (!shape) return;
  field<HTMLSelectElement>('vector-kind')!.value = shape.kind;
  field<HTMLInputElement>('vector-x')!.value = String(Math.round(shape.x));
  field<HTMLInputElement>('vector-y')!.value = String(Math.round(shape.y));
  field<HTMLInputElement>('vector-width')!.value = String(Math.round(shape.width));
  field<HTMLInputElement>('vector-height')!.value = String(Math.round(shape.height));
  field<HTMLInputElement>('vector-rotation')!.value = String(Math.round(shape.rotation ?? 0));
  field<HTMLInputElement>('vector-color')!.value = /^#[0-9a-f]{6}$/i.test(shape.fillColor ?? shape.color) ? (shape.fillColor ?? shape.color) : '#e03030';
  field<HTMLInputElement>('vector-stroke-color')!.value = /^#[0-9a-f]{6}$/i.test(shape.strokeColor ?? shape.color) ? (shape.strokeColor ?? shape.color) : '#e03030';
  field<HTMLInputElement>('vector-opacity')!.value = String(Math.round(shape.opacity * 100));
  const opacityOutput = field<HTMLElement>('vector-opacity-value'); if (opacityOutput) opacityOutput.textContent = `${Math.round(shape.opacity * 100)}%`;
  field<HTMLInputElement>('vector-stroke')!.value = String(Math.max(0, Math.round(shape.strokeWidth)));
  const defaultFill = !['line','polyline','bezier','freehand','spiral'].includes(shape.kind);
  field<HTMLSelectElement>('vector-fill-enabled')!.value = (shape.fillEnabled ?? defaultFill) ? 'yes' : 'no';
  field<HTMLSelectElement>('vector-stroke-enabled')!.value = (shape.strokeEnabled ?? ['line','polyline','bezier','freehand','spiral'].includes(shape.kind)) ? 'yes' : 'no';
  field<HTMLSelectElement>('vector-dash')!.value = shape.strokeDash ?? 'solid';
  field<HTMLSelectElement>('vector-line-cap')!.value = shape.lineCap ?? 'round';
  field<HTMLSelectElement>('vector-line-join')!.value = shape.lineJoin ?? 'round';
  field<HTMLInputElement>('vector-corner-radius')!.value = String(shape.cornerRadius ?? 20);
  field<HTMLInputElement>('vector-star-points')!.value = String(shape.starPoints ?? 5);
  field<HTMLInputElement>('vector-text')!.value = shape.text ?? 'Texto vectorial';
  field<HTMLSelectElement>('vector-font-family')!.value = shape.fontFamily ?? 'Arial';
  field<HTMLInputElement>('vector-font-size')!.value = String(shape.fontSize ?? 64);
  field<HTMLSelectElement>('vector-font-style')!.value = shape.fontStyle ?? 'normal';
  field<HTMLSelectElement>('vector-font-weight')!.value = shape.fontWeight ?? 'normal';
  field<HTMLSelectElement>('vector-text-align')!.value = shape.textAlign ?? 'left';
  field<HTMLTextAreaElement>('vector-points')!.value = shape.points ? JSON.stringify(shape.points, null, 2) : '';
  const index = shapes.findIndex((item) => item.id === shape.id);
  const up = field<HTMLButtonElement>('vector-shape-up'); if (up) up.disabled = index >= shapes.length - 1;
  const down = field<HTMLButtonElement>('vector-shape-down'); if (down) down.disabled = index <= 0;
}
