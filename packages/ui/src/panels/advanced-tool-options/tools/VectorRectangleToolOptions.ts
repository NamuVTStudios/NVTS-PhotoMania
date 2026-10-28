import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'rectángulo', supportsFill: true, hint: 'Arrastrá sobre una capa vectorial para crear un rectángulo editable. Podés ajustar el relleno, los extremos y las uniones del trazo.' } as const;
export const VectorRectangleToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
