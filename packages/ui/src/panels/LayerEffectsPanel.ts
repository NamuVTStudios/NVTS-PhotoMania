import type { LayerNode } from '@nvts/document-model';
import { cloneLayerStyles, createDefaultLayerStyles, getLayerStylesMask, type LayerStyles } from '@nvts/shared';
import { Panel } from './Panel';
import { uiIcon } from '../components/ShellTemplates';

export type LayerEffectsDraft = {
  opacity: number;
  blendMode: LayerNode['blendMode'];
  layerStyles: LayerStyles;
};

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

    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-inner-glow-enabled" type="checkbox" /> Resplandor interior</label></legend>
      <label for="effects-inner-glow-color">Color</label><input id="effects-inner-glow-color" type="color" value="#ffffff" />
      <label for="effects-inner-glow-size">Tamaño <output id="effects-inner-glow-size-value">12 px</output></label>
      <input id="effects-inner-glow-size" type="range" min="0" max="128" value="12" data-output="effects-inner-glow-size-value" data-suffix=" px" />
      <label for="effects-inner-glow-choke">Contracción <output id="effects-inner-glow-choke-value">0%</output></label>
      <input id="effects-inner-glow-choke" type="range" min="0" max="100" value="0" data-output="effects-inner-glow-choke-value" data-suffix="%" />
      <label for="effects-inner-glow-opacity">Opacidad <output id="effects-inner-glow-opacity-value">75%</output></label>
      <input id="effects-inner-glow-opacity" type="range" min="0" max="100" value="75" data-output="effects-inner-glow-opacity-value" data-suffix="%" />
    </fieldset>
    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Resplandores interiores adicionales</legend>
      <div id="effects-inner-glow-stack" class="layer-style-instance-list"></div>
      <button id="effects-inner-glow-add" type="button">+ Agregar resplandor interior</button>
    </fieldset>

    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-satin-enabled" type="checkbox" /> Satinado</label></legend>
      <label for="effects-satin-color">Color</label><input id="effects-satin-color" type="color" value="#000000" />
      <label for="effects-satin-size">Tamaño <output id="effects-satin-size-value">8 px</output></label>
      <input id="effects-satin-size" type="range" min="0" max="128" value="8" data-output="effects-satin-size-value" data-suffix=" px" />
      <label for="effects-satin-distance">Distancia <output id="effects-satin-distance-value">12 px</output></label>
      <input id="effects-satin-distance" type="range" min="0" max="256" value="12" data-output="effects-satin-distance-value" data-suffix=" px" />
      <label for="effects-satin-angle">Ángulo <output id="effects-satin-angle-value">19°</output></label>
      <input id="effects-satin-angle" type="range" min="-180" max="180" value="19" data-output="effects-satin-angle-value" data-suffix="°" />
      <label><input id="effects-satin-invert" type="checkbox" /> Invertir</label>
      <label for="effects-satin-opacity">Opacidad <output id="effects-satin-opacity-value">50%</output></label>
      <input id="effects-satin-opacity" type="range" min="0" max="100" value="50" data-output="effects-satin-opacity-value" data-suffix="%" />
    </fieldset>
    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Satinados adicionales</legend>
      <div id="effects-satin-stack" class="layer-style-instance-list"></div>
      <button id="effects-satin-add" type="button">+ Agregar satinado</button>
    </fieldset>

    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-color-overlay-enabled" type="checkbox" /> Superposición de color</label></legend>
      <label for="effects-color-overlay-color">Color</label><input id="effects-color-overlay-color" type="color" value="#ff0000" />
      <label for="effects-color-overlay-blend">Modo de fusión</label><select id="effects-color-overlay-blend"><option value="normal">Normal</option><option value="multiply">Multiplicar</option><option value="screen">Trama</option><option value="overlay">Superponer</option></select>
      <label for="effects-color-overlay-opacity">Opacidad <output id="effects-color-overlay-opacity-value">100%</output></label>
      <input id="effects-color-overlay-opacity" type="range" min="0" max="100" value="100" data-output="effects-color-overlay-opacity-value" data-suffix="%" />
    </fieldset>
    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Superposiciones de color adicionales</legend>
      <div id="effects-color-overlay-stack" class="layer-style-instance-list"></div>
      <button id="effects-color-overlay-add" type="button">+ Agregar superposición de color</button>
    </fieldset>

    <fieldset class="layer-style-effect">
      <legend><label><input id="effects-pattern-enabled" type="checkbox" /> Superposición de motivo</label></legend>
      <label for="effects-pattern-kind">Motivo</label><select id="effects-pattern-kind"><option value="diagonal">Diagonal</option><option value="grid">Cuadrícula</option><option value="dots">Puntos</option><option value="checkerboard">Damero</option><option value="crosshatch">Trama cruzada</option></select>
      <label for="effects-pattern-color">Color principal</label><input id="effects-pattern-color" type="color" value="#ffffff" />
      <label for="effects-pattern-background">Color de fondo</label><input id="effects-pattern-background" type="color" value="#000000" />
      <label for="effects-pattern-scale">Escala <output id="effects-pattern-scale-value">100%</output></label><input id="effects-pattern-scale" type="range" min="10" max="500" value="100" data-output="effects-pattern-scale-value" data-suffix="%" />
      <label for="effects-pattern-angle">Ángulo <output id="effects-pattern-angle-value">0°</output></label><input id="effects-pattern-angle" type="range" min="-180" max="180" value="0" data-output="effects-pattern-angle-value" data-suffix="°" />
      <label for="effects-pattern-blend">Modo de fusión</label><select id="effects-pattern-blend"><option value="normal">Normal</option><option value="multiply">Multiplicar</option><option value="screen">Trama</option><option value="overlay">Superponer</option></select>
      <label for="effects-pattern-opacity">Opacidad <output id="effects-pattern-opacity-value">100%</output></label><input id="effects-pattern-opacity" type="range" min="0" max="100" value="100" data-output="effects-pattern-opacity-value" data-suffix="%" />
    </fieldset>
    <fieldset class="layer-style-effect layer-style-instance-stack">
      <legend>Superposiciones de motivo adicionales</legend>
      <div id="effects-pattern-stack" class="layer-style-instance-list"></div>
      <button id="effects-pattern-add" type="button">+ Agregar superposición de motivo</button>
    </fieldset>
  </div>
  <footer><button data-close="effects-panel" type="button">Cancelar</button><button class="primary" id="effects-apply" type="button">Aplicar</button></footer>
