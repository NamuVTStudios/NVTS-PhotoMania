import { getLayerMaskLabel, type BlendMode, type LayerMask, type LayerType } from '@nvts/shared';
import type { LayerNode } from '@nvts/document-model';

// Panel template. Event behavior lives in its panel renderer/controller.

export const LAYERS_PANEL_TEMPLATE = `
    <section class="dock-panel layers-panel"><header><strong>Capas</strong><div class="panel-spacer"></div><select id="dock-blend" aria-label="Modo de fusión"><option value="normal">Normal</option><option value="multiply">Multiplicar</option><option value="screen">Trama</option><option value="overlay">Superponer</option></select></header>
      <div class="layer-props"><label>Opacidad <input id="layer-opacity" type="number" min="0" max="100" value="100"/>%</label><button id="l-fill-color" type="button" hidden>Color de relleno…</button><button id="l-filter-options" type="button" hidden>Configurar filtro…</button><button id="l-vector-add" type="button" hidden>Editar vectores…</button><button id="l-text-edit" type="button" hidden>Editar texto…</button></div>
      <div id="layers"></div><div class="layer-empty" id="layer-empty"><span class="tool-icon tool-icon--layers" aria-hidden="true"></span><strong>Capas</strong><span>Seleccioná una capa o creá una nueva.</span></div>
      <div id="layer-create-menu" class="layer-create-menu" role="menu" aria-label="Crear capa" hidden>
        <button type="button" role="menuitem" data-layer-type="paint"><span class="tool-icon tool-icon--paint-layer" aria-hidden="true"></span><span>Capa de pintura</span><kbd>Ctrl+Shift+N</kbd></button>
        <button type="button" role="menuitem" data-layer-type="filter"><span class="tool-icon tool-icon--filter-layer" aria-hidden="true"></span><span>Capa de filtro</span><kbd>Ctrl+Alt+Shift+N</kbd></button>
        <button type="button" role="menuitem" data-layer-type="fill"><span class="tool-icon tool-icon--fill-layer" aria-hidden="true"></span><span>Capa de relleno…</span><kbd>Ctrl+Shift+F</kbd></button>
        <button type="button" role="menuitem" data-layer-type="file"><span class="tool-icon tool-icon--file-layer" aria-hidden="true"></span><span>Capa de archivo…</span><kbd>Ctrl+Alt+I</kbd></button>
        <button type="button" role="menuitem" data-layer-type="vector"><span class="tool-icon tool-icon--vector-layer" aria-hidden="true"></span><span>Capa vectorial</span><kbd>Ctrl+Alt+Shift+V</kbd></button>
        <button type="button" role="menuitem" data-layer-type="text"><span class="tool-icon tool-icon--text-layer" aria-hidden="true"></span><span>Capa de texto</span><kbd>Ctrl+Alt+Shift+T</kbd></button>
        <button type="button" role="menuitem" data-layer-type="group"><span class="tool-icon tool-icon--group-layer" aria-hidden="true"></span><span>Grupo vacío</span><kbd>Ctrl+Alt+Shift+G</kbd></button>
        <div class="layer-create-menu__separator" role="separator"></div>
        <div class="layer-create-menu__heading">Máscaras de capa</div>
        <button type="button" role="menuitem" data-mask-type="transform"><span class="tool-icon tool-icon--vector-select" aria-hidden="true"></span><span>Máscara de transformación</span></button>
        <button type="button" role="menuitem" data-mask-type="colorize"><span class="tool-icon tool-icon--fill-layer" aria-hidden="true"></span><span>Máscara de colorización</span></button>
        <button type="button" role="menuitem" data-mask-type="filter"><span class="tool-icon tool-icon--filter-layer" aria-hidden="true"></span><span>Máscara de filtro</span></button>
        <button type="button" role="menuitem" data-mask-type="styles"><span class="tool-icon tool-icon--style-mask" aria-hidden="true"></span><span>Máscara de estilos</span></button>
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
  onSelectMask(layer: LayerNode, mask: LayerMask): void;
  onToggleMask(layer: LayerNode, mask: LayerMask, enabled: boolean): void;
  onToggleLock(layer: LayerNode): void;
  onSelect(layer: LayerNode): void;
  onContextMenu(layer: LayerNode, x: number, y: number): void;
  getDeleteBlockReason(layer: LayerNode): string | null;
  onMoveLayer?(sourceLayerId: string, targetLayerId: string, position: 'before' | 'after' | 'inside'): void;
  onMoveMask?(sourceLayerId: string, maskId: string, targetLayerId: string, targetMaskId: string | null, position: 'before' | 'after' | 'inside'): void;
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
  button.title = 'Doble clic izquierdo para crear o editar la máscara de estilos';
  button.onclick = (event) => event.stopPropagation();
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
  row.dataset.layerType = layer.type;
  row.draggable = true;
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

function renderLayerTree(
  container: HTMLElement,
  nodes: LayerNode[],
  activeLayerId: string,
  activeMaskId: string,
  depth: number,
  callbacks: LayersPanelCallbacks,
): number {
  let renderedCount = 0;
  for (const layer of [...nodes].reverse()) {
    renderedCount += renderLayerEntry(container, layer, activeLayerId, activeMaskId, depth, callbacks);
  }
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
  const maskCount = appendLayerMasks(container, layer, activeMaskId, callbacks);
  if (!isExpandableGroup(layer)) return maskCount + 1;
  const children = document.createElement('div');
  children.className = 'layer-children';
  children.dataset.parentLayerId = layer.id;
  const childCount = renderLayerTree(children, layer.children, activeLayerId, activeMaskId, depth + 1, callbacks);
  container.append(children);
  return childCount + maskCount + 1;
}

function appendLayerMasks(
  container: HTMLElement,
  layer: LayerNode,
  activeMaskId: string,
  callbacks: LayersPanelCallbacks,
): number {
  const masks = layer.masks ?? [];
  if (masks.length === 0) return 0;
  const children = document.createElement('div');
  children.className = 'layer-mask-children';
  children.dataset.parentLayerId = layer.id;
  masks.forEach((mask) => children.append(createLayerMaskRow(layer, mask, activeMaskId, callbacks)));
  container.append(children);
  return masks.length;
}

function createLayerMaskRow(
  layer: LayerNode,
  mask: LayerMask,
  activeMaskId: string,
  callbacks: LayersPanelCallbacks,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = `layer-mask-row${mask.id === activeMaskId ? ' active' : ''}`;
  row.dataset.maskId = mask.id;
  row.draggable = true;
  row.dataset.parentLayerId = layer.id;
  row.title = `Máscara de ${getLayerMaskLabel(mask.type)} · ${layer.name}`;
  const select = document.createElement('div');
  select.className = 'layer-mask-row__select';
  select.setAttribute('role', 'button');
  select.tabIndex = 0;
  select.setAttribute('aria-label', `Editar máscara de ${getLayerMaskLabel(mask.type)} de ${layer.name}`);
  select.title = 'Doble clic izquierdo para abrir o editar esta máscara';
  const icon = document.createElement('span');
  icon.className = `tool-icon tool-icon--${getLayerMaskIcon(mask)}`;
  icon.setAttribute('aria-hidden', 'true');
  const name = document.createElement('span');
  name.className = 'layer-mask-row__name';
  name.textContent = `Máscara de ${getLayerMaskLabel(mask.type)}`;
  select.append(icon, name);
  select.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    callbacks.onSelectMask(layer, mask);
  });
  row.ondblclick = (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('input')) return;
    event.preventDefault();
    event.stopPropagation();
    callbacks.onSelectMask(layer, mask);
  };
  const enabled = Object.assign(document.createElement('input'), { type: 'checkbox', checked: mask.enabled });
  enabled.className = 'layer-mask-row__enabled';
  enabled.title = mask.enabled ? 'Desactivar máscara' : 'Activar máscara';
  enabled.setAttribute('aria-label', `${enabled.title}: máscara de ${getLayerMaskLabel(mask.type)}`);
  enabled.addEventListener('click', (event) => event.stopPropagation());
  enabled.addEventListener('change', () => callbacks.onToggleMask(layer, mask, enabled.checked));
  row.append(select, enabled);
  return row;
}

function getLayerMaskIcon(mask: LayerMask): string {
  if (mask.type === 'transform') return 'vector-select';
  if (mask.type === 'colorize') return 'fill-layer';
  if (mask.type === 'filter') return 'filter-layer';
  return 'style-mask';
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
  bindLayerTreeDragAndDrop(list, callbacks);
  const empty = root.querySelector<HTMLElement>('#layer-empty');
  if (empty) empty.hidden = renderedCount > 0;
  updateDeleteButton(root, layers, activeLayerId, callbacks);
  revealActiveLayer(list);
}

type LayerDragPayload =
  | { kind: 'layer'; layerId: string }
  | { kind: 'mask'; layerId: string; maskId: string };

function bindLayerTreeDragAndDrop(list: HTMLElement, callbacks: LayersPanelCallbacks): void {
  if (list.dataset.dragDropBound === 'true') return;
  list.dataset.dragDropBound = 'true';
  list.addEventListener('dragstart', (event) => startLayerTreeDrag(event, list));
  list.addEventListener('dragover', (event) => previewLayerTreeDrop(event, list));
  list.addEventListener('dragleave', (event) => clearLayerTreeDropTarget(event, list));
  list.addEventListener('drop', (event) => finishLayerTreeDrop(event, list, callbacks));
  list.addEventListener('dragend', () => clearLayerTreeDropClasses(list));
}

function startLayerTreeDrag(event: DragEvent, list: HTMLElement): void {
  const target = event.target;
  if (!(target instanceof Element) || target.closest('button,input,select,textarea')) return;
  const mask = target.closest<HTMLElement>('.layer-mask-row');
  const layer = target.closest<HTMLElement>('.layer');
  const payload: LayerDragPayload | null = mask?.dataset.maskId && mask.dataset.parentLayerId
    ? { kind: 'mask', layerId: mask.dataset.parentLayerId, maskId: mask.dataset.maskId }
    : layer?.dataset.layerId
      ? { kind: 'layer', layerId: layer.dataset.layerId }
      : null;
  if (!payload || !event.dataTransfer) return;
  clearLayerTreeDropClasses(list);
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-nvts-layer-entry', JSON.stringify(payload));
  event.dataTransfer.setData('text/plain', JSON.stringify(payload));
}

function previewLayerTreeDrop(event: DragEvent, list: HTMLElement): void {
  const target = findLayerDropTarget(event.target);
  if (!target || !event.dataTransfer) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearLayerTreeDropClasses(list);
  const position = getLayerDropPosition(event, target);
  target.classList.add(position === 'inside' ? 'drop-inside' : position === 'before' ? 'drop-before' : 'drop-after');
}

function clearLayerTreeDropTarget(event: DragEvent, list: HTMLElement): void {
  const related = event.relatedTarget;
  if (related instanceof Node && list.contains(related)) return;
  clearLayerTreeDropClasses(list);
}

function clearLayerTreeDropClasses(list: HTMLElement): void {
  list.querySelectorAll('.drop-before,.drop-after,.drop-inside').forEach((row) => {
    row.classList.remove('drop-before', 'drop-after', 'drop-inside');
  });
}

function finishLayerTreeDrop(event: DragEvent, list: HTMLElement, callbacks: LayersPanelCallbacks): void {
  const payload = readLayerDragPayload(event.dataTransfer);
  const target = findLayerDropTarget(event.target);
  if (!payload || !target) return clearLayerTreeDropClasses(list);
  event.preventDefault();
  const position = getLayerDropPosition(event, target);
  const targetLayerId = target.dataset.layerId ?? target.dataset.parentLayerId ?? '';
  if (!targetLayerId) return clearLayerTreeDropClasses(list);
  if (payload.kind === 'layer') {
    if (target.dataset.layerId && payload.layerId !== targetLayerId) callbacks.onMoveLayer?.(payload.layerId, targetLayerId, position);
  }
  if (payload.kind === 'mask') {
    const targetMaskId = target.dataset.maskId ?? null;
    callbacks.onMoveMask?.(payload.layerId, payload.maskId, targetLayerId, targetMaskId, targetMaskId ? position : 'inside');
  }
  clearLayerTreeDropClasses(list);
}

function readLayerDragPayload(transfer: DataTransfer | null): LayerDragPayload | null {
  if (!transfer) return null;
  const raw = transfer.getData('application/x-nvts-layer-entry') || transfer.getData('text/plain');
  try {
    const value = JSON.parse(raw) as Partial<LayerDragPayload>;
    if (value.kind === 'layer' && typeof value.layerId === 'string') return { kind: 'layer', layerId: value.layerId };
    if (value.kind === 'mask' && typeof value.layerId === 'string' && typeof value.maskId === 'string') {
      return { kind: 'mask', layerId: value.layerId, maskId: value.maskId };
    }
  } catch { return null; }
  return null;
}

function findLayerDropTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>('.layer-mask-row,.layer');
}

function getLayerDropPosition(event: DragEvent, target: HTMLElement): 'before' | 'after' | 'inside' {
  const bounds = target.getBoundingClientRect();
  const progress = (event.clientY - bounds.top) / Math.max(1, bounds.height);
  if (target.classList.contains('layer') && target.dataset.layerType === 'group' && progress > 0.3 && progress < 0.7) return 'inside';
  return progress < 0.5 ? 'before' : 'after';
}

function revealActiveLayer(list: HTMLElement): void {
  const activeLayer = list.querySelector<HTMLElement>('.layer.active');
  activeLayer?.scrollIntoView({ block: 'nearest' });
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
