// Layer operations and linked image management.
import { AppLayerStateFeatures } from './AppLayerStateFeatures';
import { decodeImageWithSharedCore, renderFilteredImage } from '@nvts/image-processing';
import { decodePdfCompatibleAi, decodePsdComposite, extractAiRasterPreview, extractKraMergedImage } from '@nvts/storage';
import { runEdit, type LayerNode } from '@nvts/document-model';
import { cloneLayerMasks, cloneLayerStyles, createLayerMask, FILTER_KINDS, getLayerMaskLabel, isPixelLayerType, type FilterKind, type LayerMask, type LayerStyles, type LayerType } from '@nvts/shared';
import { renderLayersPanel } from '../panels/LayersPanel';
import { renderLayerMaskEditor } from '../panels/LayerMaskEditor';
import { LayerMaskPreviewController } from '../panels/LayerMaskPreviewController';
import { FILTER_LABELS } from '../panels/FilterCatalog';
import { rememberLinkedFile, getLinkedFile } from '@nvts/storage';
import type { LayerContextAction, LayerBehavior } from './AppBase';
import { documentNameFromFile } from './AppUtilities';

type MaskEditSession = {
  layerId: string;
  originalMasks: LayerMask[];
  draftMasks: LayerMask[];
  originalOpacity: number;
  draftOpacity: number;
  originalBlendMode: LayerNode['blendMode'];
  draftBlendMode: LayerNode['blendMode'];
};
type LayerStyleDraft = { opacity: number; blendMode: LayerNode['blendMode']; layerStyles: LayerStyles };
type LayerStyleGroup = 'stroke' | 'outerGlow' | 'dropShadow' | 'bevelEmboss' | 'gradientOverlay' | 'innerShadow' | 'innerGlow' | 'satin' | 'colorOverlay' | 'patternOverlay';
type StyleControlValue = string | number | boolean;

const LAYER_STYLE_PROPERTIES: Record<LayerStyleGroup, readonly string[]> = {
  stroke: ['enabled', 'color', 'size', 'opacity'],
  outerGlow: ['enabled', 'color', 'size', 'opacity'],
  dropShadow: ['enabled', 'color', 'size', 'distance', 'angle', 'opacity'],
  bevelEmboss: ['enabled', 'size', 'depth', 'angle', 'altitude', 'highlightColor', 'shadowColor', 'opacity'],
  gradientOverlay: ['enabled', 'startColor', 'endColor', 'angle', 'opacity'],
  innerShadow: ['enabled', 'color', 'size', 'distance', 'angle', 'opacity'],
  innerGlow: ['enabled', 'color', 'size', 'choke', 'opacity'],
  satin: ['enabled', 'color', 'size', 'distance', 'angle', 'opacity', 'invert'],
  colorOverlay: ['enabled', 'color', 'opacity', 'blendMode'],
  patternOverlay: ['enabled', 'pattern', 'color', 'backgroundColor', 'scale', 'angle', 'opacity', 'blendMode'],
};

function isStylesMask(mask: LayerMask): mask is Extract<LayerMask, { type: 'styles' }> {
  return mask.type === 'styles';
}

function isLayerStyleGroup(value: string | undefined): value is LayerStyleGroup {
  return Boolean(value && Object.hasOwn(LAYER_STYLE_PROPERTIES, value));
}

function isLayerStyleProperty(group: LayerStyleGroup, property: string | undefined): boolean {
  return Boolean(property && LAYER_STYLE_PROPERTIES[group].includes(property));
}

function readStyleControlValue(property: string, control: HTMLInputElement | HTMLSelectElement): StyleControlValue | null {
  if (control instanceof HTMLSelectElement) return control.value;
  if (control instanceof HTMLInputElement && control.type === 'checkbox') return control.checked;
  if (control.type === 'color') return control.value;
  const value = Number(control.value);
  if (!Number.isFinite(value)) return null;
  return property === 'opacity' ? value / 100 : value;
}

function updateLayerStyleMask(
  mask: LayerMask,
  group: LayerStyleGroup,
  property: string,
  value: StyleControlValue,
): LayerMask {
  if (mask.type !== 'styles') return mask;
  const styles = cloneLayerStyles(mask.styles);
  const currentStyle = { ...styles[group] } as unknown as Record<string, StyleControlValue>;
  currentStyle[property] = value;
  return { ...mask, styles: { ...styles, [group]: currentStyle } as LayerStyles };
}

export abstract class AppLayerPanelFeatures extends AppLayerStateFeatures {
  private maskEditSession: MaskEditSession | null = null;
  private maskPreview: LayerMaskPreviewController | null = null;
  protected bindMaskControls(): void {
    const editor = this.q<HTMLElement>('#masks-panel');
    this.maskPreview = new LayerMaskPreviewController(this.root, this.canvas, () => this.renderer.capturePixels());
    this.maskPreview.mount();
    editor.addEventListener('click', (event) => this.handleMaskClick(event));
    editor.addEventListener('dblclick', (event) => this.handleMaskDoubleClick(event));
    editor.addEventListener('change', (event) => this.handleMaskChange(event));
  }

