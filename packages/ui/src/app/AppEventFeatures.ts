import { findVectorSelectionTarget, getDocumentDisplayTransform, getVectorSelectionFrame, vectorDeltaToLocal } from './VectorSelectionGeometry';
// Event wiring, menus, shortcuts and vector gestures.
import { AppVectorFeatures } from './AppVectorFeatures';
import { refresh, type LayerNode } from '@nvts/document-model';
import { cloneVectorShape, cloneVectorShapes, getVectorShapeBounds, remapVectorPoints, type VectorShape } from '@nvts/shared';
import { wireLayersPanel } from '../panels/LayersPanel';
import { wireLayerEffectsPanel } from '../panels/LayerEffectsPanel';
import { wireFilterPanel } from '../panels/FilterPanel';
import { wireVectorEditorPanel } from '../panels/VectorEditorPanel';
import { wirePlugins, type PluginApi } from '../panels/PluginsPanel';
import { createDockLayoutManager } from '../managers/DockLayoutManager';
import { AnimationFrameLayerManager } from '../managers/AnimationFrameLayerManager';
import { ToolGroupFlyoutController } from '../managers/ToolGroupFlyoutController';
import { ComicGuideOverlayController } from '../features/comics/ComicGuideOverlay';
import { routeLayerMenuAction, type LayerMenuCommand } from './LayerMenuCommandRouter';
import type { WorkspaceId } from '../workspaces';
import type { Tool, MenuEntry, PanelVisibilityEntry } from './AppBase';
import type { ToolTarget } from '../tools/ToolsBase';
import { readPreferences } from '../panels/PreferencesPanel';
import { isCurrentStrokePointer, isPenContactSample } from '../tools/TabletInput';
import { MenuInteractionController } from '../menus/MenuInteractionController';
import type { FilterKind } from '@nvts/shared';
import { encodeGif89a, encodePdfCompatibleAi, encodePsdComposite, encodeSvgWithEmbeddedPng } from '@nvts/storage';

export abstract class AppEventFeatures extends AppVectorFeatures {
  private animationFrameManager: AnimationFrameLayerManager | null = null;
  protected comicGuideOverlay: ComicGuideOverlayController | null = null;

  protected abstract handleTransformSessionKey(event: KeyboardEvent): boolean;
  protected abstract startLayerTransform(): void;
  protected abstract clearSelectionFromMenu(): void;
  protected abstract clearHistoryFromMenu(): void;

  protected bind(): void {
      this.setTabletInputPreferences(readPreferences().tabletInput);
      this.bindColorSwatches();
      this.bindPluginAndLayerPanels();
      this.wireComicManager();
      this.initializeToolPanels();
      this.bindMenuDropdowns();
      new MenuInteractionController(this.root).mount();
      this.bindEditMenuActions();
      this.bindWorkspaceSelector();
      this.bindPanelVisibilityMenu();
      this.bindToolAndViewControls();
      this.bindEditorPanels();
      this.bindFileToolbar();
      this.bindExportWorkflow();
      this.bindMaskControls();
      this.bindCanvasEvents();
      this.bindComicGuideOverlay();
      this.bindAnimationFrameControls();
      this.bindKeyboardShortcuts();
    }

  protected bindPluginAndLayerPanels(): void {
      wirePlugins(this.root, () => this.createPluginApiContext());
      wireLayersPanel(this.root, {
        createLayer: (type) => { void this.createLayerOfType(type); },
        createMask: (type) => this.addMaskToActiveLayer(type),
        deleteActiveLayer: () => this.deleteActiveLayer(),
        duplicateActiveLayer: () => this.duplicateActiveLayer(),
        moveActiveLayer: (delta) => this.moveActive(delta),
        changeFillColor: () => {
          const layer = this.active();
          if (layer?.type === 'fill') this.changeFillColor(layer);
        },
        configureFilter: () => {
          const layer = this.active();
          if (layer?.type === 'filter') this.openFilterEditor(layer);
        },
        editVectorLayer: () => {
          const layer = this.active();
          if (layer?.type === 'vector') this.editVectorLayer(layer);
        },
        editTextLayer: () => {
          const layer = this.active();
          if (layer?.type === 'text') void this.createTextAt({ x: layer.textX ?? 0, y: layer.textY ?? 0 }, layer);
        },
        setOpacity: (opacity) => this.setActiveLayerOpacity(opacity),
        setBlendMode: (blendMode) => this.setActiveLayerBlendMode(blendMode),
      });
    }


  private bindAnimationFrameControls(): void {
    this.animationFrameManager = new AnimationFrameLayerManager(
      () => this.ctl,
      () => this.activeId,
      (layerId) => { this.activeId = layerId; },
    );
    const initialLayer = this.animationFrameManager.initialize();
    if (initialLayer) this.activeId = initialLayer.id;
    this.root.addEventListener('nvts:animation-frame-change', (event) => {
      const detail = (event as CustomEvent<{ frame: number }>).detail;
      this.activateAnimationFrame(detail?.frame);
    });
  }

  private activateAnimationFrame(frame: number): void {
    if (!this.animationFrameManager || this.stroke || this.colorizeStroke) return;
    const layer = this.animationFrameManager.selectFrame(frame);
    if (!layer) return;
    this.activeId = layer.id;
    this.colorizeOutputCache.clear();
    this.ctl.comp.invalidateAll();
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
  }

  protected deleteActiveLayer(): void {
      if (this.stroke) return;
      const layer = this.active();
      if (!layer) return;
      const reason = this.ctl.getLayerDeletionBlockReason(layer.id);
      if (reason) {
        this.syncUI();
        this.reportLayerDeletionBlockReason(reason);
        return;
      }
      if (!this.ctl.removeLayer(layer.id)) return;
      this.activeId = this.topRaster()?.id ?? this.ctl.doc.layers.at(-1)?.id ?? '';
      this.refreshAfterLayerStructureChange();
    }

  protected reportLayerDeletionBlockReason(reason: string): void {
      const status = this.root.querySelector<HTMLElement>('#status');
      if (status) status.textContent = reason;
    }

  protected duplicateActiveLayer(): void {
      if (this.stroke || !this.active()) return;
      const copy = this.ctl.duplicateLayer(this.activeId);
      if (copy) this.activeId = copy.id;
      this.refreshAfterLayerPropertyChange();
    }

  protected setActiveLayerOpacity(opacity: number): void {
      const layer = this.active();
      if (!layer) return;
      this.ctl.setProps(layer.id, { opacity });
      this.refreshAfterLayerPropertyChange();
    }

  protected setActiveLayerBlendMode(blendMode: LayerNode['blendMode']): void {
      const layer = this.active();
      if (!layer) return;
      this.ctl.setProps(layer.id, { blendMode });
      this.refreshAfterLayerPropertyChange();
    }

  protected refreshAfterLayerStructureChange(): void {
      this.ctl.comp.invalidateAll();
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    }

  protected refreshAfterLayerPropertyChange(): void {
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    }

  protected initializeToolPanels(): void {
      this.renderToolOptions();
      this.renderAdvancedToolOptions();
      this.applyCanvasView();
      this.updatePreviewCanvasSize();
    }

  protected getMenuEntries(): MenuEntry[] {
      return [
        { button: this.q<HTMLButtonElement>('#menu-file'), dropdown: this.q<HTMLElement>('#file-menu-dropdown') },
        { button: this.q<HTMLButtonElement>('#menu-edit'), dropdown: this.q<HTMLElement>('#edit-menu-dropdown') },
        { button: this.q<HTMLButtonElement>('#menu-layer'), dropdown: this.q<HTMLElement>('#layer-menu-dropdown') },
        { button: this.q<HTMLButtonElement>('#menu-view'), dropdown: this.q<HTMLElement>('#view-menu-dropdown') },
        { button: this.q<HTMLButtonElement>('#menu-workspace'), dropdown: this.q<HTMLElement>('#workspace-menu-dropdown') },
      ];
    }

  protected closeMenu(menu: { button: HTMLButtonElement; dropdown: HTMLElement }): void {
      menu.dropdown.hidden = true;
      menu.button.setAttribute('aria-expanded', 'false');
    }

