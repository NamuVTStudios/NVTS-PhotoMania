import type { LayerNode } from '@nvts/document-model';
import { cloneLayerStyles, createDefaultLayerStyles, getLayerStylesMask, type LayerStyles } from '@nvts/shared';
import { Panel } from './Panel';
import { uiIcon } from '../components/ShellTemplates';

export const LAYER_EFFECTS_PANEL_TEMPLATE = `
<section id="effects-panel" class="editor-panel" hidden>
  <header><strong class="panel-title-icon">${uiIcon('effects')}<span>Estilos de capa</span></strong><select id="effects-layer-select" aria-label="Capa para editar estilos"></select><button class="panel-close" data-close="effects-panel" type="button" aria-label="Cerrar estilos">${uiIcon('close')}</button></header>
  <div class="editor-content layer-style-content">
    <p class="layer-style-description">Los efectos se guardan como parámetros editables y se renderizan sin modificar los píxeles originales.</p>
    <p id="effects-layer-style-warning" class="layer-style-note" hidden>Las capas de filtro modifican el contenido inferior y no admiten estilos de contorno en esta versión.</p>
    <label for="effects-opacity">Opacidad de capa <output id="effects-opacity-value">100%</output></label>
    <input id="effects-opacity" type="range" min="0" max="100" value="100" data-output="effects-opacity-value" data-suffix="%" />
    <label for="effects-blend">Modo de fusión</label>
    <select id="effects-blend"><option value="normal">Normal</option><option value="multiply">Multiplicar</option><option value="screen">Trama</option><option value="overlay">Superponer</option></select>

    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-stroke-enabled" type="checkbox" /> Trazo</label></legend>
      <label for="effects-stroke-color">Color</label><input id="effects-stroke-color" type="color" value="#ffffff" />
      <label for="effects-stroke-size">Tamaño <output id="effects-stroke-size-value">3 px</output></label>
      <input id="effects-stroke-size" type="range" min="1" max="32" value="3" data-output="effects-stroke-size-value" data-suffix=" px" />
      <label for="effects-stroke-opacity">Opacidad <output id="effects-stroke-opacity-value">100%</output></label>
      <input id="effects-stroke-opacity" type="range" min="0" max="100" value="100" data-output="effects-stroke-opacity-value" data-suffix="%" />
    </fieldset>
    <fieldset class="layer-style-effect layer-style-stroke-stack">
      <legend>Trazos adicionales</legend>
      <p class="layer-style-note">Agrega tantos trazos como necesites. Cada instancia tiene su propio color, grosor y opacidad.</p>
      <div id="effects-stroke-stack" class="layer-style-stroke-stack-list"></div>
      <button id="effects-stroke-add" type="button">+ Agregar trazo</button>
    </fieldset>



    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-glow-enabled" type="checkbox" /> Resplandor exterior</label></legend>
      <label for="effects-glow-color">Color</label><input id="effects-glow-color" type="color" value="#fff2a8" />
      <label for="effects-glow-size">Tamaño <output id="effects-glow-size-value">12 px</output></label>
      <input id="effects-glow-size" type="range" min="1" max="64" value="12" data-output="effects-glow-size-value" data-suffix=" px" />
      <label for="effects-glow-opacity">Opacidad <output id="effects-glow-opacity-value">75%</output></label>
      <input id="effects-glow-opacity" type="range" min="0" max="100" value="75" data-output="effects-glow-opacity-value" data-suffix="%" />
    </fieldset>

    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Resplandores adicionales</legend>
      <p class="layer-style-note">Cada resplandor adicional conserva sus propios parámetros.</p>
      <div id="effects-glow-stack" class="layer-style-instance-list"></div>
      <button id="effects-glow-add" type="button">+ Agregar resplandor</button>
    </fieldset>



    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-shadow-enabled" type="checkbox" /> Sombra paralela</label></legend>
      <label for="effects-shadow-color">Color</label><input id="effects-shadow-color" type="color" value="#000000" />
      <label for="effects-shadow-size">Desenfoque <output id="effects-shadow-size-value">8 px</output></label>
      <input id="effects-shadow-size" type="range" min="0" max="64" value="8" data-output="effects-shadow-size-value" data-suffix=" px" />
      <label for="effects-shadow-distance">Distancia <output id="effects-shadow-distance-value">6 px</output></label>
      <input id="effects-shadow-distance" type="range" min="0" max="128" value="6" data-output="effects-shadow-distance-value" data-suffix=" px" />
      <label for="effects-shadow-angle">Ángulo <output id="effects-shadow-angle-value">45°</output></label>
      <input id="effects-shadow-angle" type="range" min="-180" max="180" value="45" data-output="effects-shadow-angle-value" data-suffix="°" />
      <label for="effects-shadow-opacity">Opacidad <output id="effects-shadow-opacity-value">55%</output></label>
      <input id="effects-shadow-opacity" type="range" min="0" max="100" value="55" data-output="effects-shadow-opacity-value" data-suffix="%" />
    </fieldset>

    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Sombras adicionales</legend>
      <p class="layer-style-note">Agrega sombras con distancia, ángulo, desenfoque y opacidad independientes.</p>
      <div id="effects-shadow-stack" class="layer-style-instance-list"></div>
      <button id="effects-shadow-add" type="button">+ Agregar sombra</button>
    </fieldset>



    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-bevel-enabled" type="checkbox" /> Bisel y relieve</label></legend>
      <label for="effects-bevel-size">Tamaño <output id="effects-bevel-size-value">4 px</output></label>
      <input id="effects-bevel-size" type="range" min="1" max="32" value="4" data-output="effects-bevel-size-value" data-suffix=" px" />
      <label for="effects-bevel-depth">Profundidad <output id="effects-bevel-depth-value">5</output></label>
      <input id="effects-bevel-depth" type="range" min="1" max="10" value="5" data-output="effects-bevel-depth-value" data-suffix="" />
      <label for="effects-bevel-angle">Ángulo de luz <output id="effects-bevel-angle-value">45°</output></label>
      <input id="effects-bevel-angle" type="range" min="-180" max="180" value="45" data-output="effects-bevel-angle-value" data-suffix="°" />
      <label for="effects-bevel-altitude">Altitud <output id="effects-bevel-altitude-value">45°</output></label>
      <input id="effects-bevel-altitude" type="range" min="0" max="90" value="45" data-output="effects-bevel-altitude-value" data-suffix="°" />
      <label for="effects-bevel-highlight">Color de luz</label><input id="effects-bevel-highlight" type="color" value="#ffffff" />
      <label for="effects-bevel-shadow">Color de sombra</label><input id="effects-bevel-shadow" type="color" value="#000000" />
      <label for="effects-bevel-opacity">Opacidad <output id="effects-bevel-opacity-value">70%</output></label>
      <input id="effects-bevel-opacity" type="range" min="0" max="100" value="70" data-output="effects-bevel-opacity-value" data-suffix="%" />
    </fieldset>

    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Biseles adicionales</legend>
      <p class="layer-style-note">Cada bisel puede tener iluminación, profundidad y colores propios.</p>
      <div id="effects-bevel-stack" class="layer-style-instance-list"></div>
      <button id="effects-bevel-add" type="button">+ Agregar bisel</button>
    </fieldset>

    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-gradient-enabled" type="checkbox" /> Superposición de degradado</label></legend>
      <label for="effects-gradient-start">Color inicial</label><input id="effects-gradient-start" type="color" value="#ff5e62" />
      <label for="effects-gradient-end">Color final</label><input id="effects-gradient-end" type="color" value="#6a5af9" />
      <label for="effects-gradient-angle">Ángulo <output id="effects-gradient-angle-value">90°</output></label><input id="effects-gradient-angle" type="range" min="-180" max="180" value="90" data-output="effects-gradient-angle-value" data-suffix="°" />
      <label for="effects-gradient-opacity">Opacidad <output id="effects-gradient-opacity-value">100%</output></label><input id="effects-gradient-opacity" type="range" min="0" max="100" value="100" data-output="effects-gradient-opacity-value" data-suffix="%" />
    </fieldset>
    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Degradados adicionales</legend>
      <p class="layer-style-note">Cada degradado tiene sus propios colores, ángulo y opacidad.</p>
      <div id="effects-gradient-stack" class="layer-style-instance-list"></div>
      <button id="effects-gradient-add" type="button">+ Agregar degradado</button>
    </fieldset>

    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-inner-shadow-enabled" type="checkbox" /> Sombra interior</label></legend>
      <label for="effects-inner-shadow-color">Color</label><input id="effects-inner-shadow-color" type="color" value="#000000" />
      <label for="effects-inner-shadow-size">Desenfoque <output id="effects-inner-shadow-size-value">8 px</output></label><input id="effects-inner-shadow-size" type="range" min="0" max="64" value="8" data-output="effects-inner-shadow-size-value" data-suffix=" px" />
      <label for="effects-inner-shadow-distance">Distancia <output id="effects-inner-shadow-distance-value">4 px</output></label><input id="effects-inner-shadow-distance" type="range" min="0" max="128" value="4" data-output="effects-inner-shadow-distance-value" data-suffix=" px" />
      <label for="effects-inner-shadow-angle">Ángulo <output id="effects-inner-shadow-angle-value">45°</output></label><input id="effects-inner-shadow-angle" type="range" min="-180" max="180" value="45" data-output="effects-inner-shadow-angle-value" data-suffix="°" />
      <label for="effects-inner-shadow-opacity">Opacidad <output id="effects-inner-shadow-opacity-value">55%</output></label><input id="effects-inner-shadow-opacity" type="range" min="0" max="100" value="55" data-output="effects-inner-shadow-opacity-value" data-suffix="%" />
    </fieldset>
    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Sombras interiores adicionales</legend>
      <p class="layer-style-note">Cada sombra interior mantiene sus propios parámetros.</p>
      <div id="effects-inner-shadow-stack" class="layer-style-instance-list"></div>
      <button id="effects-inner-shadow-add" type="button">+ Agregar sombra interior</button>
    </fieldset>
  </div>
  <footer><button data-close="effects-panel" type="button">Cancelar</button><button class="primary" id="effects-apply" type="button">Aplicar</button></footer>
</section>`;