  protected addMaskToActiveLayer(type: LayerMask['type']): void {
    const layer = this.active();
    if (!layer) return this.reportMissingMaskLayer();
    const session = this.ensureMaskEditSession(layer);
    if (!session) return;
    const existingStyleMask = this.findExistingStyleMask(type, session.draftMasks);
    if (existingStyleMask) return this.openExistingMask(layer, type, existingStyleMask);
    this.createAndOpenLayerMask(layer, type, session);
  }

  private openExistingMask(layer: LayerNode, type: LayerMask['type'], mask: LayerMask): void {
    if (type === 'styles') return this.openLayerEffectsEditor(layer);
    this.selectLayerMaskForEditing(layer, mask, 'La capa ya tiene una máscara de estilos; se abrió la existente.');
  }

  private reportMissingMaskLayer(): void {
    this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa antes de añadir una máscara.';
  }

  private findExistingStyleMask(type: LayerMask['type'], masks: readonly LayerMask[]): LayerMask | null {
    if (type !== 'styles') return null;
    return masks.find((mask) => mask.type === 'styles') ?? null;
  }

  private createAndOpenLayerMask(layer: LayerNode, type: LayerMask['type'], session: MaskEditSession): void {
    const mask = this.createMaskForLayer(layer, type);
    if (!this.stageMaskCollection(layer.id, [...session.draftMasks, mask], `Se añadió máscara de ${getLayerMaskLabel(mask.type)}.`)) return;
    if (type === 'styles') return this.openLayerEffectsEditor(layer);
    this.openLayerMaskEditor(layer, mask.id);
  }

  private createMaskForLayer(layer: LayerNode, type: 'styles'): Extract<LayerMask, { type: 'styles' }>;
  private createMaskForLayer(layer: LayerNode, type: Exclude<LayerMask['type'], 'styles'>): LayerMask;
  private createMaskForLayer(layer: LayerNode, type: LayerMask['type']): LayerMask;
  private createMaskForLayer(layer: LayerNode, type: LayerMask['type']): LayerMask {
    const mask = createLayerMask(type, crypto.randomUUID());
    if (mask.type !== 'styles' || !layer.layerStyles) return mask;
    return { ...mask, styles: cloneLayerStyles(layer.layerStyles) };
  }

  protected openLayerMaskEditor(layer: LayerNode, maskId: string, message = 'Se seleccionó una máscara.'): void {
    const session = this.ensureMaskEditSession(layer);
    if (!session) return;
    const mask = session.draftMasks.find((candidate) => candidate.id === maskId);
    if (!mask) return;
    this.selectLayerMaskForEditing(layer, mask, message);
  }

  private selectLayerMaskForEditing(layer: LayerNode, mask: LayerMask, message: string): void {
    this.activeId = layer.id;
    this.activeMaskId = mask.id;
    this.finishMaskEdit(message);
    this.showRightEditor('masks-panel');
  }

  protected handleMaskClick(event: Event): void {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('button');
    if (button && this.applyMaskChangesFromButton(button)) return;
    if (button && this.cancelMaskChangesFromButton(button)) return;
    if (this.selectMaskCardFromSummary(event, target)) return;
    if (!button) return;
    const layer = this.active();
    if (!layer) return;
    if (this.deleteMaskFromButton(button, layer)) return;
    if (this.removeFilterFromMaskButton(button, layer)) return;
    if (this.clearColorizeMaskFromButton(button, layer)) return;
    if (this.refreshColorizeMaskFromButton(button)) return;
    this.addFilterToMaskFromButton(button, layer);
  }

  private applyMaskChangesFromButton(button: HTMLButtonElement): boolean {
    if (button.id !== 'mask-apply-changes') return false;
    this.applyMaskChanges();
    return true;
  }

  private cancelMaskChangesFromButton(button: HTMLButtonElement): boolean {
    if (button.id !== 'mask-cancel-changes') return false;
    this.cancelMaskChanges();
    return true;
  }


  private selectMaskCardFromSummary(event: Event, target: HTMLElement): boolean {
    const summary = target.closest<HTMLElement>('.layer-mask-entry > summary');
    if (!summary || target.closest('input, button')) return false;
    event.preventDefault();
    return true;
  }

  private handleMaskDoubleClick(event: MouseEvent): void {
    if (event.button !== 0) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const summary = target.closest<HTMLElement>('.layer-mask-entry > summary');
    if (!summary || target.closest('input, button')) return;
    const card = summary.parentElement as HTMLDetailsElement | null;
    const maskId = card?.dataset.maskId;
    if (!maskId) return;
    event.preventDefault();
    event.stopPropagation();
    this.activeMaskId = maskId;
    this.syncUI();
    const selectedLayer = this.active();
    const selectedMask = selectedLayer?.masks?.find((mask) => mask.id === maskId);
    if (!selectedLayer || !selectedMask) return;
    if (selectedMask.type === 'styles') return this.openLayerEffectsEditor(selectedLayer);
    this.openLayerMaskEditor(selectedLayer, maskId);
  }

