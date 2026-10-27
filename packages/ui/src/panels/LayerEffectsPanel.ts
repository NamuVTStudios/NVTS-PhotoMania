// Panel template. Event behavior lives in its panel renderer/controller.

export const LAYER_EFFECTS_PANEL_TEMPLATE = `
<section id="effects-panel" class="editor-panel" hidden><header><strong>✧ Estilos de capa</strong><select id="effects-layer-select" aria-label="Capa para editar estilos"></select><button class="panel-close" data-close="effects-panel">×</button></header><div class="editor-content"><aside class="editor-list"><button class="active">□ Trazo</button><button>□ Superposición de colores</button><button>□ Superposición de degradados</button><button>□ Resplandor exterior</button><button>□ Bisel y relieve</button></aside><div class="editor-settings"><strong>Trazo</strong><label>Tamaño <input type="range" min="1" max="40" value="3"/><output>3 px</output></label><label>Opacidad <input type="range" min="0" max="100" value="100"/><output>100%</output></label><label>Posición <select><option>Exterior</option><option>Interior</option><option>Centro</option></select></label><label>Color <input type="color" value="#000000"/></label></div></div><footer><span>Vista previa en vivo</span><button data-close="effects-panel">Cancelar</button><button class="primary" id="effects-apply">Aplicar</button></footer></section>
`;

/** Wires the close/apply controls owned by the layer-effects panel. */
export function wireLayerEffectsPanel(root: HTMLElement, onLayerChange: (layerId: string) => void): void {
  const panel = root.querySelector<HTMLElement>('#effects-panel');
  root.querySelector<HTMLSelectElement>('#effects-layer-select')?.addEventListener('change', (event) => {
    const layerId = (event.currentTarget as HTMLSelectElement).value;
    if (layerId) onLayerChange(layerId);
  });
  root.querySelector<HTMLButtonElement>('#effects-apply')?.addEventListener('click', () => {
    if (panel) panel.hidden = true;
  });
}
