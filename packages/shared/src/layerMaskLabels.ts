import type { LayerMask } from './nvtsphoto';

const LAYER_MASK_LABELS: Record<LayerMask['type'], string> = {
  transform: 'transformación',
  colorize: 'colorización',
  filter: 'filtro',
  styles: 'estilos',
};

export function getLayerMaskLabel(type: LayerMask['type']): string {
  return LAYER_MASK_LABELS[type];
}
