import { renderRasterShapeToolSettings, bindRasterShapeToolSettings } from './RasterShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = {"label":"estrella de píxeles","hint":"Arrastrá para rasterizar una estrella. Podés definir la cantidad de puntas y activar o desactivar el relleno.","supportsFill":true,"parameter":{"key":"starPoints","id":"advanced-pixel-star-points","label":"Puntas","min":3,"max":64,"suffix":""}} as const;

export const PixelStarToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderRasterShapeToolSettings(context, settings),
  bind: (context) => bindRasterShapeToolSettings(context, settings),
};
