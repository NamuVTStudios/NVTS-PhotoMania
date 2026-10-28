import { bindNavigationSettings } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const HandToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `<label class="advanced-setting">Sensibilidad del desplazamiento <output id="advanced-pan-sensitivity-value">${brush.panSensitivity}%</output><input id="advanced-pan-sensitivity" type="range" min="25" max="200" step="5" value="${brush.panSensitivity}"/></label><label class="advanced-setting">Incremento de zoom <output id="advanced-zoom-increment-value">${Math.round((brush.zoomIncrement - 1) * 100)}%</output><input id="advanced-zoom-increment" type="range" min="1.05" max="1.5" step="0.05" value="${brush.zoomIncrement}"/></label><p class="hint">La sensibilidad cambia la velocidad al arrastrar. El incremento afecta al zoom con Ctrl/Cmd + rueda.</p>`,
  bind: ({ host, brush }) => bindNavigationSettings(host, brush),
};