  protected bindEditMenuActions(): void {
      this.root.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const item = target.closest<HTMLButtonElement>('[data-menu-action]');
        if (!item || item.disabled) return;
        this.runDeclaredMenuAction(item.dataset.menuAction ?? '', item.dataset.filterKind as FilterKind | undefined, item.dataset.menuUrl);
      });
    }

  protected runDeclaredMenuAction(action: string, filterKind?: FilterKind, url?: string): void {
      if (action === 'undo') return this.doUndo();
      if (action === 'redo') return this.doRedo();
      if (action === 'clear-history') return this.clearHistoryFromMenu();
      if (action === 'transform-layer') return this.runLayerMenuAction('transform');
      if (action === 'deselect') return this.clearSelectionFromMenu();
      if (action === 'open-filter-panel' && filterKind) this.openFilterPanelForMenu(filterKind);
      if (action === 'open-url' && url) this.openExternalMenuUrl(url);
    }

  private openExternalMenuUrl(value: string): void {
      let url: URL;
      try { url = new URL(value); } catch { return; }
      if (url.protocol !== 'https:') return;
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    }

  protected bindMenuDropdowns(): void {
      const menus = this.getMenuEntries();
      for (const menu of menus) {
        menu.button.addEventListener('click', (event) => {
          event.stopPropagation();
          const shouldOpen = menu.dropdown.hidden;
          menus.forEach((entry) => this.closeMenu(entry));
          menu.dropdown.hidden = !shouldOpen;
          menu.button.setAttribute('aria-expanded', String(shouldOpen));
        });
        menu.dropdown.addEventListener('click', (event) => {
          const item = (event.target as HTMLElement).closest<HTMLButtonElement>('button[role^="menuitem"]');
          if (!item || item.classList.contains('submenu-trigger')) return;
          this.closeMenu(menu);
        });
        menu.dropdown.addEventListener('keydown', (event) => this.handleMenuKeyboard(menu, event));
      }
      this.bindLayerTypeSubmenu();
      document.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        menus.forEach((menu) => {
          if (!menu.dropdown.contains(target) && !menu.button.contains(target)) this.closeMenu(menu);
        });
      });
    }

  private handleMenuKeyboard(menu: MenuEntry, event: KeyboardEvent): void {
      const target = event.target as HTMLElement;
      const activeDropdown = target.closest<HTMLElement>('.file-menu-dropdown');
      if (!activeDropdown || !menu.dropdown.contains(activeDropdown)) return;
      const trigger = target.closest<HTMLButtonElement>('button[role^="menuitem"]');

      if (event.key === 'Escape') {
        event.preventDefault();
        if (activeDropdown.classList.contains('submenu-dropdown')) {
          activeDropdown.hidden = true;
          const parent = this.root.querySelector<HTMLButtonElement>(`[aria-controls="${activeDropdown.id}"]`);
          parent?.setAttribute('aria-expanded', 'false');
          parent?.focus();
          return;
        }
        this.closeMenu(menu);
        menu.button.focus();
        return;
      }

      if (event.key === 'ArrowRight' && trigger?.classList.contains('submenu-trigger')) {
        event.preventDefault();
        const id = trigger.getAttribute('aria-controls');
        const submenu = id ? this.root.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
        if (!submenu) return;
        submenu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        this.focusFirstMenuItem(submenu);
        return;
      }

      if (event.key === 'ArrowLeft' && activeDropdown.classList.contains('submenu-dropdown')) {
        event.preventDefault();
        activeDropdown.hidden = true;
        const parent = this.root.querySelector<HTMLButtonElement>(`[aria-controls="${activeDropdown.id}"]`);
        parent?.setAttribute('aria-expanded', 'false');
        parent?.focus();
        return;
      }

      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = Array.from(activeDropdown.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]'))
        .filter((button) => button.closest('.file-menu-dropdown') === activeDropdown && !button.disabled && !this.hasHiddenAncestor(button));
      if (!items.length) return;
      event.preventDefault();
      const index = items.indexOf(trigger as HTMLButtonElement);
      if (event.key === 'Home') items[0].focus();
      else if (event.key === 'End') items.at(-1)?.focus();
      else {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const start = index < 0 ? (direction > 0 ? -1 : 0) : index;
        items[(start + direction + items.length) % items.length].focus();
      }
    }

  private focusFirstMenuItem(dropdown: HTMLElement): void {
    const first = Array.from(dropdown.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]'))
      .find((button) => button.closest('.file-menu-dropdown') === dropdown && !button.disabled && !this.hasHiddenAncestor(button));
    first?.focus();
  }

  private hasHiddenAncestor(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current) {
      if (current.hidden) return true;
      current = current.parentElement;
    }
    return false;
  }

  private bindLayerTypeSubmenu(): void {
    const button = this.q<HTMLButtonElement>('#menu-new-layer-types');
    const dropdown = this.q<HTMLElement>('#layer-types-menu-dropdown');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropdown.hidden = !dropdown.hidden;
      button.setAttribute('aria-expanded', String(!dropdown.hidden));
    });
    dropdown.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-create-layer-type]')) {
        dropdown.hidden = true;
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  protected bindWorkspaceSelector(): void {
      const workspaceMenu = this.getMenuEntries()[4];
      const dropdown = workspaceMenu.dropdown;
      const refresh = () => {
        dropdown.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
          const selected = button.dataset.workspace === this.workspace;
          button.setAttribute('aria-checked', String(selected));
          const check = button.querySelector<HTMLElement>('.menu-check');
          const checkmark = selected ? '✓' : '';
          if (check) check.textContent = checkmark;
        });
      };
      dropdown.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          const candidate = button.dataset.workspace as WorkspaceId;
          if (!this.workspaceManager.isWorkspaceId(candidate)) return;
          this.applyWorkspace(candidate);
          this.closeMenu(workspaceMenu);
          refresh();
        });
      });
      this.bindWorkspaceResetButton(dropdown, workspaceMenu);
      refresh();
    }

  private bindWorkspaceResetButton(
    dropdown: HTMLElement,
    workspaceMenu: { button: HTMLButtonElement; dropdown: HTMLElement },
  ): void {
    dropdown.querySelector<HTMLButtonElement>('#workspace-reset-defaults')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!window.confirm('Se borrará la configuración personalizada del espacio de trabajo seleccionado y se restaurarán sus valores predeterminados. Los demás espacios de trabajo no se modificarán. ¿Continuar?')) return;
      this.restoreWorkspaceDefaults();
      this.closeMenu(workspaceMenu);
    });
  }

  protected getPanelVisibilityEntries(): PanelVisibilityEntry[] {
      return [
        { button: this.q<HTMLButtonElement>('#toggle-panel-advanced'), panel: this.q<HTMLElement>('.advanced-tool-panel') },
        { button: this.q<HTMLButtonElement>('#toggle-panel-history'), panel: this.q<HTMLElement>('.history-panel') },
        { button: this.q<HTMLButtonElement>('#toggle-panel-layers'), panel: this.q<HTMLElement>('.layers-panel') },
        { button: this.q<HTMLButtonElement>('#toggle-panel-comic'), panel: this.q<HTMLElement>('.comic-manager-panel') },
        { button: this.q<HTMLButtonElement>('#toggle-panel-storyboard'), panel: this.q<HTMLElement>('.storyboard-panel') },
        { button: this.q<HTMLButtonElement>('#toggle-panel-timeline'), panel: this.q<HTMLElement>('.animation-timeline-panel') },
      ];
    }

  protected bindPanelVisibilityMenu(): void {
      const viewMenu = this.getMenuEntries()[3];
      const panelsDropdown = this.q<HTMLElement>('#panels-menu-dropdown');
      const panelsMenuButton = this.q<HTMLButtonElement>('#menu-panels');
      this.bindPanelDropdownEvents(viewMenu, panelsDropdown, panelsMenuButton);
      this.bindPanelVisibilityItems(viewMenu, panelsDropdown, panelsMenuButton);
      this.q<HTMLButtonElement>('#toggle-panels').onclick = () => this.toggleAllPanels(panelsDropdown, panelsMenuButton, viewMenu);
      this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
      this.applyWorkspace(this.workspace, false);
      this.dockLayout = createDockLayoutManager(this.root, this.workspace);
      this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
    }

  protected bindPanelDropdownEvents(
      viewMenu: { button: HTMLButtonElement; dropdown: HTMLElement },
      panelsDropdown: HTMLElement,
      panelsMenuButton: HTMLButtonElement,
    ): void {
      viewMenu.button.addEventListener('click', () => {
        if (!viewMenu.dropdown.hidden) return;
        panelsDropdown.hidden = true;
        panelsMenuButton.setAttribute('aria-expanded', 'false');
      });
      panelsMenuButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        panelsDropdown.hidden = !panelsDropdown.hidden;
        this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
      });
      panelsDropdown.addEventListener('click', (event) => event.stopPropagation());
      panelsDropdown.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        panelsDropdown.hidden = true;
        this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
        panelsMenuButton.focus();
      });
    }

  protected bindPanelVisibilityItems(
      viewMenu: { button: HTMLButtonElement; dropdown: HTMLElement },
      panelsDropdown: HTMLElement,
      panelsMenuButton: HTMLButtonElement,
    ): void {
      this.getPanelVisibilityEntries().forEach((entry) => {
        entry.button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          entry.panel.hidden = !entry.panel.hidden;
          panelsDropdown.hidden = true;
          this.closeMenu(viewMenu);
          this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
          this.dockLayout?.refreshVisibility();
        });
      });
    }

  protected updatePanelVisibilityMenu(panelsDropdown: HTMLElement, panelsMenuButton: HTMLButtonElement): void {
      const entries = this.getPanelVisibilityEntries();
      entries.forEach((entry) => {
        const visible = !entry.panel.hidden;
        entry.button.setAttribute('aria-checked', String(visible));
        const check = entry.button.querySelector<HTMLElement>('.menu-check');
        const checkmark = visible ? '✓' : '';
        if (check) check.textContent = checkmark;
      });
      const dock = this.q<HTMLElement>('.right-dock');
      dock.classList.toggle('panels-empty', entries.every((entry) => entry.panel.hidden || !entry.panel.closest('.dock-panel-slot')));
      const workspace = this.q<HTMLElement>('.workspace');
      const allHidden = dock.classList.contains('panels-hidden') || workspace.classList.contains('panels-hidden');
      this.q<HTMLButtonElement>('#toggle-panels').setAttribute('aria-pressed', String(!allHidden));
      panelsMenuButton.setAttribute('aria-expanded', String(!panelsDropdown.hidden));
    }

  protected toggleAllPanels(panelsDropdown?: HTMLElement, panelsMenuButton?: HTMLButtonElement, viewMenu?: { button: HTMLButtonElement; dropdown: HTMLElement }): void {
      const entries = this.getPanelVisibilityEntries();
      const dock = this.q<HTMLElement>('.right-dock');
      const workspace = this.q<HTMLElement>('.workspace');
      const everyPanelHidden = entries.every((entry) => entry.panel.hidden);
      const dockWasHidden = dock.classList.contains('panels-hidden') || workspace.classList.contains('panels-hidden');
      this.applyPanelVisibilityState(entries, dock, workspace, dockWasHidden, everyPanelHidden);
      if (panelsDropdown) panelsDropdown.hidden = true;
      if (viewMenu) this.closeMenu(viewMenu);
      if (panelsMenuButton && panelsDropdown) this.updatePanelVisibilityMenu(panelsDropdown, panelsMenuButton);
      else {
        const dropdown = this.q<HTMLElement>('#panels-menu-dropdown');
        const button = this.q<HTMLButtonElement>('#menu-panels');
        this.updatePanelVisibilityMenu(dropdown, button);
      }
      this.dockLayout?.refreshVisibility();
    }

  private applyPanelVisibilityState(
    entries: ReturnType<AppEventFeatures['getPanelVisibilityEntries']>, dock: HTMLElement, workspace: HTMLElement,
    dockWasHidden: boolean, everyPanelHidden: boolean,
  ): void {
    if (dockWasHidden) return this.showPanelsAfterHiddenState(entries, dock, workspace, everyPanelHidden);
    if (everyPanelHidden) return this.showEveryPanel(entries);
    this.hideAllPanels(dock, workspace);
  }

  private showPanelsAfterHiddenState(
    entries: ReturnType<AppEventFeatures['getPanelVisibilityEntries']>, dock: HTMLElement, workspace: HTMLElement,
    everyPanelHidden: boolean,
  ): void {
    dock.classList.remove('panels-hidden');
    workspace.classList.remove('panels-hidden');
    this.revealPanelsWhenAllHidden(entries, everyPanelHidden);
  }

  private showEveryPanel(entries: ReturnType<AppEventFeatures['getPanelVisibilityEntries']>): void {
    entries.forEach((entry) => { entry.panel.hidden = false; });
  }

  private hideAllPanels(dock: HTMLElement, workspace: HTMLElement): void {
    dock.classList.add('panels-hidden');
    workspace.classList.add('panels-hidden');
  }

  protected bindToolAndViewControls(): void {
      new ToolGroupFlyoutController(this.root).mount();
      this.bindToolButtons();
      this.bindZoomButtons();
      this.bindClosePanelControls();
    }

  protected bindToolButtons(): void {
      const on = (id: string, fn: () => void) => { this.q(id).onclick = fn; };
      on('#menu-filter', () => this.openDestructiveFilterPanel());
      this.bindLayerMenuActions();
      on('#rail-hand', () => this.setTool('hand'));
      on('#rail-move', () => this.setTool('move'));
      on('#rail-brush', () => this.setTool('brush'));
      on('#rail-pen', () => this.setTool('pen'));
      on('#rail-pencil', () => this.setTool('pencil'));
      on('#rail-airbrush', () => this.setTool('airbrush'));
      on('#rail-decoration', () => this.setTool('decoration'));
      on('#rail-dust-removal', () => this.setTool('dust-removal'));
      on('#rail-vector-eraser', () => this.setTool('vector-eraser'));
      on('#rail-vector-line-correction', () => this.setTool('vector-line-correction'));
      on('#rail-speech-bubble', () => this.setTool('speech-bubble'));
      on('#rail-flash', () => this.setTool('flash'));
      on('#rail-vector-parallel-lines', () => this.setTool('vector-parallel-lines'));
      on('#rail-vector-radial-lines', () => this.setTool('vector-radial-lines'));
      on('#rail-select-rectangle', () => this.setTool('select-rectangle'));
      on('#rail-select-ellipse', () => this.setTool('select-ellipse'));
      on('#rail-select-lasso', () => this.setTool('select-lasso'));
      on('#rail-select-polygon', () => this.setTool('select-polygon'));
      on('#rail-selection-brush', () => this.setTool('selection-brush'));
      on('#rail-selection-erase', () => this.setTool('selection-erase'));
      on('#rail-magic-wand', () => this.setTool('magic-wand'));
      on('#rail-selection-clear', () => this.setTool('selection-clear'));
      on('#rail-eraser', () => this.setTool('eraser'));
      on('#rail-eyedropper', () => this.setTool('eyedropper'));
      on('#rail-line', () => this.setTool('line'));
      on('#rail-text', () => this.setTool('text'));
      on('#rail-vector-select', () => this.setTool('vector-select'));
      on('#rail-vector-rectangle', () => this.setTool('vector-rectangle'));
      on('#rail-vector-rounded-rectangle', () => this.setTool('vector-rounded-rectangle'));
      on('#rail-vector-ellipse', () => this.setTool('vector-ellipse'));
      on('#rail-vector-line', () => this.setTool('vector-line'));
      on('#rail-vector-polyline', () => this.setTool('vector-polyline'));
      on('#rail-vector-pen', () => this.setTool('vector-pen'));
      on('#rail-vector-polygon', () => this.setTool('vector-polygon'));
      on('#rail-vector-star', () => this.setTool('vector-star'));
      on('#rail-vector-spiral', () => this.setTool('vector-spiral'));
      on('#rail-vector-freehand', () => this.setTool('vector-freehand'));
      on('#rail-rectangle', () => this.setTool('rectangle'));
      on('#rail-ellipse', () => this.setTool('ellipse'));
      on('#rail-pixel-rounded-rectangle', () => this.setTool('pixel-rounded-rectangle'));
      on('#rail-pixel-polyline', () => this.setTool('pixel-polyline'));
      on('#rail-pixel-bezier', () => this.setTool('pixel-bezier'));
      on('#rail-pixel-polygon', () => this.setTool('pixel-polygon'));
      on('#rail-pixel-star', () => this.setTool('pixel-star'));
      on('#rail-pixel-spiral', () => this.setTool('pixel-spiral'));
      on('#rail-fill', () => this.setTool('fill'));
      on('#rail-clone-stamp', () => this.setTool('clone-stamp'));
      on('#rail-gradient', () => this.setTool('gradient'));
      on('#rail-smudge', () => this.setTool('smudge'));
      on('#rail-liquify', () => this.setTool('liquify'));
      on('#rail-comic-panel', () => this.setTool('comic-panel'));
    }

  protected bindLayerMenuActions(): void {
      const dropdown = this.q<HTMLElement>('#layer-menu-dropdown');
      dropdown.querySelectorAll<HTMLButtonElement>('[data-layer-action]').forEach((button) => {
        button.addEventListener('click', () => this.runLayerMenuAction(button.dataset.layerAction ?? ''));
      });
      dropdown.querySelectorAll<HTMLButtonElement>('[data-create-layer-type]').forEach((button) => {
        button.addEventListener('click', () => {
          const type = button.dataset.createLayerType as LayerNode['type'] | undefined;
          if (type) void this.createLayerOfType(type);
        });
      });
    }

  protected runLayerMenuAction(action: string): void {
      const layer = this.active();
      routeLayerMenuAction(action, Boolean(layer), {
        createPaintLayer: () => { void this.createLayerOfType('paint'); },
        reportMissingSelection: () => this.reportLayerDeletionBlockReason('Seleccioná una capa primero.'),
        selectedLayerActions: layer ? this.createLayerMenuCommandHandlers(layer) : {},
      });
    }

  protected createLayerMenuCommandHandlers(layer: LayerNode): Partial<Record<LayerMenuCommand, () => void>> {
      return {
        duplicate: () => this.duplicateActiveLayer(),
        rename: () => this.renameLayer(layer),
        'move-up': () => this.moveActive(1),
        'move-down': () => this.moveActive(-1),
        delete: () => this.deleteActiveLayer(),
        effects: () => this.openLayerEffectsEditor(layer),
        visibility: () => {
          this.ctl.setProps(layer.id, { visible: !layer.visible });
          this.refreshAfterLayerPropertyChange();
        },
        lock: () => {
          this.ctl.setProps(layer.id, { locked: !layer.locked });
          this.refreshAfterLayerPropertyChange();
        },
        opacity: () => this.promptLayerOpacity(layer.opacity),
        blend: () => this.promptLayerBlendMode(layer.blendMode),
        group: () => this.groupActiveLayer(),
        transform: () => this.startLayerTransform(),
      };
    }

  protected groupActiveLayer(): void {
    const layer = this.active();
    if (!layer) {
      this.reportLayerDeletionBlockReason('Seleccioná una capa antes de agrupar.');
      return;
    }
    if (layer.type === 'group') {
      this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa que no sea un grupo para agruparla.';
      return;
    }
    if (this.ctl.isEffectivelyLocked(layer.id)) {
      this.q<HTMLElement>('#status').textContent = 'No se puede agrupar una capa bloqueada.';
      return;
    }
    const group = this.ctl.groupLayer(layer.id);
    if (!group) return;
    this.refreshAfterLayerStructureChange();
    this.q<HTMLElement>('#status').textContent = `«${layer.name}» se agrupó en «${group.name}».`;
  }

  protected promptLayerOpacity(currentOpacity: number): void {
      const entered = prompt('Opacidad de la capa (0–100)', String(Math.round(currentOpacity * 100)));
      if (entered === null) return;
      const opacity = Number(entered);
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 100) { alert('La opacidad debe estar entre 0 y 100.'); return; }
      this.setActiveLayerOpacity(opacity / 100);
    }

  protected promptLayerBlendMode(currentMode: LayerNode['blendMode']): void {
      const modes: LayerNode['blendMode'][] = ['normal', 'multiply', 'screen', 'overlay'];
      const entered = prompt(`Modo de fusión (${modes.join(', ')})`, currentMode);
      if (!entered || !modes.includes(entered as LayerNode['blendMode'])) return;
      this.setActiveLayerBlendMode(entered as LayerNode['blendMode']);
    }

  protected bindZoomButtons(): void {
      this.q<HTMLButtonElement>('#zoom-out').onclick = () => {
        this.zoom = Math.max(0.25, Math.round((this.zoom / 1.2) * 1000) / 1000);
        this.applyCanvasView();
      };
      this.q<HTMLButtonElement>('#zoom-in').onclick = () => {
        this.zoom = Math.min(8, Math.round((this.zoom * 1.2) * 1000) / 1000);
        this.applyCanvasView();
      };
      this.q<HTMLButtonElement>('#zoom-fit').onclick = () => {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.applyCanvasView();
      };
    }

  protected bindClosePanelControls(): void {
      this.root.querySelectorAll<HTMLElement>('[data-close]').forEach((element) => {
        element.addEventListener('click', () => this.closePanelByTarget(element.dataset.close));
      });
    }

  private closePanelByTarget(target: string | undefined): void {
    if (!target) return;
    if (target === 'filters-panel') return this.closeFilterDialog();
    if (target === 'effects-panel' || target === 'masks-panel') return this.hideRightEditors();
    this.q<HTMLElement>('#' + target).hidden = true;
  }

  protected applyLayerStyleSettings(): void {
    const style = this.layerEffectsPanel?.getStyle();
    if (!style) return;
    this.commitLayerStyleSettings(style);
  }

  protected bindEditorPanels(): void {
      this.filterPanel = wireFilterPanel(this.root, {
        labelForFilter: (kind) => this.filterLabel(kind),
        applyFilter: () => this.applyFilterDialog(),
      });
      this.layerEffectsPanel = wireLayerEffectsPanel(this.root, (layerId) => {
        const layer = this.ctl.find(layerId);
        if (layer) this.openLayerEffectsEditor(layer);
      }, () => this.applyLayerStyleSettings(), (style) => this.previewLayerStyleSettings(style));
      wireVectorEditorPanel(this.root, {
        addShape: (kind) => this.addVectorShape(kind),
        deleteShape: () => this.deleteSelectedVectorShape(),
        duplicateShape: () => this.duplicateSelectedVectorShape(),
        moveShape: (delta) => this.moveSelectedVectorShape(delta),
        exportSvg: () => this.exportVectorLayerSvg(),
        apply: () => this.applyVectorEditor(),
        cancel: () => this.cancelVectorEditor(),
        clear: () => this.clearVectorEditor(),
        updateFromFields: (fieldId) => this.updateVectorShapeFromFields(fieldId),
      });
    }

  protected clearVectorEditor(): void {
      if (!confirm('¿Vaciar todos los objetos de esta capa vectorial?')) return;
      this.vectorDraft = [];
      this.vectorSelectedId = null;
      this.renderVectorEditor();
    }

  protected bindFileToolbar(): void {
      this.q('#b-new').onclick = () => this.promptNew();
      this.q('#b-open').onclick = () => { void this.open(); };
      this.q('#b-import-image').onclick = () => { void this.createFileLayer(); };
      this.q('#b-save').onclick = () => { void this.save(false); };
      this.q('#b-save-as').onclick = () => { void this.save(true); };
      this.q('#b-export').onclick = () => this.openExportPanel();
      this.q('#b-render-animation').onclick = () => this.openAnimationRenderPanel();
    }

  protected bindExportWorkflow(): void {
      this.q('#export-panel-close').addEventListener('click', () => this.closeWorkflowPanel('#export-panel'));
      this.q('#animation-render-close').addEventListener('click', () => this.closeWorkflowPanel('#animation-render-panel'));
      this.q('#export-format').addEventListener('change', () => this.updateExportFormatDescription());
      this.q<HTMLInputElement>('#export-quality').addEventListener('input', (event) => {
        const input = event.currentTarget as HTMLInputElement;
        this.q<HTMLOutputElement>('#export-quality-value').value = `${input.value}%`;
      });
      this.q('#export-choose-folder').addEventListener('click', () => { void this.chooseExportDirectory(); });
      this.q('#export-confirm').addEventListener('click', () => { void this.exportFromPanel(); });
      this.q('#animation-open-timeline').addEventListener('click', () => this.openAnimationTimeline());
      this.updateExportFormatDescription();
    }

  protected openExportPanel(initialFormat?: string): void {
      this.closeWorkflowPanel('#animation-render-panel');
      const panel = this.q<HTMLElement>('#export-panel');
      const name = this.q<HTMLInputElement>('#export-name');
      const format = this.q<HTMLSelectElement>('#export-format');
      if (!name.value || name.value === 'Sin título') name.value = this.ctl.doc.name || 'PhotoMania';
      if (initialFormat) format.value = initialFormat;
      panel.hidden = false;
      this.updateExportFormatDescription();
      format.focus();
    }

  protected openAnimationRenderPanel(): void {
      this.closeWorkflowPanel('#export-panel');
      this.q<HTMLElement>('#animation-render-panel').hidden = false;
      this.q<HTMLButtonElement>('#animation-render-disabled').focus();
    }

  protected closeWorkflowPanel(selector: string): void {
      const panel = this.root.querySelector<HTMLElement>(selector);
      if (panel) panel.hidden = true;
    }

  protected updateExportFormatDescription(): void {
      const format = this.q<HTMLSelectElement>('#export-format').value;
      const messages: Record<string, string> = {
        png: 'PNG conserva transparencia y exporta la composición visible.',
        jpeg: 'JPEG aplana la transparencia sobre blanco. La calidad se ajusta con el control inferior.',
        gif: 'GIF exporta una imagen estática de 256 colores. La animación requiere celdas por fotograma en la línea de tiempo.',
        svg: 'El SVG incluye la composición completa como una imagen PNG incrustada; no convierte las capas rasterizadas en trazados vectoriales.',
        psd: 'PSD genera un archivo RGB de 8 bits con transparencia y una sola composición aplanada; no conserva las capas editables.',
        ai: 'AI genera un archivo PDF-compatible que Illustrator puede abrir. La composición se incrusta aplanada, sin capas ni trazados editables.',
        kra: 'La exportación KRA nativa todavía no está implementada. La importación KRA usa la imagen compuesta del archivo.',
      };
      this.q<HTMLElement>('#export-format-info').textContent = messages[format] ?? '';
      this.q<HTMLElement>('#export-quality-field').hidden = format !== 'jpeg';
    }

  protected async chooseExportDirectory(): Promise<void> {
      const fileSystemWindow = window as Window & { showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> };
      if (!fileSystemWindow.showDirectoryPicker) {
        this.q<HTMLElement>('#export-destination-label').textContent = 'Este navegador no permite seleccionar una carpeta. Se abrirá el selector de archivo si está disponible.';
        return;
      }
      try {
        this.exportDirectoryHandle = await fileSystemWindow.showDirectoryPicker({ mode: 'readwrite' });
        this.q<HTMLElement>('#export-destination-label').textContent = `Carpeta seleccionada: ${this.exportDirectoryHandle.name}`;
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) this.fail(error);
      }
    }

  protected async exportFromPanel(): Promise<void> {
      if (this.stroke || this.blockForUnappliedMaskChanges('exportar')) return;
      const format = this.q<HTMLSelectElement>('#export-format').value;
      if (format === 'kra') {
        this.q<HTMLElement>('#export-format-info').textContent = 'KRA nativo todavía no está disponible; elegí otro formato.';
        return;
      }
      const extension = this.getExportExtension(format);
      const documentName = this.ctl.doc.name || 'PhotoMania';
      const baseName = this.q<HTMLInputElement>('#export-name').value.trim() || documentName;
      const fileName = this.ensureExportExtension(baseName, extension);
      try {
        const targetPromise = this.chooseExportFileTarget(fileName, format);
        const { width, height } = this.ctl.doc;
        const composition = this.createSamplingCanvas(width, height);
        this.composeSamplingLayers(this.ctl.doc.layers, composition, width, height, (layer) => this.ctl.readPixels(layer));
        const output = format === 'jpeg' || format === 'ai'
          ? this.flattenOnWhite(composition, width, height)
          : composition;
        const bytes = await this.encodeExportFormat(format, output);
        const target = await targetPromise;
        if (target) this.q<HTMLElement>('#export-destination-label').textContent = `Ubicación elegida: ${target.name}`;
        await this.writeExportTarget(target, fileName, bytes, format);
        this.q<HTMLElement>('#status').textContent = `Exportado como ${format.toUpperCase()} · ${width}×${height}`;
        this.closeWorkflowPanel('#export-panel');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) this.fail(error);
      }
    }

  protected getExportExtension(format: string): string {
      const extensions: Record<string, string> = { png: 'png', jpeg: 'jpg', gif: 'gif', svg: 'svg', psd: 'psd', ai: 'ai' };
      const extension = extensions[format];
      if (!extension) throw new Error(`Formato de exportación no compatible: ${format}`);
      return extension;
    }

  protected ensureExportExtension(fileName: string, extension: string): string {
      const safeName = fileName.replace(/[\\/:*?"<>|]/g, '_').replace(/\.(png|jpe?g|gif|svg|psd|ai|kra)$/i, '').trim() || 'PhotoMania';
      return `${safeName}.${extension}`;
    }

  protected async chooseExportFileTarget(fileName: string, format: string): Promise<FileSystemFileHandle | null> {
      if (this.exportDirectoryHandle) return null;
      const fileSystemWindow = window as Window & { showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle> };
      if (!fileSystemWindow.showSaveFilePicker) return null;
      const mimeType = this.getExportMimeType(format) as `${string}/${string}`;
      const fileExtension = `.${this.getExportExtension(format)}` as `.${string}`;
      const accept: Record<`${string}/${string}`, `.${string}` | `.${string}`[]> = {};
      accept[mimeType] = [fileExtension];

      return fileSystemWindow.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: `${format.toUpperCase()} file`, accept }],
      });
    }

  protected async encodeExportFormat(format: string, canvas: HTMLCanvasElement): Promise<Uint8Array | Blob> {
      const { width, height } = canvas;
      if (format === 'psd' || format === 'ai' || format === 'gif') {
        const pixels = new Uint8Array(canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, width, height).data);
        if (format === 'psd') return encodePsdComposite(width, height, pixels);
        if (format === 'ai') return encodePdfCompatibleAi(width, height, pixels);
        return encodeGif89a(width, height, pixels);
      }
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const blob = await this.encodeCanvas(canvas, mimeType, Number(this.q<HTMLInputElement>('#export-quality').value) / 100);
      if (format !== 'svg') return blob;
      const pngBytes = new Uint8Array(await blob.arrayBuffer());
      return encodeSvgWithEmbeddedPng(width, height, pngBytes);
    }

  protected encodeCanvas(canvas: HTMLCanvasElement, mimeType: string, quality = 0.92): Promise<Blob> {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error(`El navegador no pudo codificar la imagen como ${mimeType}.`));
        }, mimeType, quality);
      });
    }

  protected getExportMimeType(format: string): string {
      const mimeTypes: Record<string, string> = {
        png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
        psd: 'image/vnd.adobe.photoshop', ai: 'application/pdf',
      };
      return mimeTypes[format] ?? 'application/octet-stream';
    }

  protected async writeExportTarget(
      handle: FileSystemFileHandle | null,
      fileName: string,
      data: Uint8Array | Blob,
      format: string,
    ): Promise<void> {
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type: this.getExportMimeType(format) });
      if (this.exportDirectoryHandle) {
        await this.writeExportToDirectory(this.exportDirectoryHandle, fileName, blob);
        return;
      }
      if (handle) {
        const writable = await handle.createWritable();
        try { await writable.write(blob); await writable.close(); }
        catch (error) { await writable.abort(); throw error; }
        return;
      }
      this.downloadExportBlob(blob, fileName);
      this.q<HTMLElement>('#export-destination-label').textContent = 'El navegador guardó el archivo mediante su mecanismo de descargas.';
    }

  protected async writeExportToDirectory(directory: FileSystemDirectoryHandle, fileName: string, blob: Blob): Promise<void> {
      let permission = await directory.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') permission = await directory.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') throw new Error('No se concedió permiso para escribir en la carpeta seleccionada.');
      let existingFile = false;
      try { await directory.getFileHandle(fileName); existingFile = true; }
      catch (error) { if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error; }
      if (existingFile && !confirm(`Ya existe “${fileName}” en la carpeta elegida. ¿Querés reemplazarlo?`)) {
        throw new DOMException('Exportación cancelada.', 'AbortError');
      }
      const handle = await directory.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      try { await writable.write(blob); await writable.close(); }
      catch (error) { await writable.abort(); throw error; }
    }

  protected downloadExportBlob(blob: Blob, fileName: string): void {
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: fileName });
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

  protected openAnimationTimeline(): void {
      this.closeWorkflowPanel('#animation-render-panel');
      const panel = this.q<HTMLElement>('#animation-timeline-panel');
      panel.hidden = false;
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

  protected flattenOnWhite(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
      const output = this.createSamplingCanvas(width, height);
      const context = output.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la exportación JPEG/AI.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0);
      return output;
    }

  protected bindComicGuideOverlay(): void {
      const canvas = this.root.querySelector<HTMLCanvasElement>('#canvas');
      if (!canvas || !this.root.querySelector('#toggle-comic-guides')) return;
      this.comicGuideOverlay = new ComicGuideOverlayController(this.root, canvas);
    }

  protected bindCanvasEvents(): void {
      const canvas = this.canvas;
      canvas.addEventListener('pointerdown', (event) => this.down(event));
      canvas.addEventListener('pointermove', (event) => this.handleCanvasPointerMove(event));
      canvas.addEventListener('pointerup', (event) => this.up(event));
      canvas.addEventListener('pointercancel', (event) => this.up(event));
      canvas.addEventListener('contextmenu', (event) => {
        if (this.tool !== 'eyedropper') event.preventDefault();
      });
      const stage = this.root.querySelector<HTMLElement>('.canvas-stage')!;
      this.bindCanvasFileDrop(stage);
      stage.addEventListener('wheel', (event) => this.handleCanvasWheel(event), { passive: false });
      new ResizeObserver(() => {
        this.applyCanvasView();
        this.updatePreviewCanvasSize();
        this.scheduleRefresh();
      }).observe(stage);
    }

  private handleCanvasPointerMove(event: PointerEvent): void {
    if (!isCurrentStrokePointer(this.activeStrokePointerId, event.pointerId, this.strokePointerEnded)) return;
    if (!isPenContactSample(event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse', event.buttons, event.pressure)) return;
    if (event.pointerType !== 'pen' || typeof event.getCoalescedEvents !== 'function') {
      this.onPointerMove(event);
      return;
    }

    const coalesced = event.getCoalescedEvents();
    if (!coalesced.length) {
      this.onPointerMove(event);
      return;
    }

    for (const sample of coalesced) {
      if (!isCurrentStrokePointer(this.activeStrokePointerId, sample.pointerId, this.strokePointerEnded)) continue;
      if (!isPenContactSample('pen', sample.buttons, sample.pressure)) continue;
      this.onPointerMove(sample);
    }

    const lastSample = coalesced.at(-1);
    if (lastSample && (lastSample.clientX !== event.clientX || lastSample.clientY !== event.clientY)) {
      this.onPointerMove(event);
    }
  }

  private bindCanvasFileDrop(stage: HTMLElement): void {
    stage.addEventListener('dragenter', (event) => this.handleCanvasFileDragEnter(event, stage));
    stage.addEventListener('dragover', (event) => this.handleCanvasFileDragOver(event));
    stage.addEventListener('dragleave', (event) => this.handleCanvasFileDragLeave(event, stage));
    stage.addEventListener('drop', (event) => this.handleCanvasFileDrop(event, stage));
  }

  private handleCanvasFileDragEnter(event: DragEvent, stage: HTMLElement): void {
    if (!this.isFileDrag(event)) return;
    event.preventDefault();
    stage.classList.add('canvas-stage--file-drop');
  }

  private handleCanvasFileDragOver(event: DragEvent): void {
    if (!this.isFileDrag(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  private handleCanvasFileDragLeave(event: DragEvent, stage: HTMLElement): void {
    const related = event.relatedTarget;
    if (related instanceof Node && stage.contains(related)) return;
    stage.classList.remove('canvas-stage--file-drop');
  }

  private handleCanvasFileDrop(event: DragEvent, stage: HTMLElement): void {
    event.preventDefault();
    stage.classList.remove('canvas-stage--file-drop');
    const files = this.getDroppedImageFiles(event.dataTransfer);
    if (!files.length) {
      this.q<HTMLElement>('#status').textContent = 'Soltá archivos de imagen compatibles sobre el lienzo.';
      return;
    }
    void this.importDroppedImageFiles(files);
  }

  private isFileDrag(event: DragEvent): boolean {
    const transfer = event.dataTransfer;
    if (!transfer) return false;
    return Array.from(transfer.types).includes('Files') || Array.from(transfer.items).some((item) => item.kind === 'file');
  }

  private getDroppedImageFiles(dataTransfer: DataTransfer | null): File[] {
    return Array.from(dataTransfer?.files ?? []).filter((file) => this.isSupportedImageFile(file));
  }

  private isSupportedImageFile(file: File): boolean {
    return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tiff?|svg|avif)$/i.test(file.name);
  }

  private async importDroppedImageFiles(files: File[]): Promise<void> {
    let successful = 0;
    const failedNames: string[] = [];
    for (const file of files) {
      try {
        await this.createFileLayerFromSource({ file, handle: null });
        successful++;
      } catch (error) {
        failedNames.push(file.name);
        console.warn(`No se pudo importar «${file.name}»:`, error);
      }
    }
    this.reportDroppedImageImportResult(files.length, successful, failedNames);
  }

  private reportDroppedImageImportResult(total: number, successful: number, failedNames: string[]): void {
    const status = this.q<HTMLElement>('#status');
    if (!failedNames.length) {
      status.textContent = total === 1 ? 'Imagen importada como capa.' : `${successful} imágenes importadas como capas.`;
      return;
    }
    status.textContent = `${successful} de ${total} imágenes importadas. No se pudieron cargar: ${failedNames.join(', ')}.`;
  }

  protected handleCanvasWheel(event: WheelEvent): void {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        this.zoom = this.getWheelZoom(event.deltaY);
        this.applyCanvasView();
        return;
      }
      if (!this.spaceDown && !event.shiftKey) return;
      event.preventDefault();
      const sensitivity = this.brush.panSensitivity / 100;
      this.panX -= event.deltaX * sensitivity;
      this.panY -= event.deltaY * sensitivity;
      this.applyCanvasView();
    }

  private getWheelZoom(deltaY: number): number {
    const step = Math.max(1.05, Math.min(1.5, this.brush.zoomIncrement));
    const factor = deltaY < 0 ? step : 1 / step;
    return Math.max(0.25, Math.min(8, this.zoom * factor));
  }

  protected bindKeyboardShortcuts(): void {
      window.addEventListener('keydown', (event) => this.handleKeyDown(event));
      window.addEventListener('keyup', (event) => {
        if (event.code === 'Space') this.spaceDown = false;
      });
    }

  protected handleKeyDown(event: KeyboardEvent): void {
      if (this.handleTransformSessionKey(event)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.code.startsWith('Digit') ? event.code.slice(5) : event.key.toLowerCase();
      const target = event.target as HTMLElement | null;
      const typing = this.isTypingTarget(target);
      const insideMenuOrDialog = !!target?.closest('.menus, .preferences-overlay, .editor-panel');
      if (this.shouldTogglePanelsFromKey(event, mod, typing, insideMenuOrDialog)) {
        event.preventDefault();
        this.toggleAllPanels();
        return;
      }
      if (event.code === 'Space' && !typing) {
        event.preventDefault();
        this.spaceDown = true;
        return;
      }
      if (typing && event.key === 'Delete') return;
      if (this.handleDocumentShortcut(event, mod, key)) return;
      this.handleToolShortcut(key, mod, typing, event.shiftKey);
    }

  protected isTypingTarget(target: HTMLElement | null): boolean {
      return !!target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    }

  protected shouldTogglePanelsFromKey(event: KeyboardEvent, mod: boolean, typing: boolean, insideMenuOrDialog: boolean): boolean {
      return event.key === 'Tab' && !event.shiftKey && !mod && !event.altKey && !typing && !insideMenuOrDialog;
    }

  protected revealPanelsWhenAllHidden(entries: PanelVisibilityEntry[], everyPanelHidden: boolean): void {
      if (everyPanelHidden) entries.forEach((entry) => { entry.panel.hidden = false; });
    }

  protected handleDocumentShortcut(event: KeyboardEvent, mod: boolean, key: string): boolean {
      if (!mod) return this.handleLayerFunctionShortcut(event, key);
      if ((key === 'z' || key === 'y') && this.isTypingTarget(event.target as HTMLElement | null)) return false;
      if (key === 'z') return this.handleUndoRedoShortcut(event);
      if (key === 'y') { event.preventDefault(); this.doRedo(); return true; }
      if (key === 't' && event.shiftKey && !event.altKey && !this.isTypingTarget(event.target as HTMLElement | null)) { event.preventDefault(); this.runLayerMenuAction('transform'); return true; }
      if (key === 's') { event.preventDefault(); void this.save(event.shiftKey); return true; }
      if (key === 'o') { event.preventDefault(); void this.open(); return true; }
      if (key === 'n' && !event.shiftKey && !event.altKey) { event.preventDefault(); this.promptNew(); return true; }
      if (key === 'i' && event.altKey) { event.preventDefault(); void this.createFileLayer(); return true; }
      if (key === 'e' && event.altKey && event.shiftKey) { event.preventDefault(); this.openExportPanel('jpeg'); return true; }
      if (key === 'e' && event.shiftKey) { event.preventDefault(); this.openExportPanel(); return true; }
      if (key === 'g' && !event.shiftKey && !event.altKey) { event.preventDefault(); this.groupActiveLayer(); return true; }
      if (key === 'j' && !event.shiftKey && !event.altKey) { event.preventDefault(); this.duplicateActiveLayer(); return true; }
      if (key === 'n' && event.shiftKey && !event.altKey) { event.preventDefault(); void this.createLayerOfType('paint'); return true; }
      if (key === 'n' && event.shiftKey && event.altKey) { event.preventDefault(); void this.createLayerOfType('filter'); return true; }
      if (key === 'f' && event.shiftKey && !event.altKey) { event.preventDefault(); void this.createLayerOfType('fill'); return true; }
      if (key === 'v' && event.shiftKey && event.altKey) { event.preventDefault(); void this.createLayerOfType('vector'); return true; }
      if (key === 't' && event.shiftKey && event.altKey) { event.preventDefault(); void this.createLayerOfType('text'); return true; }
      if (key === 'g' && event.shiftKey && event.altKey) { event.preventDefault(); void this.createLayerOfType('group'); return true; }
      if (key === '1' && event.altKey) return this.togglePanelShortcut(event, '#toggle-panel-advanced');
      if (key === '2' && event.altKey) return this.togglePanelShortcut(event, '#toggle-panel-history');
      if (key === '3' && event.altKey) return this.togglePanelShortcut(event, '#toggle-panel-layers');
      if (key === '4' && event.altKey) return this.togglePanelShortcut(event, '#toggle-panel-timeline');
      if (key === '5' && event.altKey) return this.togglePanelShortcut(event, '#toggle-panel-comic');
      if (key === '6' && event.altKey) return this.togglePanelShortcut(event, '#toggle-panel-storyboard');
      if (key === 'p' && event.altKey && !event.shiftKey) return this.clickMenuAction(event, '#plugins-manage');
      if (key === 'p' && event.altKey && event.shiftKey) return this.clickMenuAction(event, '#plugins-install-menu');
      if (key === ',' && !event.altKey) return this.clickMenuAction(event, '#b-preferences');
      if (key === 'h' && event.shiftKey && !event.altKey) return this.runActiveLayerCommand(event, 'visibility');
      if (key === 'l' && event.shiftKey && !event.altKey) return this.runActiveLayerCommand(event, 'lock');
      if (key === 'k' && event.shiftKey && !event.altKey) return this.runActiveLayerCommand(event, 'effects');
      if (key === 'o' && event.shiftKey && !event.altKey) return this.runActiveLayerCommand(event, 'opacity');
      if (key === 'b' && event.shiftKey && !event.altKey) return this.runActiveLayerCommand(event, 'blend');
      if (key === ']' && !event.shiftKey && !event.altKey) return this.moveActiveLayerFromShortcut(event, 1);
      if (key === '[' && !event.shiftKey && !event.altKey) return this.moveActiveLayerFromShortcut(event, -1);
      return false;
    }

  private handleLayerFunctionShortcut(event: KeyboardEvent, key: string): boolean {
    if (event.key === 'F2') return this.renameActiveLayerFromShortcut(event);
    if (event.key === 'Delete' && !event.altKey) return this.deleteSelectedElementFromShortcut(event);
    return false;
  }

  private renameActiveLayerFromShortcut(event: KeyboardEvent): boolean {
    event.preventDefault();
    const layer = this.active();
    if (layer) this.renameLayer(layer);
    return true;
  }

  private deleteSelectedElementFromShortcut(event: KeyboardEvent): boolean {
    const layer = this.active();
    if (!layer) return false;
    event.preventDefault();
    const preferences = readPreferences();
    if (this.activeMaskId) {
      const maskId = this.activeMaskId;
      this.cancelMaskChanges();
      const currentLayer = this.ctl.find(layer.id);
      const maskExists = currentLayer?.masks?.some((mask) => mask.id === maskId) ?? false;
      if (!maskExists) return true;
      const changed = preferences.maskDeleteBehavior === 'clear'
        ? this.ctl.clearMaskContent(layer.id, maskId)
        : this.ctl.removeMask(layer.id, maskId);
      if (!changed) return true;
      this.activeMaskId = preferences.maskDeleteBehavior === 'remove' ? '' : maskId;
      this.refreshAfterLayerPropertyChange();
      this.q<HTMLElement>('#status').textContent = preferences.maskDeleteBehavior === 'clear'
        ? 'Se borró el contenido de la máscara.'
        : 'Se eliminó la máscara.';
      return true;
    }
    if (preferences.layerDeleteBehavior === 'remove') {
      this.deleteActiveLayer();
      return true;
    }
    if (!this.ctl.clearLayerContent(layer.id)) {
      this.q<HTMLElement>('#status').textContent = 'No se puede borrar el contenido de este tipo de capa.';
      return true;
    }
    this.activeMaskId = '';
    this.refreshAfterLayerPropertyChange();
    this.q<HTMLElement>('#status').textContent = `Se borró el contenido de «${layer.name}».`;
    return true;
  }

  private togglePanelShortcut(event: KeyboardEvent, selector: string): boolean {
    event.preventDefault();
    this.q<HTMLButtonElement>(selector).click();
    return true;
  }

  private clickMenuAction(event: KeyboardEvent, selector: string): boolean {
    event.preventDefault();
    this.q<HTMLButtonElement>(selector).click();
    return true;
  }

  private runActiveLayerCommand(event: KeyboardEvent, action: LayerMenuCommand): boolean {
    event.preventDefault();
    this.runLayerMenuAction(action);
    return true;
  }

  private moveActiveLayerFromShortcut(event: KeyboardEvent, delta: number): boolean {
    event.preventDefault();
    if (this.active()) this.moveActive(delta);
    return true;
  }

  private handleUndoRedoShortcut(event: KeyboardEvent): boolean {
    event.preventDefault();
    if (event.shiftKey) this.doRedo();
    else this.doUndo();
    return true;
  }

  protected handleToolShortcut(key: string, mod: boolean, typing: boolean, shift = false): void {
      if (mod || typing) return;
      const tools: Record<string, Tool> = {
        b: 'brush', q: 'pen', y: 'pencil', a: 'airbrush', x: 'decoration', e: 'eraser', i: 'eyedropper', l: 'line', r: 'rectangle',
        o: 'ellipse', g: 'fill', h: 'hand', m: 'move', t: 'text', v: 'vector-select', c: 'clone-stamp', p: 'comic-panel', d: 'gradient', j: 'smudge', k: 'liquify',
        'shift+e': 'vector-eraser', 'shift+u': 'dust-removal', 'shift+t': 'vector-line-correction', 'shift+w': 'speech-bubble', 'shift+f': 'flash',
        'shift+o': 'vector-parallel-lines', 'shift+p': 'vector-radial-lines',
        'shift+r': 'select-rectangle', 'shift+q': 'select-ellipse', 'shift+l': 'select-lasso', 'shift+m': 'magic-wand', 'shift+x': 'selection-clear',
        'shift+1': 'select-polygon', 'shift+2': 'selection-brush', 'shift+3': 'selection-erase',
        '1': 'pixel-rounded-rectangle', '2': 'pixel-polyline', '3': 'pixel-bezier', '4': 'pixel-polygon', '5': 'pixel-star', '6': 'pixel-spiral',
        '7': 'vector-rectangle', '8': 'vector-rounded-rectangle', '9': 'vector-ellipse', '0': 'vector-line',
        'shift+z': 'vector-polyline', 'shift+n': 'vector-pen', 'shift+s': 'vector-polygon', 'shift+g': 'vector-star',
        'shift+d': 'vector-spiral', 'shift+c': 'vector-freehand',
      };
      const shortcut = shift ? `shift+${key}` : key;
      const tool = tools[shortcut] ?? tools[key];
      if (tool) this.setTool(tool);
    }

  protected createPluginApiContext(): Partial<PluginApi> {
      const collectLayers = (nodes: LayerNode[]): LayerNode[] => nodes.flatMap((node) => [node, ...collectLayers(node.children)]);
      return {
        getDocumentInfo: () => this.ctl ? ({ name: this.ctl.doc.name, width: this.ctl.doc.width, height: this.ctl.doc.height, activeLayerId: this.activeId || null }) : null,
        getLayers: () => this.ctl ? collectLayers(this.ctl.doc.layers).map((layer) => ({ id: layer.id, name: layer.name, type: layer.type, visible: layer.visible, locked: layer.locked, opacity: layer.opacity })) : [],
        createLayer: (type, name) => {
          if (!this.ctl) return null;
          try {
            const node = this.ctl.addLayerAbove(type, name, this.activeId);
            this.activateCreatedLayer(node); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
            return { id: node.id, name: node.name, type: node.type };
          } catch (error) { this.fail(error); return null; }
        },
        renameLayer: (id, name) => {
          if (!this.ctl || !name.trim()) return false;
          const done = this.ctl.setProps(id, { name: name.trim().slice(0, 120) });
          if (done) { this.syncUI(); this.updateHistoryUI(); }
          return done;
        },
        setLayerProperties: (id, properties) => {
          if (!this.ctl) return false;
          const patch = { ...properties };
          if (patch.opacity !== undefined) patch.opacity = Math.max(0, Math.min(1, patch.opacity));
          const done = this.ctl.setProps(id, patch);
          if (done) { this.ctl.comp.invalidateAll(); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh(); }
          return done;
        },
      };
    }

  protected beginVectorGesture(point: { x: number; y: number }, event: PointerEvent): void {
      const layer = this.active();
      if (!layer || layer.type !== 'vector') { this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa vectorial.'; return; }
      if (this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id)) { this.q<HTMLElement>('#status').textContent = 'La capa vectorial está bloqueada u oculta.'; return; }
      const shapes = layer.vectorShapes ?? [];
      const target = findVectorSelectionTarget(
        point,
        shapes,
        (shape) => Math.max(5, shape.strokeWidth / 2),
      );
      if (!target) {
        this.vectorDirectSelectedId = null; this.clearToolPreview();
        this.q<HTMLElement>('#status').textContent = this.getVectorHitMissMessage(shapes.length);
        return;
      }
      const { shape: hit, mode } = target;
      const copy = cloneVectorShape(hit);
      this.vectorDirectSelectedId = hit.id;
      this.vectorGesture = { layerId: layer.id, shapeId: hit.id, mode, startPoint: point, original: copy, latest: cloneVectorShape(copy), moved: false };
      this.canvas.setPointerCapture(event.pointerId);
      this.drawVectorSelectionOverlay(copy);
      this.q<HTMLElement>('#status').textContent = `${this.vectorKindLabel(hit.kind)} seleccionado · ${mode === 'resize' ? 'redimensionar' : 'arrastrar para mover'}`;
    }

  private getVectorHitMissMessage(shapeCount: number): string {
    if (shapeCount > 0) return 'No se encontró un objeto en esa posición.';
    return 'La capa está vacía. Usá “Editar vectores…” para agregar formas.';
  }

  protected transformVectorShape(original: VectorShape, dx: number, dy: number, mode: 'move' | 'resize'): VectorShape {
      const clone = cloneVectorShape(original);
      if (mode === 'move') {
        clone.x = original.x + dx; clone.y = original.y + dy;
        clone.points = this.moveVectorPoints(clone.points, dx, dy);
        return clone;
      }
      return this.resizeVectorShapeToFrame(original, clone, dx, dy);
    }

  private resizeVectorShapeToFrame(original: VectorShape, clone: VectorShape, dx: number, dy: number): VectorShape {
      const source = getVectorShapeBounds(original);
      let nextWidth = Math.max(1, source.width + dx);
      let nextHeight = Math.max(1, source.height + dy);
      const aspectRatio = source.width / Math.max(1, source.height);
      const widthChange = Math.abs(dx / Math.max(1, source.width));
      const heightChange = Math.abs(dy / Math.max(1, source.height));
      if (this.brush.vectorKeepAspectRatio && widthChange >= heightChange) nextHeight = Math.max(1, nextWidth / aspectRatio);
      if (this.brush.vectorKeepAspectRatio && widthChange < heightChange) nextWidth = Math.max(1, nextHeight * aspectRatio);
      const target = { x: source.x, y: source.y, width: nextWidth, height: nextHeight };
      const points = original.points ?? this.createLineResizePoints(original);
      clone.points = remapVectorPoints(points, source, target);
      Object.assign(clone, target);
      this.scaleVectorTextSize(original, clone, nextWidth / source.width, nextHeight / source.height);
      return clone;
    }

  private createLineResizePoints(shape: VectorShape): NonNullable<VectorShape['points']> | undefined {
      if (shape.kind !== 'line') return undefined;
      return [{ x: shape.x, y: shape.y }, { x: shape.x + shape.width, y: shape.y + shape.height }];
    }

  private scaleVectorTextSize(original: VectorShape, clone: VectorShape, scaleX: number, scaleY: number): void {
      if (clone.kind !== 'text') return;
      clone.fontSize = Math.max(1, (original.fontSize ?? 64) * Math.min(scaleX, scaleY));
    }

  protected moveVectorPoints(
      points: VectorShape['points'],
      dx: number,
      dy: number,
    ): VectorShape['points'] {
      return points?.map((point) => ({
        ...point, x: point.x + dx, y: point.y + dy,
        ...(point.inX !== undefined ? { inX: point.inX + dx } : {}), ...(point.inY !== undefined ? { inY: point.inY + dy } : {}),
        ...(point.outX !== undefined ? { outX: point.outX + dx } : {}), ...(point.outY !== undefined ? { outY: point.outY + dy } : {}),
      }));
    }

  protected resizeVectorPoints(
      points: VectorShape['points'],
      original: VectorShape,
      sx: number,
      sy: number,
    ): VectorShape['points'] {
      const source = getVectorShapeBounds(original);
      const target = { ...source, width: Math.max(1, source.width * sx), height: Math.max(1, source.height * sy) };
      return remapVectorPoints(points, source, target);
    }

  protected updateVectorGesture(point: { x: number; y: number }): void {
      const gesture = this.vectorGesture; if (!gesture) return;
      const dx = point.x - gesture.startPoint.x, dy = point.y - gesture.startPoint.y;
      const localDelta = gesture.mode === 'resize'
        ? vectorDeltaToLocal(dx, dy, gesture.original.rotation ?? 0)
        : { x: dx, y: dy };
      gesture.moved = gesture.moved || Math.hypot(dx, dy) > 1;
      gesture.latest = this.transformVectorShape(gesture.original, localDelta.x, localDelta.y, gesture.mode);
      this.drawVectorSelectionOverlay(gesture.latest);
    }

  protected finishVectorGesture(point: { x: number; y: number }): void {
      const gesture = this.vectorGesture; if (!gesture) return;
      this.updateVectorGesture(point);
      this.vectorGesture = null;
      const layer = this.ctl.find(gesture.layerId);
      if (layer?.type === 'vector' && gesture.moved) {
        const shapes = cloneVectorShapes(layer.vectorShapes).map((shape) => shape.id === gesture.shapeId ? gesture.latest : shape);
        this.commitVectorShapes(layer, shapes);
      }
      this.vectorDirectSelectedId = gesture.shapeId;
      this.drawVectorSelectionOverlay(gesture.latest);
    }

  protected drawVectorSelectionOverlay(shape: VectorShape): void {
      this.updatePreviewCanvasSize();
      const preview = this.q<HTMLCanvasElement>('#tool-preview'); const ctx = preview.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, preview.width, preview.height);
      const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const stageRect = this.q<HTMLElement>('.canvas-stage').getBoundingClientRect();
      const canvasRect = this.canvas.getBoundingClientRect();
      const display = getDocumentDisplayTransform(stageRect, canvasRect, this.ctl.doc.width, this.ctl.doc.height);
      const frame = getVectorSelectionFrame(shape);
      const centerX = display.left + frame.centerX * display.scale;
      const centerY = display.top + frame.centerY * display.scale;
      const width = frame.width * display.scale;
      const height = frame.height * display.scale;
      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(frame.rotation * Math.PI / 180);
      ctx.strokeStyle = '#c92334';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(-width / 2, -height / 2, width, height);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#c92334';
      ctx.lineWidth = 1.25;
      const halfWidth = width / 2;
      const halfHeight = height / 2;
      const points = [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [-halfWidth, halfHeight], [halfWidth, halfHeight]];
      points.forEach(([x, y]) => { ctx.fillRect(x - 3.5, y - 3.5, 7, 7); ctx.strokeRect(x - 3.5, y - 3.5, 7, 7); });
      ctx.restore();
    }

  protected moveActive(delta: number): void {
      if (this.stroke || !this.active()) return;
      if (this.ctl.moveLayer(this.activeId, delta)) {
        this.ctl.comp.invalidateAll();
        this.renderLayers();
        this.scheduleRefresh(); this.updateHistoryUI();
      }
    }

  protected setTool(t: Tool): void {
      if (this.stroke || this.isPanning) return;
      const definition = this.toolManager.getDefinition(t);
      const layer = this.ensureToolTargetLayer(t, definition.target);
      if (definition.target !== 'any' && !layer) {
        this.reportUnavailableToolTarget(definition.target, this.active());
        return;
      }
      this.tool = t;
      this.applyDefaultBrushPresetForTool(t);
      this.vectorGesture = null; this.vectorDrawGesture = null; this.vectorDirectSelectedId = null;
      this.renderToolOptions();
      this.renderAdvancedToolOptions();
      this.applyCanvasView();
      this.clearToolPreview();
    }

  private ensureToolTargetLayer(tool: Tool, target: ToolTarget): LayerNode | undefined {
    if (target === 'any') return this.active();
    const active = this.active();
    if (this.isUsableToolLayer(active, target)) return active;

    if (tool === 'vector-select') return this.activateEditableVectorLayer(target);

    // No reutilizar una capa compatible que pueda estar debajo de la capa activa:
    // el resultado del trazo quedaría oculto por la imagen, texto o vector superior.
    const created = this.createToolTargetLayer(target, active);
    this.activateCreatedLayer(created);
    this.syncUI();
    this.updateHistoryUI();
    this.scheduleRefresh();
    this.q<HTMLElement>('#status').textContent = target === 'raster'
      ? 'Se creó una capa de pintura para la herramienta seleccionada.'
      : 'Se creó una capa vectorial para la herramienta seleccionada.';
    return created;
  }

  private isUsableToolLayer(layer: LayerNode | undefined, target: ToolTarget): layer is LayerNode {
    if (!layer) return false;
    if (target === 'any') return true;
    const matchesTarget = target === 'raster'
      ? layer.type === 'paint' || layer.type === 'raster'
      : layer.type === 'vector';
    if (!matchesTarget) return false;
    return this.ctl.isEffectivelyVisible(layer.id) && !this.ctl.isEffectivelyLocked(layer.id);
  }

  private activateEditableVectorLayer(target: ToolTarget): LayerNode | undefined {
    const existing = this.findEditableToolLayer(this.ctl.doc.layers, target);
    if (!existing) return undefined;
    this.activateCreatedLayer(existing);
    this.syncUI();
    this.q<HTMLElement>('#status').textContent = `Se seleccionó «${existing.name}» para editar sus objetos.`;
    return existing;
  }

  private findEditableToolLayer(nodes: LayerNode[], target: ToolTarget): LayerNode | undefined {
    return [...nodes].reverse()
      .map((node) => node.type === 'group'
        ? this.findEditableToolLayer(node.children, target)
        : this.isUsableToolLayer(node, target) ? node : undefined)
      .find((candidate): candidate is LayerNode => Boolean(candidate));
  }

  private createToolTargetLayer(target: ToolTarget, active: LayerNode | undefined): LayerNode {
    const type = target === 'raster' ? 'paint' : 'vector';
    const name = target === 'raster' ? 'Pintura' : 'Vectorial';
    const canInsertAbove = Boolean(active
      && this.ctl.isEffectivelyVisible(active.id)
      && !this.ctl.isEffectivelyLocked(active.id));
    if (canInsertAbove && active) return this.ctl.addLayerAbove(type, name, active.id);
    return this.ctl.addLayer(type, name);
  }

  private reportUnavailableToolTarget(target: string, layer: LayerNode | undefined): void {
    if (target === 'vector') return this.reportVectorToolUnavailable();
    this.reportPaintToolUnavailable(layer);
  }

  protected reportVectorToolUnavailable(): void {
      const status = this.root.querySelector<HTMLElement>('#status');
      if (status) status.textContent = 'Seleccioná una capa vectorial visible y desbloqueada para editar sus objetos directamente.';
    }

  protected reportPaintToolUnavailable(layer: LayerNode | undefined): void {
      const status = this.root.querySelector<HTMLElement>('#status');
      if (!status) return;
      status.textContent = this.getPaintToolUnavailableMessage(layer);
    }

  private getPaintToolUnavailableMessage(layer: LayerNode | undefined): string {
    if (!layer) return 'Creá o seleccioná una capa de pintura para usar esta herramienta';
    if (layer.locked || this.ctl.isEffectivelyLocked(layer.id)) return 'La capa está bloqueada';
    if (!this.ctl.isEffectivelyVisible(layer.id)) return 'La capa está oculta';
    return `${this.layerTypeLabel(layer.type)}: seleccioná una capa de pintura para dibujar`;
  }

  protected promptNew(): void {
      if (this.blockForUnappliedMaskChanges('crear un documento nuevo')) return;
      const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/.exec(prompt('Tamaño (ancho x alto)', '1280x720') ?? '');
      if (!m) return;
      const [w, h] = [Number(m[1]), Number(m[2])];
      if (w > 8192 || h > 8192) { alert('Máximo 8192×8192.'); return; }
      this.newDocument(w, h, 'Sin título');
    }
}
