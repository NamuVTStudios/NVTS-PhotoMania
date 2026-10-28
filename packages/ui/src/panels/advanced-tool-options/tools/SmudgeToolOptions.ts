import { bindBrushDynamics, renderBrushDynamics } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const SmudgeToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `${renderBrushDynamics(brush)}<p class="hint">La opacidad de la barra de herramientas controla la intensidad de mezcla. El tamaño define el radio de los píxeles afectados.</p>`,
  bind: ({ host, brush }) => bindBrushDynamics(host, brush),
};
