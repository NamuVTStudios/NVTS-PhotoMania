import { renderVectorShapeToolSettings, bindVectorShapeToolSettings } from './VectorShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = { label: 'espiral', supportsFill: false, hint: 'Arrastrá para definir el tamaño de la espiral vectorial. Podés moverla, redimensionarla y cambiar su trazo desde el editor vectorial.' } as const;
export const VectorSpiralToolOptions : ToolAdvancedOptionsDefinition = {
  render: (context) => renderVectorShapeToolSettings(context, settings),
  bind: (context) => bindVectorShapeToolSettings(context, settings),
};
