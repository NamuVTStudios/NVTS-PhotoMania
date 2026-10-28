import { bindSampleMerged, bindSampleRadius } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const EyedropperToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `<label class="advanced-check"><input id="advanced-sample-merged" type="checkbox" ${brush.sampleMerged ? 'checked' : ''}/> Muestrear todas las capas visibles</label><label class="advanced-setting">Área de muestra<select id="advanced-sample-radius"><option value="1" ${brush.sampleRadius === 1 ? 'selected' : ''}>Un píxel</option><option value="3" ${brush.sampleRadius === 3 ? 'selected' : ''}>Promedio 3 × 3</option><option value="5" ${brush.sampleRadius === 5 ? 'selected' : ''}>Promedio 5 × 5</option></select></label><p class="hint">El promedio ayuda a tomar colores más uniformes en bordes suavizados o imágenes con textura.</p>`,
  bind: ({ host, brush }) => {
    bindSampleMerged(host, brush);
    bindSampleRadius(host, brush);
  },
};
