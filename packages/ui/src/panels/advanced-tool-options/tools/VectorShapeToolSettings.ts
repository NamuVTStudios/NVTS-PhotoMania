import { bindShapeFill, bindStrokeOptions, renderStrokeOptions } from '../shared';
import type { AdvancedToolOptionsContext } from '../types';

export type VectorShapeToolSettings = {
  label: string;
  hint: string;
  supportsFill: boolean;
};

export function renderVectorShapeToolSettings(context: AdvancedToolOptionsContext, settings: VectorShapeToolSettings): string {
  const fill = settings.supportsFill
    ? `<label class="advanced-check"><input id="advanced-shape-fill" type="checkbox" ${context.brush.shapeFill ? 'checked' : ''}/> Rellenar ${settings.label.toLowerCase()}</label>`
    : '';
  return `${renderStrokeOptions(context.brush)}${fill}<p class="hint">${settings.hint}</p>`;
}

export function bindVectorShapeToolSettings(context: AdvancedToolOptionsContext, settings: VectorShapeToolSettings): void {
  bindStrokeOptions(context.host, context.brush);
  if (settings.supportsFill) bindShapeFill(context);
}
