/** Docking, floating and resizing behavior for PhotoMania's side panels. */
export type DockablePanelId = 'advanced' | 'history' | 'layers' | 'comic';

const STORAGE_KEY = 'nvts-photomania-dock-layout-v1';
const PANEL_DEFINITIONS: Array<{ id: DockablePanelId; selector: string; title: string; defaultHeight: number }> = [
  { id: 'advanced', selector: '.advanced-tool-panel', title: 'Opciones avanzadas de herramienta', defaultHeight: 210 },
  { id: 'history', selector: '.history-panel', title: 'Historial', defaultHeight: 175 },
  { id: 'layers', selector: '.layers-panel', title: 'Capas', defaultHeight: 310 },
  { id: 'comic', selector: '.comic-manager-panel', title: 'Gestor de cómics', defaultHeight: 340 },
];
const VALID_IDS = PANEL_DEFINITIONS.map((panel) => panel.id);

type PanelSavedState = {
  visible: boolean;
  floating: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  dockHeight: number;
};
type WorkspaceSavedState = {
  dockWidth: number;
  panelsHidden: boolean;
  order: DockablePanelId[];
  panels: Partial<Record<DockablePanelId, PanelSavedState>>;
};
type PersistedState = { version: 1; workspaces: Record<string, WorkspaceSavedState> };

type PanelItem = {
  id: DockablePanelId;
  title: string;
  defaultHeight: number;
  panel: HTMLElement;
  slot: HTMLElement;
  floating: boolean;
  floatingWindow: HTMLElement | null;
  dockToggle: HTMLButtonElement;
};

export interface DockLayoutController {
  saveCurrentWorkspace(): void;
  applyWorkspace(workspace: string): void;
  refreshVisibility(): void;
  save(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function minDockHeight(item: PanelItem): number {
  if (item.id === 'layers') return 220;
  if (item.id === 'comic') return 150;
  if (item.id === 'history') return 110;
  return 120;
}
function readPersistedState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, workspaces: {} };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.workspaces)) return { version: 1, workspaces: {} };
    return parsed as unknown as PersistedState;
  } catch { return { version: 1, workspaces: {} }; }
}

/**
 * Installs a desktop-editor-like layout: dock width resizing, panel-height resizing,
 * panel reordering, floating windows and per-workspace persistent layouts.
 */
