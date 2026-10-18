import type { BlendMode, LayerType } from '@nvts/shared';
import type { LayerNode } from '@nvts/document-model';

// Panel template. Event behavior lives in its panel renderer/controller.

export const LAYERS_PANEL_TEMPLATE = `
    <section class="dock-panel layers-panel"><header><strong>Capas</strong><div class="panel-spacer"></div><select id="dock-blend" aria-label="Modo de fusión"><option value="normal">Normal</option><option value="multiply">Multiplicar</option><option value="screen">Trama</option><option value="overlay">Superponer</option></select></header>
      <div class="layer-props"><label>Opacidad <input id="layer-opacity" type="number" min="0" max="100" value="100"/>%</label><button id="l-fill-color" type="button" hidden>Color de relleno…</button><button id="l-filter-options" type="button" hidden>Configurar filtro…</button><button id="l-vector-add" type="button" hidden>Editar vectores…</button><button id="l-text-edit" type="button" hidden>Editar texto…</button></div>
      <div id="layers"></div><div class="layer-empty" id="layer-empty"><span class="tool-icon tool-icon--layers" aria-hidden="true"></span><strong>Capas</strong><span>Seleccioná una capa o creá una nueva.</span></div>
      <div id="layer-create-menu" class="layer-create-menu" role="menu" aria-label="Crear capa" hidden>
        <button type="button" role="menuitem" data-layer-type="paint"><span class="tool-icon tool-icon--paint-layer" aria-hidden="true"></span><span>Capa de pintura</span></button>
        <button type="button" role="menuitem" data-layer-type="filter"><span class="tool-icon tool-icon--filter-layer" aria-hidden="true"></span><span>Capa de filtro</span></button>
        <button type="button" role="menuitem" data-layer-type="fill"><span class="tool-icon tool-icon--fill-layer" aria-hidden="true"></span><span>Capa de relleno…</span></button>
        <button type="button" role="menuitem" data-layer-type="file"><span class="tool-icon tool-icon--file-layer" aria-hidden="true"></span><span>Capa de archivo…</span></button>
        <button type="button" role="menuitem" data-layer-type="vector"><span class="tool-icon tool-icon--vector-layer" aria-hidden="true"></span><span>Capa vectorial</span></button>
        <button type="button" role="menuitem" data-layer-type="text"><span class="tool-icon tool-icon--text-layer" aria-hidden="true"></span><span>Capa de texto</span></button>
        <button type="button" role="menuitem" data-layer-type="group"><span class="tool-icon tool-icon--group-layer" aria-hidden="true"></span><span>Grupo</span></button>
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
  onContextMenu(layer: LayerNode, x: number, y: number): void;
  getDeleteBlockReason(layer: LayerNode): string | null;
}

/** Owns the layer-tree DOM: rows, nesting, thumbnails and layer-specific controls. */
export function renderLayersPanel(
  root: HTMLElement,
  layers: LayerNode[],
  activeLayerId: string,
  callbacks: LayersPanelCallbacks,
): void {
  const list = root.querySelector<HTMLElement>('#layers');
  if (!list) return;
  list.replaceChildren();
  let total = 0;

  const renderTree = (container: HTMLElement, nodes: LayerNode[], depth: number): void => {
    // The stack order is visually inverted so the topmost layer appears first.
    for (const layer of [...nodes].reverse()) {
      total++;
      const row = document.createElement('div');
      row.className = 'layer' + (layer.id === activeLayerId ? ' active' : '');
      row.dataset.layerId = layer.id;
      row.style.paddingLeft = `${5 + depth * 14}px`;
      row.title = `${callbacks.getTypeLabel(layer.type)} · ${layer.name}`;

      const visible = Object.assign(document.createElement('input'), { type: 'checkbox', checked: layer.visible });
      visible.title = 'Visibilidad';
      visible.setAttribute('aria-label', `Visibilidad de ${layer.name}`);
      visible.onclick = (event) => event.stopPropagation();
      visible.onchange = () => callbacks.onVisibilityChange(layer, visible.checked);

      const icon = document.createElement('span');
      const iconName = layer.type === 'group' && layer.children.length ? 'group-layer-open' : callbacks.getTypeIcon(layer.type);
      icon.className = `layer-type-icon tool-icon tool-icon--${iconName}`;
      icon.title = callbacks.getTypeLabel(layer.type);

      const thumbnail = document.createElement('canvas');
      thumbnail.className = 'layer-thumbnail'; thumbnail.width = 52; thumbnail.height = 36;
      thumbnail.setAttribute('aria-label', `Miniatura de ${layer.name}`);
      callbacks.drawThumbnail(thumbnail, layer);

      const name = document.createElement('span');
      name.className = 'layer-name'; name.textContent = layer.name;
      name.title = layer.type === 'file'
        ? `${layer.sourceName ?? layer.name} · ${layer.sourceLinkId ? 'vínculo externo configurado' : 'imagen incrustada sin vínculo externo'}`
        : 'Doble clic para renombrar o editar esta capa';
      name.ondblclick = (event) => { event.stopPropagation(); callbacks.onRenameOrEdit(layer); };

      const effects = document.createElement('button');
      effects.className = 'layer-effects-hit'; effects.type = 'button'; effects.textContent = 'fx';
      effects.title = 'Estilos de capa';
      effects.onclick = (event) => { event.stopPropagation(); callbacks.onOpenEffects(layer); };

      const lock = document.createElement('button');
      lock.type = 'button'; lock.className = 'layer-lock-toggle';
      const lockIcon = document.createElement('span');
      lockIcon.className = `tool-icon ${layer.locked ? 'tool-icon--lock' : 'tool-icon--unlock'}`;
      lockIcon.setAttribute('aria-hidden', 'true');
      lock.replaceChildren(lockIcon);
      lock.title = layer.locked ? 'Desbloquear capa' : 'Bloquear capa';
      lock.setAttribute('aria-label', lock.title);
      lock.onclick = (event) => { event.stopPropagation(); callbacks.onToggleLock(layer); };

      row.append(visible, icon, thumbnail, name, effects, lock);
      row.onclick = () => callbacks.onSelect(layer);
      row.oncontextmenu = (event) => {
        event.preventDefault();
        callbacks.onContextMenu(layer, event.clientX, event.clientY);
      };
      container.append(row);

      if (layer.type === 'group' && layer.children.length) {
        const children = document.createElement('div');
        children.className = 'layer-children';
        children.dataset.parentLayerId = layer.id;
        renderTree(children, layer.children, depth + 1);
        container.append(children);
      }
    }
  };

  renderTree(list, layers, 0);
  const empty = root.querySelector<HTMLElement>('#layer-empty');
  if (empty) empty.hidden = total > 0;

  // El botón refleja la regla del documento en cada render, incluyendo el bloqueo
  // heredado de un grupo y el caso en que borrar dejaría cero capas.
  const findLayer = (nodes: LayerNode[], id: string): LayerNode | null => {
    for (const node of nodes) {
      if (node.id === id) return node;
      const nested = findLayer(node.children, id);
      if (nested) return nested;
    }
    return null;
  };
  const deleteButton = root.querySelector<HTMLButtonElement>('#l-del');
  if (deleteButton) {
    const selected = findLayer(layers, activeLayerId);
    const reason = selected
      ? callbacks.getDeleteBlockReason(selected)
      : 'Seleccioná una capa para eliminar.';
    deleteButton.disabled = Boolean(reason);
    deleteButton.title = reason ?? 'Eliminar capa';
    deleteButton.setAttribute('aria-label', reason ? `Eliminar capa. ${reason}` : 'Eliminar capa');
  }
}


export interface LayersPanelActions {
  createLayer(type: LayerType): void;
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
  root.querySelector<HTMLButtonElement>('#l-add')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const menu = root.querySelector<HTMLElement>('#layer-create-menu');
    if (menu) {
      menu.hidden = !menu.hidden;
      button.setAttribute('aria-expanded', String(!menu.hidden));
    }
  });
  root.querySelectorAll<HTMLButtonElement>('#layer-create-menu [data-layer-type]').forEach((button) => {
    button.addEventListener('click', () => {
      const menu = root.querySelector<HTMLElement>('#layer-create-menu');
      const add = root.querySelector<HTMLButtonElement>('#l-add');
      if (menu) menu.hidden = true;
      add?.setAttribute('aria-expanded', 'false');
      actions.createLayer(button.dataset.layerType as LayerType);
    });
  });
  root.querySelector<HTMLButtonElement>('#l-del')?.addEventListener('click', () => actions.deleteActiveLayer());
  root.querySelector<HTMLButtonElement>('#l-duplicate')?.addEventListener('click', () => actions.duplicateActiveLayer());
  root.querySelector<HTMLButtonElement>('#l-up')?.addEventListener('click', () => actions.moveActiveLayer(+1));
  root.querySelector<HTMLButtonElement>('#l-down')?.addEventListener('click', () => actions.moveActiveLayer(-1));
  root.querySelector<HTMLButtonElement>('#l-fill-color')?.addEventListener('click', () => actions.changeFillColor());
  root.querySelector<HTMLButtonElement>('#l-filter-options')?.addEventListener('click', () => actions.configureFilter());
  root.querySelector<HTMLButtonElement>('#l-vector-add')?.addEventListener('click', () => actions.editVectorLayer());
  root.querySelector<HTMLButtonElement>('#l-text-edit')?.addEventListener('click', () => actions.editTextLayer());
  root.querySelector<HTMLInputElement>('#layer-opacity')?.addEventListener('change', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const value = Number(input.value);
    if (Number.isFinite(value)) actions.setOpacity(Math.max(0, Math.min(100, value)) / 100);
  });
  root.querySelector<HTMLSelectElement>('#dock-blend')?.addEventListener('change', (event) => {
    actions.setBlendMode((event.currentTarget as HTMLSelectElement).value as BlendMode);
  });
  document.addEventListener('pointerdown', (event) => {
    const menu = root.querySelector<HTMLElement>('#layer-create-menu');
    const add = root.querySelector<HTMLElement>('#l-add');
    const target = event.target;
    if (menu && add && target instanceof Node && !menu.contains(target) && !add.contains(target)) {
      menu.hidden = true;
      add.setAttribute('aria-expanded', 'false');
    }
  });
}