  private deleteMaskFromButton(button: HTMLButtonElement, layer: LayerNode): boolean {
    const maskId = button.dataset.deleteMask;
    if (!maskId) return false;
    const session = this.ensureMaskEditSession(layer);
    if (!session) return true;
    const nextMasks = session.draftMasks.filter((mask) => mask.id !== maskId);
    this.activeMaskId = nextMasks[0]?.id ?? '';
    this.stageMaskCollection(layer.id, nextMasks, 'Se quitó la máscara de la vista previa. Aplicá los cambios para confirmar.');
    return true;
  }

  private removeFilterFromMaskButton(button: HTMLButtonElement, layer: LayerNode): boolean {
      const maskId = button.dataset.removeMaskFilter;
      if (!maskId) return false;
      const index = Number(button.dataset.filterIndex);
      this.updateMaskField(layer.id, maskId, (mask) => mask.type === 'filter'
        ? { ...mask, filters: mask.filters.filter((_, filterIndex) => filterIndex !== index) }
        : mask);
      return true;
    }

  private clearColorizeMaskFromButton(button: HTMLButtonElement, layer: LayerNode): boolean {
      const maskId = button.dataset.clearColorize;
      if (!maskId) return false;
      this.updateMaskField(layer.id, maskId, (mask) => mask.type === 'colorize' ? { ...mask, strokes: [] } : mask);
      return true;
    }

  private refreshColorizeMaskFromButton(button: HTMLButtonElement): boolean {
      if (!button.dataset.updateColorize) return false;
      this.colorizeOutputCache.clear();
      this.scheduleRefresh();
      return true;
    }

  private addFilterToMaskFromButton(button: HTMLButtonElement, layer: LayerNode): void {
      const maskId = button.dataset.addMaskFilter;
      if (!maskId) return;
      const currentMask = layer.masks?.find((mask) => mask.id === maskId && mask.type === 'filter');
      if (!currentMask || currentMask.type !== 'filter') return;
      this.updateMaskField(layer.id, maskId, (mask) => mask.type === 'filter'
        ? { ...mask, filters: [...mask.filters, { kind: 'grayscale', strength: 1 }] }
        : mask);
    }

  protected handleMaskChange(event: Event): void {
      const control = event.target as HTMLInputElement | HTMLSelectElement;
      const layer = this.active();
      const maskId = control.dataset.maskId;
      if (!layer || !maskId) return;
      this.activeMaskId = maskId;
      if (this.updateMaskEnabledFromControl(layer, maskId, control)) return;
      if (this.updateFilterFromControl(layer, maskId, control)) return;
      this.updateTypedMaskFromControl(layer.id, maskId, control);
    }

  private updateMaskEnabledFromControl(layer: LayerNode, maskId: string, control: HTMLInputElement | HTMLSelectElement): boolean {
      if (control.dataset.maskField !== 'enabled' || !(control instanceof HTMLInputElement)) return false;
      this.updateMaskField(layer.id, maskId, (mask) => ({ ...mask, enabled: control.checked }));
      return true;
    }

  private updateFilterFromControl(layer: LayerNode, maskId: string, control: HTMLInputElement | HTMLSelectElement): boolean {
      if (control.dataset.filterIndex === undefined) return false;
      this.updateFilterMaskControl(layer.id, maskId, Number(control.dataset.filterIndex), control);
      return true;
    }

  private updateTypedMaskFromControl(layerId: string, maskId: string, control: HTMLInputElement | HTMLSelectElement): void {
      const field = control.dataset.maskField ?? '';
      if (field.startsWith('transform.')) {
        this.updateTransformMaskControl(layerId, maskId, control as HTMLInputElement);
        return;
      }
      if (field.startsWith('colorize.')) {
        this.updateColorizeMaskControl(layerId, maskId, control as HTMLInputElement);
        return;
      }
      if (field.startsWith('style.')) this.updateStyleMaskControl(layerId, maskId, control);
    }

  private updateStyleMaskControl(layerId: string, maskId: string, control: HTMLInputElement | HTMLSelectElement): void {
    const [prefix, group, property] = (control.dataset.maskField ?? '').split('.');
    if (prefix !== 'style' || !isLayerStyleGroup(group) || !isLayerStyleProperty(group, property)) return;
    const value = readStyleControlValue(property, control);
    if (value === null) return;
    this.updateMaskField(layerId, maskId, (mask) => updateLayerStyleMask(mask, group, property, value));
  }

