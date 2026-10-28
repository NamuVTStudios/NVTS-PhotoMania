// Layer operations and linked image management.
import { AppLayerStateFeatures } from './AppLayerStateFeatures';
import { renderFilteredImage } from '@nvts/image-processing';
import { runEdit, type LayerNode } from '@nvts/document-model';
import { FILTER_KINDS, getLayerMaskLabel, isPixelLayerType, type FilterKind, type LayerMask, type LayerType } from '@nvts/shared';
import { renderLayersPanel } from '../panels/LayersPanel';
import { renderLayerMaskEditor } from '../panels/LayerMaskEditor';
import { FILTER_LABELS } from '../panels/FilterCatalog';
import { rememberLinkedFile, getLinkedFile } from '@nvts/storage';
import type { LayerContextAction, LayerBehavior } from './AppBase';
import { documentNameFromFile } from './AppUtilities';

export abstract class AppLayerPanelFeatures extends AppLayerStateFeatures {
  protected bindMaskControls(): void {
      const manager = this.q<HTMLElement>('.layer-mask-manager');
      manager.addEventListener('click', (event) => this.handleMaskClick(event));
      manager.addEventListener('change', (event) => this.handleMaskChange(event));
    }

  protected addMaskToActiveLayer(type: LayerMask['type']): void {
      const layer = this.active();
      if (!layer) {
        this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa antes de añadir una máscara.';
        return;
      }
      const mask = this.ctl.addMask(layer.id, type);
      if (!mask) return;
      this.activeMaskId = mask.id;
      this.q<HTMLDetailsElement>('.layer-mask-manager').open = true;
      this.finishMaskEdit(`Se añadió máscara de ${getLayerMaskLabel(mask.type)}.`);
      if (mask.type === 'filter') this.openFilterMaskEditor(layer, mask.id);
    }

  protected handleMaskClick(event: Event): void {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      const layer = this.active();
      if (!button || !layer) return;
      const editFilterMask = button.dataset.editMaskFilter;
      if (editFilterMask) {
        this.openFilterMaskEditor(layer, editFilterMask, Number(button.dataset.filterIndex));
        return;
      }
      const editStyleMask = button.dataset.editStyleMask;
      if (editStyleMask) {
        this.openLayerEffectsEditor(layer);
        return;
      }
      const deleteMask = button.dataset.deleteMask;
      if (deleteMask && this.ctl.removeMask(layer.id, deleteMask)) {
        this.activeMaskId = '';
        this.finishMaskEdit('Se eliminó la máscara.');
        return;
      }
      const removeFilter = button.dataset.removeMaskFilter;
      if (removeFilter) {
        const index = Number(button.dataset.filterIndex);
        this.updateMaskField(layer.id, removeFilter, (mask) => mask.type === 'filter'
          ? { ...mask, filters: mask.filters.filter((_, filterIndex) => filterIndex !== index) }
          : mask);
        return;
      }
      const clearColorize = button.dataset.clearColorize;
      if (clearColorize) {
        this.updateMaskField(layer.id, clearColorize, (mask) => mask.type === 'colorize' ? { ...mask, strokes: [] } : mask);
        return;
      }
      if (button.dataset.updateColorize) {
        this.colorizeOutputCache.clear();
        this.scheduleRefresh();
        return;
      }
      const addFilterMask = button.dataset.addMaskFilter;
      if (!addFilterMask) return;
      const currentMask = layer.masks?.find((mask) => mask.id === addFilterMask && mask.type === 'filter');
      if (!currentMask || currentMask.type !== 'filter') return;
      const newIndex = currentMask.filters.length;
      this.updateMaskField(layer.id, addFilterMask, (mask) => mask.type === 'filter'
        ? { ...mask, filters: [...mask.filters, { kind: 'grayscale', strength: 1 }] }
        : mask);
      this.openFilterMaskEditor(layer, addFilterMask, newIndex);
    }

  protected handleMaskChange(event: Event): void {
      const control = event.target as HTMLInputElement | HTMLSelectElement;
      const layer = this.active();
      if (!layer || !control.dataset.maskId) return;
      const maskId = control.dataset.maskId;
      if (control.dataset.maskField === 'enabled' && control instanceof HTMLInputElement) {
        this.updateMaskField(layer.id, maskId, (mask) => ({ ...mask, enabled: control.checked }));
        return;
      }
      if (control.dataset.filterIndex !== undefined) {
        this.updateFilterMaskControl(layer.id, maskId, Number(control.dataset.filterIndex), control);
        return;
      }
      if (control.dataset.maskField?.startsWith('transform.')) {
        this.updateTransformMaskControl(layer.id, maskId, control as HTMLInputElement);
        return;
      }
      if (control.dataset.maskField?.startsWith('colorize.')) this.updateColorizeMaskControl(layer.id, maskId, control as HTMLInputElement);
    }

  protected updateMaskField(layerId: string, maskId: string, update: (mask: LayerMask) => LayerMask): void {
      if (this.ctl.updateMask(layerId, maskId, update)) this.finishMaskEdit('Se actualizaron las opciones de la máscara.');
    }

