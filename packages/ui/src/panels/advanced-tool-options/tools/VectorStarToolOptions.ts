import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'estrella', supportsFill: true, hint: 'Arrastrá para crear una estrella vectorial editable. El número de puntas se puede ajustar desde el editor vectorial.' } as const;
export const VectorStarToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
