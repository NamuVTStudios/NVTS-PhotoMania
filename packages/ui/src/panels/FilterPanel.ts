import type { FilterKind } from '@nvts/shared';

// Panel template. Event behavior lives in its panel renderer/controller.

export const FILTER_PANEL_TEMPLATE = `
<section id="filters-panel" class="editor-panel" hidden><header><strong>⚒ Filtros</strong><span id="filters-layer-name"></span><button class="panel-close" data-close="filters-panel">×</button></header><div class="editor-content"><aside class="editor-list"><button class="active" data-filter="grayscale">Escala de grises</button><button data-filter="invert">Invertir colores</button><button data-filter="sepia">Sepia</button><button data-filter="blur">Desenfoque gaussiano</button><button data-filter="brightness">Brillo</button><button data-filter="contrast">Contraste</button></aside><div class="editor-settings"><strong id="filter-title">Escala de grises</strong><label>Intensidad <input id="filter-radius" type="range" min="1" max="100" value="100"/><output id="filter-radius-value">100%</output></label><p class="hint" id="filter-hint">En una capa de filtro, el ajuste queda editable y afecta a las capas que están debajo.</p></div></div><footer><span id="filter-mode-hint">Ajuste no destructivo</span><button data-close="filters-panel">Cancelar</button><button class="primary" id="filter-apply">Aplicar</button></footer></section>
`;


export interface FilterPanelCallbacks {
  labelForFilter(kind: FilterKind): string;
  applyFilter(): void;
}

export function wireFilterPanel(root: HTMLElement, callbacks: FilterPanelCallbacks): void {
  const panel = root.querySelector<HTMLElement>('#filters-panel');
  const title = root.querySelector<HTMLElement>('#filter-title');
  const radius = root.querySelector<HTMLInputElement>('#filter-radius');
  const radiusValue = root.querySelector<HTMLOutputElement>('#filter-radius-value');
  if (!panel || !title || !radius || !radiusValue) return;

  panel.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button) => {
    button.onclick = () => {
      panel.querySelectorAll('[data-filter]').forEach((entry) => entry.classList.remove('active'));
      button.classList.add('active');
      title.textContent = callbacks.labelForFilter(button.dataset.filter as FilterKind);
    };
  });
  radius.oninput = () => { radiusValue.textContent = `${radius.value}%`; };
  root.querySelector<HTMLButtonElement>('#filter-apply')?.addEventListener('click', () => callbacks.applyFilter());
}
