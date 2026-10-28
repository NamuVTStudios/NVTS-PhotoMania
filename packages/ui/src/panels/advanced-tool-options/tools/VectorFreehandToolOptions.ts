import { bindBrushDynamics } from '../shared';
import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'trazo libre', supportsFill: false, hint: 'Dibujá una ruta con el puntero. Se guardan los puntos como geometría vectorial para poder mover y editar el objeto más tarde.' } as const;
export const VectorFreehandToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => `${renderVectorShapeToolSettings(context, settings)}<label class="advanced-setting">Suavizado del recorrido <output id="advanced-smoothing-value">${context.brush.smoothing}%</output><input id="advanced-smoothing" type="range" min="0" max="100" value="${context.brush.smoothing}"/></label>`,
  bind: (context) => {
    bindVectorShapeToolSettings(context, settings);
    bindBrushDynamics(context.host, context.brush);
  },
};
