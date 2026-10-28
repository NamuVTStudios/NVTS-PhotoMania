import { renderRasterShapeToolSettings, bindRasterShapeToolSettings } from './RasterShapeToolSettings';
import type { ToolAdvancedOptionsDefinition } from '../types';

const settings = {"label":"espiral de píxeles","hint":"Arrastrá para rasterizar una espiral dentro del área delimitada. La cantidad de vueltas se puede ajustar.","supportsFill":false,"parameter":{"key":"spiralTurns","id":"advanced-pixel-spiral-turns","label":"Vueltas","min":1,"max":12,"suffix":" vueltas"}} as const;

export const PixelSpiralToolOptions: ToolAdvancedOptionsDefinition = {
  render: (context) => renderRasterShapeToolSettings(context, settings),
  bind: (context) => bindRasterShapeToolSettings(context, settings),
};
