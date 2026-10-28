import { uiIcon } from '../../../components/ShellTemplates';
import { bindBrushDynamics, renderBrushDynamics } from '../shared';
import type { AdvancedToolOptionsContext, ToolAdvancedOptionsDefinition } from '../types';

export const BrushToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ brush }) => `${renderBrushDynamics(brush)}${getBrushActionsMarkup()}`,
  bind: (context) => {
    bindBrushDynamics(context.host, context.brush);
    bindBrightnessActions(context);
  },
};

function getBrushActionsMarkup(): string {
  return `<div class="advanced-tool-actions"><strong>Ajustes rápidos de la capa</strong><div><button id="advanced-brightness-down" type="button">${uiIcon('brightness-down')}<span>Brillo −</span></button><button id="advanced-brightness-up" type="button">${uiIcon('brightness-up')}<span>Brillo +</span></button></div><p class="hint">Ajusta los píxeles de la capa de pintura activa y se registra en el historial.</p></div>`;
}

function bindBrightnessActions(context: AdvancedToolOptionsContext): void {
  const { host, callbacks } = context;
  host.querySelector<HTMLButtonElement>('#advanced-brightness-down')?.addEventListener('click', () => callbacks.adjustActiveLayerBrightness(-20));
  host.querySelector<HTMLButtonElement>('#advanced-brightness-up')?.addEventListener('click', () => callbacks.adjustActiveLayerBrightness(20));
}
