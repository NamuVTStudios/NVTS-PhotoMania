import { bindBrushDynamics, renderBrushDynamics } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const CloneStampToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `${renderBrushDynamics(brush)}<p class="hint">Mantené Alt y hacé clic en el lienzo para definir el origen. Después arrastrá para copiar esa zona sobre la capa de pintura activa.</p>`,
  bind: ({ host, brush }) => bindBrushDynamics(host, brush),
};
