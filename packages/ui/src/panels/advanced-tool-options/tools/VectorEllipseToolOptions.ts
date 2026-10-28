import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'elipse', supportsFill: true, hint: 'Arrastrá para crear una elipse vectorial. El relleno y las propiedades del contorno se pueden cambiar después desde el editor vectorial.' } as const;
export const VectorEllipseToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
