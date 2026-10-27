// Main editor shell template.
import { ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE } from '../panels/AdvancedToolOptionsPanel';
import { HISTORY_PANEL_TEMPLATE } from '../panels/HistoryPanel';
import { LAYERS_PANEL_TEMPLATE } from '../panels/LayersPanel';
import { COMIC_MANAGER_PANEL_TEMPLATE } from '../panels/ComicManagerPanel';
import { STORYBOARD_PANEL_TEMPLATE } from '../panels/StoryboardPanel';
import { ANIMATION_TIMELINE_PANEL_TEMPLATE } from '../panels/AnimationTimelinePanel';
import { LAYER_EFFECTS_PANEL_TEMPLATE } from '../panels/LayerEffectsPanel';
import { FILTER_PANEL_TEMPLATE } from '../panels/FilterPanel';
import { VECTOR_EDITOR_PANEL_TEMPLATE } from '../panels/VectorEditorPanel';
import { LOGO_URL, MAIN_MENU } from './ShellTemplates';

export const EDITOR_TEMPLATE = `
<header class="topbar">
  <div class="brand"><img class="app-logo" src="${LOGO_URL}" alt="NVTS PhotoMania"/><strong>PhotoMania</strong></div>
  ${MAIN_MENU}
  <div class="doc-title">Sin título <small id="doc-size">1280 × 720</small></div>
</header>
<div class="tool-options"><strong id="tool-current-label">Pincel</strong><div id="toolbar" class="toolbar"></div><span id="status" role="status"></span></div>
<main class="workspace">
  <aside class="tools-rail" aria-label="Herramientas">
    <button id="rail-hand" aria-label="Mover lienzo" title="Mover lienzo (H / barra espaciadora)"><span class="tool-icon tool-icon--hand" aria-hidden="true"></span></button>
    <button id="rail-brush" class="selected" aria-label="Pincel" title="Pincel (B)"><span class="tool-icon tool-icon--brush" aria-hidden="true"></span></button>
    <button id="rail-eraser" aria-label="Borrador" title="Borrador (E)"><span class="tool-icon tool-icon--eraser" aria-hidden="true"></span></button>
    <button id="rail-line" aria-label="Línea" title="Línea (L)"><span class="tool-icon tool-icon--line" aria-hidden="true"></span></button>
    <button id="rail-rectangle" aria-label="Rectángulo" title="Rectángulo (R)"><span class="tool-icon tool-icon--rectangle" aria-hidden="true"></span></button>
    <button id="rail-ellipse" aria-label="Elipse" title="Elipse (O)"><span class="tool-icon tool-icon--ellipse" aria-hidden="true"></span></button>
    <button id="rail-fill" aria-label="Bote de pintura" title="Relleno (G)"><span class="tool-icon tool-icon--fill" aria-hidden="true"></span></button>
    <button id="rail-eyedropper" aria-label="Cuentagotas" title="Cuentagotas (I)"><span class="tool-icon tool-icon--eyedropper" aria-hidden="true"></span></button>
    <button id="rail-text" aria-label="Texto" title="Texto (T)"><span class="tool-icon tool-icon--text" aria-hidden="true"></span></button>
    <button id="rail-vector-select" aria-label="Seleccionar objeto vectorial" title="Seleccionar objeto vectorial (V)"><span class="tool-icon tool-icon--vector-select" aria-hidden="true"></span></button>
    <div class="swatches"><span id="foreground-swatch"></span><span></span></div>
  </aside>
  <section class="canvas-area"><div class="canvas-label"><span id="canvas-name">Sin título</span><span id="canvas-meta">1280 × 720 px · RGB/8</span></div><div class="canvas-stage"><canvas id="canvas"></canvas><canvas id="tool-preview" aria-hidden="true"></canvas></div><div class="zoom-controls"><button id="zoom-out" title="Alejar" aria-label="Alejar"><span class="tool-icon tool-icon--zoom-out" aria-hidden="true"></span></button><span id="zoom-value">Ajustar</span><button id="zoom-in" title="Acercar" aria-label="Acercar"><span class="tool-icon tool-icon--zoom-in" aria-hidden="true"></span></button><button id="zoom-fit" title="Ajustar al lienzo"><span class="tool-icon tool-icon--zoom-fit" aria-hidden="true"></span><span>Ajustar</span></button></div></section>
  <aside class="right-dock">
${ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE}
${HISTORY_PANEL_TEMPLATE}
${LAYERS_PANEL_TEMPLATE}
${COMIC_MANAGER_PANEL_TEMPLATE}
${STORYBOARD_PANEL_TEMPLATE}
${ANIMATION_TIMELINE_PANEL_TEMPLATE}
${LAYER_EFFECTS_PANEL_TEMPLATE}
${FILTER_PANEL_TEMPLATE}
  </aside>
  <aside class="animation-timeline-dock" aria-label="Panel inferior de animación"></aside>
</main>
${VECTOR_EDITOR_PANEL_TEMPLATE}`;
