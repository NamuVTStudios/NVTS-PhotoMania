import { renderRasterShapeToolSettings, bindRasterShapeToolSettings } from './RasterShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = {"label":"polilínea de píxeles","hint":"Arrastrá para capturar varios puntos y rasterizar una ruta de segmentos rectos en la capa de pintura.","supportsFill":false} as const;

export const PixelPolylineToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderRasterShapeToolSettings(context, settings),
  bind: (context) => bindRasterShapeToolSettings(context, settings),
};
