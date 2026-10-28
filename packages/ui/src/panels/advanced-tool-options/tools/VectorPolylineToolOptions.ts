import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'polilínea', supportsFill: false, hint: 'Arrastrá para construir una ruta vectorial formada por segmentos rectos. Los nodos y el orden de los segmentos se pueden editar posteriormente.' } as const;
export const VectorPolylineToolOptions : ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
