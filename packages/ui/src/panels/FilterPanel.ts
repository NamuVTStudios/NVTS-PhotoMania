import type { FilterKind } from '@nvts/shared';

export const FILTER_PANEL_TEMPLATE = `
<section id="filters-panel" class="editor-panel" hidden><header><strong>⚒ Filtros</strong><span id="filters-layer-name"></span><button class="panel-close" data-close="filters-panel">×</button></header><div class="editor-content"><aside class="editor-list" aria-label="Categorías de filtros">
<div class="filter-group"><strong>Ajustes fotográficos</strong><button class="active" data-filter="grayscale">Escala de grises</button><button data-filter="brightness">Brillo</button><button data-filter="contrast">Contraste</button><button data-filter="saturation">Saturación</button><button data-filter="hue-rotate">Rotación de tono</button><button data-filter="sepia">Sepia</button><button data-filter="invert">Invertir colores</button><button data-filter="blur">Desenfoque gaussiano</button><button data-filter="sharpen">Enfocar</button></div>
<div class="filter-group"><strong>Ilustración y cómic</strong><button data-filter="posterize">Posterizar</button><button data-filter="threshold">Umbral blanco y negro</button><button data-filter="duotone">Duotono</button><button data-filter="solarize">Solarizar</button><button data-filter="pixelate">Pixelar / mosaico</button><button data-filter="edge-detect">Bordes / contorno</button></div>
<div class="filter-group"><strong>Textura y acabado</strong><button data-filter="noise">Grano / ruido</button><button data-filter="vignette">Viñeta</button></div>
</aside><div class="editor-settings"><strong id="filter-title">Escala de grises</strong><label>Intensidad <input id="filter-radius" type="range" min="1" max="100" value="100"/><output id="filter-radius-value">100%</output></label><p class="hint" id="filter-hint">En una capa de filtro, el ajuste queda editable y afecta a las capas que están debajo.</p></div></div><footer><span id="filter-mode-hint">Ajuste no destructivo</span><button data-close="filters-panel">Cancelar</button><button class="primary" id="filter-apply">Aplicar</button></footer></section>
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

  panel.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((button) => {
    button.onclick = () => selectFilter(panel, button, title, callbacks);
  });
  radius.oninput = () => { radiusValue.textContent = `${radius.value}%`; };
  root.querySelector<HTMLButtonElement>('#filter-apply')?.addEventListener('click', () => callbacks.applyFilter());
}

function selectFilter(
  panel: HTMLElement,
  button: HTMLButtonElement,
  title: HTMLElement,
  callbacks: FilterPanelCallbacks,
): void {
  panel.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((entry) => entry.classList.remove('active'));
  button.classList.add('active');
  title.textContent = callbacks.labelForFilter(button.dataset.filter as FilterKind);
}
