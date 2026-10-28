import { bindShapeFill, bindStrokeOptions, renderStrokeOptions } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const EllipseToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `${renderStrokeOptions(brush)}<label class="advanced-check"><input id="advanced-shape-fill" type="checkbox" ${brush.shapeFill ? 'checked' : ''}/> Rellenar elipse</label><p class="hint">Si el relleno está desactivado, se dibuja solamente el contorno de la figura.</p>`,
  bind: (context) => {
    bindStrokeOptions(context.host, context.brush);
    bindShapeFill(context);
  },
};
