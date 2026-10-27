import { getLayerMaskLabel, type BlendMode, type LayerMask, type LayerType } from '@nvts/shared';
import type { LayerNode } from '@nvts/document-model';

// Panel template. Event behavior lives in its panel renderer/controller.

export const LAYERS_PANEL_TEMPLATE = `
    <section class="dock-panel layers-panel"><header><strong>Capas</strong><div class="panel-spacer"></div><select id="dock-blend" aria-label="Modo de fusión"><option value="normal">Normal</option><option value="multiply">Multiplicar</option><option value="screen">Trama</option><option value="overlay">Superponer</option></select></header>
      <div class="layer-props"><label>Opacidad <input id="layer-opacity" type="number" min="0" max="100" value="100"/>%</label><button id="l-fill-color" type="button" hidden>Color de relleno…</button><button id="l-filter-options" type="button" hidden>Configurar filtro…</button><button id="l-vector-add" type="button" hidden>Editar vectores…</button><button id="l-text-edit" type="button" hidden>Editar texto…</button></div>
      <div id="layers"></div><div class="layer-empty" id="layer-empty"><span class="tool-icon tool-icon--layers" aria-hidden="true"></span><strong>Capas</strong><span>Seleccioná una capa o creá una nueva.</span></div>
      <details class="layer-mask-manager"><summary>Máscaras de capa</summary><div id="layer-mask-list"></div></details>
      <div id="layer-create-menu" class="layer-create-menu" role="menu" aria-label="Crear capa" hidden>
        <button type="button" role="menuitem" data-layer-type="paint"><span class="tool-icon tool-icon--paint-layer" aria-hidden="true"></span><span>Capa de pintura</span></button>
        <button type="button" role="menuitem" data-layer-type="filter"><span class="tool-icon tool-icon--filter-layer" aria-hidden="true"></span><span>Capa de filtro</span></button>
        <button type="button" role="menuitem" data-layer-type="fill"><span class="tool-icon tool-icon--fill-layer" aria-hidden="true"></span><span>Capa de relleno…</span></button>
        <button type="button" role="menuitem" data-layer-type="file"><span class="tool-icon tool-icon--file-layer" aria-hidden="true"></span><span>Capa de archivo…</span></button>
        <button type="button" role="menuitem" data-layer-type="vector"><span class="tool-icon tool-icon--vector-layer" aria-hidden="true"></span><span>Capa vectorial</span></button>
        <button type="button" role="menuitem" data-layer-type="text"><span class="tool-icon tool-icon--text-layer" aria-hidden="true"></span><span>Capa de texto</span></button>
        <button type="button" role="menuitem" data-layer-type="group"><span class="tool-icon tool-icon--group-layer" aria-hidden="true"></span><span>Grupo</span></button>
        <div class="layer-create-menu__separator" role="separator"></div>
        <div class="layer-create-menu__heading">Máscaras de capa</div>
        <button type="button" role="menuitem" data-mask-type="transform"><span class="tool-icon tool-icon--vector-select" aria-hidden="true"></span><span>Máscara de transformación</span></button>
        <button type="button" role="menuitem" data-mask-type="colorize"><span class="tool-icon tool-icon--fill-layer" aria-hidden="true"></span><span>Máscara de colorización</span></button>
        <button type="button" role="menuitem" data-mask-type="filter"><span class="tool-icon tool-icon--filter-layer" aria-hidden="true"></span><span>Máscara de filtro</span></button>
      </div>
      <footer>
        <div class="layer-action-row" aria-label="Acciones de capa">
          <button id="l-up" type="button" title="Subir capa" aria-label="Subir capa"><span class="tool-icon tool-icon--move-up" aria-hidden="true"></span></button>
          <button id="l-down" type="button" title="Bajar capa" aria-label="Bajar capa"><span class="tool-icon tool-icon--move-down" aria-hidden="true"></span></button>
          <button id="l-duplicate" type="button" title="Duplicar capa" aria-label="Duplicar capa"><span class="tool-icon tool-icon--duplicate" aria-hidden="true"></span></button>
          <button id="l-del" type="button" title="Eliminar capa" aria-label="Eliminar capa"><span class="tool-icon tool-icon--delete" aria-hidden="true"></span></button>
        </div>
        <button id="l-add" class="primary" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="layer-create-menu"><span class="tool-icon tool-icon--plus" aria-hidden="true"></span><span>Nueva capa</span></button>
      </footer>
    </section>
`;


