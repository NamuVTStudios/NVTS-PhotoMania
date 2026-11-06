import { bindBrushDynamics } from '../shared';
import type { ToolAdvancedOptionsDefinition } from '../types';

export const SmudgeToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `<label class="advanced-setting">Modo de mezcla<select id="advanced-smudge-mode"><option value="smudge" ${brush.smudgeMode === 'smudge' ? 'selected' : ''}>Punta del dedo</option><option value="blur" ${brush.smudgeMode === 'blur' ? 'selected' : ''}>Desenfocar</option><option value="mixer" ${brush.smudgeMode === 'mixer' ? 'selected' : ''}>Mezclador de pintura</option><option value="wet" ${brush.smudgeMode === 'wet' ? 'selected' : ''}>Mezcla húmeda</option></select></label><p class="hint">El mezclador incorpora el color principal; la mezcla húmeda conserva mayor influencia del color muestreado. El desenfoque suaviza los píxeles vecinos.</p>`,
  bind: ({ host, brush }) => {
    bindBrushDynamics(host, brush);
    host.querySelector<HTMLSelectElement>('#advanced-smudge-mode')?.addEventListener('change', (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      brush.smudgeMode = value === 'blur' || value === 'mixer' || value === 'wet' ? value : 'smudge';
    });
  },
};
