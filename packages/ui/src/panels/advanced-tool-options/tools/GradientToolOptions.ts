import { bindGradientSettings } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const GradientToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `<label class="advanced-setting">Tipo de degradado<select id="advanced-gradient-type"><option value="linear" ${brush.gradientType === 'linear' ? 'selected' : ''}>Lineal</option><option value="radial" ${brush.gradientType === 'radial' ? 'selected' : ''}>Radial</option></select></label><label class="advanced-setting">Opacidad <output id="advanced-gradient-opacity-value">${brush.opacity}%</output><input id="advanced-gradient-opacity" type="range" min="1" max="100" value="${brush.opacity}"/></label><label class="advanced-check"><input id="advanced-gradient-reverse" type="checkbox" ${brush.gradientReverse ? 'checked' : ''}/> Invertir (transparente a color)</label><p class="hint">Arrastrá sobre el lienzo para definir la longitud del degradado. El modo radial usa el punto inicial como centro.</p>`,
  bind: ({ host, brush }) => bindGradientSettings(host, brush),
};
