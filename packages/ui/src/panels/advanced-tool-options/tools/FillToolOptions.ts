import { bindCheckbox, bindSampleMerged, bindTolerance } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const FillToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `<label class="advanced-setting">Tolerancia <output id="advanced-tolerance-value">${brush.tolerance}</output><input id="advanced-tolerance" type="range" min="0" max="255" value="${brush.tolerance}"/></label><label class="advanced-check"><input id="advanced-contiguous" type="checkbox" ${brush.contiguous ? 'checked' : ''}/> Solo píxeles contiguos</label><label class="advanced-check"><input id="advanced-sample-merged" type="checkbox" ${brush.sampleMerged ? 'checked' : ''}/> Muestrear todas las capas visibles</label><p class="hint">Con contiguos desactivado se rellenan todas las zonas que coinciden con el color inicial dentro de la tolerancia.</p>`,
  bind: ({ host, brush }) => {
    bindTolerance(host, brush);
    bindCheckbox(host, '#advanced-contiguous', (checked) => { brush.contiguous = checked; });
    bindSampleMerged(host, brush);
  },
};
