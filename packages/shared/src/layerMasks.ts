import { cloneLayerStyles, createDefaultLayerStyles, type ColorizeMask, type FilterMask, type LayerMask, type LayerStylesMask, type TransformMask } from './nvtsphoto';

type MaskClonerMap = {
  transform: (mask: TransformMask) => TransformMask;
  colorize: (mask: ColorizeMask) => ColorizeMask;
  filter: (mask: FilterMask) => FilterMask;
  styles: (mask: LayerStylesMask) => LayerStylesMask;
};

const MASK_CLONERS: MaskClonerMap = {
  transform: (mask) => ({ ...mask }),
  colorize: (mask) => ({
    ...mask,
    transparentColors: [...mask.transparentColors],
    strokes: mask.strokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point })),
    })),
  }),
  filter: (mask) => ({ ...mask, filters: mask.filters.map((filter) => ({ ...filter })) }),
  styles: (mask) => ({ ...mask, styles: cloneLayerStyles(mask.styles) }),
};

type MaskFactoryMap = {
  [Type in LayerMask['type']]: (id: string) => Extract<LayerMask, { type: Type }>;
};

const MASK_FACTORIES: MaskFactoryMap = {
  transform: (id) => ({ id, type: 'transform', enabled: true, offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1, rotation: 0, shearX: 0, shearY: 0 }),
  colorize: (id) => ({
    id, type: 'colorize', enabled: true, editStrokes: true, showOutput: true,
    gapClose: 0, threshold: 0.4, limitToLayerBounds: true, transparentColors: [], strokes: [],
  }),
  filter: (id) => ({ id, type: 'filter', enabled: true, filters: [{ kind: 'grayscale', strength: 1 }] }),
  styles: (id) => ({ id, type: 'styles', enabled: true, styles: createDefaultLayerStyles() }),
};

export function cloneLayerMasks(masks: readonly LayerMask[] | undefined): LayerMask[] {
  return (masks ?? []).map(cloneLayerMask);
}

export function createLayerMask(type: LayerMask['type'], id: string): LayerMask {
  const factory = MASK_FACTORIES[type] as (maskId: string) => LayerMask;
  return factory(id);
}

function cloneLayerMask(mask: LayerMask): LayerMask {
  const cloner = MASK_CLONERS[mask.type] as (selectedMask: LayerMask) => LayerMask;
  return cloner(mask);
}

/** Returns the style mask when present; legacy layerStyles are used only for older documents. */
export function getLayerStylesMask(masks: readonly LayerMask[] | undefined): LayerStylesMask | undefined {
  return masks?.find((mask): mask is LayerStylesMask => mask.type === 'styles');
}

/** Returns renderable layer styles while respecting the style mask's enabled state. */
export function getRenderableLayerStyles(layer: { layerStyles?: import('./nvtsphoto').LayerStyles; masks?: readonly LayerMask[] }): import('./nvtsphoto').LayerStyles | undefined {
  const mask = getLayerStylesMask(layer.masks);
  if (mask) return mask.enabled ? mask.styles : undefined;
  return layer.layerStyles;
}