  protected updateTransformMaskControl(layerId: string, maskId: string, control: HTMLInputElement): void {
      const property = control.dataset.maskField?.replace('transform.', '') as 'offsetX' | 'offsetY' | 'scaleX' | 'scaleY' | 'rotation' | 'shearX' | 'shearY';
      const value = Number(control.value);
      if (!Number.isFinite(value) || ((property === 'scaleX' || property === 'scaleY') && value === 0)) return;
      this.updateMaskField(layerId, maskId, (mask) => mask.type === 'transform' ? { ...mask, [property]: value } : mask);
    }

  protected updateColorizeMaskControl(layerId: string, maskId: string, control: HTMLInputElement): void {
    const property = control.dataset.maskField?.replace('colorize.', '');
    this.updateMaskField(layerId, maskId, (mask) => this.createUpdatedColorizeMask(mask, property, control));
  }

  private createUpdatedColorizeMask(
    mask: LayerMask, property: string | undefined, control: HTMLInputElement,
  ): LayerMask {
    if (mask.type !== 'colorize') return mask;
    if (property === 'editStrokes') return { ...mask, editStrokes: control.checked };
    if (property === 'showOutput') return { ...mask, showOutput: control.checked };
    if (property === 'limitToLayerBounds') return { ...mask, limitToLayerBounds: control.checked };
    if (property === 'gapClose') return { ...mask, gapClose: Number(control.value) };
    if (property === 'threshold') return { ...mask, threshold: Number(control.value) / 100 };
    if (property === 'transparentColor') return this.updateTransparentColorMask(mask, control);
    return mask;
  }

  private updateTransparentColorMask(
    mask: Extract<LayerMask, { type: 'colorize' }>, control: HTMLInputElement,
  ): LayerMask {
    const colors = new Set(mask.transparentColors);
    const color = control.dataset.maskColor ?? '';
    this.updateTransparentColorSet(colors, color, control.checked);
    return { ...mask, transparentColors: [...colors] };
  }

  private updateTransparentColorSet(colors: Set<string>, color: string, checked: boolean): void {
    if (checked) colors.add(color);
    else colors.delete(color);
  }

  protected updateFilterMaskControl(layerId: string, maskId: string, index: number, control: HTMLInputElement | HTMLSelectElement): void {
      this.updateMaskField(layerId, maskId, (mask) => {
        if (mask.type !== 'filter' || !mask.filters[index]) return mask;
        const filter = { ...mask.filters[index] };
        if (control instanceof HTMLSelectElement) filter.kind = control.value as FilterKind;
        else filter.strength = Number(control.value) / 100;
        return { ...mask, filters: mask.filters.map((current, currentIndex) => currentIndex === index ? filter : current) };
      });
    }

  protected finishMaskEdit(message: string): void {
      this.colorizeOutputCache.clear();
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = message;
    }

  protected renderLayerMasks(): void {
      const container = this.root.querySelector<HTMLElement>('#layer-mask-list');
      if (!container) return;
      const layer = this.active();
      const mask = layer?.masks?.find((candidate) => candidate.id === this.activeMaskId);
      renderLayerMaskEditor(container, mask, { filterKinds: this.filterKinds(), filterLabel: (kind) => this.filterLabel(kind) });
    }

  protected filterKinds(): FilterKind[] {
      return [...FILTER_KINDS];
    }

  protected renderLayers(): void {
      renderLayersPanel(this.root, this.ctl.doc.layers, this.activeId, this.activeMaskId, {
        getTypeLabel: (type) => this.layerTypeLabel(type),
        getTypeIcon: (type) => this.layerTypeIcon(type),
        drawThumbnail: (canvas, layer) => this.drawLayerThumbnail(canvas, layer),
        onVisibilityChange: (layer, visible) => {
          this.ctl.setProps(layer.id, { visible });
          this.ctl.comp.invalidateAll(); this.renderLayers(); this.updateHistoryUI(); this.scheduleRefresh();
        },
        onRenameOrEdit: (layer) => this.editLayerByType(layer),
        onOpenEffects: (layer) => this.openLayerEffectsEditor(layer),
        onToggleLock: (layer) => {
          this.ctl.setProps(layer.id, { locked: !layer.locked });
          this.syncUI(); this.updateHistoryUI();
        },
        onSelect: (layer) => {
          this.activeId = layer.id;
          this.activeMaskId = '';
          this.syncUI();
        },
        onSelectMask: (layer, mask) => {
          this.activeId = layer.id;
          this.activeMaskId = mask.id;
          this.syncUI();
          if (mask.type === 'filter') {
            this.openFilterMaskEditor(layer, mask.id);
            return;
          }
          if (mask.type === 'styles') {
            this.openLayerEffectsEditor(layer);
            return;
          }
          this.hideRightEditors();
          this.q<HTMLDetailsElement>('.layer-mask-manager').open = true;
        },
        onToggleMask: (layer, mask, enabled) => {
          this.ctl.updateMask(layer.id, mask.id, (current) => ({ ...current, enabled }));
          this.finishMaskEdit(enabled ? 'Se activó la máscara.' : 'Se desactivó la máscara.');
        },
        onContextMenu: (layer, x, y) => { this.activeId = layer.id; this.activeMaskId = ''; this.syncUI(); this.showLayerContextMenu(x, y, layer); },
        getDeleteBlockReason: (layer) => this.ctl.getLayerDeletionBlockReason(layer.id),
      });
      this.renderLayerMasks();
    }

