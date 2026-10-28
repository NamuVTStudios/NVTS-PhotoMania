import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'curva Bézier', supportsFill: false, hint: 'Arrastrá para crear una curva Bézier simple con nodos de inicio y fin y manejadores editables en el editor vectorial.' } as const;
export const VectorPenToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
