import { renderRasterShapeToolSettings, bindRasterShapeToolSettings } from './RasterShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = {"label":"curva Bézier de píxeles","hint":"Arrastrá de inicio a fin para rasterizar una curva Bézier suave. El resultado se convierte en píxeles en la capa activa.","supportsFill":false} as const;

export const PixelBezierToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderRasterShapeToolSettings(context, settings),
  bind: (context) => bindRasterShapeToolSettings(context, settings),
};
