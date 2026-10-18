/** Docking, floating and resizing behavior for PhotoMania's side panels. */
import type { WorkspacePanelId } from '../workspaces/types';
export type DockablePanelId = WorkspacePanelId;

const STORAGE_KEY = 'nvts-photomania-dock-layout-v1';
const PANEL_DEFINITIONS: Array<{ id: DockablePanelId; selector: string; title: string; defaultHeight: number }> = [
  { id: 'advanced', selector: '.advanced-tool-panel', title: 'Opciones avanzadas de herramienta', defaultHeight: 210 },
  { id: 'history', selector: '.history-panel', title: 'Historial', defaultHeight: 175 },
  { id: 'layers', selector: '.layers-panel', title: 'Capas', defaultHeight: 310 },
  { id: 'comic', selector: '.comic-manager-panel', title: 'Gestor de cómics', defaultHeight: 340 },
  { id: 'storyboard', selector: '.storyboard-panel', title: 'Guion gráfico', defaultHeight: 340 },
  { id: 'timeline', selector: '.animation-timeline-panel', title: 'Línea de tiempo de animación', defaultHeight: 300 },
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
type FloatingGeometry = { x: number; y: number; width: number; height: number };
type HeaderDragState = {
  startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean;
};

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
  if (item.id === 'storyboard' || item.id === 'timeline') return 180;
  return 120;
}
function emptyPersistedState(): PersistedState {
  return { version: 1, workspaces: {} };
}

function readPersistedState(): PersistedState {
  let raw: string | null;
  try { raw = localStorage.getItem(STORAGE_KEY); }
  catch { return emptyPersistedState(); }
  return parsePersistedState(raw);
}

function parsePersistedState(raw: string | null): PersistedState {
  if (!raw) return emptyPersistedState();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return emptyPersistedState(); }
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.workspaces)) return emptyPersistedState();
  return parsed as unknown as PersistedState;
}

/** Creates a dock controller only when the application shell has the required layout elements. */
export function createDockLayoutManager(root: HTMLElement, initialWorkspace: string): DockLayoutController {
  const workspaceElement = root.querySelector<HTMLElement>('.workspace');
  const dock = root.querySelector<HTMLElement>('.right-dock');
  if (!workspaceElement || !dock) return createEmptyDockController();
  return new DockLayoutManagerImpl(root, workspaceElement, dock, initialWorkspace);
}

function createEmptyDockController(): DockLayoutController {
  return { saveCurrentWorkspace() {}, applyWorkspace() {}, refreshVisibility() {}, save() {} };
}

/** Owns dock state; individual interactions are separated into small methods. */
class DockLayoutManagerImpl implements DockLayoutController {
  private persisted = readPersistedState();
  private activeWorkspace: string;
  private order: DockablePanelId[] = [];
  private restoring = false;
  private readonly items = new Map<DockablePanelId, PanelItem>();
  private readonly resizeHandles = new Map<string, HTMLElement>();
  private readonly floatingLayer = document.createElement('div');
  private readonly widthResizer = document.createElement('div');

  constructor(
    private readonly root: HTMLElement,
    private readonly workspaceElement: HTMLElement,
    private readonly dock: HTMLElement,
    initialWorkspace: string,
  ) {
    this.activeWorkspace = initialWorkspace;
    this.configureFloatingLayer();
    this.configureWidthResizer();
    this.initializePanelSlots();
    this.initializePanelHeights();
    this.bindWidthResizer();
    this.restoreInitialWorkspace();
    window.addEventListener('resize', () => this.handleWindowResize());
  }

  save(): void {
    this.saveCurrentWorkspace();
  }

  private configureFloatingLayer(): void {
    this.floatingLayer.className = 'floating-panels-layer';
    this.floatingLayer.setAttribute('aria-label', 'Paneles flotantes');
    this.workspaceElement.append(this.floatingLayer);
  }