export interface LayersPanelCallbacks {
  getTypeLabel(type: LayerNode['type']): string;
  getTypeIcon(type: LayerNode['type']): string;
  drawThumbnail(canvas: HTMLCanvasElement, layer: LayerNode): void;
  onVisibilityChange(layer: LayerNode, visible: boolean): void;
  onRenameOrEdit(layer: LayerNode): void;
  onOpenEffects(layer: LayerNode): void;
  onToggleLock(layer: LayerNode): void;
  onSelect(layer: LayerNode): void;
  onSelectMask(layer: LayerNode, mask: LayerMask): void;
  onToggleMask(layer: LayerNode, mask: LayerMask, enabled: boolean): void;
  onContextMenu(layer: LayerNode, x: number, y: number): void;
  getDeleteBlockReason(layer: LayerNode): string | null;
}

function createLayerVisibilityControl(layer: LayerNode, callbacks: LayersPanelCallbacks): HTMLInputElement {
  const control = Object.assign(document.createElement('input'), { type: 'checkbox', checked: layer.visible });
  control.title = 'Visibilidad';
  control.setAttribute('aria-label', `Visibilidad de ${layer.name}`);
  control.onclick = (event) => event.stopPropagation();
  control.onchange = () => callbacks.onVisibilityChange(layer, control.checked);
  return control;
}

function createLayerTypeIcon(layer: LayerNode, callbacks: LayersPanelCallbacks): HTMLSpanElement {
  const icon = document.createElement('span');
  const iconName = layer.type === 'group' && layer.children.length
    ? 'group-layer-open'
    : callbacks.getTypeIcon(layer.type);
  icon.className = `layer-type-icon tool-icon tool-icon--${iconName}`;
  icon.title = callbacks.getTypeLabel(layer.type);
  return icon;
}

function createLayerThumbnail(layer: LayerNode, callbacks: LayersPanelCallbacks): HTMLCanvasElement {
  const thumbnail = document.createElement('canvas');
  thumbnail.className = 'layer-thumbnail';
  thumbnail.width = 52;
  thumbnail.height = 36;
  thumbnail.setAttribute('aria-label', `Miniatura de ${layer.name}`);
  callbacks.drawThumbnail(thumbnail, layer);
  return thumbnail;
}

function createLayerName(layer: LayerNode, callbacks: LayersPanelCallbacks): HTMLSpanElement {
  const name = document.createElement('span');
  name.className = 'layer-name';
  name.textContent = layer.name;
  name.title = getLayerNameTooltip(layer);
  name.ondblclick = (event) => {
    event.stopPropagation();
    callbacks.onRenameOrEdit(layer);
  };
  return name;
}

function getLayerNameTooltip(layer: LayerNode): string {
  if (layer.type !== 'file') return 'Doble clic para renombrar o editar esta capa';
  const sourceName = layer.sourceName ?? layer.name;
  const linkStatus = getFileLayerLinkStatus(layer.sourceLinkId);
  return `${sourceName} · ${linkStatus}`;
}

function getFileLayerLinkStatus(linkId: string | undefined): string {
  if (linkId) return 'vínculo externo configurado';
  return 'imagen incrustada sin vínculo externo';
}

function createLayerEffectsButton(layer: LayerNode, callbacks: LayersPanelCallbacks): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'layer-effects-hit';
  button.type = 'button';
  button.textContent = 'fx';
  button.title = 'Doble clic izquierdo para abrir estilos de capa';
  button.ondblclick = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    callbacks.onOpenEffects(layer);
  };
  return button;
}

function createLayerLockButton(layer: LayerNode, callbacks: LayersPanelCallbacks): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'layer-lock-toggle';
  const icon = document.createElement('span');
  icon.className = `tool-icon ${layer.locked ? 'tool-icon--lock' : 'tool-icon--unlock'}`;
  icon.setAttribute('aria-hidden', 'true');
  button.replaceChildren(icon);
  button.title = layer.locked ? 'Desbloquear capa' : 'Bloquear capa';
  button.setAttribute('aria-label', button.title);
  button.onclick = (event) => {
    event.stopPropagation();
    callbacks.onToggleLock(layer);
  };
  return button;
}

function createLayerRow(layer: LayerNode, activeLayerId: string, depth: number, callbacks: LayersPanelCallbacks): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'layer' + (layer.id === activeLayerId ? ' active' : '');
  row.dataset.layerId = layer.id;
  row.style.paddingLeft = `${5 + depth * 14}px`;
  row.title = `${callbacks.getTypeLabel(layer.type)} · ${layer.name}`;
  row.append(
    createLayerVisibilityControl(layer, callbacks),
    createLayerTypeIcon(layer, callbacks),
    createLayerThumbnail(layer, callbacks),
    createLayerName(layer, callbacks),
    createLayerEffectsButton(layer, callbacks),
    createLayerLockButton(layer, callbacks),
  );
  row.onclick = () => callbacks.onSelect(layer);
  row.ondblclick = (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, input, select, textarea, .layer-name')) return;
    callbacks.onOpenEffects(layer);
  };
  row.oncontextmenu = (event) => {
    event.preventDefault();
    callbacks.onContextMenu(layer, event.clientX, event.clientY);
  };
  return row;
}

