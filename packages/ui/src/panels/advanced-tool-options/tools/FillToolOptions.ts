import { bindCheckbox, bindSampleMerged, bindTolerance } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const FillToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `<label class="advanced-setting">Tolerancia <output id="advanced-tolerance-value">${brush.tolerance}</output><input id="advanced-tolerance" type="range" min="0" max="255" value="${brush.tolerance}"/></label><label class="advanced-check"><input id="advanced-contiguous" type="checkbox" ${brush.contiguous ? 'checked' : ''}/> Solo píxeles contiguos</label><label class="advanced-check"><input id="advanced-sample-merged" type="checkbox" ${brush.sampleMerged ? 'checked' : ''}/> Muestrear todas las capas visibles</label><label class="advanced-setting">Cerrar huecos<select id="advanced-gap-closure"><option value="0" ${brush.gapClosure === 0 ? 'selected' : ''}>Desactivado</option><option value="1" ${brush.gapClosure === 1 ? 'selected' : ''}>Huecos de 1 px</option><option value="2" ${brush.gapClosure === 2 ? 'selected' : ''}>Huecos de hasta 2 px</option></select></label><p class="hint">El cierre morfológico ayuda a evitar fugas de relleno en contornos con pequeñas interrupciones.</p>`,
  bind: ({ host, brush }) => {
    bindTolerance(host, brush);
    bindCheckbox(host, '#advanced-contiguous', (checked) => { brush.contiguous = checked; });
    bindSampleMerged(host, brush);
    host.querySelector<HTMLSelectElement>('#advanced-gap-closure')?.addEventListener('change', (event) => {
      const value = Number((event.currentTarget as HTMLSelectElement).value);
      brush.gapClosure = value === 2 ? 2 : value === 1 ? 1 : 0;
    });
  },
};
