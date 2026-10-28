import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'línea', supportsFill: false, hint: 'Arrastrá desde el punto inicial hasta el final. La línea mantiene coordenadas vectoriales y se puede redimensionar sin rasterizar su modelo.' } as const;
export const VectorLineToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
