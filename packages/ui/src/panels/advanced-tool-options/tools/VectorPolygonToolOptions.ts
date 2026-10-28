import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'polígono', supportsFill: true, hint: 'Arrastrá para crear un polígono triangular inicial con nodos editables. Podés modificar sus puntos desde el editor vectorial.' } as const;
export const VectorPolygonToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