  protected layerTypeLabel(type: LayerType): string {
      return ({ paint: 'Capa de pintura', raster: 'Capa de pintura', filter: 'Capa de filtro', fill: 'Capa de relleno', file: 'Capa de archivo', vector: 'Capa vectorial', text: 'Capa de texto', group: 'Grupo de capas' })[type];
    }

  protected layerTypeIcon(type: LayerType): string {
      return ({ paint: 'paint-layer', raster: 'paint-layer', filter: 'filter-layer', fill: 'fill-layer', file: 'file-layer', vector: 'vector-layer', text: 'text-layer', group: 'group-layer' })[type];
    }

  protected drawLayerThumbnail(canvas: HTMLCanvasElement, layer: LayerNode): void {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (this.drawSpecialLayerThumbnail(context, canvas, layer)) return;
      this.drawRasterLayerThumbnail(context, canvas, layer);
    }

  protected drawSpecialLayerThumbnail(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: LayerNode): boolean {
      if (layer.type === 'filter') {
        context.fillStyle = '#fcebed';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = '#c92334';
        context.font = 'bold 19px system-ui';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('fx', canvas.width / 2, canvas.height / 2);
        return true;
      }
      if (layer.type === 'fill') {
        context.fillStyle = layer.fillColor ?? '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        return true;
      }
      if (layer.type === 'group') {
        context.fillStyle = '#9c9caa';
        context.font = '20px system-ui';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('▱', canvas.width / 2, canvas.height / 2);
        return true;
      }
      return false;
    }

  protected drawRasterLayerThumbnail(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement, layer: LayerNode): void {
      // Lee filas del ancho original sin reservar otra copia RGBA de todo el documento.
      const image = context.createImageData(canvas.width, canvas.height);
      const docW = this.ctl.doc.width;
      const docH = this.ctl.doc.height;
      const rowBytes = new Uint8Array(docW * 4);
      let anyPixels = false;
      for (let y = 0; y < canvas.height; y++) {
        const srcY = Math.min(docH - 1, Math.floor((y / canvas.height) * docH));
        rowBytes.fill(0);
        anyPixels = this.ctl.readLayerRect(layer, 0, srcY, docW, 1, rowBytes) || anyPixels;
        this.copyThumbnailRow(image.data, rowBytes, y, canvas.width, docW);
      }
      if (anyPixels) context.putImageData(image, 0, 0);
    }

  protected copyThumbnailRow(target: Uint8ClampedArray, source: Uint8Array, y: number, thumbnailWidth: number, sourceWidth: number): void {
      for (let x = 0; x < thumbnailWidth; x++) {
        const sourceX = Math.min(sourceWidth - 1, Math.floor((x / thumbnailWidth) * sourceWidth));
        const src = sourceX * 4;
        const dst = (y * thumbnailWidth + x) * 4;
        target[dst] = source[src];
        target[dst + 1] = source[src + 1];
        target[dst + 2] = source[src + 2];
        target[dst + 3] = source[src + 3];
      }
    }

  protected showLayerContextMenu(x: number, y: number, layer: LayerNode): void {
      this.closeLayerContextMenu();
      const menu = this.createLayerContextMenu(x, y, layer);
      document.body.append(menu);
      this.layerContextMenu = menu;
      this.bindLayerContextMenuDismissal(menu);
    }

  protected createLayerContextMenu(x: number, y: number, layer: LayerNode): HTMLDivElement {
      const menu = document.createElement('div');
      menu.className = 'layer-context-menu';
      menu.setAttribute('role', 'menu');
      menu.style.left = `${Math.max(6, Math.min(x, window.innerWidth - 225))}px`;
      menu.style.top = `${Math.max(6, Math.min(y, window.innerHeight - 270))}px`;
      this.getLayerContextActions(layer).forEach(([label, action]) => {
        menu.append(this.createLayerContextMenuItem(menu, layer, label, action));
      });
      return menu;
    }

  protected getLayerContextActions(layer: LayerNode): LayerContextAction[] {
      const actions: Array<[string, () => void]> = this.getCommonLayerContextActions(layer);
      actions.push(...this.layerBehaviors[layer.type].contextActions(layer));
      actions.push(['Eliminar capa', () => this.deleteLayerFromContext(layer)]);
      return actions;
    }

  protected getCommonLayerContextActions(layer: LayerNode): Array<[string, () => void]> {
      return [
        ['Renombrar…', () => this.renameLayer(layer)],
        ['Duplicar capa', () => this.duplicateLayerFromContext(layer)],
        ['Subir capa', () => this.moveLayerById(layer.id, +1)],
        ['Bajar capa', () => this.moveLayerById(layer.id, -1)],
        ['Mover a grupo…', () => this.moveLayerIntoGroup(layer)],
      ];
    }

  protected appendFileLayerContextActions(actions: Array<[string, () => void]>, layer: LayerNode): void {
      const linkLabel = layer.sourceLinkId ? 'Vínculo externo configurado' : 'Sin vínculo externo';
      actions.push([`${linkLabel}: ${layer.sourceName ?? layer.name}`, () => {}]);
      actions.push(['Actualizar desde archivo vinculado', () => { void this.refreshLinkedFileLayer(layer, true); }]);
      actions.push(['Vincular / reemplazar archivo fuente…', () => { void this.replaceFileLayer(layer); }]);
      if (!layer.sourceLinkId) return;
      actions.push(['Quitar vínculo externo', () => {
        this.ctl.setProps(layer.id, { sourceLinkId: undefined, sourceLastModified: undefined, sourceFileSize: undefined });
        this.syncUI();
        this.updateHistoryUI();
      }]);
    }