  private configureWidthResizer(): void {
    this.widthResizer.className = 'dock-width-resizer';
    this.widthResizer.setAttribute('role', 'separator');
    this.widthResizer.setAttribute('aria-orientation', 'vertical');
    this.widthResizer.setAttribute('aria-label', 'Cambiar el ancho de la zona de paneles');
    this.widthResizer.tabIndex = 0;
    this.workspaceElement.insertBefore(this.widthResizer, this.dock);
  }

  private initializePanelSlots(): void {
    const initialItems: Array<{ item: PanelItem; initialOrder: number }> = [];
    for (const definition of PANEL_DEFINITIONS) this.initializePanelSlot(definition, initialItems);
    this.order = initialItems.sort((a, b) => a.initialOrder - b.initialOrder).map(({ item }) => item.id);
  }

  private initializePanelSlot(
    definition: (typeof PANEL_DEFINITIONS)[number],
    initialItems: Array<{ item: PanelItem; initialOrder: number }>,
  ): void {
    const panel = this.root.querySelector<HTMLElement>(definition.selector);
    if (!panel) return;
    const initialOrder = Number.parseInt(panel.style.order, 10);
    const slot = this.createPanelSlot(panel, definition, initialOrder);
    const header = panel.querySelector<HTMLElement>(':scope > header');
    const dockToggle = this.createDockToggle(definition, header);
    const item = this.createPanelItem(definition, panel, slot, dockToggle);
    this.items.set(item.id, item);
    initialItems.push({ item, initialOrder: Number.isFinite(initialOrder) ? initialOrder : initialItems.length });
    this.bindDockToggle(item);
    this.wireOptionalHeaderDrag(item, header);
  }

  private wireOptionalHeaderDrag(item: PanelItem, header: HTMLElement | null): void {
    if (!header) return;
    this.wireHeaderDrag(item, header);
  }

