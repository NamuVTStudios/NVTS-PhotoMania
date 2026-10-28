import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'rectángulo redondeado', supportsFill: true, hint: 'Arrastrá para crear un rectángulo con esquinas redondeadas editable. Ajustá el radio desde el editor vectorial.' } as const;
export const VectorRoundedRectangleToolOptions : ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