</section>`;

type EffectStackKind = 'glow' | 'shadow' | 'bevel' | 'gradient' | 'inner-shadow' | 'inner-glow' | 'satin' | 'color-overlay' | 'pattern';
type EffectStackValue = LayerStyles['outerGlow'] | LayerStyles['dropShadow'] | LayerStyles['bevelEmboss'] | LayerStyles['gradientOverlay'] | LayerStyles['innerShadow'] | LayerStyles['innerGlow'] | LayerStyles['satin'] | LayerStyles['colorOverlay'] | LayerStyles['patternOverlay'];
type EffectStackDefaults = { color: string; size: number; opacity: number; distance: number; angle: number; depth: number; altitude: number; highlightColor: string; shadowColor: string; startColor: string; endColor: string; backgroundColor: string; pattern: string; scale: number; blendMode: string; choke: number };

function getEffectStackDefaults(kind: EffectStackKind): EffectStackDefaults {
  const base: EffectStackDefaults = { color: '#000000', size: 8, opacity: 55, distance: 4, angle: 45, depth: 5, altitude: 45, highlightColor: '#ffffff', shadowColor: '#000000', startColor: '#ff5e62', endColor: '#6a5af9', backgroundColor: '#000000', pattern: 'diagonal', scale: 100, blendMode: 'normal', choke: 0 };
  if (kind === 'glow') return { ...base, color: '#fff2a8', size: 12, opacity: 75, distance: 0 };
  if (kind === 'bevel') return { ...base, color: '#ffffff', size: 4, opacity: 70 };
  if (kind === 'gradient') return { ...base, opacity: 100, angle: 90 };
  if (kind === 'inner-glow') return { ...base, color: '#ffffff', size: 12, opacity: 75, choke: 0 };
  if (kind === 'satin') return { ...base, color: '#000000', size: 8, opacity: 50, distance: 12, angle: 19 };
  if (kind === 'color-overlay') return { ...base, color: '#ff0000', opacity: 100 };
  if (kind === 'pattern') return { ...base, color: '#ffffff', backgroundColor: '#000000', opacity: 100, angle: 0, pattern: 'diagonal' };
  return base;
}

function supportsEffectColor(kind: EffectStackKind): boolean {
  return kind !== 'bevel' && kind !== 'gradient';
}

function supportsEffectAngle(kind: EffectStackKind): boolean {
  return kind !== 'glow' && kind !== 'inner-glow' && kind !== 'color-overlay';
}

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
    private readonly onPreview: (style: LayerEffectsDraft) => void = () => undefined,
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
    this.bindPreviewChanges();
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
    this.renderEffectStack('inner-glow', styles.innerGlows ?? []);
    this.renderEffectStack('satin', styles.satins ?? []);
    this.renderEffectStack('color-overlay', styles.colorOverlays ?? []);
    this.renderEffectStack('pattern', styles.patternOverlays ?? []);
    this.setEffectFieldsDisabled(layer.type === 'filter');
    this.setUnsupportedTypeWarning(layer.type === 'filter');
    this.updateRangeOutputs();
  }

  getStyle(): LayerEffectsDraft {
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
        innerGlows: this.readEffectStack('inner-glow') as unknown as NonNullable<LayerStyles['innerGlows']>,
        satins: this.readEffectStack('satin') as unknown as NonNullable<LayerStyles['satins']>,
        colorOverlays: this.readEffectStack('color-overlay') as unknown as NonNullable<LayerStyles['colorOverlays']>,
        patternOverlays: this.readEffectStack('pattern') as unknown as NonNullable<LayerStyles['patternOverlays']>,
        innerGlow: this.readInnerGlowStyle(),
        satin: this.readSatinStyle(),
        colorOverlay: this.readColorOverlayStyle(),
        patternOverlay: this.readPatternOverlayStyle(),
        gradientOverlay: { enabled: this.readChecked('effects-gradient-enabled'), startColor: this.readValue('effects-gradient-start'), endColor: this.readValue('effects-gradient-end'), angle: this.readNumber('effects-gradient-angle'), opacity: this.readNumber('effects-gradient-opacity') / 100 },
        innerShadow: { enabled: this.readChecked('effects-inner-shadow-enabled'), color: this.readValue('effects-inner-shadow-color'), size: this.readNumber('effects-inner-shadow-size'), distance: this.readNumber('effects-inner-shadow-distance'), angle: this.readNumber('effects-inner-shadow-angle'), opacity: this.readNumber('effects-inner-shadow-opacity') / 100 },
      },
    };
  }

  private bindStrokeStack(): void {
    this.requireElement<HTMLButtonElement>('#effects-stroke-add').addEventListener('click', () => {
      this.addStrokeRow();
      this.notifyPreviewChange();
    });
    this.requireElement<HTMLElement>('#effects-stroke-stack').addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const removeButton = target.closest<HTMLButtonElement>('[data-remove-stroke]');
      if (!removeButton) return;
      removeButton.closest<HTMLElement>('[data-stroke-row]')?.remove();
      this.notifyPreviewChange();
    });
  }

  private bindEffectStacks(): void {
    this.bindEffectStack('glow');
    this.bindEffectStack('shadow');
    this.bindEffectStack('bevel');
    this.bindEffectStack('gradient');
    this.bindEffectStack('inner-shadow');
    this.bindEffectStack('inner-glow');
    this.bindEffectStack('satin');
    this.bindEffectStack('color-overlay');
    this.bindEffectStack('pattern');
  }

  private bindEffectStack(kind: EffectStackKind): void {
    this.requireElement<HTMLButtonElement>(`#effects-${kind}-add`).addEventListener('click', () => {
      this.addEffectRow(kind);
      this.notifyPreviewChange();
    });
    this.requireElement<HTMLElement>(`#effects-${kind}-stack`).addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const removeButton = target.closest<HTMLButtonElement>('[data-remove-effect]');
      if (!removeButton) return;
      removeButton.closest<HTMLElement>('[data-effect-row]')?.remove();
      this.notifyPreviewChange();
    });
  }

  private renderEffectStack(kind: EffectStackKind, effects: Array<EffectStackValue>): void {
    const list = this.requireElement<HTMLElement>(`#effects-${kind}-stack`);
    list.replaceChildren();
    effects.forEach((effect) => this.addEffectRow(kind, effect));
  }

  private addEffectRow(kind: EffectStackKind, effect?: EffectStackValue): void {
    const row = document.createElement('div');
    row.className = 'layer-style-instance-row';
    row.dataset.effectRow = kind;
    const defaults = getEffectStackDefaults(kind);
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
    const backgroundColor = String(value?.backgroundColor ?? defaults.backgroundColor);
    const pattern = String(value?.pattern ?? defaults.pattern);
    const scale = Number(value?.scale ?? defaults.scale);
    const blendMode = String(value?.blendMode ?? defaults.blendMode);
    const choke = Number(value?.choke ?? defaults.choke);
    const invert = value?.invert === true;
    row.innerHTML = `<label>Activado <input type="checkbox" data-effect-field="enabled" ${(value ? value.enabled === true : true) ? 'checked' : ''}></label>
      ${supportsEffectColor(kind) ? `<label>Color <input type="color" data-effect-field="color" value="${color}"></label>` : ''}
      ${kind === 'gradient' ? `<label>Color inicial <input type="color" data-effect-field="startColor" value="${startColor}"></label><label>Color final <input type="color" data-effect-field="endColor" value="${endColor}"></label>` : ''}
      ${kind === 'pattern' ? `<label>Motivo <select data-effect-field="pattern"><option value="diagonal" ${pattern === 'diagonal' ? 'selected' : ''}>Diagonal</option><option value="grid" ${pattern === 'grid' ? 'selected' : ''}>Cuadrícula</option><option value="dots" ${pattern === 'dots' ? 'selected' : ''}>Puntos</option><option value="checkerboard" ${pattern === 'checkerboard' ? 'selected' : ''}>Damero</option><option value="crosshatch" ${pattern === 'crosshatch' ? 'selected' : ''}>Trama cruzada</option></select></label><label>Color de fondo <input type="color" data-effect-field="backgroundColor" value="${backgroundColor}"></label><label>Escala % <input type="number" min="10" max="500" data-effect-field="scale" value="${scale}"></label>` : ''}
      ${kind === 'pattern' || kind === 'color-overlay' ? `<label>Fusión <select data-effect-field="blendMode"><option value="normal" ${blendMode === 'normal' ? 'selected' : ''}>Normal</option><option value="multiply" ${blendMode === 'multiply' ? 'selected' : ''}>Multiplicar</option><option value="screen" ${blendMode === 'screen' ? 'selected' : ''}>Trama</option><option value="overlay" ${blendMode === 'overlay' ? 'selected' : ''}>Superponer</option></select></label>` : ''}
      ${kind === 'pattern' ? '' : `<label>Tamaño/desenfoque <input type="number" min="0" max="128" data-effect-field="size" value="${size}"></label>`}
      ${kind === 'shadow' || kind === 'inner-shadow' || kind === 'satin' ? `<label>Distancia <input type="number" min="0" max="256" data-effect-field="distance" value="${distance}"></label>` : ''}
      ${supportsEffectAngle(kind) ? `<label>Ángulo <input type="number" min="-180" max="180" data-effect-field="angle" value="${angle}"></label>` : ''}
      ${kind === 'inner-glow' ? `<label>Contracción % <input type="number" min="0" max="100" data-effect-field="choke" value="${choke}"></label>` : ''}
      ${kind === 'satin' ? `<label>Invertir <input type="checkbox" data-effect-field="invert" ${invert ? 'checked' : ''}></label>` : ''}
      ${kind === 'bevel' ? `<label>Profundidad <input type="number" min="1" max="10" data-effect-field="depth" value="${depth}"></label><label>Altitud <input type="number" min="0" max="90" data-effect-field="altitude" value="${altitude}"></label><label>Luz <input type="color" data-effect-field="highlightColor" value="${highlight}"></label><label>Sombra <input type="color" data-effect-field="shadowColor" value="${shadow}"></label>` : ''}
      <label>Opacidad % <input type="number" min="0" max="100" data-effect-field="opacity" value="${opacity}"></label>
      <button type="button" data-remove-effect aria-label="Eliminar instancia">Eliminar</button>`;
    this.requireElement<HTMLElement>(`#effects-${kind}-stack`).append(row);
  }

  private readEffectStack(kind: EffectStackKind): Array<Record<string, string | number | boolean>> {
    return Array.from(this.requireElement<HTMLElement>(`#effects-${kind}-stack`).querySelectorAll<HTMLElement>('[data-effect-row]')).map((row) => {
      const read = (field: string) => row.querySelector<HTMLInputElement>(`[data-effect-field="${field}"]`);
      const number = (field: string, fallback = 0) => { const input = read(field); const value = Number(input?.value); return Number.isFinite(value) ? value : fallback; };
      const result: Record<string, string | number | boolean> = {
        enabled: read('enabled')?.checked ?? false,
        opacity: Math.max(0, Math.min(100, number('opacity'))) / 100,
      };
      if (kind !== 'pattern' && kind !== 'color-overlay') result.size = Math.max(0, Math.min(128, number('size')));
      if (supportsEffectColor(kind)) result.color = read('color')?.value ?? getEffectStackDefaults(kind).color;
      if (kind === 'gradient') { result.startColor = read('startColor')?.value ?? '#ff5e62'; result.endColor = read('endColor')?.value ?? '#6a5af9'; result.angle = Math.max(-180, Math.min(180, number('angle', 90))); }
      if (kind === 'pattern') {
        result.pattern = read('pattern')?.value ?? 'diagonal';
        result.backgroundColor = read('backgroundColor')?.value ?? '#000000';
        result.scale = Math.max(10, Math.min(500, number('scale', 100)));
        result.angle = Math.max(-180, Math.min(180, number('angle', 0)));
        result.blendMode = read('blendMode')?.value ?? 'normal';
      }
      if (kind === 'color-overlay') result.blendMode = read('blendMode')?.value ?? 'normal';
      if (kind === 'shadow' || kind === 'inner-shadow' || kind === 'satin') { result.distance = Math.max(0, Math.min(256, number('distance'))); result.angle = Math.max(-180, Math.min(180, number('angle', 45))); }
      if (kind === 'inner-glow') result.choke = Math.max(0, Math.min(100, number('choke')));
      if (kind === 'satin') result.invert = read('invert')?.checked ?? false;
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
      <label>Activado <input type="checkbox" data-stroke-field="enabled" ${(stroke ? stroke.enabled : true) ? 'checked' : ''}></label>
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

  private bindPreviewChanges(): void {
    const content = this.requireElement<HTMLElement>('.layer-style-content');
    content.addEventListener('input', () => this.notifyPreviewChange());
    content.addEventListener('change', () => this.notifyPreviewChange());
  }

  private notifyPreviewChange(): void {
    this.updateRangeOutputs();
    this.onPreview(this.getStyle());
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
    this.writeInnerGlowFields(styles);
    this.writeSatinFields(styles);
    this.writeColorOverlayFields(styles);
    this.writePatternOverlayFields(styles);
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

  private writeInnerGlowFields(styles: LayerStyles): void {
    this.writeChecked('effects-inner-glow-enabled', styles.innerGlow.enabled); this.writeValue('effects-inner-glow-color', styles.innerGlow.color);
    this.writeValue('effects-inner-glow-size', styles.innerGlow.size); this.writeValue('effects-inner-glow-choke', styles.innerGlow.choke);
    this.writeValue('effects-inner-glow-opacity', styles.innerGlow.opacity * 100);
  }

  private writeSatinFields(styles: LayerStyles): void {
    this.writeChecked('effects-satin-enabled', styles.satin.enabled); this.writeValue('effects-satin-color', styles.satin.color);
    this.writeValue('effects-satin-size', styles.satin.size); this.writeValue('effects-satin-distance', styles.satin.distance);
    this.writeValue('effects-satin-angle', styles.satin.angle); this.writeValue('effects-satin-opacity', styles.satin.opacity * 100);
    this.writeChecked('effects-satin-invert', styles.satin.invert);
  }

  private writeColorOverlayFields(styles: LayerStyles): void {
    this.writeChecked('effects-color-overlay-enabled', styles.colorOverlay.enabled); this.writeValue('effects-color-overlay-color', styles.colorOverlay.color);
    this.writeValue('effects-color-overlay-opacity', styles.colorOverlay.opacity * 100);
    this.requireElement<HTMLSelectElement>('#effects-color-overlay-blend').value = styles.colorOverlay.blendMode;
  }

  private writePatternOverlayFields(styles: LayerStyles): void {
    this.writeChecked('effects-pattern-enabled', styles.patternOverlay.enabled); this.writeValue('effects-pattern-color', styles.patternOverlay.color);
    this.writeValue('effects-pattern-background', styles.patternOverlay.backgroundColor); this.writeValue('effects-pattern-scale', styles.patternOverlay.scale);
    this.writeValue('effects-pattern-angle', styles.patternOverlay.angle); this.writeValue('effects-pattern-opacity', styles.patternOverlay.opacity * 100);
    this.requireElement<HTMLSelectElement>('#effects-pattern-kind').value = styles.patternOverlay.pattern;
    this.requireElement<HTMLSelectElement>('#effects-pattern-blend').value = styles.patternOverlay.blendMode;
  }

  private writeInnerShadowFields(styles: LayerStyles): void {
    this.writeChecked('effects-inner-shadow-enabled', styles.innerShadow.enabled); this.writeValue('effects-inner-shadow-color', styles.innerShadow.color);
    this.writeValue('effects-inner-shadow-size', styles.innerShadow.size); this.writeValue('effects-inner-shadow-distance', styles.innerShadow.distance);
    this.writeValue('effects-inner-shadow-angle', styles.innerShadow.angle); this.writeValue('effects-inner-shadow-opacity', styles.innerShadow.opacity * 100);
  }

  private readStrokeStyle(): LayerStyles['stroke'] {
    return { enabled: this.readChecked('effects-stroke-enabled'), color: this.readValue('effects-stroke-color'), size: this.readNumber('effects-stroke-size'), opacity: this.readNumber('effects-stroke-opacity') / 100 };
  }

  private readInnerGlowStyle(): LayerStyles['innerGlow'] {
    return { enabled: this.readChecked('effects-inner-glow-enabled'), color: this.readValue('effects-inner-glow-color'), size: this.readNumber('effects-inner-glow-size'), choke: this.readNumber('effects-inner-glow-choke'), opacity: this.readNumber('effects-inner-glow-opacity') / 100 };
  }

  private readSatinStyle(): LayerStyles['satin'] {
    return { enabled: this.readChecked('effects-satin-enabled'), color: this.readValue('effects-satin-color'), size: this.readNumber('effects-satin-size'), distance: this.readNumber('effects-satin-distance'), angle: this.readNumber('effects-satin-angle'), opacity: this.readNumber('effects-satin-opacity') / 100, invert: this.readChecked('effects-satin-invert') };
  }

  private readColorOverlayStyle(): LayerStyles['colorOverlay'] {
    return { enabled: this.readChecked('effects-color-overlay-enabled'), color: this.readValue('effects-color-overlay-color'), opacity: this.readNumber('effects-color-overlay-opacity') / 100, blendMode: this.requireElement<HTMLSelectElement>('#effects-color-overlay-blend').value as LayerStyles['colorOverlay']['blendMode'] };
  }

  private readPatternOverlayStyle(): LayerStyles['patternOverlay'] {
    return { enabled: this.readChecked('effects-pattern-enabled'), pattern: this.requireElement<HTMLSelectElement>('#effects-pattern-kind').value as LayerStyles['patternOverlay']['pattern'], color: this.readValue('effects-pattern-color'), backgroundColor: this.readValue('effects-pattern-background'), scale: this.readNumber('effects-pattern-scale'), angle: this.readNumber('effects-pattern-angle'), opacity: this.readNumber('effects-pattern-opacity') / 100, blendMode: this.requireElement<HTMLSelectElement>('#effects-pattern-blend').value as LayerStyles['patternOverlay']['blendMode'] };
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
  onPreview: (style: LayerEffectsDraft) => void = () => undefined,
): LayerEffectsPanelController | null {
  if (!root.querySelector('#effects-panel')) return null;
  const controller = new LayerEffectsPanelController(root, onLayerChange, onApply, onPreview);
  controller.mount();
  return controller;
}
