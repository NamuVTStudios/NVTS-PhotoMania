import { bindVectorAspect } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const VectorSelectToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `<label class="advanced-check"><input id="advanced-vector-aspect" type="checkbox" ${brush.vectorKeepAspectRatio ? 'checked' : ''}/> Mantener proporción al redimensionar</label><p class="hint">Seleccioná un objeto dentro de una capa vectorial. Arrastrá su interior para moverlo o el control inferior derecho para redimensionarlo.</p><button type="button" id="advanced-vector-edit">Abrir editor de objetos vectoriales…</button>`,
  bind: (context) => {
    bindVectorAspect(context.host, context.brush);
    context.host.querySelector<HTMLButtonElement>('#advanced-vector-edit')?.addEventListener('click', () => context.callbacks.editVectorLayer());
  },
};
