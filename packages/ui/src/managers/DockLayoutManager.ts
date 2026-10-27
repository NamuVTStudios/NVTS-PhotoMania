import { uiIcon } from '../components/ShellTemplates';
/** Docking, floating and resizing behavior for PhotoMania's side panels. */
import {
  readDockLayout,
  writeDockLayout,
  type DockablePanelId,
  type PanelSavedState,
  type PersistedDockLayout,
  type WorkspaceSavedState,
} from '../persistence/DockLayoutStorage';
export type { DockablePanelId } from '../persistence/DockLayoutStorage';

const PANEL_DEFINITIONS: Array<{ id: DockablePanelId; selector: string; title: string; defaultHeight: number }> = [
  { id: 'advanced', selector: '.advanced-tool-panel', title: 'Opciones avanzadas de herramienta', defaultHeight: 210 },
  { id: 'history', selector: '.history-panel', title: 'Historial', defaultHeight: 175 },
  { id: 'layers', selector: '.layers-panel', title: 'Capas', defaultHeight: 310 },
  { id: 'comic', selector: '.comic-manager-panel', title: 'Gestor de cómics', defaultHeight: 340 },
  { id: 'storyboard', selector: '.storyboard-panel', title: 'Guion gráfico', defaultHeight: 340 },
  { id: 'timeline', selector: '.animation-timeline-panel', title: 'Línea de tiempo de animación', defaultHeight: 260 },
];
const VALID_IDS = PANEL_DEFINITIONS.map((panel) => panel.id);

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
  resizeHandle: HTMLElement | null;
};

export interface DockLayoutController {
  saveCurrentWorkspace(): void;
  applyWorkspace(workspace: string): void;
  refreshVisibility(): void;
  save(): void;
}

