import type { LayerNode } from '@nvts/document-model';
import { Panel } from './Panel';

export const LAYER_EFFECTS_PANEL_TEMPLATE = `
<section id="effects-panel" class="editor-panel" hidden><header><strong>✧ Estilos de capa</strong><select id="effects-layer-select" aria-label="Capa para editar estilos"></select><button class="panel-close" data-close="effects-panel">×</button></header><div class="editor-content"><aside class="editor-list"><button class="active">□ Trazo</button><button>□ Superposición de colores</button><button>□ Superposición de degradados</button><button>□ Resplandor exterior</button><button>□ Bisel y relieve</button></aside><div class="editor-settings"><strong>Trazo</strong><label>Tamaño <input type="range" min="1" max="40" value="3"/><output>3 px</output></label><label>Opacidad <input type="range" min="0" max="100" value="100"/><output>100%</output></label><label>Posición <select><option>Exterior</option><option>Interior</option><option>Centro</option></select></label><label>Color <input type="color" value="#000000"/></label></div></div><footer><span>Vista previa en vivo</span><button data-close="effects-panel">Cancelar</button><button class="primary" id="effects-apply">Aplicar</button></footer></section>
`;

/** Owns the layer selector and visibility behavior for the layer-effects editor. */
export class LayerEffectsPanelController extends Panel {
  private readonly layerSelector: HTMLSelectElement;
  private mounted = false;

  constructor(
    root: HTMLElement,
    private readonly onLayerChange: (layerId: string) => void,
    private readonly onApply: () => void,
  ) {
    super(root, '#effects-panel');
    const selector = this.panelElement.querySelector<HTMLSelectElement>('#effects-layer-select');
    if (!selector) throw new Error('Falta el selector de capas en el panel de estilos.');
    this.layerSelector = selector;
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.layerSelector.addEventListener('change', () => {
      const layerId = this.layerSelector.value;
      if (layerId) this.onLayerChange(layerId);
    });
    this.root.querySelector<HTMLButtonElement>('#effects-apply')?.addEventListener('click', () => this.onApply());
  }

  configureLayers(layers: LayerNode[], selectedLayerId: string): void {
    this.layerSelector.replaceChildren();
    this.appendLayerOptions(layers, selectedLayerId, '');
  }

  private appendLayerOptions(layers: LayerNode[], selectedLayerId: string, prefix: string): void {
    for (const layer of layers) {
      const option = document.createElement('option');
      option.value = layer.id;
      option.textContent = `${prefix}${layer.name}`;
      option.selected = layer.id === selectedLayerId;
      this.layerSelector.append(option);
      this.appendLayerOptions(layer.children, selectedLayerId, `${prefix}↳ `);
    }
  }
}

export function wireLayerEffectsPanel(
  root: HTMLElement,
  onLayerChange: (layerId: string) => void,
  onApply: () => void = () => undefined,
): LayerEffectsPanelController | null {
  if (!root.querySelector('#effects-panel')) return null;
  const controller = new LayerEffectsPanelController(root, onLayerChange, onApply);
  controller.mount();
  return controller;
}
