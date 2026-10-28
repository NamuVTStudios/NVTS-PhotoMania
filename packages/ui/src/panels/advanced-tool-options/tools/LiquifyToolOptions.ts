import { bindBrushDynamics, renderBrushDynamics } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const LiquifyToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `${renderBrushDynamics(brush)}<p class="hint">El tamaño define el área de deformación. La opacidad controla cuánto se aplica cada desplazamiento; el suavizado estabiliza el recorrido.</p>`,
  bind: ({ host, brush }) => bindBrushDynamics(host, brush),
};