  protected createLayerContextMenuItem(
      menu: HTMLElement,
      layer: LayerNode,
      label: string,
      action: () => void,
    ): HTMLButtonElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.setAttribute('role', 'menuitem');
      this.applyLayerContextItemAvailability(button, layer, label);
      button.onclick = () => {
        if (button.disabled) return;
        this.closeLayerContextMenu(menu);
        action();
      };
      return button;
    }

  protected applyLayerContextItemAvailability(button: HTMLButtonElement, layer: LayerNode, label: string): void {
      if (label !== 'Eliminar capa') return;
      const reason = this.ctl.getLayerDeletionBlockReason(layer.id);
      button.disabled = Boolean(reason);
      if (reason) button.title = reason;
    }

  protected bindLayerContextMenuDismissal(menu: HTMLElement): void {
      this.layerContextDismiss = (event: PointerEvent) => {
        if (!(event.target instanceof Node) || menu.contains(event.target)) return;
        this.closeLayerContextMenu(menu);
      };
      document.addEventListener('pointerdown', this.layerContextDismiss);
      menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') this.closeLayerContextMenu(menu);
      });
    }

  protected closeLayerContextMenu(menu = this.layerContextMenu): void {
      menu?.remove();
      if (this.layerContextDismiss) {
        document.removeEventListener('pointerdown', this.layerContextDismiss);
        this.layerContextDismiss = null;
      }
      if (!menu || this.layerContextMenu === menu) this.layerContextMenu = null;
    }

  protected duplicateLayerFromContext(layer: LayerNode): void {
      const clone = this.ctl.duplicateLayer(layer.id);
      if (clone) this.activeId = clone.id;
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    }

  protected deleteLayerFromContext(layer: LayerNode): void {
      if (!this.ctl.removeLayer(layer.id)) return;
      this.activeId = this.topRaster()?.id ?? this.ctl.doc.layers.at(-1)?.id ?? '';
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    }

  protected moveLayerIntoGroup(layer: LayerNode): void {
      const groups: LayerNode[] = [];
      const walk = (nodes: LayerNode[]) => nodes.forEach((node) => {
        if (node.type === 'group' && node.id !== layer.id && !this.isDescendantOf(layer, node.id)) groups.push(node);
        walk(node.children);
      });
      walk(this.ctl.doc.layers);
      const options = ['0 · Raíz', ...groups.map((group, index) => `${index + 1} · ${group.name}`)];
      const choice = prompt(`Mover «${layer.name}» a dónde?\n${options.join('\n')}`, '0');
      if (choice === null) return;
      const raw = choice.trim().split(/[· ]/)[0];
      const index = Number(raw);
      if (!Number.isInteger(index) || index < 0 || index > groups.length) { alert('Elegí un número de la lista.'); return; }
      const parentId = index === 0 ? null : groups[index - 1].id;
      if (this.ctl.moveLayerToParent(layer.id, parentId)) {
        this.activeId = layer.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      }
    }

  protected isDescendantOf(layer: LayerNode, ancestorId: string): boolean {
      return layer.children.some((child) => child.id === ancestorId || this.isDescendantOf(child, ancestorId));
    }

  protected renameLayer(layer: LayerNode): void {
      const name = prompt('Nombre de la capa', layer.name)?.trim();
      if (!name || name === layer.name) return;
      this.ctl.setProps(layer.id, { name }); this.syncUI(); this.updateHistoryUI();
    }

  protected editLayerByType(layer: LayerNode): void {
      this.activeId = layer.id;
      this.layerBehaviors[layer.type].edit(layer);
    }

  protected editTextLayer(layer: LayerNode): void {
      this.activeId = layer.id;
      void this.createTextAt({ x: layer.textX ?? 0, y: layer.textY ?? 0 }, layer);
    }

  protected createLayerBehaviorRegistry(): Record<LayerType, LayerBehavior> {
      const noContextActions = (): LayerContextAction[] => [];
      const renameLayer = (layer: LayerNode) => this.renameLayer(layer);
      return {
        paint: { edit: renameLayer, contextActions: noContextActions },
        raster: { edit: renameLayer, contextActions: noContextActions },
        group: { edit: renameLayer, contextActions: noContextActions },
        file: {
          edit: renameLayer,
          contextActions: (layer) => {
            const actions: LayerContextAction[] = [];
            this.appendFileLayerContextActions(actions, layer);
            return actions;
          },
        },
        filter: {
          edit: (layer) => { this.syncUI(); this.openFilterEditor(layer); },
          contextActions: (layer) => [['Configurar filtro…', () => this.openFilterEditor(layer)]],
        },
        fill: {
          edit: (layer) => this.changeFillColor(layer),
          contextActions: (layer) => [['Cambiar color de relleno…', () => this.changeFillColor(layer)]],
        },
        vector: {
          edit: (layer) => this.editVectorLayer(layer),
          contextActions: (layer) => [['Editar objetos vectoriales…', () => this.editVectorLayer(layer)]],
        },
        text: {
          edit: (layer) => this.editTextLayer(layer),
          contextActions: (layer) => [['Editar texto…', () => this.editTextLayer(layer)]],
        },
      };
    }

  protected openLayerEffectsEditor(layer: LayerNode): void {
      this.activeId = layer.id;
      this.activeMaskId = layer.masks?.find((mask) => mask.type === 'styles')?.id ?? '';
      this.syncUI();
      this.layerEffectsPanel?.configureLayers(this.ctl.doc.layers, layer.id);
      this.layerEffectsPanel?.configureCurrentStyle(layer);
      this.showRightEditor('effects-panel');
    }

  protected showRightEditor(panelId: 'effects-panel' | 'filters-panel'): void {
      this.expandRightDockForEditor();
      this.filterPanel?.hide();
      this.layerEffectsPanel?.hide();
      if (panelId === 'filters-panel') this.filterPanel?.show();
      if (panelId === 'effects-panel') this.layerEffectsPanel?.show();
      this.setRightEditorVisibility(true);
    }

  protected hideRightEditors(): void {
      this.layerEffectsPanel?.hide();
      this.filterPanel?.hide();
      this.setRightEditorVisibility(false);
      this.restoreRightDockWidth();
      this.dockLayout?.refreshVisibility();
    }

  protected setRightEditorVisibility(visible: boolean): void {
      const workspace = this.q<HTMLElement>('.workspace');
      const dock = this.q<HTMLElement>('.right-dock');
      workspace.classList.toggle('right-editor-open', visible);
      dock.classList.toggle('right-editor-open', visible);
      if (!visible) {
        workspace.style.removeProperty('grid-template-columns');
        dock.style.removeProperty('display');
        return;
      }
      workspace.style.setProperty(
        'grid-template-columns',
        '54px minmax(0, 1fr) 6px var(--right-dock-width, 280px)',
        'important',
      );
      dock.style.setProperty('display', 'flex', 'important');
    }

  protected expandRightDockForEditor(): void {
      const workspace = this.q<HTMLElement>('.workspace');
      if (this.previousEditorDockWidth === null) this.previousEditorDockWidth = workspace.style.getPropertyValue('--right-dock-width');
      workspace.style.setProperty('--right-dock-width', 'clamp(420px, 44vw, 820px)');
    }

  protected restoreRightDockWidth(): void {
      if (this.previousEditorDockWidth === null) return;
      const workspace = this.q<HTMLElement>('.workspace');
      if (this.previousEditorDockWidth) workspace.style.setProperty('--right-dock-width', this.previousEditorDockWidth);
      else workspace.style.removeProperty('--right-dock-width');
      this.previousEditorDockWidth = null;
    }

  protected changeFillColor(layer: LayerNode): void {
      if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
      const color = prompt('Color de relleno (hexadecimal)', layer.fillColor ?? '#ffffff')?.trim();
      if (!color) return;
      if (!/^#?[0-9a-f]{6}$/i.test(color)) { alert('Usá un color hexadecimal de 6 dígitos, por ejemplo #e03030.'); return; }
      this.ctl.setProps(layer.id, { fillColor: color.startsWith('#') ? color : `#${color}` });
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    }

  protected openFilterEditor(layer: LayerNode): void {
      if (this.ctl.isEffectivelyLocked(layer.id)) {
        alert('La capa o su grupo está bloqueado.');
        return;
      }
      this.activeId = layer.id;
      this.filterEditLayerId = layer.id;
      this.filterMaskEditLayerId = null;
      this.filterMaskEditId = null;
      this.prepareFilterEditor(
        layer.name,
        layer.filterKind ?? 'grayscale',
        layer.filterStrength ?? 1,
        'Este ajuste es no destructivo y afecta a las capas inferiores. Podés cambiarlo más tarde.',
        'Capa de filtro editable',
      );
      this.showRightEditor('filters-panel');
    }

  protected openFilterMaskEditor(layer: LayerNode, maskId: string, filterIndex = 0): void {
      const mask = layer.masks?.find((candidate) => candidate.id === maskId && candidate.type === 'filter');
      if (!mask || mask.type !== 'filter') return;
      if (!Number.isInteger(filterIndex) || filterIndex < 0 || filterIndex >= mask.filters.length) return;
      this.filterEditLayerId = null;
      this.filterMaskEditLayerId = layer.id;
      this.filterMaskEditId = mask.id;
      this.filterMaskFilterIndex = filterIndex;
      const filter = mask.filters[this.filterMaskFilterIndex];
      this.prepareFilterEditor(
        layer.name,
        filter?.kind ?? 'grayscale',
        filter?.strength ?? 1,
        'La máscara conserva el efecto en la capa y permite editarlo cuando quieras.',
        'Máscara de filtro no destructiva',
      );
      this.showRightEditor('filters-panel');
    }

  protected prepareFilterEditor(layerName: string, kind: FilterKind, strength: number, hint: string, mode: string): void {
      this.filterPanel?.configure({ layerName, kind, strength, hint, mode });
    }

  protected filterLabel(kind: FilterKind): string {
      return FILTER_LABELS[kind];
    }

  protected openDestructiveFilterPanel(): void {
      const layer = this.active();
      if (layer?.type === 'filter') { this.openFilterEditor(layer); return; }
      if (!layer || !isPixelLayerType(layer.type) || this.ctl.isEffectivelyLocked(layer.id)) {
        alert('Seleccioná una capa de píxeles desbloqueada o creá una capa de filtro para aplicar un ajuste no destructivo.');
        return;
      }
      this.filterEditLayerId = null;
      this.filterMaskEditLayerId = null;
      this.filterMaskEditId = null;
      this.prepareFilterEditor(
        layer.name, 'grayscale', 1,
        'Este filtro se aplicará directamente a los píxeles de la capa seleccionada y se podrá deshacer.',
        'Filtro destructivo sobre la capa',
      );
      this.showRightEditor('filters-panel');
    }

  protected applyFilterDialog(): void {
      const selection = this.getActiveFilterSelection();
      if (!selection) return;
      if (this.filterMaskEditLayerId && this.filterMaskEditId) {
        this.applyFilterMaskSelection(selection.kind, selection.strength);
        return;
      }
      if (this.updateExistingFilterLayer(selection.layer, selection.kind, selection.strength)) return;
      if (!this.canApplyDestructiveFilter(selection.layer)) {
        this.closeFilterDialog();
        return;
      }
      this.applyDestructiveFilter(selection.layer, selection.kind, selection.strength);
    }

  protected applyFilterMaskSelection(kind: FilterKind, strength: number): void {
      const layerId = this.filterMaskEditLayerId;
      const maskId = this.filterMaskEditId;
      const index = this.filterMaskFilterIndex;
      if (!layerId || !maskId) return;
      const layer = this.ctl.find(layerId);
      const mask = layer?.masks?.find((candidate) => candidate.id === maskId && candidate.type === 'filter');
      if (!mask || mask.type !== 'filter' || index < 0 || index >= mask.filters.length) {
        this.q<HTMLElement>('#status').textContent = 'El filtro seleccionado ya no está disponible.';
        this.closeFilterDialog();
        return;
      }
      const updated = this.ctl.updateMask(layerId, maskId, (current) => this.replaceMaskFilter(current, index, kind, strength));
      this.closeFilterDialog();
      if (updated) this.finishMaskEdit('Se actualizó el filtro de la máscara.');
    }


  private replaceMaskFilter(mask: LayerMask, index: number, kind: FilterKind, strength: number): LayerMask {
    if (mask.type !== 'filter') return mask;
    const filters = [...mask.filters];
    filters[index] = { kind, strength };
    return { ...mask, filters };
  }

  protected getActiveFilterSelection(): { layer: LayerNode; kind: FilterKind; strength: number } | null {
      const layer = this.active();
      const selection = this.filterPanel?.getSelection();
      if (!layer || !selection) return null;
      return { layer, ...selection };
    }

  protected updateExistingFilterLayer(layer: LayerNode, kind: FilterKind, strength: number): boolean {
      if (!this.filterEditLayerId || layer.id !== this.filterEditLayerId || layer.type !== 'filter') return false;
      this.ctl.setProps(layer.id, { filterKind: kind, filterStrength: strength });
      this.closeFilterDialog();
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
      this.filterEditLayerId = null;
      return true;
    }

  protected canApplyDestructiveFilter(layer: LayerNode): boolean {
      return isPixelLayerType(layer.type) && !this.ctl.isEffectivelyLocked(layer.id);
    }

  protected applyDestructiveFilter(layer: LayerNode, kind: FilterKind, strength: number): void {
      try {
        const transformed = this.createFilteredPixelData(layer, kind, strength);
        runEdit(this.ctx, layer.engineId, `Filtro: ${this.filterLabel(kind)}`, (surface) => {
          if (!surface.writeRectFromJS(0, 0, this.ctl.doc.width, this.ctl.doc.height, transformed)) {
            throw new Error('No se pudo escribir el resultado del filtro.');
          }
        });
        this.closeFilterDialog();
        this.syncUI();
        this.updateHistoryUI();
        this.scheduleRefresh();
      } catch (error) {
        this.fail(error);
      }
    }

  protected createFilteredPixelData(layer: LayerNode, kind: FilterKind, strength: number): Uint8Array {
      const { width, height } = this.ctl.doc;
      const original = this.ctl.readPixels(layer) ?? new Uint8Array(width * height * 4);
      const source = this.createPixelCanvas(width, height, original);
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      const outputContext = output.getContext('2d', { willReadFrequently: true });
      if (!outputContext) throw new Error('El navegador no pudo preparar el filtro.');
      const filtered = renderFilteredImage(source, outputContext, kind, strength, {
        x: 0, y: 0, width, height, fullWidth: width, fullHeight: height,
      });
      return new Uint8Array(filtered.data);
    }

  protected createPixelCanvas(width: number, height: number, pixels: Uint8Array): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('El navegador no pudo preparar el filtro.');
      const imageData = context.createImageData(width, height);
      imageData.data.set(pixels);
      context.putImageData(imageData, 0, 0);
      return canvas;
    }

  protected closeFilterDialog(): void {
      this.filterEditLayerId = null;
      this.filterMaskEditLayerId = null;
      this.filterMaskEditId = null;
      this.hideRightEditors();
    }

  protected async createLayerOfType(type: LayerType): Promise<void> {
      this.q<HTMLElement>('#layer-create-menu').hidden = true;
      if (type === 'file') { await this.createFileLayer(); return; }
      if (type === 'text') { await this.createTextAt({ x: Math.round(this.ctl.doc.width * 0.25), y: Math.round(this.ctl.doc.height * 0.25) }); return; }
      if (type === 'fill') await this.createFillLayer();
      else this.createStandardLayer(type);
      this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
    }

  protected async createFillLayer(): Promise<void> {
      const color = prompt('Color inicial de la capa de relleno', '#ffffff');
      if (!color) return;
      if (!/^#?[0-9a-f]{6}$/i.test(color.trim())) { alert('Color inválido; usá por ejemplo #ffffff.'); return; }
      const node = this.ctl.addLayer('fill', 'Relleno', undefined, -1, { fillColor: color.startsWith('#') ? color : `#${color}` });
      this.activeId = node.id;
    }

  protected createStandardLayer(type: LayerType): void {
      const name = ({ paint: `Pintura ${this.ctl.doc.layers.length}`, filter: 'Filtro', vector: 'Vectorial', text: 'Texto', group: 'Grupo', raster: 'Capa', fill: 'Relleno', file: 'Archivo' } as Record<LayerType, string>)[type];
      const node = this.ctl.addLayer(type, name);
      this.activeId = node.id;
      if (type === 'vector') this.editVectorLayer(node);
    }

  protected async createFileLayer(): Promise<void> {
      const source = await this.pickImageSource();
      if (!source) return;
      try { await this.createFileLayerFromSource(source); }
      catch (error) { this.fail(error); }
    }

  protected async createFileLayerFromSource(source: { file: File; handle: FileSystemFileHandle | null }): Promise<void> {
      const pixels = await this.imageFileToDocumentPixels(source.file);
      const candidateLinkId = source.handle ? crypto.randomUUID() : undefined;
      const remembered = Boolean(candidateLinkId && source.handle && await this.rememberLinkedFileSafely(candidateLinkId, source.handle));
      const sourceLinkId = remembered ? candidateLinkId : undefined;
      const node = this.ctl.addFileLayer(
        documentNameFromFile(source.file.name) || 'Archivo', pixels, source.file.name, sourceLinkId,
        source.file.lastModified, source.file.size,
      );
      this.activeId = node.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = sourceLinkId
        ? `Capa de archivo vinculada: ${source.file.name}`
        : `Capa de archivo importada: ${source.file.name} (sin vínculo externo en este navegador)`;
    }

  protected async rememberLinkedFileSafely(linkId: string, handle: FileSystemFileHandle): Promise<boolean> {
      try { await rememberLinkedFile(linkId, handle); return true; }
      catch (error) { console.warn('No se pudo conservar el vínculo en este navegador:', error); return false; }
    }

  protected async pickImageSource(): Promise<{ file: File; handle: FileSystemFileHandle | null } | null> {
      if (typeof window.showOpenFilePicker !== 'function') return this.pickImageSourceFromInput();
      return this.pickImageSourceFromPicker();
    }

  private async pickImageSourceFromInput(): Promise<{ file: File; handle: null } | null> {
    const file = await this.pickImageFile();
    if (!file) return null;
    return { file, handle: null };
  }

  protected async pickImageSourceFromPicker(): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'Archivos de imagen', accept: {
            'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'],
            'image/gif': ['.gif'], 'image/bmp': ['.bmp'], 'image/tiff': ['.tif', '.tiff'], 'image/svg+xml': ['.svg'],
          } }],
        });
        return this.readPickedImage(handle);
      } catch (error) {
        return this.handleImagePickerError(error);
      }
    }

  protected async readPickedImage(handle: FileSystemFileHandle | undefined): Promise<{ file: File; handle: FileSystemFileHandle } | null> {
      if (!handle) return null;
      const file = await handle.getFile();
      return this.validatePickedImage(file, handle);
    }

  protected validatePickedImage(file: File, handle: FileSystemFileHandle): { file: File; handle: FileSystemFileHandle } {
      if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|tiff?|svg)$/i.test(file.name)) {
        throw new Error('El archivo seleccionado no parece ser una imagen compatible.');
      }
      return { file, handle };
    }

  protected handleImagePickerError(error: unknown): null {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }

  protected async imageFileToDocumentPixels(file: File): Promise<Uint8Array> {
      const bitmap = await createImageBitmap(file);
      try {
        return this.renderBitmapToDocumentPixels(bitmap);
      } finally {
        bitmap.close();
      }
    }

  private renderBitmapToDocumentPixels(bitmap: ImageBitmap): Uint8Array {
    const { width, height } = this.ctl.doc;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('No se pudo preparar la imagen para la capa de archivo.');
    const scale = Math.min(1, width / bitmap.width, height / bitmap.height);
    const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
    const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
    const x = Math.round((width - drawWidth) / 2);
    const y = Math.round((height - drawHeight) / 2);
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, x, y, drawWidth, drawHeight);
    return new Uint8Array(context.getImageData(0, 0, width, height).data);
  }

  protected async refreshLinkedFileLayer(layer: LayerNode, askForPermission: boolean): Promise<void> {
      if (layer.type !== 'file') return;
      if (this.ctl.isEffectivelyLocked(layer.id)) {
        alert('La capa o su grupo está bloqueado.');
        return;
      }
      if (!layer.sourceLinkId) {
        await this.replaceFileLayerIfRequested(layer, askForPermission);
        return;
      }
      await this.refreshExistingLinkedFileLayer(layer, layer.sourceLinkId, askForPermission);
    }

  protected async replaceFileLayerIfRequested(layer: LayerNode, askForPermission: boolean): Promise<void> {
      if (!askForPermission) return;
      await this.replaceFileLayer(layer);
    }

  protected async refreshExistingLinkedFileLayer(layer: LayerNode, linkId: string, askForPermission: boolean): Promise<void> {
      try { await this.refreshAndApplyExistingLinkedFile(layer, linkId, askForPermission); }
      catch (error) { this.reportLinkedFileRefreshError(error, layer, askForPermission); }
    }

  protected async refreshAndApplyExistingLinkedFile(layer: LayerNode, linkId: string, askForPermission: boolean): Promise<void> {
      const file = await this.getPermittedLinkedSourceFile(linkId, askForPermission);
      if (!file || this.isLinkedFileUnchanged(layer, file, askForPermission)) return;
      await this.applyLinkedFileUpdate(layer, file, linkId);
    }

  protected async getPermittedLinkedSourceFile(linkId: string, askForPermission: boolean): Promise<File | null> {
      const handle = await getLinkedFile(linkId);
      if (!handle) return this.reportMissingLinkedFile(askForPermission);
      let permission = await handle.queryPermission({ mode: 'read' });
      if (permission !== 'granted' && askForPermission) permission = await handle.requestPermission({ mode: 'read' });
      if (permission !== 'granted') return this.reportLinkedFilePermissionDenied(askForPermission);
      return handle.getFile();
    }

  protected reportMissingLinkedFile(askForPermission: boolean): null {
      if (askForPermission) alert('No se encontró el vínculo en este navegador. Usá «Vincular / reemplazar archivo fuente…» para volver a vincularlo. La imagen guardada en el proyecto sigue disponible.');
      return null;
    }

  protected reportLinkedFilePermissionDenied(askForPermission: boolean): null {
      if (askForPermission) alert('El navegador no concedió permiso para leer el archivo vinculado.');
      return null;
    }

  protected isLinkedFileUnchanged(layer: LayerNode, file: File, askForPermission: boolean): boolean {
      return !askForPermission && file.lastModified === layer.sourceLastModified && file.size === layer.sourceFileSize;
    }

  protected async applyLinkedFileUpdate(layer: LayerNode, file: File, linkId: string): Promise<void> {
      const pixels = await this.imageFileToDocumentPixels(file);
      const updated = this.ctl.replaceFileLayerContent(layer.id, pixels, file.name, linkId, file.lastModified, file.size);
      if (!updated) return;
      this.activeId = layer.id;
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = `Imagen vinculada actualizada: ${file.name}`;
    }

  protected reportLinkedFileRefreshError(error: unknown, layer: LayerNode, askForPermission: boolean): void {
      if (askForPermission) {
        this.fail(error);
        return;
      }
      console.warn(`No se pudo actualizar la capa vinculada «${layer.name}»:`, error);
    }

  protected async refreshLinkedFileLayers(askForPermission = false): Promise<void> {
      await this.walkLinkedFileLayerTree(this.ctl.doc.layers, askForPermission);
    }

  protected async walkLinkedFileLayerTree(nodes: LayerNode[], askForPermission: boolean): Promise<void> {
      for (const layer of nodes) await this.refreshLinkedFileLayerTreeNode(layer, askForPermission);
    }

  protected async refreshLinkedFileLayerTreeNode(layer: LayerNode, askForPermission: boolean): Promise<void> {
      if (layer.type === 'file' && layer.sourceLinkId) await this.refreshLinkedFileLayer(layer, askForPermission);
      if (layer.children.length) await this.walkLinkedFileLayerTree(layer.children, askForPermission);
    }

  protected pickImageFile(): Promise<File | null> {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*' });
      return new Promise((resolve) => {
        input.onchange = () => resolve(input.files?.[0] ?? null);
        input.addEventListener('cancel', () => resolve(null), { once: true });
        input.click();
      });
    }

  protected async replaceFileLayer(layer: LayerNode): Promise<void> {
      if (layer.type !== 'file') return;
      if (this.ctl.isEffectivelyLocked(layer.id)) { alert('La capa o su grupo está bloqueado.'); return; }
      const source = await this.pickImageSource();
      if (!source) return;
      try { await this.replaceFileLayerFromSource(layer, source); }
      catch (error) { this.fail(error); }
    }

  protected async replaceFileLayerFromSource(
      layer: LayerNode,
      source: { file: File; handle: FileSystemFileHandle | null },
    ): Promise<void> {
      const pixels = await this.imageFileToDocumentPixels(source.file);
      const candidateLinkId = source.handle ? crypto.randomUUID() : undefined;
      const remembered = Boolean(candidateLinkId && source.handle && await this.rememberLinkedFileSafely(candidateLinkId, source.handle));
      const nextLinkId = remembered ? candidateLinkId : undefined;
      const updated = this.ctl.replaceFileLayerContent(layer.id, pixels, source.file.name, nextLinkId, source.file.lastModified, source.file.size);
      if (!updated) return;
      this.activeId = layer.id; this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = nextLinkId
        ? `Vínculo externo actualizado: ${source.file.name}`
        : `Imagen reemplazada (sin vínculo externo): ${source.file.name}`;
    }
}