/** Keeps non-dock editor overlays attached when the dock slot list is rebuilt. */
export function preserveEditorPanels(
  dock: Pick<HTMLElement, 'querySelectorAll'>,
  dockSlots: HTMLElement[],
): HTMLElement[] {
  const editorPanels = [...dock.querySelectorAll<HTMLElement>(':scope > .editor-panel')];
  return [...dockSlots, ...editorPanels];
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
function getDefaultFloatingCoordinate(axis: 'x' | 'y'): number {
  if (axis === 'x') return 120;
  return 80;
}

function getRectCoordinate(rect: DOMRect, workspaceRect: DOMRect, axis: 'x' | 'y'): number {
  if (axis === 'x') return rect.left - workspaceRect.left;
  return rect.top - workspaceRect.top;
}

function getPresetOrderValue(cssOrder: number, id: DockablePanelId): number {
  if (Number.isFinite(cssOrder)) return cssOrder;
  return VALID_IDS.indexOf(id);
}

/** Creates a dock controller only when the application shell has the required layout elements. */
export function createDockLayoutManager(root: HTMLElement, initialWorkspace: string): DockLayoutController {
  const workspaceElement = root.querySelector<HTMLElement>('.workspace');
  const dock = root.querySelector<HTMLElement>('.right-dock');
  const bottomDock = root.querySelector<HTMLElement>('.animation-timeline-dock');
  if (!workspaceElement || !dock || !bottomDock) return createEmptyDockController();
  return new DockLayoutManagerImpl(root, workspaceElement, dock, bottomDock, initialWorkspace);
}

function createEmptyDockController(): DockLayoutController {
  return { saveCurrentWorkspace() {}, applyWorkspace() {}, refreshVisibility() {}, save() {} };
}

/** Owns dock state; individual interactions are separated into small methods. */
class DockLayoutManagerImpl implements DockLayoutController {
  private persisted: PersistedDockLayout = readDockLayout();
  private activeWorkspace: string;
  private order: DockablePanelId[] = [];
  private restoring = false;
  private readonly items = new Map<DockablePanelId, PanelItem>();
  private readonly floatingLayer = document.createElement('div');
  private readonly widthResizer = document.createElement('div');
  private readonly bottomResizer = document.createElement('div');

  constructor(
    private readonly root: HTMLElement,
    private readonly workspaceElement: HTMLElement,
    private readonly dock: HTMLElement,
    private readonly bottomDock: HTMLElement,
    initialWorkspace: string,
  ) {
    this.activeWorkspace = initialWorkspace;
    this.configureFloatingLayer();
    this.configureWidthResizer();
    this.configureBottomDock();
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

  private configureBottomDock(): void {
    this.bottomResizer.className = 'timeline-dock-resizer';
    this.bottomResizer.setAttribute('role', 'separator');
    this.bottomResizer.setAttribute('aria-orientation', 'horizontal');
    this.bottomResizer.setAttribute('aria-label', 'Cambiar la altura de la línea de tiempo de animación');
    this.bottomResizer.tabIndex = 0;
    this.bottomResizer.addEventListener('pointerdown', (event) => this.startTimelineResize(event));
    this.bottomResizer.addEventListener('keydown', (event) => this.resizeTimelineFromKeyboard(event));
    this.bottomDock.append(this.bottomResizer);
    this.workspaceElement.style.setProperty('--timeline-dock-height', '260px');
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
    if (item.id !== 'timeline') {
      item.resizeHandle = this.createDockResizeHandle(item);
      slot.append(item.resizeHandle);
    }
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
    slot.style.height = definition.id === 'timeline' ? '100%' : `${definition.defaultHeight}px`;
    slot.style.order = Number.isFinite(initialOrder) ? String(initialOrder) : '0';
    const host = definition.id === 'timeline' ? this.bottomDock : this.dock;
    host.append(slot);
    slot.append(panel);
    panel.style.order = '';
    panel.style.height = definition.id === 'timeline' ? '100%' : 'calc(100% - 10px)';
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
    button.innerHTML = uiIcon('pop-out');
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
      resizeHandle: null,
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
    for (const item of this.items.values()) this.initializePanelHeight(item);
  }

  private initializePanelHeight(item: PanelItem): void {
    if (item.id === 'timeline') return;
    item.slot.style.height = `${item.defaultHeight}px`;
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
    item.panel.style.height = '100%';
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
    item.panel.style.height = item.id === 'timeline' ? '100%' : 'calc(100% - 10px)';
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
    if (id === 'timeline') return;
    const candidates = this.order.filter((candidate) => {
      const item = this.items.get(candidate);
      return !!item && item.id !== 'timeline' && !item.floating && candidate !== id && !item.panel.hidden;
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
      return !!item && item.id !== 'timeline' && !item.floating && !item.panel.hidden;
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
    return this.order.map((id) => this.items.get(id)).filter((item): item is PanelItem => !!item && item.id !== 'timeline' && !item.floating && !item.panel.hidden);
  }

  private createDockResizeHandle(item: PanelItem): HTMLElement {
    const handle = document.createElement('div');
    handle.className = 'dock-panel-resizer';
    handle.dataset.panelId = item.id;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-orientation', 'horizontal');
    handle.setAttribute('aria-label', `Cambiar el tamaño de ${item.title}`);
    handle.title = `Arrastrá para cambiar la altura de ${item.title}`;
    handle.tabIndex = 0;
    handle.addEventListener('pointerdown', (event) => this.startDockResize(item, event));
    handle.addEventListener('keydown', (event) => this.resizeDockFromKeyboard(item, event));
    return handle;
  }

  private startDockResize(item: PanelItem, event: PointerEvent): void {
    if (event.button !== 0 || item.floating || item.id === 'timeline') return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = item.slot.getBoundingClientRect().height;
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      this.resizeDockPanel(item, startHeight + moveEvent.clientY - startY);
    };
    const up = () => this.finishDockResize(move, up);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
    document.addEventListener('pointercancel', up, { once: true });
  }

  private resizeDockPanel(item: PanelItem, requestedHeight: number): void {
    const maxHeight = Math.max(minDockHeight(item), Math.min(900, this.workspaceElement.clientHeight * 0.85));
    item.slot.style.height = `${clamp(requestedHeight, minDockHeight(item), maxHeight)}px`;
  }

  private finishDockResize(move: (event: PointerEvent) => void, up: () => void): void {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    this.saveCurrentWorkspace();
  }

  private resizeDockFromKeyboard(item: PanelItem, event: KeyboardEvent): void {
    if (item.id === 'timeline' || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const height = item.slot.getBoundingClientRect().height;
    this.resizeDockPanel(item, height + (event.key === 'ArrowDown' ? 12 : -12));
    this.saveCurrentWorkspace();
  }

  private startTimelineResize(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startHeight = this.bottomDock.getBoundingClientRect().height;
    const move = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      this.setTimelineDockHeight(startHeight + startY - moveEvent.clientY);
    };
    const up = () => this.finishTimelineResize(move, up);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up, { once: true });
    document.addEventListener('pointercancel', up, { once: true });
  }

  private setTimelineDockHeight(requestedHeight: number): void {
    const maxHeight = Math.max(180, Math.min(620, this.workspaceElement.clientHeight - 120));
    const height = clamp(requestedHeight, 180, maxHeight);
    this.workspaceElement.style.setProperty('--timeline-dock-height', `${height}px`);
  }

  private finishTimelineResize(move: (event: PointerEvent) => void, up: () => void): void {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    this.saveCurrentWorkspace();
  }

  private resizeTimelineFromKeyboard(event: KeyboardEvent): void {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const current = this.bottomDock.getBoundingClientRect().height;
    this.setTimelineDockHeight(current + (event.key === 'ArrowUp' ? 12 : -12));
    this.saveCurrentWorkspace();
  }

  private rebuildDockChildren(): void {
    const sorted = this.order
      .map((id) => this.items.get(id))
      .filter((item): item is PanelItem => !!item && !item.floating && item.id !== 'timeline');
    this.order.forEach((id, index) => {
      const item = this.items.get(id);
      if (item && item.id !== 'timeline') item.slot.style.order = String(index);
    });
    this.dock.replaceChildren(...this.createDockChildren(sorted));
    this.rebuildBottomDock();
    this.syncFloatingPanelVisibility();
    this.syncDockChrome();
  }

  private createDockChildren(sorted: PanelItem[]): HTMLElement[] {
    const dockSlots = sorted.map((item) => {
      item.slot.hidden = item.panel.hidden || item.floating;
      return item.slot;
    });
    // Rebuilding the dock must not detach overlays managed by App.
    return preserveEditorPanels(this.dock, dockSlots);
  }

  private rebuildBottomDock(): void {
    const item = this.items.get('timeline');
    if (!item) {
      this.bottomDock.replaceChildren(this.bottomResizer);
      return;
    }
    item.slot.hidden = item.floating || item.panel.hidden;
    this.bottomDock.replaceChildren(this.bottomResizer, item.slot);
  }

  private syncFloatingPanelVisibility(): void {
    for (const item of this.items.values()) this.syncFloatingItemVisibility(item);
  }

  private syncFloatingItemVisibility(item: PanelItem): void {
    if (!item.floatingWindow) return;
    item.floatingWindow.hidden = item.panel.hidden;
  }

  private syncDockChrome(): void {
    const panelsHidden = this.workspaceElement.classList.contains('panels-hidden') || this.dock.classList.contains('panels-hidden');
    const hasDockedVisible = !panelsHidden && this.getDockedVisibleItems().length > 0;
    const timeline = this.items.get('timeline');
    const hasBottomTimeline = !panelsHidden && !!timeline && !timeline.floating && !timeline.panel.hidden;
    this.dock.classList.toggle('panels-empty', !hasDockedVisible);
    this.workspaceElement.classList.toggle('has-side-panels', hasDockedVisible);
    this.workspaceElement.classList.toggle('has-bottom-timeline', hasBottomTimeline);
    this.bottomDock.hidden = !hasBottomTimeline;
    this.widthResizer.hidden = !hasDockedVisible;
  }

  private captureWorkspaceState(): WorkspaceSavedState {
    return {
      dockWidth: this.captureDockWidth(),
      timelineDockHeight: Math.round(this.bottomDock.getBoundingClientRect().height || Number.parseFloat(getComputedStyle(this.workspaceElement).getPropertyValue('--timeline-dock-height')) || 260),
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
      x: this.getFloatingCoordinate(item, rect, workspaceRect, 'x'),
      y: this.getFloatingCoordinate(item, rect, workspaceRect, 'y'),
      width: this.getFloatingSize(item, rect, 'width'),
      height: this.getFloatingSize(item, rect, 'height'),
      dockHeight: Math.max(minDockHeight(item), Number.parseFloat(item.slot.style.height) || item.slot.getBoundingClientRect().height || item.defaultHeight),
    };
  }

  private getFloatingCoordinate(item: PanelItem, rect: DOMRect | undefined, workspaceRect: DOMRect, axis: 'x' | 'y'): number {
    if (!item.floatingWindow) return getDefaultFloatingCoordinate(axis);
    const styleValue = axis === 'x' ? item.floatingWindow.style.left : item.floatingWindow.style.top;
    const parsed = Number.parseFloat(styleValue);
    if (parsed) return parsed;
    if (!rect) return getDefaultFloatingCoordinate(axis);
    return getRectCoordinate(rect, workspaceRect, axis);
  }

  private getFloatingSize(item: PanelItem, rect: DOMRect | undefined, axis: 'width' | 'height'): number {
    if (axis === 'width') return this.getFloatingWidth(item, rect);
    return this.getFloatingHeight(item, rect);
  }

  private getFloatingWidth(item: PanelItem, rect: DOMRect | undefined): number {
    if (!item.floatingWindow) return 360;
    return rect?.width ?? 360;
  }

  private getFloatingHeight(item: PanelItem, rect: DOMRect | undefined): number {
    if (item.floatingWindow) return rect?.height ?? Math.max(item.defaultHeight, 180);
    return Math.max(130, item.slot.getBoundingClientRect().height || item.defaultHeight);
  }

  saveCurrentWorkspace(): void {
    if (this.restoring) return;
    this.persisted.workspaces[this.activeWorkspace] = this.captureWorkspaceState();
    this.persistToStorage();
  }

  private persistToStorage(): void {
    writeDockLayout(this.persisted);
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
    this.workspaceElement.style.setProperty('--right-dock-width', `${width}px`);
    this.setTimelineDockHeight(Number(saved.timelineDockHeight) || 260);
    this.dock.classList.toggle('panels-hidden', !!saved.panelsHidden);
    this.workspaceElement.classList.toggle('panels-hidden', !!saved.panelsHidden);
    for (const item of this.items.values()) this.restorePanelState(item, saved.panels[item.id]);
    for (const item of this.items.values()) item.panel.style.order = '';
  }

  private restorePanelState(item: PanelItem, saved?: PanelSavedState): void {
    item.panel.hidden = saved ? !saved.visible : item.panel.hidden;
    item.slot.style.height = `${clamp(Number(saved?.dockHeight) || item.defaultHeight, minDockHeight(item), 1800)}px`;
    this.restorePanelFloatingMode(item, saved);
    item.panel.hidden = saved ? !saved.visible : item.panel.hidden;
    item.slot.hidden = item.floating || item.panel.hidden;
    if (item.floatingWindow) item.floatingWindow.hidden = item.panel.hidden;
  }

  private restorePanelFloatingMode(item: PanelItem, saved?: PanelSavedState): void {
    if (saved?.floating) return this.restoreFloatingPanel(item, saved);
    if (item.floating) this.dockPanel(item.id);
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
    this.workspaceElement.style.setProperty('--right-dock-width', '280px');
    this.setTimelineDockHeight(260);
    this.dock.classList.remove('panels-hidden');
    this.workspaceElement.classList.remove('panels-hidden');
  }

  private dockItemIfFloating(item: PanelItem): void {
    if (!item.floating) return;
    this.dockPanel(item.id);
  }

  private capturePresetOrder(): Map<DockablePanelId, number> {
    const presetOrder = new Map<DockablePanelId, number>();
    for (const item of this.items.values()) this.capturePresetOrderForItem(presetOrder, item);
    return presetOrder;
  }

  private capturePresetOrderForItem(presetOrder: Map<DockablePanelId, number>, item: PanelItem): void {
    const cssOrder = Number.parseInt(this.getPanelCssOrder(item), 10);
    presetOrder.set(item.id, getPresetOrderValue(cssOrder, item.id));
  }

  private getPanelCssOrder(item: PanelItem): string {
    if (item.floating) return item.panel.style.order;
    return item.slot.style.order;
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
    this.workspaceElement.style.setProperty('--right-dock-width', `${width}px`);
  }

  private resizeDockWidthFromKeyboard(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowLeft' ? 12 : -12;
    const width = this.dock.getBoundingClientRect().width + direction;
    this.workspaceElement.style.setProperty('--right-dock-width', `${clamp(width, 220, Math.min(600, window.innerWidth * 0.6))}px`);
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
