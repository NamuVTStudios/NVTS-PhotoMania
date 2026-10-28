import { bindShapeFill, bindStrokeOptions } from '../shared';
import type { AdvancedToolOptionsContext } from '../types';

export type RasterShapeParameter = 'shapeCornerRadius' | 'polygonSides' | 'starPoints' | 'spiralTurns';

export interface RasterShapeToolSettings {
  label: string;
  hint: string;
  supportsFill: boolean;
  parameter?: { key: RasterShapeParameter; id: string; label: string; min: number; max: number; suffix: string };
}

export function renderRasterShapeToolSettings(context: AdvancedToolOptionsContext, settings: RasterShapeToolSettings): string {
  const fill = settings.supportsFill
    ? `<label class="advanced-check"><input id="advanced-shape-fill" type="checkbox" ${context.brush.shapeFill ? 'checked' : ''}/> Rellenar ${settings.label.toLowerCase()}</label>`
    : '';
  const parameter = settings.parameter ? renderRasterShapeParameter(context, settings.parameter) : '';
  return `${renderStrokeSettings(context)}${fill}${parameter}<p class="hint">${settings.hint}</p>`;
}

function renderStrokeSettings(context: AdvancedToolOptionsContext): string {
  return `<label class="advanced-setting">Extremos de línea<select id="advanced-line-cap"><option value="round" ${context.brush.lineCap === 'round' ? 'selected' : ''}>Redondos</option><option value="butt" ${context.brush.lineCap === 'butt' ? 'selected' : ''}>Rectos</option><option value="square" ${context.brush.lineCap === 'square' ? 'selected' : ''}>Cuadrados</option></select></label><label class="advanced-setting">Uniones<select id="advanced-line-join"><option value="round" ${context.brush.lineJoin === 'round' ? 'selected' : ''}>Redondeadas</option><option value="miter" ${context.brush.lineJoin === 'miter' ? 'selected' : ''}>En punta</option><option value="bevel" ${context.brush.lineJoin === 'bevel' ? 'selected' : ''}>Biseladas</option></select></label>`;
}

function renderRasterShapeParameter(
  context: AdvancedToolOptionsContext,
  parameter: NonNullable<RasterShapeToolSettings['parameter']>,
): string {
  return `<label class="advanced-setting">${parameter.label}<input id="${parameter.id}" type="number" min="${parameter.min}" max="${parameter.max}" step="1" value="${context.brush[parameter.key]}"/>${parameter.suffix}</label>`;
}

export function bindRasterShapeToolSettings(context: AdvancedToolOptionsContext, settings: RasterShapeToolSettings): void {
  const { host, brush } = context;
  bindStrokeOptions(host, brush);
  if (settings.supportsFill) bindShapeFill(context);
  const parameter = settings.parameter;
  if (!parameter) return;
  host.querySelector<HTMLInputElement>(`#${parameter.id}`)?.addEventListener('input', (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const parsed = Number(input.value);
    if (!Number.isFinite(parsed)) return;
    brush[parameter.key] = Math.max(parameter.min, Math.min(parameter.max, Math.round(parsed)));
    input.value = String(brush[parameter.key]);
  });
}
