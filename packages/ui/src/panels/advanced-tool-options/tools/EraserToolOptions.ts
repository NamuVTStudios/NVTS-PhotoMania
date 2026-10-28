import { bindBrushDynamics, renderBrushDynamics } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const EraserToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `${renderBrushDynamics(brush)}<p class="hint">La dureza controla la transición del borde; el espaciado y el suavizado afectan cómo se recorre el trazo al borrar.</p>`,
  bind: ({ host, brush }) => bindBrushDynamics(host, brush),
};