function createLayerMaskRow(layer: LayerNode, mask: LayerMask, activeMaskId: string, depth: number, callbacks: LayersPanelCallbacks): HTMLDivElement {
  const row = document.createElement('div');
  row.className = `layer-mask-row${mask.id === activeMaskId ? ' active' : ''}`;
  row.dataset.layerId = layer.id;
  row.dataset.maskId = mask.id;
  row.style.paddingLeft = `${24 + depth * 14}px`;
  const enabled = Object.assign(document.createElement('input'), { type: 'checkbox', checked: mask.enabled });
  enabled.title = 'Activar máscara';
  enabled.setAttribute('aria-label', `Activar máscara de ${getLayerMaskLabel(mask.type)}`);
  enabled.onclick = (event) => event.stopPropagation();
  enabled.onchange = () => callbacks.onToggleMask(layer, mask, enabled.checked);
  const icon = document.createElement('span');
  icon.className = `tool-icon tool-icon--${getLayerMaskIcon(mask)}`;
  icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = `Máscara de ${getLayerMaskLabel(mask.type)}`;
  row.append(enabled, icon, label);
  row.onclick = () => callbacks.onSelectMask(layer, mask);
  return row;
}

function getLayerMaskIcon(mask: LayerMask): string {
  if (mask.type === 'transform') return 'vector-select';
  if (mask.type === 'colorize') return 'fill-layer';
  return 'filter-layer';
}

function renderLayerTree(
  container: HTMLElement,
  nodes: LayerNode[],
  activeLayerId: string,
  activeMaskId: string,
  depth: number,
  callbacks: LayersPanelCallbacks,
): number {
  let renderedCount = 0;
  for (const layer of [...nodes].reverse()) renderedCount += renderLayerEntry(container, layer, activeLayerId, activeMaskId, depth, callbacks);
  return renderedCount;
}

function renderLayerEntry(
  container: HTMLElement,
  layer: LayerNode,
  activeLayerId: string,
  activeMaskId: string,
  depth: number,
  callbacks: LayersPanelCallbacks,
): number {
  container.append(createLayerRow(layer, activeLayerId, depth, callbacks));
  let renderedCount = 1;
  renderedCount += appendLayerMaskRows(container, layer, activeMaskId, depth, callbacks);
  if (!isExpandableGroup(layer)) return renderedCount;
  const children = document.createElement('div');
  children.className = 'layer-children';
  children.dataset.parentLayerId = layer.id;
  const childCount = renderLayerTree(children, layer.children, activeLayerId, activeMaskId, depth + 1, callbacks);
  container.append(children);
  return childCount + renderedCount;
}

function appendLayerMaskRows(
  container: HTMLElement, layer: LayerNode, activeMaskId: string, depth: number, callbacks: LayersPanelCallbacks,
): number {
  if (!layer.masks?.length) return 0;
  const masks = document.createElement('div');
  masks.className = 'layer-mask-children';
  masks.dataset.parentLayerId = layer.id;
  for (const mask of layer.masks) masks.append(createLayerMaskRow(layer, mask, activeMaskId, depth, callbacks));
  container.append(masks);
  return layer.masks.length;
}

function isExpandableGroup(layer: LayerNode): boolean {
  return layer.type === 'group' && layer.children.length > 0;
}

function findLayerById(layers: LayerNode[], id: string): LayerNode | null {
  return layers.reduce<LayerNode | null>((found, layer) => {
    if (found) return found;
    if (layer.id === id) return layer;
    return findLayerById(layer.children, id);
  }, null);
}

function updateDeleteButton(root: HTMLElement, layers: LayerNode[], activeLayerId: string, callbacks: LayersPanelCallbacks): void {
  const button = root.querySelector<HTMLButtonElement>('#l-del');
  if (!button) return;
  const selected = findLayerById(layers, activeLayerId);
  const reason = selected ? callbacks.getDeleteBlockReason(selected) : 'Seleccioná una capa para eliminar.';
  button.disabled = Boolean(reason);
  button.title = reason ?? 'Eliminar capa';
  button.setAttribute('aria-label', reason ? `Eliminar capa. ${reason}` : 'Eliminar capa');
}

/** Owns the layer-tree DOM and delegates individual row creation to focused helpers. */
export function renderLayersPanel(
  root: HTMLElement,
  layers: LayerNode[],
  activeLayerId: string,
  activeMaskId: string,
  callbacks: LayersPanelCallbacks,
): void {
  const list = root.querySelector<HTMLElement>('#layers');
  if (!list) return;
  list.replaceChildren();
  const renderedCount = renderLayerTree(list, layers, activeLayerId, activeMaskId, 0, callbacks);
  const empty = root.querySelector<HTMLElement>('#layer-empty');
  if (empty) empty.hidden = renderedCount > 0;
  updateDeleteButton(root, layers, activeLayerId, callbacks);
}


