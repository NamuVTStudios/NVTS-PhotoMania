import type { FilterKind } from '@nvts/shared';
import { Panel } from './Panel';
import { uiIcon } from '../components/ShellTemplates';
import { FILTER_LABELS, renderFilterGroups } from './FilterCatalog';

export const FILTER_PANEL_TEMPLATE = `
<section id="filters-panel" class="editor-panel" hidden>
  <header><strong class="panel-title-icon">${uiIcon('filter')}<span>Filtros</span></strong><span id="filters-layer-name"></span><button class="panel-close" data-close="filters-panel" type="button" aria-label="Cerrar filtros">${uiIcon('close')}</button></header>
  <div class="editor-content"><aside class="editor-list" aria-label="Categorías de filtros">${renderFilterGroups()}</aside><div class="editor-settings"><strong id="filter-title">${FILTER_LABELS.grayscale}</strong><label>Intensidad <input id="filter-radius" type="range" min="1" max="100" value="100"/><output id="filter-radius-value">100%</output></label><p class="hint" id="filter-hint">En una capa de filtro, el ajuste queda editable y afecta a las capas que están debajo.</p></div></div>
  <footer><span id="filter-mode-hint">Ajuste no destructivo</span><button data-close="filters-panel">Cancelar</button><button class="primary" id="filter-apply">Aplicar</button></footer>
</section>`;

export interface FilterPanelCallbacks {
  labelForFilter(kind: FilterKind): string;
  applyFilter(): void;
}

export interface FilterPanelConfiguration {
  layerName: string;
  kind: FilterKind;
  strength: number;
  hint: string;
  mode: string;
}

export interface FilterSelection {
  kind: FilterKind;
  strength: number;
}

/** Owns filter selection, intensity and presentation; App owns document edits. */
export class FilterPanelController extends Panel {
  private readonly title: HTMLElement;
  private readonly layerName: HTMLElement;
  private readonly intensity: HTMLInputElement;
  private readonly intensityValue: HTMLOutputElement;
  private readonly hint: HTMLElement;
  private readonly modeHint: HTMLElement;
  private mounted = false;

  constructor(root: HTMLElement, private readonly callbacks: FilterPanelCallbacks) {
    super(root, '#filters-panel');
    this.title = this.requireElement<HTMLElement>('#filter-title');
    this.layerName = this.requireElement<HTMLElement>('#filters-layer-name');
    this.intensity = this.requireElement<HTMLInputElement>('#filter-radius');
    this.intensityValue = this.requireElement<HTMLOutputElement>('#filter-radius-value');
    this.hint = this.requireElement<HTMLElement>('#filter-hint');
    this.modeHint = this.requireElement<HTMLElement>('#filter-mode-hint');
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.bindFilterChoices();
    this.bindIntensity();
    this.bindApplyAction();
  }

  configure(configuration: FilterPanelConfiguration): void {
    this.layerName.textContent = configuration.layerName;
    this.selectFilter(configuration.kind);
    const strength = Math.max(1, Math.min(100, Math.round(configuration.strength * 100)));
    this.intensity.value = String(strength);
    this.updateIntensityLabel();
    this.hint.textContent = configuration.hint;
    this.modeHint.textContent = configuration.mode;
  }

  getSelection(): FilterSelection | null {
    const activeButton = this.panelElement.querySelector<HTMLButtonElement>('[data-filter].active');
    if (!activeButton) return null;
    const kind = activeButton.dataset.filter as FilterKind | undefined;
    if (!kind) return null;
    return {
      kind,
      strength: Math.max(0.01, Math.min(1, Number(this.intensity.value) / 100)),
    };
  }

  private bindFilterChoices(): void {
    this.panelElement.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        const kind = button.dataset.filter as FilterKind | undefined;
        if (kind) this.selectFilter(kind);
      });
    });
  }

  private bindIntensity(): void {
    this.intensity.addEventListener('input', () => this.updateIntensityLabel());
  }

  private bindApplyAction(): void {
    this.root.querySelector<HTMLButtonElement>('#filter-apply')?.addEventListener('click', () => this.callbacks.applyFilter());
  }

  private selectFilter(kind: FilterKind): void {
    this.panelElement.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((button) => {
      button.classList.toggle('active', button.dataset.filter === kind);
    });
    this.title.textContent = this.callbacks.labelForFilter(kind);
  }

  private updateIntensityLabel(): void {
    this.intensityValue.textContent = `${this.intensity.value}%`;
  }

  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = this.panelElement.querySelector<T>(selector);
    if (!element) throw new Error(`Falta el control ${selector} en el panel de filtros.`);
    return element;
  }
}

export function wireFilterPanel(root: HTMLElement, callbacks: FilterPanelCallbacks): FilterPanelController | null {
  if (!root.querySelector('#filters-panel')) return null;
  const controller = new FilterPanelController(root, callbacks);
  controller.mount();
  return controller;
}