/** Owns layer-style form state and dispatches changes through the application callback. */
export class LayerEffectsPanelController extends Panel {
  private readonly layerSelector: HTMLSelectElement;
  private mounted = false;
  private stylesForEditing: LayerStyles = createDefaultLayerStyles();
  private readonly opacityInput: HTMLInputElement;
  private readonly blendInput: HTMLSelectElement;

  constructor(
    root: HTMLElement,
    private readonly onLayerChange: (layerId: string) => void,
    private readonly onApply: () => void,
  ) {
    super(root, '#effects-panel');
    this.layerSelector = this.requireElement<HTMLSelectElement>('#effects-layer-select');
    this.opacityInput = this.requireElement<HTMLInputElement>('#effects-opacity');
    this.blendInput = this.requireElement<HTMLSelectElement>('#effects-blend');
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.bindLayerSelector();
    this.bindRangeOutputs();
    this.bindApplyButton();
    this.bindStrokeStack();
    this.bindEffectStacks();
  }

  configureLayers(layers: LayerNode[], selectedLayerId: string): void {
    this.layerSelector.replaceChildren();
    this.appendLayerOptions(layers, selectedLayerId, '');
  }

  configureCurrentStyle(layer: LayerNode): void {
    this.opacityInput.value = String(Math.round(layer.opacity * 100));
    this.blendInput.value = layer.blendMode;
    const styleMask = getLayerStylesMask(layer.masks);
    const styles = cloneLayerStyles(styleMask?.styles ?? layer.layerStyles);
    this.stylesForEditing = styles;
    this.writeStyleFields(styles);
    this.renderStrokeStack(styles.strokes ?? []);
    this.renderEffectStack('glow', styles.outerGlows ?? []);
    this.renderEffectStack('shadow', styles.dropShadows ?? []);
    this.renderEffectStack('bevel', styles.bevelEmbosses ?? []);
    this.renderEffectStack('gradient', styles.gradientOverlays ?? []);
    this.renderEffectStack('inner-shadow', styles.innerShadows ?? []);
    this.setEffectFieldsDisabled(layer.type === 'filter');
    this.setUnsupportedTypeWarning(layer.type === 'filter');
    this.updateRangeOutputs();
  }

