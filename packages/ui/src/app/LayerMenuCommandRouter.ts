/** Supported commands that require an active layer selection. */
export type LayerMenuCommand =
  | 'duplicate'
  | 'rename'
  | 'move-up'
  | 'move-down'
  | 'delete'
  | 'effects'
  | 'visibility'
  | 'lock'
  | 'opacity'
  | 'blend'
  | 'group'
  | 'transform';

export interface LayerMenuCommandHandlers {
  createPaintLayer(): void;
  reportMissingSelection(): void;
  selectedLayerActions: Partial<Record<LayerMenuCommand, () => void>>;
}

/** Routes a layer-menu command only after checking whether selection is required. */
export function routeLayerMenuAction(
  action: string,
  hasActiveLayer: boolean,
  handlers: LayerMenuCommandHandlers,
): void {
  if (action === 'new-paint') {
    handlers.createPaintLayer();
    return;
  }
  if (!hasActiveLayer) {
    handlers.reportMissingSelection();
    return;
  }
  const selectedAction = handlers.selectedLayerActions[action as LayerMenuCommand];
  if (!selectedAction) return;
  selectedAction();
}
