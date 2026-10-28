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
    <button id="rail-gradient" aria-label="Degradado" title="Degradado: arrastrá para definir la dirección"><span class="tool-icon tool-icon--gradient" aria-hidden="true"></span></button>
    <button id="rail-smudge" aria-label="Dedo" title="Dedo: arrastrá para mezclar los píxeles"><span class="tool-icon tool-icon--smudge" aria-hidden="true"></span></button>
    <button id="rail-liquify" aria-label="Licuar" title="Licuar: arrastrá para desplazar los píxeles"><span class="tool-icon tool-icon--liquify" aria-hidden="true"></span></button>
    <button id="rail-clone-stamp" aria-label="Tampón de clonar" title="Tampón de clonar (C) · Alt + clic define el origen"><span class="tool-icon tool-icon--clone-stamp" aria-hidden="true"></span></button>
    <button id="rail-line" aria-label="Línea" title="Línea (L)"><span class="tool-icon tool-icon--line" aria-hidden="true"></span></button>
    <button id="rail-rectangle" aria-label="Rectángulo" title="Rectángulo (R)"><span class="tool-icon tool-icon--rectangle" aria-hidden="true"></span></button>
    <button id="rail-ellipse" aria-label="Elipse" title="Elipse (O)"><span class="tool-icon tool-icon--ellipse" aria-hidden="true"></span></button>
    <button id="rail-pixel-rounded-rectangle" aria-label="Rectángulo redondeado de píxeles" title="Rectángulo redondeado de píxeles · arrastrá para rasterizar la forma"><span class="tool-icon tool-icon--pixel-rounded-rectangle" aria-hidden="true"></span></button>
    <button id="rail-pixel-polyline" aria-label="Polilínea de píxeles" title="Polilínea de píxeles · arrastrá para dibujar segmentos sobre una capa de pintura"><span class="tool-icon tool-icon--pixel-polyline" aria-hidden="true"></span></button>
    <button id="rail-pixel-bezier" aria-label="Curva Bézier de píxeles" title="Curva Bézier de píxeles · arrastrá para rasterizar una curva"><span class="tool-icon tool-icon--pixel-bezier" aria-hidden="true"></span></button>
    <button id="rail-pixel-polygon" aria-label="Polígono de píxeles" title="Polígono de píxeles · arrastrá para rasterizar un polígono"><span class="tool-icon tool-icon--pixel-polygon" aria-hidden="true"></span></button>
    <button id="rail-pixel-star" aria-label="Estrella de píxeles" title="Estrella de píxeles · arrastrá para rasterizar una estrella"><span class="tool-icon tool-icon--pixel-star" aria-hidden="true"></span></button>
    <button id="rail-pixel-spiral" aria-label="Espiral de píxeles" title="Espiral de píxeles · arrastrá para rasterizar una espiral"><span class="tool-icon tool-icon--pixel-spiral" aria-hidden="true"></span></button>
    <button id="rail-fill" aria-label="Bote de pintura" title="Relleno (G)"><span class="tool-icon tool-icon--fill" aria-hidden="true"></span></button>
    <button id="rail-eyedropper" aria-label="Cuentagotas" title="Cuentagotas (I)"><span class="tool-icon tool-icon--eyedropper" aria-hidden="true"></span></button>
    <button id="rail-text" aria-label="Texto" title="Texto (T)"><span class="tool-icon tool-icon--text" aria-hidden="true"></span></button>
    <button id="rail-vector-select" aria-label="Seleccionar objeto vectorial" title="Seleccionar objeto vectorial (V)"><span class="tool-icon tool-icon--vector-select" aria-hidden="true"></span></button>
    <div class="tools-rail-divider" aria-hidden="true"></div>
    <button id="rail-vector-rectangle" aria-label="Rectángulo vectorial" title="Rectángulo vectorial · arrastrá para crear una forma editable"><span class="tool-icon tool-icon--vector-rectangle" aria-hidden="true"></span></button>
    <button id="rail-vector-rounded-rectangle" aria-label="Rectángulo redondeado vectorial" title="Rectángulo redondeado vectorial · arrastrá para crear una forma editable"><span class="tool-icon tool-icon--vector-rounded-rectangle" aria-hidden="true"></span></button>
    <button id="rail-vector-ellipse" aria-label="Elipse vectorial" title="Elipse vectorial · arrastrá para crear una forma editable"><span class="tool-icon tool-icon--vector-ellipse" aria-hidden="true"></span></button>
    <button id="rail-vector-line" aria-label="Línea vectorial" title="Línea vectorial · arrastrá para crear una línea editable"><span class="tool-icon tool-icon--vector-line" aria-hidden="true"></span></button>
    <button id="rail-vector-polyline" aria-label="Polilínea vectorial" title="Polilínea vectorial · arrastrá para crear una ruta de segmentos editable"><span class="tool-icon tool-icon--vector-polyline" aria-hidden="true"></span></button>
    <button id="rail-vector-pen" aria-label="Pluma vectorial" title="Pluma vectorial · arrastrá para crear una curva Bézier editable"><span class="tool-icon tool-icon--vector-pen" aria-hidden="true"></span></button>
    <button id="rail-vector-polygon" aria-label="Polígono vectorial" title="Polígono vectorial · arrastrá para crear un polígono editable"><span class="tool-icon tool-icon--vector-polygon" aria-hidden="true"></span></button>
    <button id="rail-vector-star" aria-label="Estrella vectorial" title="Estrella vectorial · arrastrá para crear una estrella editable"><span class="tool-icon tool-icon--vector-star" aria-hidden="true"></span></button>
    <button id="rail-vector-spiral" aria-label="Espiral vectorial" title="Espiral vectorial · arrastrá para crear una espiral editable"><span class="tool-icon tool-icon--vector-spiral" aria-hidden="true"></span></button>
    <button id="rail-vector-freehand" aria-label="Trazo vectorial libre" title="Trazo vectorial libre · dibujá una ruta editable con el puntero"><span class="tool-icon tool-icon--vector-freehand" aria-hidden="true"></span></button>
    <div class="tools-rail-divider" aria-hidden="true"></div>
    <button id="rail-comic-panel" aria-label="Marco y viñetas de cómic" title="Marco y viñetas (P) · requiere una capa vectorial"><span class="tool-icon tool-icon--comic-panel" aria-hidden="true"></span></button>
    <div class="swatches"><span id="foreground-swatch"></span><span></span></div>
  </aside>
  <section class="canvas-area"><div class="canvas-label"><span id="canvas-name">Sin título</span><span id="canvas-meta">1280 × 720 px · RGB/8</span></div><div class="canvas-stage"><canvas id="canvas"></canvas><canvas id="tool-preview" aria-hidden="true"></canvas></div><div class="zoom-controls"><button id="zoom-out" title="Alejar" aria-label="Alejar"><span class="tool-icon tool-icon--zoom-out" aria-hidden="true"></span></button><span id="zoom-value">Ajustar</span><button id="zoom-in" title="Acercar" aria-label="Acercar"><span class="tool-icon tool-icon--zoom-in" aria-hidden="true"></span></button><button id="zoom-fit" title="Ajustar al lienzo"><span class="tool-icon tool-icon--zoom-fit" aria-hidden="true"></span><span>Ajustar</span></button><button id="toggle-comic-guides" type="button" aria-pressed="false" title="Mostrar guías editoriales">Guías</button><button id="toggle-comic-symmetry-vertical" class="symmetry-toggle" type="button" aria-pressed="false" title="Activar o desactivar la simetría respecto del eje vertical">Simetría V</button><button id="toggle-comic-symmetry-horizontal" class="symmetry-toggle" type="button" aria-pressed="false" title="Activar o desactivar la simetría respecto del eje horizontal">Simetría H</button></div></section>
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