  getStyle(): { opacity: number; blendMode: LayerNode['blendMode']; layerStyles: LayerStyles } {
    return {
      opacity: Number(this.opacityInput.value) / 100,
      blendMode: this.blendInput.value as LayerNode['blendMode'],
      layerStyles: {
        stroke: this.readStrokeStyle(),
        outerGlow: this.readGlowStyle(),
        dropShadow: this.readShadowStyle(),
        bevelEmboss: this.readBevelStyle(),
        strokes: this.readStrokeStack(),
        outerGlows: this.readEffectStack('glow') as unknown as NonNullable<LayerStyles['outerGlows']>,
        dropShadows: this.readEffectStack('shadow') as unknown as NonNullable<LayerStyles['dropShadows']>,
        bevelEmbosses: this.readEffectStack('bevel') as unknown as NonNullable<LayerStyles['bevelEmbosses']>,
        gradientOverlays: this.readEffectStack('gradient') as unknown as NonNullable<LayerStyles['gradientOverlays']>,
        innerShadows: this.readEffectStack('inner-shadow') as unknown as NonNullable<LayerStyles['innerShadows']>,
        gradientOverlay: { enabled: this.readChecked('effects-gradient-enabled'), startColor: this.readValue('effects-gradient-start'), endColor: this.readValue('effects-gradient-end'), angle: this.readNumber('effects-gradient-angle'), opacity: this.readNumber('effects-gradient-opacity') / 100 },
        innerShadow: { enabled: this.readChecked('effects-inner-shadow-enabled'), color: this.readValue('effects-inner-shadow-color'), size: this.readNumber('effects-inner-shadow-size'), distance: this.readNumber('effects-inner-shadow-distance'), angle: this.readNumber('effects-inner-shadow-angle'), opacity: this.readNumber('effects-inner-shadow-opacity') / 100 },
      },
    };
  }

