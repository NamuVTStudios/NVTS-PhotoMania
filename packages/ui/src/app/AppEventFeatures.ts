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
import { ComicGuideOverlayController } from '../features/comics/ComicGuideOverlay';
import type { WorkspaceId } from '../workspaces';
import type { Tool, MenuEntry, PanelVisibilityEntry } from './AppBase';

export abstract class AppEventFeatures extends AppVectorFeatures {
  protected bind(): void {
      this.bindPluginAndLayerPanels();
      this.wireComicManager();
      this.initializeToolPanels();
      this.bindMenuDropdowns();
      this.bindWorkspaceSelector();
      this.bindPanelVisibilityMenu();
      this.bindToolAndViewControls();
      this.bindEditorPanels();
      this.bindFileToolbar();
      this.bindMaskControls();
      this.bindCanvasEvents();
      this.bindComicGuideOverlay();
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
          if ((event.target as HTMLElement).closest('button[role^="menuitem"]')) this.closeMenu(menu);
        });
        menu.dropdown.addEventListener('keydown', (event) => {
          if (event.key !== 'Escape') return;
          this.closeMenu(menu);
          menu.button.focus();
        });
      }
      document.addEventListener('pointerdown', (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        menus.forEach((menu) => {
          if (!menu.dropdown.contains(target) && !menu.button.contains(target)) this.closeMenu(menu);
        });
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
      this.bindToolButtons();
      this.bindZoomButtons();
      this.bindClosePanelControls();
    }

  protected bindToolButtons(): void {
      const on = (id: string, fn: () => void) => { this.q(id).onclick = fn; };
      on('#menu-filter', () => this.openDestructiveFilterPanel());
      this.bindLayerMenuActions();
      on('#rail-hand', () => this.setTool('hand'));
      on('#rail-brush', () => this.setTool('brush'));
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
    }

  protected runLayerMenuAction(action: string): void {
      const layer = this.active();
      if (action === 'new-paint') { void this.createLayerOfType('paint'); return; }
      if (!layer) { this.reportLayerDeletionBlockReason('Seleccioná una capa primero.'); return; }
      if (action === 'duplicate') { this.duplicateActiveLayer(); return; }
      if (action === 'rename') { this.renameLayer(layer); return; }
      if (action === 'move-up') { this.moveActive(1); return; }
      if (action === 'move-down') { this.moveActive(-1); return; }
      if (action === 'delete') { this.deleteActiveLayer(); return; }
      if (action === 'effects') { this.openLayerEffectsEditor(layer); return; }
      if (action === 'visibility') { this.ctl.setProps(layer.id, { visible: !layer.visible }); this.refreshAfterLayerPropertyChange(); return; }
      if (action === 'lock') { this.ctl.setProps(layer.id, { locked: !layer.locked }); this.refreshAfterLayerPropertyChange(); return; }
      if (action === 'opacity') { this.promptLayerOpacity(layer.opacity); return; }
      if (action === 'blend') { this.promptLayerBlendMode(layer.blendMode); }
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
    if (target === 'effects-panel') return this.hideRightEditors();
    this.q<HTMLElement>('#' + target).hidden = true;
  }

  protected applyLayerStyleSettings(): void {
    const layer = this.active();
    const style = this.layerEffectsPanel?.getStyle();
    if (!layer || !style) return;
    this.ctl.setLayerAppearance(layer.id, style);
    this.activeMaskId = layer.masks?.find((mask) => mask.type === 'styles')?.id ?? '';
    this.refreshAfterLayerPropertyChange();
    this.hideRightEditors();
  }

  protected bindEditorPanels(): void {
      this.filterPanel = wireFilterPanel(this.root, {
        labelForFilter: (kind) => this.filterLabel(kind),
        applyFilter: () => this.applyFilterDialog(),
      });
      this.layerEffectsPanel = wireLayerEffectsPanel(this.root, (layerId) => {
        const layer = this.ctl.find(layerId);
        if (layer) this.openLayerEffectsEditor(layer);
      }, () => this.applyLayerStyleSettings());
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
      this.q('#b-export-png').onclick = () => { void this.exportVisibleImage('image/png'); };
      this.q('#b-export-jpeg').onclick = () => { void this.exportVisibleImage('image/jpeg'); };
    }

  protected async exportVisibleImage(mimeType: 'image/png' | 'image/jpeg'): Promise<void> {
      if (this.stroke) return;
      try {
        const { width, height, name } = this.ctl.doc;
        const composition = this.createSamplingCanvas(width, height);
        this.composeSamplingLayers(this.ctl.doc.layers, composition, width, height, (layer) => this.ctl.readPixels(layer));
        const output = mimeType === 'image/jpeg' ? this.flattenOnWhite(composition, width, height) : composition;
        const blob = await this.encodeCanvas(output, mimeType);
        this.downloadRaster(blob, name, mimeType);
        this.q<HTMLElement>('#status').textContent = `Exportado como ${mimeType === 'image/png' ? 'PNG' : 'JPEG'} · ${width}×${height}`;
      } catch (error) {
        this.fail(error);
      }
    }

  protected flattenOnWhite(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
      const output = this.createSamplingCanvas(width, height);
      const context = output.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la exportación JPEG.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0);
      return output;
    }

  protected encodeCanvas(canvas: HTMLCanvasElement, mimeType: string): Promise<Blob> {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error(`El navegador no pudo codificar la imagen como ${mimeType}.`));
        }, mimeType, mimeType === 'image/jpeg' ? 0.92 : undefined);
      });
    }

  protected downloadRaster(blob: Blob, documentName: string, mimeType: 'image/png' | 'image/jpeg'): void {
      const extension = mimeType === 'image/png' ? 'png' : 'jpg';
      const safeName = documentName.replace(/[\\/:*?"<>|]/g, '_').trim() || 'PhotoMania';
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: `${safeName}.${extension}` });
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

  protected bindComicGuideOverlay(): void {
      const canvas = this.root.querySelector<HTMLCanvasElement>('#canvas');
      if (!canvas || !this.root.querySelector('#toggle-comic-guides')) return;
      new ComicGuideOverlayController(this.root, canvas);
    }

  protected bindCanvasEvents(): void {
      const canvas = this.canvas;
      canvas.addEventListener('pointerdown', (event) => this.down(event));
      canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
      canvas.addEventListener('pointerup', (event) => this.up(event));
      canvas.addEventListener('pointercancel', (event) => this.up(event));
      canvas.addEventListener('contextmenu', (event) => {
        if (this.tool !== 'eyedropper') event.preventDefault();
      });
      const stage = this.root.querySelector<HTMLElement>('.canvas-stage')!;
      stage.addEventListener('wheel', (event) => this.handleCanvasWheel(event), { passive: false });
      new ResizeObserver(() => {
        this.updatePreviewCanvasSize();
        this.scheduleRefresh();
      }).observe(stage);
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
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
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
      if (this.handleDocumentShortcut(event, mod, key)) return;
      this.handleToolShortcut(key, mod, typing);
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
      if (!mod) return false;
      if (key === 'z') return this.handleUndoRedoShortcut(event);
      if (key === 'y') { event.preventDefault(); this.doRedo(); return true; }
      if (key === 's') { event.preventDefault(); void this.save(event.shiftKey); return true; }
      if (key === 'o') { event.preventDefault(); void this.open(); return true; }
      if (key === 'n') { event.preventDefault(); this.promptNew(); return true; }
      return false;
    }

  private handleUndoRedoShortcut(event: KeyboardEvent): boolean {
    event.preventDefault();
    if (event.shiftKey) this.doRedo();
    else this.doUndo();
    return true;
  }

  protected handleToolShortcut(key: string, mod: boolean, typing: boolean): void {
      if (mod || typing) return;
      const tools: Record<string, Tool> = {
        b: 'brush', e: 'eraser', i: 'eyedropper', l: 'line', r: 'rectangle',
        o: 'ellipse', g: 'fill', h: 'hand', t: 'text', v: 'vector-select', c: 'clone-stamp', p: 'comic-panel', d: 'gradient', j: 'smudge', k: 'liquify',
      };
      const tool = tools[key];
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
            const node = this.ctl.addLayer(type, name);
            this.activeId = node.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
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
      const layer = this.active();
      const layerType = layer?.type ?? null;
      const definition = this.toolManager.getDefinition(t);
      if (!this.toolManager.canUseLayer(t, layerType)) return this.reportUnavailableToolTarget(definition.target, layer);
      if (this.hasUnavailableToolLayer(definition.target, layer)) return this.reportUnavailableToolTarget(definition.target, layer);
      this.tool = t;
      this.vectorGesture = null; this.vectorDrawGesture = null; this.vectorDirectSelectedId = null;
      this.renderToolOptions();
      this.renderAdvancedToolOptions();
      this.applyCanvasView();
      this.clearToolPreview();
    }

  private hasUnavailableToolLayer(target: string, layer: LayerNode | undefined): boolean {
    if (target === 'any' || !layer) return false;
    return this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id);
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
      const m = /^(\d{2,5})\s*[x×]\s*(\d{2,5})$/.exec(prompt('Tamaño (ancho x alto)', '1280x720') ?? '');
      if (!m) return;
      const [w, h] = [Number(m[1]), Number(m[2])];
      if (w > 8192 || h > 8192) { alert('Máximo 8192×8192.'); return; }
      this.newDocument(w, h, 'Sin título');
    }
}
