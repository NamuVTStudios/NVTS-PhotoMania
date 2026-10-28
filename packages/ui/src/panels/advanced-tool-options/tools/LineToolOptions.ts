import { bindStrokeOptions, renderStrokeOptions } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const LineToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `${renderStrokeOptions(brush)}<p class="hint">Los extremos y las uniones se aplican al dibujar la línea.</p>`,
  bind: ({ host, brush }) => bindStrokeOptions(host, brush),
};
