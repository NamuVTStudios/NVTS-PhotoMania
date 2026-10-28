import { renderRasterShapeToolSettings, bindRasterShapeToolSettings } from './RasterShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = {"label":"polígono de píxeles","hint":"Arrastrá para crear un polígono regular rasterizado. Definí la cantidad de lados y si querés rellenarlo.","supportsFill":true,"parameter":{"key":"polygonSides","id":"advanced-pixel-polygon-sides","label":"Lados","min":3,"max":64,"suffix":""}} as const;

export const PixelPolygonToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderRasterShapeToolSettings(context, settings),
  bind: (context) => bindRasterShapeToolSettings(context, settings),
};