  private bindStrokeStack(): void {
    this.requireElement<HTMLButtonElement>('#effects-stroke-add').addEventListener('click', () => this.addStrokeRow());
    this.requireElement<HTMLElement>('#effects-stroke-stack').addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const removeButton = target.closest<HTMLButtonElement>('[data-remove-stroke]');
      if (!removeButton) return;
      removeButton.closest<HTMLElement>('[data-stroke-row]')?.remove();
    });
  }

  private bindEffectStacks(): void {
    this.bindEffectStack('glow');
    this.bindEffectStack('shadow');
    this.bindEffectStack('bevel');
    this.bindEffectStack('gradient');
    this.bindEffectStack('inner-shadow');
  }

  private bindEffectStack(kind: 'glow' | 'shadow' | 'bevel' | 'gradient' | 'inner-shadow'): void {
    this.requireElement<HTMLButtonElement>(`#effects-${kind}-add`).addEventListener('click', () => this.addEffectRow(kind));
    this.requireElement<HTMLElement>(`#effects-${kind}-stack`).addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const removeButton = target.closest<HTMLButtonElement>('[data-remove-effect]');
      if (!removeButton) return;
      removeButton.closest<HTMLElement>('[data-effect-row]')?.remove();
    });
  }

  private renderEffectStack(kind: 'glow' | 'shadow' | 'bevel' | 'gradient' | 'inner-shadow', effects: Array<LayerStyles['outerGlow'] | LayerStyles['dropShadow'] | LayerStyles['bevelEmboss'] | LayerStyles['gradientOverlay'] | LayerStyles['innerShadow']>): void {
    const list = this.requireElement<HTMLElement>(`#effects-${kind}-stack`);
    list.replaceChildren();
    effects.forEach((effect) => this.addEffectRow(kind, effect));
  }

  private addEffectRow(kind: 'glow' | 'shadow' | 'bevel' | 'gradient' | 'inner-shadow', effect?: LayerStyles['outerGlow'] | LayerStyles['dropShadow'] | LayerStyles['bevelEmboss'] | LayerStyles['gradientOverlay'] | LayerStyles['innerShadow']): void {
    const row = document.createElement('div');
    row.className = 'layer-style-instance-row';
    row.dataset.effectRow = kind;
    const defaults = kind === 'glow' ? { color: '#fff2a8', size: 12, opacity: 75, distance: 0, angle: 45, depth: 5, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', startColor: '#ff5e62', endColor: '#6a5af9' }
      : kind === 'shadow' || kind === 'inner-shadow' ? { color: '#000000', size: 8, opacity: 55, distance: 4, angle: 45, depth: 5, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', startColor: '#ff5e62', endColor: '#6a5af9' }
      : kind === 'gradient' ? { color: '#000000', size: 8, opacity: 100, distance: 0, angle: 90, depth: 5, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', startColor: '#ff5e62', endColor: '#6a5af9' }
      : { color: '#ffffff', size: 4, opacity: 70, distance: 0, angle: 45, depth: 5, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', startColor: '#ff5e62', endColor: '#6a5af9' };
    const value = effect as unknown as Record<string, unknown> | undefined;
    const color = String(value?.color ?? defaults.color);
    const size = Number(value?.size ?? defaults.size);
    const opacity = Math.round(Number(value?.opacity ?? defaults.opacity / 100) * 100);
    const distance = Number(value?.distance ?? defaults.distance);
    const angle = Number(value?.angle ?? defaults.angle);
    const depth = Number(value?.depth ?? defaults.depth);
    const altitude = Number(value?.altitude ?? defaults.altitude);
    const highlight = String(value?.highlightColor ?? defaults.highlightColor);
    const shadow = String(value?.shadowColor ?? defaults.shadowColor);
    const startColor = String(value?.startColor ?? defaults.startColor);
    const endColor = String(value?.endColor ?? defaults.endColor);
    row.innerHTML = `<label>Activado <input type="checkbox" data-effect-field="enabled" ${value?.enabled === true ? 'checked' : ''}></label>
      ${kind !== 'bevel' && kind !== 'gradient' ? `<label>Color <input type="color" data-effect-field="color" value="${color}"></label>` : ''}
      ${kind === 'gradient' ? `<label>Color inicial <input type="color" data-effect-field="startColor" value="${startColor}"></label><label>Color final <input type="color" data-effect-field="endColor" value="${endColor}"></label>` : ''}
      ${kind !== 'gradient' ? `<label>Tamaño/desenfoque <input type="number" min="0" max="64" data-effect-field="size" value="${size}"></label>` : ''}
      ${kind === 'shadow' || kind === 'inner-shadow' ? `<label>Distancia <input type="number" min="0" max="128" data-effect-field="distance" value="${distance}"></label>` : ''}
      ${kind !== 'glow' ? `<label>Ángulo <input type="number" min="-180" max="180" data-effect-field="angle" value="${angle}"></label>` : ''}
      ${kind === 'bevel' ? `<label>Profundidad <input type="number" min="1" max="10" data-effect-field="depth" value="${depth}"></label><label>Altitud <input type="number" min="0" max="90" data-effect-field="altitude" value="${altitude}"></label><label>Luz <input type="color" data-effect-field="highlightColor" value="${highlight}"></label><label>Sombra <input type="color" data-effect-field="shadowColor" value="${shadow}"></label>` : ''}
      <label>Opacidad % <input type="number" min="0" max="100" data-effect-field="opacity" value="${opacity}"></label>
      <button type="button" data-remove-effect aria-label="Eliminar instancia">Eliminar</button>`;
    this.requireElement<HTMLElement>(`#effects-${kind}-stack`).append(row);
  }

  private readEffectStack(kind: 'glow' | 'shadow' | 'bevel' | 'gradient' | 'inner-shadow'): Array<Record<string, string | number | boolean>> {
    return Array.from(this.requireElement<HTMLElement>(`#effects-${kind}-stack`).querySelectorAll<HTMLElement>('[data-effect-row]')).map((row) => {
      const read = (field: string) => row.querySelector<HTMLInputElement>(`[data-effect-field="${field}"]`);
      const number = (field: string, fallback = 0) => { const input = read(field); const value = Number(input?.value); return Number.isFinite(value) ? value : fallback; };
      const result: Record<string, string | number | boolean> = {
        enabled: read('enabled')?.checked ?? false,
        size: Math.max(0, Math.min(64, number('size'))),
        opacity: Math.max(0, Math.min(100, number('opacity'))) / 100,
      };
      if (kind !== 'bevel' && kind !== 'gradient') result.color = read('color')?.value ?? (kind === 'glow' ? '#fff2a8' : '#000000');
      if (kind === 'gradient') { result.startColor = read('startColor')?.value ?? '#ff5e62'; result.endColor = read('endColor')?.value ?? '#6a5af9'; result.angle = Math.max(-180, Math.min(180, number('angle', 90))); }
      if (kind === 'shadow' || kind === 'inner-shadow') { result.distance = Math.max(0, Math.min(128, number('distance'))); result.angle = Math.max(-180, Math.min(180, number('angle', 45))); }
      if (kind === 'bevel') {
        result.depth = Math.max(1, Math.min(10, number('depth', 5)));
        result.angle = Math.max(-180, Math.min(180, number('angle', 45)));
        result.altitude = Math.max(0, Math.min(90, number('altitude', 45)));
        result.highlightColor = read('highlightColor')?.value ?? '#ffffff';
        result.shadowColor = read('shadowColor')?.value ?? '#000000';
      }
      return result;
    });
  }

  private renderStrokeStack(strokes: NonNullable<LayerStyles['strokes']>): void {
    const list = this.requireElement<HTMLElement>('#effects-stroke-stack');
    list.replaceChildren();
    strokes.forEach((stroke) => this.addStrokeRow(stroke));
  }

  private addStrokeRow(stroke?: LayerStyles['stroke']): void {
    const row = document.createElement('div');
    row.className = 'layer-style-stroke-row';
    row.dataset.strokeRow = 'true';
    row.innerHTML = `
      <label>Activado <input type="checkbox" data-stroke-field="enabled" ${stroke?.enabled ? 'checked' : ''}></label>
      <label>Color <input type="color" data-stroke-field="color" value="${stroke?.color ?? '#ffffff'}"></label>
      <label>Grosor <input type="number" min="1" max="256" data-stroke-field="size" value="${stroke?.size ?? 6}"></label>
      <label>Opacidad % <input type="number" min="0" max="100" data-stroke-field="opacity" value="${Math.round((stroke?.opacity ?? 1) * 100)}"></label>
      <button type="button" data-remove-stroke aria-label="Eliminar trazo">Eliminar</button>`;
    this.requireElement<HTMLElement>('#effects-stroke-stack').append(row);
  }

  private readStrokeStack(): NonNullable<LayerStyles['strokes']> {
    return Array.from(this.requireElement<HTMLElement>('#effects-stroke-stack').querySelectorAll<HTMLElement>('[data-stroke-row]'))
      .map((row) => this.readStrokeRow(row));
  }

  private readStrokeRow(row: HTMLElement): LayerStyles['stroke'] {
    const read = (field: string) => row.querySelector<HTMLInputElement>(`[data-stroke-field="${field}"]`)!;
    return {
      enabled: read('enabled').checked,
      color: read('color').value,
      size: Math.max(1, Math.min(256, Number(read('size').value) || 1)),
      opacity: Math.max(0, Math.min(100, Number(read('opacity').value) || 0)) / 100,
    };
  }

  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = this.panelElement.querySelector<T>(selector);
    if (!element) throw new Error(`Falta el control ${selector} en el panel de estilos.`);
    return element;
  }

  private bindLayerSelector(): void {
    this.layerSelector.addEventListener('change', () => this.notifyLayerChange());
  }

  private notifyLayerChange(): void {
    const layerId = this.layerSelector.value;
    if (layerId) this.onLayerChange(layerId);
  }

  private bindRangeOutputs(): void {
    this.panelElement.querySelectorAll<HTMLInputElement>('input[type="range"][data-output]')
      .forEach((input) => input.addEventListener('input', () => this.updateRangeOutputs()));
  }

  private bindApplyButton(): void {
    this.root.querySelector<HTMLButtonElement>('#effects-apply')?.addEventListener('click', () => this.onApply());
  }

  private updateRangeOutputs(): void {
    const inputs = this.panelElement.querySelectorAll<HTMLInputElement>('input[type="range"][data-output]');
    inputs.forEach((input) => this.updateRangeOutput(input));
  }

  private updateRangeOutput(input: HTMLInputElement): void {
    const outputId = input.dataset.output;
    if (!outputId) return;
    const output = this.panelElement.querySelector<HTMLOutputElement>(`#${outputId}`);
    if (!output) return;
    output.value = `${input.value}${input.dataset.suffix ?? ''}`;
    output.textContent = output.value;
  }

  private setEffectFieldsDisabled(disabled: boolean): void {
    this.panelElement.querySelectorAll<HTMLFieldSetElement>('.layer-style-effect').forEach((fieldset) => {
      fieldset.disabled = disabled;
      fieldset.querySelectorAll<HTMLInputElement>('legend input').forEach((input) => { input.disabled = disabled; });
    });
  }

  private setUnsupportedTypeWarning(visible: boolean): void {
    const warning = this.panelElement.querySelector<HTMLElement>('#effects-layer-style-warning');
    if (warning) warning.hidden = !visible;
  }

  private writeStyleFields(styles: LayerStyles): void {
    this.writeStrokeFields(styles);
    this.writeGlowFields(styles);
    this.writeShadowFields(styles);
    this.writeBevelFields(styles);
    this.writeGradientFields(styles);
    this.writeInnerShadowFields(styles);
  }

  private writeStrokeFields(styles: LayerStyles): void {
    this.writeChecked('effects-stroke-enabled', styles.stroke.enabled);
    this.writeValue('effects-stroke-color', styles.stroke.color);
    this.writeValue('effects-stroke-size', styles.stroke.size);
    this.writeValue('effects-stroke-opacity', styles.stroke.opacity * 100);
  }

  private writeGlowFields(styles: LayerStyles): void {
    this.writeChecked('effects-glow-enabled', styles.outerGlow.enabled);
    this.writeValue('effects-glow-color', styles.outerGlow.color);
    this.writeValue('effects-glow-size', styles.outerGlow.size);
    this.writeValue('effects-glow-opacity', styles.outerGlow.opacity * 100);
  }

  private writeShadowFields(styles: LayerStyles): void {
    this.writeChecked('effects-shadow-enabled', styles.dropShadow.enabled);
    this.writeValue('effects-shadow-color', styles.dropShadow.color);
    this.writeValue('effects-shadow-size', styles.dropShadow.size);
    this.writeValue('effects-shadow-distance', styles.dropShadow.distance);
    this.writeValue('effects-shadow-angle', styles.dropShadow.angle);
    this.writeValue('effects-shadow-opacity', styles.dropShadow.opacity * 100);
  }

  private writeBevelFields(styles: LayerStyles): void {
    this.writeChecked('effects-bevel-enabled', styles.bevelEmboss.enabled);
    this.writeValue('effects-bevel-size', styles.bevelEmboss.size);
    this.writeValue('effects-bevel-depth', styles.bevelEmboss.depth);
    this.writeValue('effects-bevel-angle', styles.bevelEmboss.angle);
    this.writeValue('effects-bevel-altitude', styles.bevelEmboss.altitude);
    this.writeValue('effects-bevel-highlight', styles.bevelEmboss.highlightColor);
    this.writeValue('effects-bevel-shadow', styles.bevelEmboss.shadowColor);
    this.writeValue('effects-bevel-opacity', styles.bevelEmboss.opacity * 100);
  }

  private writeGradientFields(styles: LayerStyles): void {
    this.writeChecked('effects-gradient-enabled', styles.gradientOverlay.enabled);
    this.writeValue('effects-gradient-start', styles.gradientOverlay.startColor); this.writeValue('effects-gradient-end', styles.gradientOverlay.endColor);
    this.writeValue('effects-gradient-angle', styles.gradientOverlay.angle); this.writeValue('effects-gradient-opacity', styles.gradientOverlay.opacity * 100);
  }

  private writeInnerShadowFields(styles: LayerStyles): void {
    this.writeChecked('effects-inner-shadow-enabled', styles.innerShadow.enabled); this.writeValue('effects-inner-shadow-color', styles.innerShadow.color);
    this.writeValue('effects-inner-shadow-size', styles.innerShadow.size); this.writeValue('effects-inner-shadow-distance', styles.innerShadow.distance);
    this.writeValue('effects-inner-shadow-angle', styles.innerShadow.angle); this.writeValue('effects-inner-shadow-opacity', styles.innerShadow.opacity * 100);
  }

  private readStrokeStyle(): LayerStyles['stroke'] {
    return { enabled: this.readChecked('effects-stroke-enabled'), color: this.readValue('effects-stroke-color'), size: this.readNumber('effects-stroke-size'), opacity: this.readNumber('effects-stroke-opacity') / 100 };
  }

  private readGlowStyle(): LayerStyles['outerGlow'] {
    return { enabled: this.readChecked('effects-glow-enabled'), color: this.readValue('effects-glow-color'), size: this.readNumber('effects-glow-size'), opacity: this.readNumber('effects-glow-opacity') / 100 };
  }

  private readShadowStyle(): LayerStyles['dropShadow'] {
    return { enabled: this.readChecked('effects-shadow-enabled'), color: this.readValue('effects-shadow-color'), size: this.readNumber('effects-shadow-size'), distance: this.readNumber('effects-shadow-distance'), angle: this.readNumber('effects-shadow-angle'), opacity: this.readNumber('effects-shadow-opacity') / 100 };
  }

  private readBevelStyle(): LayerStyles['bevelEmboss'] {
    return { enabled: this.readChecked('effects-bevel-enabled'), size: this.readNumber('effects-bevel-size'), depth: this.readNumber('effects-bevel-depth'), angle: this.readNumber('effects-bevel-angle'), altitude: this.readNumber('effects-bevel-altitude'), highlightColor: this.readValue('effects-bevel-highlight'), shadowColor: this.readValue('effects-bevel-shadow'), opacity: this.readNumber('effects-bevel-opacity') / 100 };
  }

  private readChecked(id: string): boolean {
    return this.requireElement<HTMLInputElement>(`#${id}`).checked;
  }

  private readValue(id: string): string {
    return this.requireElement<HTMLInputElement>(`#${id}`).value;
  }

  private readNumber(id: string): number {
    const value = Number(this.readValue(id));
    return Number.isFinite(value) ? value : 0;
  }

  private writeChecked(id: string, value: boolean): void {
    this.requireElement<HTMLInputElement>(`#${id}`).checked = value;
  }

  private writeValue(id: string, value: string | number): void {
    this.requireElement<HTMLInputElement>(`#${id}`).value = String(value);
  }

  private appendLayerOptions(layers: LayerNode[], selectedLayerId: string, prefix: string): void {
    for (const layer of layers) this.appendLayerOption(layer, selectedLayerId, prefix);
  }

  private appendLayerOption(layer: LayerNode, selectedLayerId: string, prefix: string): void {
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = `${prefix}${layer.name}`;
    option.selected = layer.id === selectedLayerId;
    this.layerSelector.append(option);
    this.appendLayerOptions(layer.children, selectedLayerId, `${prefix}↳ `);
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