export function createDockLayoutManager(root: HTMLElement, initialWorkspace: string): DockLayoutController {
  const workspaceElement = root.querySelector<HTMLElement>('.workspace');
  const dock = root.querySelector<HTMLElement>('.right-dock');
  if (!workspaceElement || !dock) {
    return { saveCurrentWorkspace() {}, applyWorkspace() {}, refreshVisibility() {}, save() {} };
  }

  let persisted = readPersistedState();
  let activeWorkspace = initialWorkspace;
  let order: DockablePanelId[] = [];
  let restoring = false;
  const items = new Map<DockablePanelId, PanelItem>();
  const resizeHandles = new Map<string, HTMLElement>();
  const floatingLayer = document.createElement('div');
  floatingLayer.className = 'floating-panels-layer';
  floatingLayer.setAttribute('aria-label', 'Paneles flotantes');
  workspaceElement.append(floatingLayer);

  const widthResizer = document.createElement('div');
  widthResizer.className = 'dock-width-resizer';
  widthResizer.setAttribute('role', 'separator');
  widthResizer.setAttribute('aria-orientation', 'vertical');
  widthResizer.setAttribute('aria-label', 'Cambiar el ancho de la zona de paneles');
  widthResizer.tabIndex = 0;
  workspaceElement.insertBefore(widthResizer, dock);

  // Turn each panel into a stable docking slot, so moving a panel to a floating window
  // does not lose its identity, controls or event handlers.
  const initialItems: Array<{ item: PanelItem; initialOrder: number }> = [];
  for (const definition of PANEL_DEFINITIONS) {
    const panel = root.querySelector<HTMLElement>(definition.selector);
    if (!panel) continue;
    const initialOrder = Number.parseInt(panel.style.order, 10);
    const slot = document.createElement('div');
    slot.className = 'dock-panel-slot';
    slot.dataset.panelSlot = definition.id;
    slot.style.height = `${definition.defaultHeight}px`;
    slot.style.order = Number.isFinite(initialOrder) ? String(initialOrder) : '0';
    dock.insertBefore(slot, panel);
    slot.append(panel);
    panel.style.order = '';
    panel.style.height = '100%';

    const header = panel.querySelector<HTMLElement>(':scope > header');
    let dockToggle: HTMLButtonElement;
    if (header) {
      dockToggle = document.createElement('button');
      dockToggle.className = 'panel-float-toggle';
      dockToggle.type = 'button';
      dockToggle.textContent = '↗';
      dockToggle.title = 'Separar panel en una ventana flotante';
      dockToggle.setAttribute('aria-label', `Separar panel: ${definition.title}`);
      dockToggle.setAttribute('aria-pressed', 'false');
      dockToggle.draggable = false;
      header.append(dockToggle);
      header.classList.add('dock-panel-drag-handle');
    } else {
      dockToggle = document.createElement('button');
      dockToggle.type = 'button';
    }
    const item: PanelItem = {
      id: definition.id,
      title: definition.title,
      defaultHeight: definition.defaultHeight,
      panel,
      slot,
      floating: false,
      floatingWindow: null,
      dockToggle,
    };
    items.set(item.id, item);
    initialItems.push({ item, initialOrder: Number.isFinite(initialOrder) ? initialOrder : initialItems.length });
    dockToggle.addEventListener('click', (event) => {
      event.preventDefault(); event.stopPropagation();
      if (item.floating) dockPanel(item.id); else floatPanel(item.id);
      saveCurrentWorkspace();
    });
    if (header) wireHeaderDrag(item, header);
  }
  order = initialItems.sort((a, b) => a.initialOrder - b.initialOrder).map(({ item }) => item.id);
  for (const item of items.values()) {
    const defaultState: PanelSavedState = {
      visible: !item.panel.hidden,
      floating: false,
      x: 120,
      y: 80,
      width: 360,
      height: Math.max(160, item.defaultHeight),
      dockHeight: item.defaultHeight,
    };
    item.slot.style.height = `${defaultState.dockHeight}px`;
  }

  function getItem(id: string | undefined): PanelItem | undefined {
    return id && VALID_IDS.includes(id as DockablePanelId) ? items.get(id as DockablePanelId) : undefined;
  }
  function getFloatingLayerRect(): DOMRect { return workspaceElement!.getBoundingClientRect(); }
  function makeResizeHandle(item: PanelItem): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'floating-panel-resize';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', `Redimensionar ${item.title}`);
    handle.addEventListener('pointerdown', (event) => {
      if (!item.floatingWindow || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation();
      const startX = event.clientX; const startY = event.clientY;
      const startWidth = item.floatingWindow.getBoundingClientRect().width;
      const startHeight = item.floatingWindow.getBoundingClientRect().height;
      const move = (moveEvent: PointerEvent) => {
        if (!item.floatingWindow) return;
        const workspaceRect = getFloatingLayerRect();
        const maxWidth = Math.min(900, workspaceRect.width - 16);
        const maxHeight = Math.min(900, workspaceRect.height - 16);
        item.floatingWindow.style.width = `${clamp(startWidth + moveEvent.clientX - startX, 260, maxWidth)}px`;
        item.floatingWindow.style.height = `${clamp(startHeight + moveEvent.clientY - startY, 130, maxHeight)}px`;
      };
      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        saveCurrentWorkspace();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up, { once: true });
    });
    return handle;
  }

  function floatPanel(id: DockablePanelId, geometry?: { x: number; y: number; width: number; height: number }): void {
    const item = items.get(id);
    if (!item || item.floating) return;
    const workspaceRect = getFloatingLayerRect();
    const currentRect = item.slot.getBoundingClientRect();
    const width = clamp(geometry?.width ?? Math.max(320, currentRect.width), 260, Math.min(900, workspaceRect.width - 16));
    const height = clamp(geometry?.height ?? Math.max(180, currentRect.height), 130, Math.min(900, workspaceRect.height - 16));
    const left = clamp(geometry?.x ?? (currentRect.left - workspaceRect.left), 0, Math.max(0, workspaceRect.width - width));
    const top = clamp(geometry?.y ?? (currentRect.top - workspaceRect.top), 0, Math.max(0, workspaceRect.height - 72));
    const floatingWindow = document.createElement('section');
    floatingWindow.className = 'floating-panel-window';
    floatingWindow.dataset.floatingPanel = id;
    floatingWindow.style.left = `${left}px`;
    floatingWindow.style.top = `${top}px`;
    floatingWindow.style.width = `${width}px`;
    floatingWindow.style.height = `${height}px`;
    floatingWindow.style.zIndex = String(40 + order.indexOf(id));
    floatingWindow.setAttribute('aria-label', `${item.title}, panel flotante`);
    item.floating = true;
    item.floatingWindow = floatingWindow;
    item.slot.hidden = true;
    floatingLayer.append(floatingWindow);
    floatingWindow.append(item.panel);
    const resize = makeResizeHandle(item);
    floatingWindow.append(resize);
    item.dockToggle.textContent = '↙';
    item.dockToggle.title = 'Acoplar panel a la zona lateral';
    item.dockToggle.setAttribute('aria-label', `Acoplar panel: ${item.title}`);
    item.dockToggle.setAttribute('aria-pressed', 'true');
    floatingWindow.hidden = item.panel.hidden;
    floatingWindow.addEventListener('pointerdown', () => bringToFront(item));
    rebuildDockChildren();
  }

  function dockPanel(id: DockablePanelId, targetY?: number): void {
    const item = items.get(id);
    if (!item || !item.floating) return;
    item.floatingWindow?.remove();
    item.floatingWindow = null;
    item.floating = false;
    item.slot.hidden = item.panel.hidden;
    item.slot.append(item.panel);
    item.panel.style.height = '100%';
    item.dockToggle.textContent = '↗';
    item.dockToggle.title = 'Separar panel en una ventana flotante';
    item.dockToggle.setAttribute('aria-label', `Separar panel: ${item.title}`);
    item.dockToggle.setAttribute('aria-pressed', 'false');
    if (Number.isFinite(targetY)) reorderAt(id, targetY!);
    rebuildDockChildren();
  }

  function bringToFront(item: PanelItem): void {
    const floats = [...floatingLayer.querySelectorAll<HTMLElement>('.floating-panel-window')];
    const max = floats.reduce((value, element) => Math.max(value, Number(element.style.zIndex) || 40), 40);
    if (item.floatingWindow) item.floatingWindow.style.zIndex = String(max + 1);
  }

  function reorderAt(id: DockablePanelId, clientY: number): void {
    const candidates = order.filter((candidate) => {
      const item = items.get(candidate);
      return !!item && !item.floating && candidate !== id && !item.panel.hidden;
    });
    let targetIndex = candidates.length;
    for (let index = 0; index < candidates.length; index++) {
      const item = items.get(candidates[index])!;
      const rect = item.slot.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) { targetIndex = index; break; }
    }
    const next = order.filter((candidate) => candidate !== id);
    // Retain hidden/floating panels near their current relative positions; visible panels are ordered by their dock position.
    const visibleDocked = next.filter((candidate) => {
      const item = items.get(candidate);
      return !!item && !item.floating && !item.panel.hidden;
    });
    const insertBefore = visibleDocked[targetIndex];
    if (insertBefore) {
      const index = next.indexOf(insertBefore);
      next.splice(index, 0, id);
    } else {
      const lastVisible = visibleDocked[visibleDocked.length - 1];
      const index = lastVisible ? next.indexOf(lastVisible) + 1 : next.length;
      next.splice(index, 0, id);
    }
    order = next;
    rebuildDockChildren();
  }

  function wireHeaderDrag(item: PanelItem, header: HTMLElement): void {
    let drag: { startX: number; startY: number; originX: number; originY: number; offsetX: number; offsetY: number; moved: boolean } | null = null;
    header.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      if (event.button !== 0 || target?.closest('button, input, select, textarea, a, [contenteditable="true"]')) return;
      if (item.panel.hidden) return;
      const floatingRect = item.floatingWindow?.getBoundingClientRect();
      const slotRect = item.slot.getBoundingClientRect();
      const rect = floatingRect ?? slotRect;
      const workspaceRect = getFloatingLayerRect();
      drag = {
        startX: event.clientX, startY: event.clientY,
        originX: item.floatingWindow ? Number.parseFloat(item.floatingWindow.style.left) || 0 : rect.left - workspaceRect.left,
        originY: item.floatingWindow ? Number.parseFloat(item.floatingWindow.style.top) || 0 : rect.top - workspaceRect.top,
        offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top,
        moved: false,
      };
      const move = (moveEvent: PointerEvent) => {
        if (!drag) return;
        const dx = moveEvent.clientX - drag.startX; const dy = moveEvent.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        drag.moved = true;
        moveEvent.preventDefault();
        const dockRect = dock!.getBoundingClientRect();
        const workspaceBounds = getFloatingLayerRect();
        if (!item.floating && moveEvent.clientX < dockRect.left - 24) {
          floatPanel(item.id, {
            x: clamp(moveEvent.clientX - workspaceBounds.left - drag.offsetX, 0, Math.max(0, workspaceBounds.width - 260)),
            y: clamp(moveEvent.clientY - workspaceBounds.top - drag.offsetY, 0, Math.max(0, workspaceBounds.height - 70)),
            width: Math.max(300, slotRect.width),
            height: Math.max(180, slotRect.height),
          });
        }
        if (item.floating && item.floatingWindow) {
          const rect = getFloatingLayerRect();
          item.floatingWindow.style.left = `${clamp(moveEvent.clientX - rect.left - drag.offsetX, 0, Math.max(0, rect.width - item.floatingWindow.offsetWidth))}px`;
          item.floatingWindow.style.top = `${clamp(moveEvent.clientY - rect.top - drag.offsetY, 0, Math.max(0, rect.height - 48))}px`;
        } else {
          reorderAt(item.id, moveEvent.clientY);
        }
      };
      const up = (upEvent: PointerEvent) => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (!drag) return;
        const didMove = drag.moved;
        drag = null;
        if (didMove) {
          const dockRect = dock!.getBoundingClientRect();
          if (item.floating && upEvent.clientX >= dockRect.left - 12 && upEvent.clientY >= dockRect.top && upEvent.clientY <= dockRect.bottom) {
            dockPanel(item.id, upEvent.clientY);
          }
          saveCurrentWorkspace();
        }
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  function getDockedVisibleItems(): PanelItem[] {
    return order.map((id) => items.get(id)).filter((item): item is PanelItem => !!item && !item.floating && !item.panel.hidden);
  }
  function getResizeHandle(beforeId: DockablePanelId, afterId: DockablePanelId): HTMLElement {
    const key = `${beforeId}:${afterId}`;
    let handle = resizeHandles.get(key);
    if (!handle) {
      handle = document.createElement('div');
      handle.className = 'dock-panel-resizer';
      handle.dataset.beforePanel = beforeId;
      handle.dataset.afterPanel = afterId;
      handle.setAttribute('role', 'separator');
      handle.setAttribute('aria-orientation', 'horizontal');
      handle.setAttribute('aria-label', `Cambiar el tamaño de ${items.get(beforeId)?.title ?? beforeId} y ${items.get(afterId)?.title ?? afterId}`);
      handle.tabIndex = 0;
      handle.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const before = getItem(handle!.dataset.beforePanel);
        const after = getItem(handle!.dataset.afterPanel);
        if (!before || !after) return;
        const startY = event.clientY;
        const startBefore = before.slot.getBoundingClientRect().height;
        const startAfter = after.slot.getBoundingClientRect().height;
        const move = (moveEvent: PointerEvent) => {
          const delta = moveEvent.clientY - startY;
          const adjusted = clamp(delta, minDockHeight(before) - startBefore, startAfter - minDockHeight(after));
          before.slot.style.height = `${startBefore + adjusted}px`;
          after.slot.style.height = `${startAfter - adjusted}px`;
        };
        const up = () => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          saveCurrentWorkspace();
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up, { once: true });
      });
      handle.addEventListener('keydown', (event) => {
        const before = getItem(handle!.dataset.beforePanel); const after = getItem(handle!.dataset.afterPanel);
        if (!before || !after || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 12 : -12;
        const a = before.slot.getBoundingClientRect().height; const b = after.slot.getBoundingClientRect().height;
        const adjusted = clamp(direction, minDockHeight(before) - a, b - minDockHeight(after));
        before.slot.style.height = `${a + adjusted}px`; after.slot.style.height = `${b - adjusted}px`;
        saveCurrentWorkspace();
      });
      resizeHandles.set(key, handle);
    }
    handle.dataset.beforePanel = beforeId; handle.dataset.afterPanel = afterId;
    return handle;
  }

  function rebuildDockChildren(): void {
    const sorted = order.map((id) => items.get(id)).filter((item): item is PanelItem => !!item && !item.floating);
    order.forEach((id, index) => { const item = items.get(id); if (item) item.slot.style.order = String(index); });
    const children: HTMLElement[] = [];
    let previousVisible: PanelItem | null = null;
    for (const item of sorted) {
      item.slot.hidden = item.panel.hidden;
      if (!item.panel.hidden) {
        if (previousVisible) children.push(getResizeHandle(previousVisible.id, item.id));
        previousVisible = item;
      }
      children.push(item.slot);
    }
    dock!.replaceChildren(...children);
    for (const item of items.values()) {
      if (item.floatingWindow) item.floatingWindow.hidden = item.panel.hidden;
    }
    syncDockChrome();
  }

  function syncDockChrome(): void {
    const dockedVisible = getDockedVisibleItems().length > 0;
    dock!.classList.toggle('panels-empty', !dockedVisible);
    widthResizer.hidden = !dockedVisible || workspaceElement!.classList.contains('panels-hidden');
  }

  function captureWorkspaceState(): WorkspaceSavedState {
    const dockRect = dock!.getBoundingClientRect();
    const panelState: Partial<Record<DockablePanelId, PanelSavedState>> = {};
    for (const item of items.values()) {
      const rect = item.floatingWindow?.getBoundingClientRect();
      const workspaceRect = getFloatingLayerRect();
      panelState[item.id] = {
        visible: !item.panel.hidden,
        floating: item.floating,
        x: item.floatingWindow ? Number.parseFloat(item.floatingWindow.style.left) || (rect ? rect.left - workspaceRect.left : 120) : 120,
        y: item.floatingWindow ? Number.parseFloat(item.floatingWindow.style.top) || (rect ? rect.top - workspaceRect.top : 80) : 80,
        width: item.floatingWindow ? rect?.width ?? 360 : 360,
        height: item.floatingWindow ? rect?.height ?? Math.max(item.defaultHeight, 180) : Math.max(130, item.slot.getBoundingClientRect().height || item.defaultHeight),
        dockHeight: Math.max(minDockHeight(item), Number.parseFloat(item.slot.style.height) || item.slot.getBoundingClientRect().height || item.defaultHeight),
      };
    }
    return {
      dockWidth: clamp(dockRect.width || Number.parseFloat(getComputedStyle(dock!).width) || 280, 220, Math.max(220, Math.min(600, window.innerWidth * 0.6))),
      panelsHidden: dock!.classList.contains('panels-hidden') || workspaceElement!.classList.contains('panels-hidden'),
      order: [...order],
      panels: panelState,
    };
  }

  function saveCurrentWorkspace(): void {
    if (restoring) return;
    persisted.workspaces[activeWorkspace] = captureWorkspaceState();
    persistToStorage();
  }
  function persistToStorage(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); }
    catch (error) { console.warn('No se pudo guardar la disposición de paneles:', error); }
  }

  function applyWorkspace(workspace: string): void {
    const stored = persisted.workspaces[workspace];
    const existing = !!stored;
    restoring = true;
    try {
      activeWorkspace = workspace;
      if (stored) {
        order = sanitizeOrder(stored.order);
        dock!.style.setProperty('--right-dock-width', `${clamp(Number(stored.dockWidth) || 280, 220, Math.max(220, Math.min(600, window.innerWidth * 0.6)))}px`);
        dock!.classList.toggle('panels-hidden', !!stored.panelsHidden);
        workspaceElement!.classList.toggle('panels-hidden', !!stored.panelsHidden);
        for (const item of items.values()) {
          const state = stored.panels[item.id];
          item.panel.hidden = state ? !state.visible : item.panel.hidden;
          const dockHeight = clamp(Number(state?.dockHeight) || item.defaultHeight, minDockHeight(item), 1800);
          item.slot.style.height = `${dockHeight}px`;
          if (state?.floating) {
            const geo = {
              x: clamp(Number(state.x) || 0, 0, Math.max(0, workspaceElement!.clientWidth - 260)),
              y: clamp(Number(state.y) || 0, 0, Math.max(0, workspaceElement!.clientHeight - 70)),
              width: clamp(Number(state.width) || 360, 260, Math.min(900, Math.max(260, workspaceElement!.clientWidth - 16))),
              height: clamp(Number(state.height) || item.defaultHeight, 130, Math.min(900, Math.max(130, workspaceElement!.clientHeight - 16))),
            };
            if (!item.floating) floatPanel(item.id, geo);
            else if (item.floatingWindow) {
              item.floatingWindow.style.left = `${geo.x}px`; item.floatingWindow.style.top = `${geo.y}px`;
              item.floatingWindow.style.width = `${geo.width}px`; item.floatingWindow.style.height = `${geo.height}px`;
            }
          } else if (item.floating) dockPanel(item.id);
          item.panel.hidden = state ? !state.visible : item.panel.hidden;
          item.slot.hidden = item.floating || item.panel.hidden;
          if (item.floatingWindow) item.floatingWindow.hidden = item.panel.hidden;
        }
        if (existing) {
          for (const item of items.values()) item.panel.style.order = '';
        }
      } else {
        // On a new workspace, reset panels to the docked preset layout rather than leaking
        // floating panels from the previous workspace. Capture the order App just assigned.
        const presetOrder = new Map<DockablePanelId, number>();
        for (const item of items.values()) {
          const cssOrder = Number.parseInt(item.floating ? item.panel.style.order : item.slot.style.order, 10);
          presetOrder.set(item.id, Number.isFinite(cssOrder) ? cssOrder : VALID_IDS.indexOf(item.id));
        }
        for (const item of items.values()) if (item.floating) dockPanel(item.id);
        order = [...items.values()]
          .sort((a, b) => (presetOrder.get(a.id) ?? VALID_IDS.indexOf(a.id)) - (presetOrder.get(b.id) ?? VALID_IDS.indexOf(b.id)))
          .map((item) => item.id);
        for (const item of items.values()) item.panel.style.order = '';
        order.forEach((id, index) => { const item = items.get(id); if (item) item.slot.style.order = String(index); });
        dock!.style.setProperty('--right-dock-width', '280px');
        dock!.classList.remove('panels-hidden'); workspaceElement!.classList.remove('panels-hidden');
      }
      rebuildDockChildren();
      persistToStorage();
    } finally { restoring = false; }
    saveCurrentWorkspace();
  }

  function sanitizeOrder(candidate: unknown): DockablePanelId[] {
    const valid = Array.isArray(candidate) ? candidate.filter((value): value is DockablePanelId => typeof value === 'string' && VALID_IDS.includes(value as DockablePanelId)) : [];
    return [...new Set([...valid, ...VALID_IDS])];
  }

  // Resizing the whole panel zone.
  widthResizer.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = dock!.getBoundingClientRect().width;
    const move = (moveEvent: PointerEvent) => {
      const maxWidth = Math.min(600, window.innerWidth * 0.6, workspaceElement!.getBoundingClientRect().width * 0.6);
      const width = clamp(startWidth + startX - moveEvent.clientX, 220, Math.max(220, maxWidth));
      dock!.style.setProperty('--right-dock-width', `${width}px`);
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      saveCurrentWorkspace();
      syncDockChrome();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  });
  widthResizer.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const width = dock!.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? 12 : -12);
    dock!.style.setProperty('--right-dock-width', `${clamp(width, 220, Math.min(600, window.innerWidth * 0.6))}px`);
    saveCurrentWorkspace();
  });

  function refreshVisibility(): void {
    rebuildDockChildren();
    saveCurrentWorkspace();
  }

  // Restore the active workspace's layout, or persist the initial preset as its first layout.
  const activeSaved = persisted.workspaces[activeWorkspace];
  if (activeSaved) applyWorkspace(activeWorkspace);
  else {
    rebuildDockChildren();
    saveCurrentWorkspace();
  }
  window.addEventListener('resize', () => {
    const rect = getFloatingLayerRect();
    for (const item of items.values()) {
      if (!item.floatingWindow) continue;
      const width = Math.min(item.floatingWindow.offsetWidth, Math.max(260, rect.width - 16));
      const left = clamp(Number.parseFloat(item.floatingWindow.style.left) || 0, 0, Math.max(0, rect.width - width));
      const top = clamp(Number.parseFloat(item.floatingWindow.style.top) || 0, 0, Math.max(0, rect.height - 70));
      item.floatingWindow.style.width = `${width}px`; item.floatingWindow.style.left = `${left}px`; item.floatingWindow.style.top = `${top}px`;
    }
    syncDockChrome();
    saveCurrentWorkspace();
  });

  return {
    saveCurrentWorkspace,
    applyWorkspace,
    refreshVisibility,
    save: saveCurrentWorkspace,
  };
}