export interface LayersPanelActions {
  createLayer(type: LayerType): void;
  createMask(type: LayerMask['type']): void;
  deleteActiveLayer(): void;
  duplicateActiveLayer(): void;
  moveActiveLayer(delta: number): void;
  changeFillColor(): void;
  configureFilter(): void;
  editVectorLayer(): void;
  editTextLayer(): void;
  setOpacity(opacity: number): void;
  setBlendMode(mode: BlendMode): void;
}

/** Wires the fixed layer-toolbar controls and delegates document mutations to the app. */
export function wireLayersPanel(root: HTMLElement, actions: LayersPanelActions): void {
  bindLayerCreationMenu(root, actions);
  bindLayerActionButtons(root, actions);
  bindLayerPropertyControls(root, actions);
  bindLayerMenuDismissal(root);
}

function bindLayerCreationMenu(root: HTMLElement, actions: LayersPanelActions): void {
  root.querySelector<HTMLButtonElement>('#l-add')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const menu = root.querySelector<HTMLElement>('#layer-create-menu');
    if (!menu) return;
    menu.hidden = !menu.hidden;
    button.setAttribute('aria-expanded', String(!menu.hidden));
  });
  root.querySelectorAll<HTMLButtonElement>('#layer-create-menu [data-layer-type]').forEach((button) => {
    button.addEventListener('click', () => createLayerFromMenu(root, button, actions));
  });
  root.querySelectorAll<HTMLButtonElement>('#layer-create-menu [data-mask-type]').forEach((button) => {
    button.addEventListener('click', () => createMaskFromMenu(root, button, actions));
  });
}

function createLayerFromMenu(root: HTMLElement, button: HTMLButtonElement, actions: LayersPanelActions): void {
  closeLayerCreationMenu(root);
  const type = button.dataset.layerType as LayerType | undefined;
  if (type) actions.createLayer(type);
}

function createMaskFromMenu(root: HTMLElement, button: HTMLButtonElement, actions: LayersPanelActions): void {
  closeLayerCreationMenu(root);
  const type = button.dataset.maskType as LayerMask['type'] | undefined;
  if (type) actions.createMask(type);
}

function closeLayerCreationMenu(root: HTMLElement): void {
  const menu = root.querySelector<HTMLElement>('#layer-create-menu');
  const add = root.querySelector<HTMLButtonElement>('#l-add');
  if (menu) menu.hidden = true;
  add?.setAttribute('aria-expanded', 'false');
}

function bindLayerActionButtons(root: HTMLElement, actions: LayersPanelActions): void {
  root.querySelector<HTMLButtonElement>('#l-del')?.addEventListener('click', () => actions.deleteActiveLayer());
  root.querySelector<HTMLButtonElement>('#l-duplicate')?.addEventListener('click', () => actions.duplicateActiveLayer());
  root.querySelector<HTMLButtonElement>('#l-up')?.addEventListener('click', () => actions.moveActiveLayer(+1));
  root.querySelector<HTMLButtonElement>('#l-down')?.addEventListener('click', () => actions.moveActiveLayer(-1));
  root.querySelector<HTMLButtonElement>('#l-fill-color')?.addEventListener('click', () => actions.changeFillColor());
  root.querySelector<HTMLButtonElement>('#l-filter-options')?.addEventListener('click', () => actions.configureFilter());
  root.querySelector<HTMLButtonElement>('#l-vector-add')?.addEventListener('click', () => actions.editVectorLayer());
  root.querySelector<HTMLButtonElement>('#l-text-edit')?.addEventListener('click', () => actions.editTextLayer());
}

function bindLayerPropertyControls(root: HTMLElement, actions: LayersPanelActions): void {
  root.querySelector<HTMLInputElement>('#layer-opacity')?.addEventListener('change', (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(value)) return;
    actions.setOpacity(Math.max(0, Math.min(100, value)) / 100);
  });
  root.querySelector<HTMLSelectElement>('#dock-blend')?.addEventListener('change', (event) => {
    actions.setBlendMode((event.currentTarget as HTMLSelectElement).value as BlendMode);
  });
}

function bindLayerMenuDismissal(root: HTMLElement): void {
  document.addEventListener('pointerdown', (event) => {
    const menu = root.querySelector<HTMLElement>('#layer-create-menu');
    const add = root.querySelector<HTMLElement>('#l-add');
    const target = event.target;
    if (!menu || !add || !(target instanceof Node)) return;
    if (menu.contains(target) || add.contains(target)) return;
    menu.hidden = true;
    add.setAttribute('aria-expanded', 'false');
  });
}