  protected updateMaskField(layerId: string, maskId: string, update: (mask: LayerMask) => LayerMask): void {
    const layer = this.ctl.find(layerId);
    if (!layer) return;
    const session = this.ensureMaskEditSession(layer);
    if (!session) return;
    const updatedMasks = session.draftMasks.map((mask) => mask.id === maskId ? update(cloneLayerMasks([mask])[0]) : mask);
    this.stageMaskCollection(layerId, updatedMasks, 'Vista previa de máscara actualizada. Aplicá los cambios para confirmarlos.');
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

  private ensureMaskEditSession(layer: LayerNode): MaskEditSession | null {
    if (this.maskEditSession?.layerId === layer.id) return this.maskEditSession;
    if (!this.allowMaskEditorNavigation()) return null;
    const originalMasks = cloneLayerMasks(layer.masks);
    this.maskEditSession = {
      layerId: layer.id,
      originalMasks,
      draftMasks: cloneLayerMasks(originalMasks),
      originalOpacity: layer.opacity,
      draftOpacity: layer.opacity,
      originalBlendMode: layer.blendMode,
      draftBlendMode: layer.blendMode,
    };
    const captured = this.maskPreview?.captureBefore() ?? false;
    if (!captured) this.q<HTMLElement>('#status').textContent = 'No se pudo capturar la vista original del lienzo; la edición de máscaras sigue disponible.';
    this.syncMaskEditorActions();
    return this.maskEditSession;
  }

  private allowMaskEditorNavigation(): boolean {
    const session = this.maskEditSession;
    if (!session) return true;
    if (this.isMaskSessionDirty(session)) {
      this.q<HTMLElement>('#status').textContent = 'Aplicá o cancelá los cambios de máscaras antes de cambiar de capa o editor.';
      return false;
    }
    this.discardMaskSession();
    return true;
  }

  private stageMaskCollection(layerId: string, masks: readonly LayerMask[], message: string): boolean {
    const layer = this.ctl.find(layerId);
    const session = this.maskEditSession;
    if (!layer || !session || session.layerId !== layerId) return false;
    session.draftMasks = cloneLayerMasks(masks);
    layer.masks = cloneLayerMasks(session.draftMasks);
    this.activeMaskId = session.draftMasks.some((mask) => mask.id === this.activeMaskId)
      ? this.activeMaskId
      : session.draftMasks[0]?.id ?? '';
    this.ctl.comp.invalidateAll();
    this.finishMaskEdit(message);
    return true;
  }

  private applyMaskChanges(): void {
    const session = this.maskEditSession;
    if (!session || !this.isMaskSessionDirty(session)) return;
    const layer = this.ctl.find(session.layerId);
    if (!layer) return this.cancelMaskChanges();
    const nextMasks = cloneLayerMasks(session.draftMasks);
    const selectedMaskId = nextMasks.some((mask) => mask.id === this.activeMaskId)
      ? this.activeMaskId
      : nextMasks[0]?.id ?? '';
    const appearanceChanged = session.originalOpacity !== session.draftOpacity
      || session.originalBlendMode !== session.draftBlendMode;
    const shouldClearLegacyStyles = Boolean(layer.layerStyles && nextMasks.some((mask) => mask.type === 'styles'));
    const layerStylesChanged = shouldClearLegacyStyles && layer.layerStyles !== undefined;
    layer.masks = cloneLayerMasks(session.originalMasks);
    layer.opacity = session.originalOpacity;
    layer.blendMode = session.originalBlendMode;
    this.maskEditSession = null;
    this.maskPreview?.hide();
    const patch = {
      ...(appearanceChanged ? { opacity: session.draftOpacity, blendMode: session.draftBlendMode } : {}),
      ...(layerStylesChanged ? { layerStyles: undefined } : {}),
    };
    const applied = this.ctl.replaceLayerMasksAndProps(
      session.layerId,
      nextMasks,
      patch,
      'Aplicar estilos y máscaras no destructivos',
    );
    if (!applied) {
      this.q<HTMLElement>('#status').textContent = 'No se pudieron aplicar los cambios no destructivos.';
      this.syncUI();
      this.scheduleRefresh();
      return;
    }
    this.colorizeOutputCache.clear();
    this.activeMaskId = selectedMaskId;
    this.finishMaskEdit('Se aplicaron los cambios no destructivos de máscaras y apariencia.');
    this.hideRightEditors();
  }

  protected cancelMaskChanges(): void {
    this.discardMaskSession();
    this.finishMaskEdit('Se cancelaron los cambios de las máscaras.');
    this.hideRightEditors();
  }

  private discardMaskSession(): void {
    const session = this.maskEditSession;
    const layer = session ? this.ctl.find(session.layerId) : undefined;
    if (layer && session) this.restoreMaskSnapshot(session);
    this.maskEditSession = null;
    this.maskPreview?.hide();
    this.colorizeOutputCache.clear();
    this.scheduleRefresh();
  }

  private restoreMaskSnapshot(session: MaskEditSession): void {
    const layer = this.ctl.find(session.layerId);
    if (!layer) return;
    layer.masks = cloneLayerMasks(session.originalMasks);
    layer.opacity = session.originalOpacity;
    layer.blendMode = session.originalBlendMode;
    this.activeMaskId = session.originalMasks.some((mask) => mask.id === this.activeMaskId)
      ? this.activeMaskId
      : session.originalMasks[0]?.id ?? '';
    this.ctl.comp.invalidateAll();
  }

  private isMaskSessionDirty(session: MaskEditSession): boolean {
    const masksChanged = JSON.stringify(session.originalMasks) !== JSON.stringify(session.draftMasks);
    const appearanceChanged = session.originalOpacity !== session.draftOpacity
      || session.originalBlendMode !== session.draftBlendMode;
    return masksChanged || appearanceChanged;
  }

  protected blockForUnappliedMaskChanges(action: string): boolean {
    const session = this.maskEditSession;
    if (!session || !this.isMaskSessionDirty(session)) return false;
    this.q<HTMLElement>('#status').textContent = `Aplicá o cancelá los cambios de máscaras antes de ${action}.`;
    return true;
  }

  private syncMaskEditorActions(): void {
    const session = this.maskEditSession;
    const apply = this.root.querySelector<HTMLButtonElement>('#mask-apply-changes');
    const cancel = this.root.querySelector<HTMLButtonElement>('#mask-cancel-changes');
    const status = this.root.querySelector<HTMLElement>('#mask-edit-status');
    if (apply) apply.disabled = !session || !this.isMaskSessionDirty(session);
    if (cancel) cancel.disabled = !session;
    if (status) status.textContent = session && this.isMaskSessionDirty(session)
      ? 'Hay cambios sin aplicar.'
      : 'Las modificaciones todavía no se aplicaron.';
  }

  protected finishMaskEdit(message: string): void {
      this.colorizeOutputCache.clear();
      this.refreshMaskEditState();
      this.q<HTMLElement>('#status').textContent = message;
    }

  private refreshMaskEditState(): void {
      this.syncUI();
      this.updateHistoryUI();
      this.scheduleRefresh();
    }

  protected renderLayerMasks(): void {
      const container = this.root.querySelector<HTMLElement>('#layer-mask-list');
      if (!container) return;
      this.renderActiveLayerMasks(container);
      this.syncMaskEditorActions();
    }

  private renderActiveLayerMasks(container: HTMLElement): void {
      const layer = this.active();
      this.updateLayerMaskPanelHeader(layer);
      renderLayerMaskEditor(
        container,
        layer?.masks ?? [],
        this.activeMaskId,
        { filterKinds: this.filterKinds(), filterLabel: (kind) => this.filterLabel(kind) },
      );
    }

  private updateLayerMaskPanelHeader(layer: LayerNode | undefined): void {
      const layerName = this.root.querySelector<HTMLElement>('#mask-editor-layer-name');
      if (layerName) layerName.textContent = layer?.name ?? '';
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
        onSelectMask: (layer, mask) => {
          if (!this.allowMaskEditorNavigationForLayer(layer.id)) return;
          this.activeId = layer.id;
          if (mask.type === 'styles') this.openLayerEffectsEditor(layer);
          else this.openLayerMaskEditor(layer, mask.id);
        },
        onToggleMask: (layer, mask, enabled) => {
          if (!this.allowMaskEditorNavigationForLayer(layer.id)) return;
          this.updateMaskField(layer.id, mask.id, (current) => ({ ...current, enabled }));
        },
        onToggleLock: (layer) => {
          this.ctl.setProps(layer.id, { locked: !layer.locked });
          this.syncUI(); this.updateHistoryUI();
        },
        onSelect: (layer) => {
          if (!this.allowMaskEditorNavigationForLayer(layer.id)) return;
          this.activeId = layer.id;
          this.activeMaskId = '';
          this.syncUI();
        },
        onContextMenu: (layer, x, y) => {
          if (!this.allowMaskEditorNavigationForLayer(layer.id)) return;
          this.activeId = layer.id;
          this.activeMaskId = '';
          this.syncUI();
          this.showLayerContextMenu(x, y, layer);
        },
        getDeleteBlockReason: (layer) => this.ctl.getLayerDeletionBlockReason(layer.id),
        onMoveLayer: (sourceId, targetId, position) => {
          if (!this.ctl.moveLayerRelative(sourceId, targetId, position)) return;
          this.activeId = sourceId;
          this.activeMaskId = '';
          this.refreshAfterLayerStructureChange();
        },
        onMoveMask: (sourceLayerId, maskId, targetLayerId, targetMaskId, position) => {
          if (!this.ctl.moveMaskRelative(sourceLayerId, maskId, targetLayerId, targetMaskId, position)) return;
          this.activeId = targetLayerId;
          this.activeMaskId = maskId;
          this.refreshAfterLayerStructureChange();
        },
      });
      this.renderLayerMasks();
    }

  private allowMaskEditorNavigationForLayer(targetLayerId: string): boolean {
    if (this.maskEditSession?.layerId === targetLayerId) return true;
    return this.allowMaskEditorNavigation();
  }

  protected applyCanvasView(): void {
    super.applyCanvasView();
    this.maskPreview?.syncCanvasTransform();
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
      if (clone) this.activateCreatedLayer(clone);
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
    const session = this.maskEditSession;
    if ((!session || session.layerId !== layer.id) && !this.allowMaskEditorNavigation()) return;
    this.activeId = layer.id;
    const editSession = this.ensureMaskEditSession(layer);
    if (!editSession) return;
    let styleMask = editSession.draftMasks.find(isStylesMask);
    if (!styleMask && layer.type !== 'filter') {
      const newMask = this.createMaskForLayer(layer, 'styles');
      this.stageMaskCollection(layer.id, [...editSession.draftMasks, newMask], 'Se creó una máscara de estilos no destructiva.');
      styleMask = this.maskEditSession?.draftMasks.find(isStylesMask);
    }
    this.activeMaskId = styleMask?.id ?? '';
    this.syncUI();
    this.layerEffectsPanel?.configureLayers(this.ctl.doc.layers, layer.id);
    this.layerEffectsPanel?.configureCurrentStyle(layer);
    this.showRightEditor('effects-panel');
  }

  protected previewLayerStyleSettings(style: LayerStyleDraft): void {
    const layer = this.active();
    if (!layer) return;
    const session = this.ensureMaskEditSession(layer);
    if (!session) return;
    const nextMasks = cloneLayerMasks(session.draftMasks);
    let maskCollectionChanged = false;
    if (layer.type !== 'filter') {
      const update = this.updateStyleMaskCollection(nextMasks, layer, style);
      maskCollectionChanged = update.collectionChanged;
      this.activeMaskId = update.maskId;
    }
    session.draftMasks = cloneLayerMasks(nextMasks);
    session.draftOpacity = style.opacity;
    session.draftBlendMode = style.blendMode;
    layer.masks = cloneLayerMasks(session.draftMasks);
    layer.opacity = style.opacity;
    layer.blendMode = style.blendMode;
    this.ctl.comp.invalidateAll();
    if (maskCollectionChanged) this.renderLayers();
    this.syncMaskEditorActions();
    this.q<HTMLElement>('#status').textContent = 'Vista previa de estilos actualizada. Aplicá para confirmar o cancelá para descartar.';
    this.scheduleRefresh();
  }

  private updateStyleMaskCollection(
    masks: LayerMask[],
    layer: LayerNode,
    style: LayerStyleDraft,
  ): { maskId: string; collectionChanged: boolean } {
    const existingMask = masks.find(isStylesMask);
    if (existingMask) {
      this.replaceStyleMask(masks, existingMask, style);
      return { maskId: existingMask.id, collectionChanged: false };
    }
    const newMask = this.createMaskForLayer(layer, 'styles');
    newMask.styles = cloneLayerStyles(style.layerStyles);
    masks.push(newMask);
    return { maskId: newMask.id, collectionChanged: true };
  }

  private replaceStyleMask(
    masks: LayerMask[],
    mask: Extract<LayerMask, { type: 'styles' }>,
    style: LayerStyleDraft,
  ): void {
    const maskIndex = masks.findIndex((candidate) => candidate.id === mask.id);
    masks[maskIndex] = { ...mask, styles: cloneLayerStyles(style.layerStyles) };
  }

  protected commitLayerStyleSettings(style: LayerStyleDraft): void {
    this.previewLayerStyleSettings(style);
    const session = this.maskEditSession;
    if (session && this.isMaskSessionDirty(session)) return this.applyMaskChanges();
    this.hideRightEditors();
  }

  protected showRightEditor(panelId: 'effects-panel' | 'filters-panel' | 'masks-panel'): void {
    const session = this.maskEditSession;
    const sameLayerSession = Boolean(session && session.layerId === this.activeId);
    if (panelId !== 'masks-panel' && !sameLayerSession && !this.allowMaskEditorNavigation()) return;
    if (panelId === 'masks-panel' && !this.ensureActiveMaskEditSession()) return;
    this.prepareRightEditor(panelId);
    this.setRightEditorVisibility(true);
  }

  private ensureActiveMaskEditSession(): boolean {
    const layer = this.active();
    if (!layer) return true;
    return Boolean(this.ensureMaskEditSession(layer));
  }

  private prepareRightEditor(panelId: 'effects-panel' | 'filters-panel' | 'masks-panel'): void {
      this.expandRightDockForEditor();
      this.hideInactiveRightEditors();
      this.revealRightEditor(panelId);
    }

  private hideInactiveRightEditors(): void {
      this.maskPreview?.setPanelVisible(false);
      this.filterPanel?.hide();
      this.layerEffectsPanel?.hide();
      this.q<HTMLElement>('#masks-panel').hidden = true;
    }

  private revealRightEditor(panelId: 'effects-panel' | 'filters-panel' | 'masks-panel'): void {
      if (panelId === 'filters-panel') this.filterPanel?.show();
      if (panelId === 'effects-panel') this.layerEffectsPanel?.show();
      if (panelId === 'masks-panel') {
        this.q<HTMLElement>('#masks-panel').hidden = false;
        this.maskPreview?.setPanelVisible(true);
      }
    }

  protected hideRightEditors(): void {
    this.discardMaskSession();
    this.hideAllRightEditors();
    this.restoreRightDockWidth();
    this.refreshClosedRightDock();
  }

  private hideAllRightEditors(): void {
      this.maskPreview?.setPanelVisible(false);
      this.layerEffectsPanel?.hide();
      this.filterPanel?.hide();
      this.q<HTMLElement>('#masks-panel').hidden = true;
    }

  private refreshClosedRightDock(): void {
      this.setRightEditorVisibility(false);
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
        '54px minmax(0, 1fr) 6px var(--right-dock-width, 360px)',
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
      this.prepareFilterEditor(
        layer.name,
        layer.filterKind ?? 'grayscale',
        layer.filterStrength ?? 1,
        'Este ajuste es no destructivo y afecta a las capas inferiores. Podés cambiarlo más tarde.',
        'Capa de filtro editable',
      );
      this.showRightEditor('filters-panel');
    }

  protected prepareFilterEditor(layerName: string, kind: FilterKind, strength: number, hint: string, mode: string): void {
      this.filterPanel?.configure({ layerName, kind, strength, hint, mode });
    }

  protected filterLabel(kind: FilterKind): string {
      return FILTER_LABELS[kind];
    }

  protected openFilterPanelForMenu(kind: FilterKind): void {
      const layer = this.active();
      if (!layer) {
        this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa para abrir este ajuste.';
        return;
      }
      if (this.ctl.isEffectivelyLocked(layer.id)) {
        this.q<HTMLElement>('#status').textContent = 'La capa o su grupo está bloqueado.';
        return;
      }
      if (layer.type !== 'filter' && !isPixelLayerType(layer.type)) {
        this.q<HTMLElement>('#status').textContent = 'Este ajuste requiere una capa de píxeles o una capa de filtro.';
        return;
      }

      const editableFilterLayer = layer.type === 'filter';
      this.activeId = layer.id;
      this.filterEditLayerId = editableFilterLayer ? layer.id : null;
      this.prepareFilterEditor(
        layer.name,
        kind,
        layer.filterStrength ?? 1,
        editableFilterLayer
          ? 'Este ajuste es no destructivo y afecta a las capas inferiores. Podés cambiarlo más tarde.'
          : 'Este filtro se aplicará a los píxeles de la capa seleccionada y se podrá deshacer.',
        editableFilterLayer ? 'Capa de filtro editable' : 'Filtro sobre la capa seleccionada',
      );
      this.showRightEditor('filters-panel');
    }

  protected openDestructiveFilterPanel(): void {
      const layer = this.active();
      if (layer?.type === 'filter') { this.openFilterEditor(layer); return; }
      if (!layer || !isPixelLayerType(layer.type) || this.ctl.isEffectivelyLocked(layer.id)) {
        alert('Seleccioná una capa de píxeles desbloqueada o creá una capa de filtro para aplicar un ajuste no destructivo.');
        return;
      }
      this.filterEditLayerId = null;
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
      if (this.updateExistingFilterLayer(selection.layer, selection.kind, selection.strength)) return;
      if (!this.canApplyDestructiveFilter(selection.layer)) {
        this.closeFilterDialog();
        return;
      }
      this.applyDestructiveFilter(selection.layer, selection.kind, selection.strength);
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
      const node = this.ctl.addLayerAbove('fill', 'Relleno', this.activeId, { fillColor: color.startsWith('#') ? color : `#${color}` });
      this.activateCreatedLayer(node);
    }

  protected createStandardLayer(type: LayerType): void {
      const name = ({ paint: `Pintura ${this.ctl.doc.layers.length}`, filter: 'Filtro', vector: 'Vectorial', text: 'Texto', group: 'Grupo', raster: 'Capa', fill: 'Relleno', file: 'Archivo' } as Record<LayerType, string>)[type];
      const active = this.active();
      const canInsertAbove = Boolean(active
        && this.ctl.isEffectivelyVisible(active.id)
        && !this.ctl.isEffectivelyLocked(active.id));
      const node = canInsertAbove && active
        ? this.ctl.addLayerAbove(type, name, active.id)
        : this.ctl.addLayer(type, name);
      this.activateCreatedLayer(node);
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
        source.file.lastModified, source.file.size, this.activeId,
      );
      this.activateCreatedLayer(node); this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      this.q<HTMLElement>('#status').textContent = this.describeImportedImage(source.file, Boolean(sourceLinkId));
    }

  protected describeImportedImage(file: File, linked: boolean): string {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      const linkStatus = linked ? 'con vínculo externo' : 'sin vínculo externo en este navegador';
      const notes: Record<string, string> = {
        psd: 'PSD importado como composición aplanada; no se reconstruyen sus capas.',
        kra: 'KRA importado desde mergedimage.png; no se reconstruyen sus capas nativas.',
        ai: 'AI importado desde su vista previa rasterizada o desde un AI PDF-compatible de PhotoMania.',
        svg: 'SVG importado como imagen rasterizada; no se convierte en una capa vectorial editable.',
        gif: 'GIF importado como imagen estática usando su primer fotograma.',
      };
      return notes[extension] ? `${notes[extension]} (${linkStatus})` : `Capa de archivo importada: ${file.name} (${linkStatus})`;
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
            'image/gif': ['.gif'], 'image/bmp': ['.bmp'], 'image/tiff': ['.tif', '.tiff'],
            'image/x-tga': ['.tga'], 'image/x-portable-pixmap': ['.ppm'], 'image/svg+xml': ['.svg'],
            'application/octet-stream': ['.psd', '.ai', '.kra'],
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
      if (!file.type.startsWith('image/') && !/\.(png|jpe?g|webp|gif|bmp|tiff?|tga|ppm|svg|psd|ai|kra)$/i.test(file.name)) {
        throw new Error('El archivo seleccionado no parece ser una imagen compatible.');
      }
      return { file, handle };
    }

  protected handleImagePickerError(error: unknown): null {
      if (error instanceof DOMException && error.name === 'AbortError') return null;
      throw error;
    }

  protected async getImageFileDimensions(file: File): Promise<{ width: number; height: number }> {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (extension === 'psd') {
        const decoded = decodePsdComposite(new Uint8Array(await file.arrayBuffer()));
        return this.validateImportedImageDimensions(decoded.width, decoded.height);
      }
      if (extension === 'kra') {
        const bytes = extractKraMergedImage(new Uint8Array(await file.arrayBuffer()));
        return this.getImageBlobDimensions(new Blob([bytes as BlobPart], { type: 'image/png' }));
      }
      if (extension === 'ai') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const decoded = decodePdfCompatibleAi(bytes);
        if (decoded) return this.validateImportedImageDimensions(decoded.width, decoded.height);
        const preview = extractAiRasterPreview(bytes);
        return this.getImageBlobDimensions(new Blob([preview as BlobPart], { type: 'image/jpeg' }));
      }
      return this.getImageBlobDimensions(file);
    }

  private async getImageBlobDimensions(blob: Blob): Promise<{ width: number; height: number }> {
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(blob); }
      catch (browserDecodeError) {
        if (!(blob instanceof File)) throw browserDecodeError;
        const decoded = await decodeImageWithSharedCore(blob);
        if (!decoded) throw browserDecodeError;
        return this.validateImportedImageDimensions(decoded.width, decoded.height);
      }
      try { return this.validateImportedImageDimensions(bitmap.width, bitmap.height); }
      finally { bitmap.close(); }
    }

  private validateImportedImageDimensions(width: number, height: number): { width: number; height: number } {
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 100_000_000) {
        throw new Error('La imagen supera el límite de dimensiones de importación de PhotoMania.');
      }
      return { width, height };
    }

  protected async imageFileToDocumentPixels(file: File): Promise<Uint8Array> {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (extension === 'psd') {
        const decoded = decodePsdComposite(new Uint8Array(await file.arrayBuffer()));
        return this.renderDecodedImageToDocumentPixels(decoded.width, decoded.height, decoded.pixels);
      }
      if (extension === 'kra') {
        const png = extractKraMergedImage(new Uint8Array(await file.arrayBuffer()));
        return this.imageBlobToDocumentPixels(new Blob([png as BlobPart], { type: 'image/png' }));
      }
      if (extension === 'ai') {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const decoded = decodePdfCompatibleAi(bytes);
        if (decoded) return this.renderDecodedImageToDocumentPixels(decoded.width, decoded.height, decoded.pixels);
        const preview = extractAiRasterPreview(bytes);
        return this.imageBlobToDocumentPixels(new Blob([preview as BlobPart], { type: 'image/jpeg' }));
      }
      try {
        const bitmap = await createImageBitmap(file);
        try {
          return this.renderBitmapToDocumentPixels(bitmap);
        } finally {
          bitmap.close();
        }
      } catch (browserDecodeError) {
        const decoded = await decodeImageWithSharedCore(file);
        if (!decoded) throw browserDecodeError;
        return this.renderDecodedImageToDocumentPixels(decoded.width, decoded.height, decoded.pixels);
      }
    }

  private async imageBlobToDocumentPixels(blob: Blob): Promise<Uint8Array> {
    const bitmap = await createImageBitmap(blob);
    try { return this.renderBitmapToDocumentPixels(bitmap); }
    finally { bitmap.close(); }
  }

  private renderDecodedImageToDocumentPixels(sourceWidth: number, sourceHeight: number, pixels: Uint8Array): Uint8Array {
    const bitmapCanvas = document.createElement('canvas');
    bitmapCanvas.width = sourceWidth;
    bitmapCanvas.height = sourceHeight;
    const bitmapContext = bitmapCanvas.getContext('2d', { willReadFrequently: true });
    if (!bitmapContext) throw new Error('Could not prepare the Shared Core decoded image.');
    const source = bitmapContext.createImageData(sourceWidth, sourceHeight);
    source.data.set(pixels);
    bitmapContext.putImageData(source, 0, 0);
    return this.renderSourceCanvasToDocumentPixels(bitmapCanvas);
  }

  private renderBitmapToDocumentPixels(bitmap: ImageBitmap): Uint8Array {
    const source = document.createElement('canvas');
    source.width = bitmap.width;
    source.height = bitmap.height;
    const context = source.getContext('2d');
    if (!context) throw new Error('Could not prepare the imported image.');
    context.drawImage(bitmap, 0, 0);
    return this.renderSourceCanvasToDocumentPixels(source);
  }

  private renderSourceCanvasToDocumentPixels(source: HTMLCanvasElement): Uint8Array {
    const { width, height } = this.ctl.doc;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not prepare the image for the file layer.');
    const scale = Math.min(1, width / source.width, height / source.height);
    const drawWidth = Math.max(1, Math.round(source.width * scale));
    const drawHeight = Math.max(1, Math.round(source.height * scale));
    const x = Math.round((width - drawWidth) / 2);
    const y = Math.round((height - drawHeight) / 2);
    context.clearRect(0, 0, width, height);
    context.drawImage(source, x, y, drawWidth, drawHeight);
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
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*,.psd,.ai,.kra' });
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
