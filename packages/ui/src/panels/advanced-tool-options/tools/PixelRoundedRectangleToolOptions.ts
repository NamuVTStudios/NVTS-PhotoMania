import { renderRasterShapeToolSettings, bindRasterShapeToolSettings } from './RasterShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = {"label":"rectángulo redondeado de píxeles","hint":"Arrastrá sobre una capa de pintura para rasterizar un rectángulo redondeado. El radio de esquina y el relleno son configurables.","supportsFill":true,"parameter":{"key":"shapeCornerRadius","id":"advanced-pixel-corner-radius","label":"Radio de esquina","min":0,"max":256,"suffix":" px"}} as const;

export const PixelRoundedRectangleToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderRasterShapeToolSettings(context, settings),
  bind: (context) => bindRasterShapeToolSettings(context, settings),
};