  private createPanelSlot(panel: HTMLElement, definition: (typeof PANEL_DEFINITIONS)[number], initialOrder: number): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'dock-panel-slot';
    slot.dataset.panelSlot = definition.id;
    slot.style.height = `${definition.defaultHeight}px`;
    slot.style.order = Number.isFinite(initialOrder) ? String(initialOrder) : '0';
    this.dock.insertBefore(slot, panel);
    slot.append(panel);
    panel.style.order = '';
    panel.style.height = '100%';
    return slot;
  }

  private createDockToggle(
    definition: (typeof PANEL_DEFINITIONS)[number],
    header: HTMLElement | null,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    if (!header) return button;
    button.className = 'panel-float-toggle';
    button.textContent = '↗';
    button.title = 'Separar panel en una ventana flotante';
    button.setAttribute('aria-label', `Separar panel: ${definition.title}`);
    button.setAttribute('aria-pressed', 'false');
    button.draggable = false;
    header.append(button);
    header.classList.add('dock-panel-drag-handle');
    return button;
  }

  private createPanelItem(
    definition: (typeof PANEL_DEFINITIONS)[number],
    panel: HTMLElement,
    slot: HTMLElement,
    dockToggle: HTMLButtonElement,
  ): PanelItem {
    return {
      id: definition.id,
      title: definition.title,
      defaultHeight: definition.defaultHeight,
      panel,
      slot,
      floating: false,
      floatingWindow: null,
      dockToggle,
    };
  }

  private bindDockToggle(item: PanelItem): void {
    item.dockToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (item.floating) this.dockPanel(item.id);
      else this.floatPanel(item.id);
      this.saveCurrentWorkspace();
    });
  }

  private initializePanelHeights(): void {
    for (const item of this.items.values()) item.slot.style.height = `${item.defaultHeight}px`;
  }

  private getItem(id: string | undefined): PanelItem | undefined {
    return id && VALID_IDS.includes(id as DockablePanelId) ? this.items.get(id as DockablePanelId) : undefined;
  }

  private getFloatingLayerRect(): DOMRect {
    return this.floatingLayer.getBoundingClientRect();
  }

  private makeResizeHandle(item: PanelItem): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'floating-panel-resize';
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', `Redimensionar ${item.title}`);
    handle.addEventListener('pointerdown', (event) => this.startFloatingResize(item, event));
    return handle;
  }

  private startFloatingResize(item: PanelItem, event: PointerEvent): void {
    if (!item.floatingWindow || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = item.floatingWindow.getBoundingClientRect().width;
    const startHeight = item.floatingWindow.getBoundingClientRect().height;
    const move = (moveEvent: PointerEvent) => this.resizeFloatingPanel(item, startX, startY, startWidth, startHeight, moveEvent);
    const up = () => this.finishFloatingResize(move, up);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  }

  private resizeFloatingPanel(item: PanelItem, startX: number, startY: number, startWidth: number, startHeight: number, event: PointerEvent): void {
    const panel = item.floatingWindow;
    if (!panel) return;
    const workspace = this.getFloatingLayerRect();
    const maxWidth = Math.min(900, workspace.width - 16);
    const maxHeight = Math.min(900, workspace.height - 16);
    panel.style.width = `${clamp(startWidth + event.clientX - startX, 260, maxWidth)}px`;
    panel.style.height = `${clamp(startHeight + event.clientY - startY, 130, maxHeight)}px`;
  }

  private finishFloatingResize(move: (event: PointerEvent) => void, up: () => void): void {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    this.saveCurrentWorkspace();
  }

  private floatPanel(id: DockablePanelId, geometry?: FloatingGeometry): void {
    const item = this.items.get(id);
    if (!item || item.floating) return;
    const bounds = this.getFloatingGeometry(item, geometry);
    const floatingWindow = this.createFloatingWindow(item, bounds);
    this.attachFloatingPanel(item, floatingWindow);
  }

  private getFloatingGeometry(item: PanelItem, geometry?: FloatingGeometry): FloatingGeometry {
    const workspaceRect = this.getFloatingLayerRect();
    const currentRect = item.slot.getBoundingClientRect();
    const width = clamp(geometry?.width ?? Math.max(320, currentRect.width), 260, Math.min(900, workspaceRect.width - 16));
    const height = clamp(geometry?.height ?? Math.max(180, currentRect.height), 130, Math.min(900, workspaceRect.height - 16));
    const x = clamp(geometry?.x ?? currentRect.left - workspaceRect.left, 0, Math.max(0, workspaceRect.width - width));
    const y = clamp(geometry?.y ?? currentRect.top - workspaceRect.top, 0, Math.max(0, workspaceRect.height - 72));
    return { x, y, width, height };
  }

  private createFloatingWindow(item: PanelItem, geometry: FloatingGeometry): HTMLElement {
    const panel = document.createElement('section');
    panel.className = 'floating-panel-window';
    panel.dataset.floatingPanel = item.id;
    panel.style.left = `${geometry.x}px`;
    panel.style.top = `${geometry.y}px`;
    panel.style.width = `${geometry.width}px`;
    panel.style.height = `${geometry.height}px`;
    panel.style.zIndex = String(40 + this.order.indexOf(item.id));
    panel.setAttribute('aria-label', `${item.title}, panel flotante`);
    panel.addEventListener('pointerdown', () => this.bringToFront(item));
    return panel;
  }

  private attachFloatingPanel(item: PanelItem, floatingWindow: HTMLElement): void {
    item.floating = true;
    item.floatingWindow = floatingWindow;
    item.slot.hidden = true;
    this.floatingLayer.append(floatingWindow);
    floatingWindow.append(item.panel, this.makeResizeHandle(item));
    this.updateDockToggle(item, true);
    floatingWindow.hidden = item.panel.hidden;
    this.rebuildDockChildren();
  }

  private updateDockToggle(item: PanelItem, floating: boolean): void {
    item.dockToggle.textContent = floating ? '↙' : '↗';
    item.dockToggle.title = floating ? 'Acoplar panel a la zona lateral' : 'Separar panel en una ventana flotante';
    item.dockToggle.setAttribute('aria-label', `${floating ? 'Acoplar' : 'Separar'} panel: ${item.title}`);
    item.dockToggle.setAttribute('aria-pressed', String(floating));
  }

  private dockPanel(id: DockablePanelId, targetY?: number): void {
    const item = this.items.get(id);
    if (!item || !item.floating) return;
    item.floatingWindow?.remove();
    item.floatingWindow = null;
    item.floating = false;
    item.slot.hidden = item.panel.hidden;
    item.slot.append(item.panel);
    item.panel.style.height = '100%';
    this.updateDockToggle(item, false);
    if (Number.isFinite(targetY)) this.reorderAt(id, targetY!);
    this.rebuildDockChildren();
  }

  private bringToFront(item: PanelItem): void {
    const floats = [...this.floatingLayer.querySelectorAll<HTMLElement>('.floating-panel-window')];
    const max = floats.reduce((value, element) => Math.max(value, Number(element.style.zIndex) || 40), 40);
    if (item.floatingWindow) item.floatingWindow.style.zIndex = String(max + 1);
  }

  private reorderAt(id: DockablePanelId, clientY: number): void {
    const candidates = this.order.filter((candidate) => {
      const item = this.items.get(candidate);
      return !!item && !item.floating && candidate !== id && !item.panel.hidden;
    });
    const targetIndex = this.findReorderTargetIndex(candidates, clientY);
    const next = this.order.filter((candidate) => candidate !== id);
    this.insertPanelAtVisibleIndex(next, id, targetIndex);
    this.order = next;
    this.rebuildDockChildren();
  }

  private findReorderTargetIndex(candidates: DockablePanelId[], clientY: number): number {
    const index = candidates.findIndex((candidate) => this.isAboveReorderPointer(candidate, clientY));
    return index < 0 ? candidates.length : index;
  }

  private isAboveReorderPointer(candidate: DockablePanelId, clientY: number): boolean {
    const item = this.items.get(candidate);
    if (!item) return false;
    const rect = item.slot.getBoundingClientRect();
    return clientY < rect.top + rect.height / 2;
  }

  private insertPanelAtVisibleIndex(next: DockablePanelId[], id: DockablePanelId, targetIndex: number): void {
    // Retain hidden/floating panels near their current relative positions.
    const visibleDocked = next.filter((candidate) => {
      const item = this.items.get(candidate);
      return !!item && !item.floating && !item.panel.hidden;
    });
    const insertBefore = visibleDocked[targetIndex];
    if (insertBefore) {
      next.splice(next.indexOf(insertBefore), 0, id);
      return;
    }
    const lastVisible = visibleDocked[visibleDocked.length - 1];
    const index = lastVisible ? next.indexOf(lastVisible) + 1 : next.length;
    next.splice(index, 0, id);
  }

  private wireHeaderDrag(item: PanelItem, header: HTMLElement): void {
    let drag: HeaderDragState | null = null;
    header.addEventListener('pointerdown', (event) => {
      drag = this.createHeaderDragState(item, event);
      if (!drag) return;
      const move = (moveEvent: PointerEvent) => {
        if (drag) this.moveHeaderDrag(item, drag, moveEvent);
      };
      const up = (upEvent: PointerEvent) => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (!drag) return;
        this.finishHeaderDrag(item, drag, upEvent);
        drag = null;
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  private createHeaderDragState(item: PanelItem, event: PointerEvent): HeaderDragState | null {
    const target = event.target as HTMLElement | null;
    if (event.button !== 0 || target?.closest('button, input, select, textarea, a, [contenteditable="true"]')) return null;
    if (item.panel.hidden) return null;
    const floatingRect = item.floatingWindow?.getBoundingClientRect();
    const slotRect = item.slot.getBoundingClientRect();
    const rect = floatingRect ?? slotRect;
    return {
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
  }

  private moveHeaderDrag(item: PanelItem, drag: HeaderDragState, event: PointerEvent): void {
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    event.preventDefault();
    if (!item.floating && this.shouldFloatAtPointer(event.clientX)) this.floatDraggedPanel(item, drag, event);
    if (item.floating && item.floatingWindow) this.moveFloatingWindow(item, drag, event);
    else this.reorderAt(item.id, event.clientY);
  }

  private shouldFloatAtPointer(clientX: number): boolean {
    return clientX < this.dock.getBoundingClientRect().left - 24;
  }

  private floatDraggedPanel(item: PanelItem, drag: HeaderDragState, event: PointerEvent): void {
    const bounds = this.getFloatingLayerRect();
    const slotRect = item.slot.getBoundingClientRect();
    this.floatPanel(item.id, {
      x: clamp(event.clientX - bounds.left - drag.offsetX, 0, Math.max(0, bounds.width - 260)),
      y: clamp(event.clientY - bounds.top - drag.offsetY, 0, Math.max(0, bounds.height - 70)),
      width: Math.max(300, slotRect.width),
      height: Math.max(180, slotRect.height),
    });
  }

  private moveFloatingWindow(item: PanelItem, drag: HeaderDragState, event: PointerEvent): void {
    const panel = item.floatingWindow;
    if (!panel) return;
    const bounds = this.getFloatingLayerRect();
    panel.style.left = `${clamp(event.clientX - bounds.left - drag.offsetX, 0, Math.max(0, bounds.width - panel.offsetWidth))}px`;
    panel.style.top = `${clamp(event.clientY - bounds.top - drag.offsetY, 0, Math.max(0, bounds.height - 48))}px`;
  }

  private finishHeaderDrag(item: PanelItem, drag: HeaderDragState, event: PointerEvent): void {
    if (!drag.moved) return;
    const dockRect = this.dock.getBoundingClientRect();
    const droppedOverDock = event.clientX >= dockRect.left - 12
      && event.clientY >= dockRect.top && event.clientY <= dockRect.bottom;
    if (item.floating && droppedOverDock) this.dockPanel(item.id, event.clientY);
    this.saveCurrentWorkspace();
  }

  private getDockedVisibleItems(): PanelItem[] {
    return this.order.map((id) => this.items.get(id)).filter((item): item is PanelItem => !!item && !item.floating && !item.panel.hidden);
  }

  private getResizeHandle(beforeId: DockablePanelId, afterId: DockablePanelId): HTMLElement {
    const key = `${beforeId}:${afterId}`;
    let handle = this.resizeHandles.get(key);
    if (handle) {
      handle.dataset.beforePanel = beforeId;
      handle.dataset.afterPanel = afterId;
      return handle;
    }
    handle = this.createDockResizeHandle(beforeId, afterId);
    this.resizeHandles.set(key, handle);
    return handle;
  }

  private createDockResizeHandle(beforeId: DockablePanelId, afterId: DockablePanelId): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'dock-panel-resizer';
    handle.dataset.beforePanel = beforeId;
    handle.dataset.afterPanel = afterId;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-label', `Cambiar el tamaño de ${this.items.get(beforeId)?.title ?? beforeId} y ${this.items.get(afterId)?.title ?? afterId}`);
    handle.tabIndex = 0;
    handle.addEventListener('pointerdown', (event) => this.startDockResize(handle, event));
    handle.addEventListener('keydown', (event) => this.resizeDockFromKeyboard(handle, event));
    return handle;
  }

  private startDockResize(handle: HTMLElement, event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const before = this.getItem(handle.dataset.beforePanel);
    const after = this.getItem(handle.dataset.afterPanel);
    if (!before || !after) return;
    const startY = event.clientY;
    const startBefore = before.slot.getBoundingClientRect().height;
    const startAfter = after.slot.getBoundingClientRect().height;
    const move = (moveEvent: PointerEvent) => this.resizeDockPair(before, after, startY, startBefore, startAfter, moveEvent.clientY);
    const up = () => this.finishDockResize(move, up);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  }

  private resizeDockPair(before: PanelItem, after: PanelItem, startY: number, startBefore: number, startAfter: number, currentY: number): void {
    const delta = currentY - startY;
    const adjusted = clamp(delta, minDockHeight(before) - startBefore, startAfter - minDockHeight(after));
    before.slot.style.height = `${startBefore + adjusted}px`;
    after.slot.style.height = `${startAfter - adjusted}px`;
  }

  private finishDockResize(move: (event: PointerEvent) => void, up: () => void): void {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    this.saveCurrentWorkspace();
  }

  private resizeDockFromKeyboard(handle: HTMLElement, event: KeyboardEvent): void {
    const before = this.getItem(handle.dataset.beforePanel);
    const after = this.getItem(handle.dataset.afterPanel);
    if (!before || !after || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === 'ArrowDown' ? 12 : -12;
    const beforeHeight = before.slot.getBoundingClientRect().height;
    const afterHeight = after.slot.getBoundingClientRect().height;
    this.resizeDockPair(before, after, 0, beforeHeight, afterHeight, delta);
    this.saveCurrentWorkspace();
  }

  private rebuildDockChildren(): void {
    const sorted = this.order.map((id) => this.items.get(id)).filter((item): item is PanelItem => !!item && !item.floating);
    this.order.forEach((id, index) => {
      const item = this.items.get(id);
      if (item) item.slot.style.order = String(index);
    });
    this.dock.replaceChildren(...this.createDockChildren(sorted));
    this.syncFloatingPanelVisibility();
    this.syncDockChrome();
  }

  private createDockChildren(sorted: PanelItem[]): HTMLElement[] {
    const children: HTMLElement[] = [];
    let previousVisible: PanelItem | null = null;
    for (const item of sorted) {
      item.slot.hidden = item.panel.hidden;
      previousVisible = this.appendResizeHandleBefore(item, previousVisible, children);
      children.push(item.slot);
    }
    return children;
  }

  private appendResizeHandleBefore(item: PanelItem, previousVisible: PanelItem | null, children: HTMLElement[]): PanelItem | null {
    if (item.panel.hidden) return previousVisible;
    if (previousVisible) children.push(this.getResizeHandle(previousVisible.id, item.id));
    return item;
  }

  private syncFloatingPanelVisibility(): void {
    for (const item of this.items.values()) this.syncFloatingItemVisibility(item);
  }

  private syncFloatingItemVisibility(item: PanelItem): void {
    if (!item.floatingWindow) return;
    item.floatingWindow.hidden = item.panel.hidden;
  }

  private syncDockChrome(): void {
    const hasDockedVisible = this.getDockedVisibleItems().length > 0;
    this.dock.classList.toggle('panels-empty', !hasDockedVisible);
    this.widthResizer.hidden = !hasDockedVisible || this.workspaceElement.classList.contains('panels-hidden');
  }

  private captureWorkspaceState(): WorkspaceSavedState {
    return {
      dockWidth: this.captureDockWidth(),
      panelsHidden: this.arePanelsHidden(),
      order: [...this.order],
      panels: this.capturePanelStates(),
    };
  }

  private captureDockWidth(): number {
    const dockRect = this.dock.getBoundingClientRect();
    const computedWidth = Number.parseFloat(getComputedStyle(this.dock).width) || 280;
    return clamp(dockRect.width || computedWidth, 220, Math.max(220, Math.min(600, window.innerWidth * 0.6)));
  }

  private arePanelsHidden(): boolean {
    return this.dock.classList.contains('panels-hidden') || this.workspaceElement.classList.contains('panels-hidden');
  }

  private capturePanelStates(): Partial<Record<DockablePanelId, PanelSavedState>> {
    const states: Partial<Record<DockablePanelId, PanelSavedState>> = {};
    for (const item of this.items.values()) states[item.id] = this.capturePanelState(item);
    return states;
  }

  private capturePanelState(item: PanelItem): PanelSavedState {
    const rect = item.floatingWindow?.getBoundingClientRect();
    const workspaceRect = this.getFloatingLayerRect();
    return {
      visible: !item.panel.hidden,
      floating: item.floating,
      x: item.floatingWindow ? Number.parseFloat(item.floatingWindow.style.left) || (rect ? rect.left - workspaceRect.left : 120) : 120,
      y: item.floatingWindow ? Number.parseFloat(item.floatingWindow.style.top) || (rect ? rect.top - workspaceRect.top : 80) : 80,
      width: item.floatingWindow ? rect?.width ?? 360 : 360,
      height: item.floatingWindow ? rect?.height ?? Math.max(item.defaultHeight, 180) : Math.max(130, item.slot.getBoundingClientRect().height || item.defaultHeight),
      dockHeight: Math.max(minDockHeight(item), Number.parseFloat(item.slot.style.height) || item.slot.getBoundingClientRect().height || item.defaultHeight),
    };
  }

  saveCurrentWorkspace(): void {
    if (this.restoring) return;
    this.persisted.workspaces[this.activeWorkspace] = this.captureWorkspaceState();
    this.persistToStorage();
  }

  private persistToStorage(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.persisted)); }
    catch (error) { console.warn('No se pudo guardar la disposición de paneles:', error); }
  }

  applyWorkspace(workspace: string): void {
    this.restoring = true;
    try { this.applyWorkspaceState(workspace); }
    finally { this.restoring = false; }
    this.saveCurrentWorkspace();
  }

  private applyWorkspaceState(workspace: string): void {
    this.activeWorkspace = workspace;
    const saved = this.persisted.workspaces[workspace];
    if (saved) this.restoreSavedWorkspace(saved);
    else this.resetWorkspaceToPreset();
    this.rebuildDockChildren();
    this.persistToStorage();
  }

  private restoreSavedWorkspace(saved: WorkspaceSavedState): void {
    this.order = this.sanitizeOrder(saved.order);
    const width = clamp(Number(saved.dockWidth) || 280, 220, Math.max(220, Math.min(600, window.innerWidth * 0.6)));
    this.dock.style.setProperty('--right-dock-width', `${width}px`);
    this.dock.classList.toggle('panels-hidden', !!saved.panelsHidden);
    this.workspaceElement.classList.toggle('panels-hidden', !!saved.panelsHidden);
    for (const item of this.items.values()) this.restorePanelState(item, saved.panels[item.id]);
    for (const item of this.items.values()) item.panel.style.order = '';
  }

  private restorePanelState(item: PanelItem, saved?: PanelSavedState): void {
    item.panel.hidden = saved ? !saved.visible : item.panel.hidden;
    item.slot.style.height = `${clamp(Number(saved?.dockHeight) || item.defaultHeight, minDockHeight(item), 1800)}px`;
    if (saved?.floating) this.restoreFloatingPanel(item, saved);
    else if (item.floating) this.dockPanel(item.id);
    item.panel.hidden = saved ? !saved.visible : item.panel.hidden;
    item.slot.hidden = item.floating || item.panel.hidden;
    if (item.floatingWindow) item.floatingWindow.hidden = item.panel.hidden;
  }

  private restoreFloatingPanel(item: PanelItem, saved: PanelSavedState): void {
    const geometry = this.sanitizeFloatingGeometry(saved, item.defaultHeight);
    if (!item.floating) {
      this.floatPanel(item.id, geometry);
      return;
    }
    const panel = item.floatingWindow;
    if (!panel) return;
    panel.style.left = `${geometry.x}px`;
    panel.style.top = `${geometry.y}px`;
    panel.style.width = `${geometry.width}px`;
    panel.style.height = `${geometry.height}px`;
  }

  private sanitizeFloatingGeometry(saved: PanelSavedState, defaultHeight: number): FloatingGeometry {
    return {
      x: clamp(Number(saved.x) || 0, 0, Math.max(0, this.workspaceElement.clientWidth - 260)),
      y: clamp(Number(saved.y) || 0, 0, Math.max(0, this.workspaceElement.clientHeight - 70)),
      width: clamp(Number(saved.width) || 360, 260, Math.min(900, Math.max(260, this.workspaceElement.clientWidth - 16))),
      height: clamp(Number(saved.height) || defaultHeight, 130, Math.min(900, Math.max(130, this.workspaceElement.clientHeight - 16))),
    };
  }

  private resetWorkspaceToPreset(): void {
    const presetOrder = this.capturePresetOrder();
    for (const item of this.items.values()) this.dockItemIfFloating(item);
    this.order = [...this.items.values()]
      .sort((a, b) => (presetOrder.get(a.id) ?? VALID_IDS.indexOf(a.id)) - (presetOrder.get(b.id) ?? VALID_IDS.indexOf(b.id)))
      .map((item) => item.id);
    this.applyDefaultDockOrder();
    this.dock.style.setProperty('--right-dock-width', '280px');
    this.dock.classList.remove('panels-hidden');
    this.workspaceElement.classList.remove('panels-hidden');
  }

  private dockItemIfFloating(item: PanelItem): void {
    if (!item.floating) return;
    this.dockPanel(item.id);
  }

  private capturePresetOrder(): Map<DockablePanelId, number> {
    const presetOrder = new Map<DockablePanelId, number>();
    for (const item of this.items.values()) {
      const cssOrder = Number.parseInt(item.floating ? item.panel.style.order : item.slot.style.order, 10);
      presetOrder.set(item.id, Number.isFinite(cssOrder) ? cssOrder : VALID_IDS.indexOf(item.id));
    }
    return presetOrder;
  }

  private applyDefaultDockOrder(): void {
    for (const item of this.items.values()) item.panel.style.order = '';
    this.order.forEach((id, index) => {
      const item = this.items.get(id);
      if (item) item.slot.style.order = String(index);
    });
  }

  private sanitizeOrder(candidate: unknown): DockablePanelId[] {
    const valid = Array.isArray(candidate)
      ? candidate.filter((value): value is DockablePanelId => typeof value === 'string' && VALID_IDS.includes(value as DockablePanelId))
      : [];
    return [...new Set([...valid, ...VALID_IDS])];
  }

  private bindWidthResizer(): void {
    this.widthResizer.addEventListener('pointerdown', (event) => this.startDockWidthResize(event));
    this.widthResizer.addEventListener('keydown', (event) => this.resizeDockWidthFromKeyboard(event));
  }

  private startDockWidthResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.dock.getBoundingClientRect().width;
    const move = (moveEvent: PointerEvent) => this.applyDockWidthDelta(startX, startWidth, moveEvent.clientX);
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      this.saveCurrentWorkspace();
      this.syncDockChrome();
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
  }

  private applyDockWidthDelta(startX: number, startWidth: number, currentX: number): void {
    const maxWidth = Math.min(600, window.innerWidth * 0.6, this.workspaceElement.getBoundingClientRect().width * 0.6);
    const width = clamp(startWidth + startX - currentX, 220, Math.max(220, maxWidth));
    this.dock.style.setProperty('--right-dock-width', `${width}px`);
  }

  private resizeDockWidthFromKeyboard(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? 12 : -12;
    const width = this.dock.getBoundingClientRect().width + direction;
    this.dock.style.setProperty('--right-dock-width', `${clamp(width, 220, Math.min(600, window.innerWidth * 0.6))}px`);
    this.saveCurrentWorkspace();
  }

  refreshVisibility(): void {
    this.rebuildDockChildren();
    this.saveCurrentWorkspace();
  }

  private restoreInitialWorkspace(): void {
    if (this.persisted.workspaces[this.activeWorkspace]) {
      this.applyWorkspace(this.activeWorkspace);
      return;
    }
    this.rebuildDockChildren();
    this.saveCurrentWorkspace();
  }

  private handleWindowResize(): void {
    const rect = this.getFloatingLayerRect();
    for (const item of this.items.values()) this.clampFloatingPanelToBounds(item, rect);
    this.syncDockChrome();
    this.saveCurrentWorkspace();
  }

  private clampFloatingPanelToBounds(item: PanelItem, bounds: DOMRect): void {
    const panel = item.floatingWindow;
    if (!panel) return;
    const width = Math.min(panel.offsetWidth, Math.max(260, bounds.width - 16));
    const left = clamp(Number.parseFloat(panel.style.left) || 0, 0, Math.max(0, bounds.width - width));
    const top = clamp(Number.parseFloat(panel.style.top) || 0, 0, Math.max(0, bounds.height - 70));
    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
}
