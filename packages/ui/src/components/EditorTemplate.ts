// Main editor shell template.
import { ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE } from '../panels/AdvancedToolOptionsPanel';
import { HISTORY_PANEL_TEMPLATE } from '../panels/HistoryPanel';
import { LAYERS_PANEL_TEMPLATE } from '../panels/LayersPanel';
import { COMIC_MANAGER_PANEL_TEMPLATE } from '../panels/ComicManagerPanel';
import { STORYBOARD_PANEL_TEMPLATE } from '../panels/StoryboardPanel';
import { ANIMATION_TIMELINE_PANEL_TEMPLATE } from '../panels/AnimationTimelinePanel';
import { LAYER_EFFECTS_PANEL_TEMPLATE } from '../panels/LayerEffectsPanel';
import { LAYER_MASK_PANEL_TEMPLATE } from '../panels/LayerMaskEditor';
import { FILTER_PANEL_TEMPLATE } from '../panels/FilterPanel';
import { VECTOR_EDITOR_PANEL_TEMPLATE } from '../panels/VectorEditorPanel';
import { logoImageMarkup, MAIN_MENU } from './ShellTemplates';

export const EDITOR_TEMPLATE = `
<header class="topbar">
  <div class="brand">${logoImageMarkup('app-logo', 'NVTS PhotoMania')}<strong>PhotoMania</strong></div>
  ${MAIN_MENU}
  <div class="doc-title">Sin título <small id="doc-size">1280 × 720</small></div>
</header>
<div class="tool-options"><strong id="tool-current-label">Pincel</strong><div id="toolbar" class="toolbar"></div><span id="status" role="status"></span></div>
<main class="workspace">
  <aside class="tools-rail" aria-label="Herramientas">
    <button id="rail-hand" aria-label="Mover lienzo" title="Mover lienzo (H / barra espaciadora)"><span class="tool-icon tool-icon--hand" aria-hidden="true"></span></button>
    <button id="rail-move" aria-label="Mover elementos" title="Mover elementos de píxeles o vectoriales (M)"><span class="tool-icon tool-icon--move" aria-hidden="true"></span></button>
    <details class="tools-rail-group" id="direct-drawing-group" open>
      <summary aria-label="Herramientas de dibujo directo" title="Dibujo directo"><span class="tool-icon tool-icon--pencil" aria-hidden="true"></span></summary>
      <div class="tools-rail-group-items">
        <button id="rail-brush" class="selected" aria-label="Pincel" title="Pincel (B)"><span class="tool-icon tool-icon--brush" aria-hidden="true"></span></button>
        <button id="rail-pen" aria-label="Plumilla" title="Plumilla (Q)"><span class="tool-icon tool-icon--pen" aria-hidden="true"></span></button>
        <button id="rail-pencil" aria-label="Lápiz" title="Lápiz (Y)"><span class="tool-icon tool-icon--pencil" aria-hidden="true"></span></button>
        <button id="rail-airbrush" aria-label="Aerógrafo" title="Aerógrafo (A)"><span class="tool-icon tool-icon--airbrush" aria-hidden="true"></span></button>
        <button id="rail-decoration" aria-label="Decoración" title="Decoración (X)"><span class="tool-icon tool-icon--decoration" aria-hidden="true"></span></button>
      </div>
    </details>
    <details class="tools-rail-group" id="correction-tools-group">
      <summary aria-label="Corrección y borrado" title="Corrección y borrado"><span class="tool-icon tool-icon--vector-eraser" aria-hidden="true"></span></summary>
      <div class="tools-rail-group-items">
        <button id="rail-eraser" aria-label="Borrador" title="Borrador (E)"><span class="tool-icon tool-icon--eraser" aria-hidden="true"></span></button>
        <button id="rail-smudge" aria-label="Mezcla de color" title="Mezcla de color (J)"><span class="tool-icon tool-icon--smudge" aria-hidden="true"></span></button>
        <button id="rail-liquify" aria-label="Licuar" title="Licuar (K)"><span class="tool-icon tool-icon--liquify" aria-hidden="true"></span></button>
        <button id="rail-clone-stamp" aria-label="Tampón de copia" title="Tampón de copia (C) · Alt + clic define el origen"><span class="tool-icon tool-icon--clone-stamp" aria-hidden="true"></span></button>
        <button id="rail-vector-eraser" aria-label="Goma vectorial" title="Goma vectorial (Shift + E) · elimina el objeto vectorial completo"><span class="tool-icon tool-icon--vector-eraser" aria-hidden="true"></span></button>
        <button id="rail-vector-line-correction" aria-label="Corrección de línea" title="Corrección de línea (Shift + T) · simplifica trazos vectoriales sin modificar curvas Bézier"><span class="tool-icon tool-icon--vector-line-correction" aria-hidden="true"></span></button>
        <button id="rail-dust-removal" aria-label="Eliminar polvo" title="Eliminar polvo (Shift + U) · suaviza puntos aislados del escaneo"><span class="tool-icon tool-icon--dust-removal" aria-hidden="true"></span></button>
      </div>
    </details>
    <details class="tools-rail-group" id="pixel-shapes-group">
      <summary aria-label="Formas de píxeles" title="Herramientas de formas de píxeles"><span class="tool-icon tool-icon--select-rectangle" aria-hidden="true"></span></summary>
      <div class="tools-rail-group-items">
    <button id="rail-line" aria-label="Línea" title="Línea (L)"><span class="tool-icon tool-icon--line" aria-hidden="true"></span></button>
    <button id="rail-rectangle" aria-label="Rectángulo" title="Rectángulo (R)"><span class="tool-icon tool-icon--rectangle" aria-hidden="true"></span></button>
    <button id="rail-ellipse" aria-label="Elipse" title="Elipse (O)"><span class="tool-icon tool-icon--ellipse" aria-hidden="true"></span></button>
    <button id="rail-pixel-rounded-rectangle" aria-label="Rectángulo redondeado de píxeles" title="Rectángulo redondeado de píxeles (1) · arrastrá para rasterizar la forma"><span class="tool-icon tool-icon--pixel-rounded-rectangle" aria-hidden="true"></span></button>
    <button id="rail-pixel-polyline" aria-label="Polilínea de píxeles" title="Polilínea de píxeles (2) · arrastrá para dibujar segmentos sobre una capa de pintura"><span class="tool-icon tool-icon--pixel-polyline" aria-hidden="true"></span></button>
    <button id="rail-pixel-bezier" aria-label="Curva Bézier de píxeles" title="Curva Bézier de píxeles (3) · arrastrá para rasterizar una curva"><span class="tool-icon tool-icon--pixel-bezier" aria-hidden="true"></span></button>
    <button id="rail-pixel-polygon" aria-label="Polígono de píxeles" title="Polígono de píxeles (4) · arrastrá para rasterizar un polígono"><span class="tool-icon tool-icon--pixel-polygon" aria-hidden="true"></span></button>
    <button id="rail-pixel-star" aria-label="Estrella de píxeles" title="Estrella de píxeles (5) · arrastrá para rasterizar una estrella"><span class="tool-icon tool-icon--pixel-star" aria-hidden="true"></span></button>
    <button id="rail-pixel-spiral" aria-label="Espiral de píxeles" title="Espiral de píxeles (6) · arrastrá para rasterizar una espiral"><span class="tool-icon tool-icon--pixel-spiral" aria-hidden="true"></span></button>
      </div>
    </details>
    <details class="tools-rail-group" id="fill-color-group">
      <summary aria-label="Relleno y color" title="Relleno y color"><span class="tool-icon tool-icon--fill" aria-hidden="true"></span></summary>
      <div class="tools-rail-group-items">
        <button id="rail-fill" aria-label="Bote de pintura" title="Relleno (G)"><span class="tool-icon tool-icon--fill" aria-hidden="true"></span></button>
        <button id="rail-gradient" aria-label="Degradado" title="Degradado (D): arrastrá para definir la dirección"><span class="tool-icon tool-icon--gradient" aria-hidden="true"></span></button>
        <button id="rail-eyedropper" aria-label="Cuentagotas" title="Cuentagotas (I)"><span class="tool-icon tool-icon--eyedropper" aria-hidden="true"></span></button>
      </div>
    </details>
    <details class="tools-rail-group" id="selection-tools-group">
      <summary aria-label="Selección de áreas" title="Selección de áreas"><span class="tool-icon tool-icon--vector-select" aria-hidden="true"></span></summary>
      <div class="tools-rail-group-items">
        <button id="rail-select-rectangle" aria-label="Selección rectangular" title="Selección rectangular (Shift + R)"><span class="tool-icon tool-icon--select-rectangle" aria-hidden="true"></span></button>
        <button id="rail-select-ellipse" aria-label="Selección elíptica" title="Selección elíptica (Shift + Q)"><span class="tool-icon tool-icon--select-ellipse" aria-hidden="true"></span></button>
        <button id="rail-select-lasso" aria-label="Lazo" title="Lazo (Shift + L)"><span class="tool-icon tool-icon--select-lasso" aria-hidden="true"></span></button>
        <button id="rail-select-polygon" aria-label="Selección poligonal" title="Selección poligonal (Shift + 1)"><span class="tool-icon tool-icon--select-polygon" aria-hidden="true"></span></button>
        <button id="rail-selection-brush" aria-label="Pincel de selección" title="Pincel de selección (Shift + 2)"><span class="tool-icon tool-icon--selection-brush" aria-hidden="true"></span></button>
        <button id="rail-selection-erase" aria-label="Borrador de selección" title="Borrador de selección (Shift + 3)"><span class="tool-icon tool-icon--selection-erase" aria-hidden="true"></span></button>
        <button id="rail-magic-wand" aria-label="Varita mágica" title="Varita mágica (Shift + M)"><span class="tool-icon tool-icon--magic-wand" aria-hidden="true"></span></button>
        <button id="rail-selection-clear" aria-label="Borrar selección" title="Borrar selección (Shift + X)"><span class="tool-icon tool-icon--selection-clear" aria-hidden="true"></span></button>
      </div>
    </details>
    <button id="rail-text" aria-label="Texto" title="Texto (T)"><span class="tool-icon tool-icon--text" aria-hidden="true"></span></button>
    <button id="rail-vector-select" aria-label="Seleccionar objeto vectorial" title="Seleccionar objeto vectorial (V)"><span class="tool-icon tool-icon--vector-select" aria-hidden="true"></span></button>
    <div class="tools-rail-divider" aria-hidden="true"></div>
    <details class="tools-rail-group" id="vector-shapes-group">
      <summary aria-label="Formas vectoriales" title="Herramientas de formas vectoriales"><span class="tool-icon tool-icon--vector-rectangle" aria-hidden="true"></span></summary>
      <div class="tools-rail-group-items">
    <button id="rail-vector-rectangle" aria-label="Rectángulo vectorial" title="Rectángulo vectorial (7) · arrastrá para crear una forma editable"><span class="tool-icon tool-icon--vector-rectangle" aria-hidden="true"></span></button>
    <button id="rail-vector-rounded-rectangle" aria-label="Rectángulo redondeado vectorial" title="Rectángulo redondeado vectorial (8) · arrastrá para crear una forma editable"><span class="tool-icon tool-icon--vector-rounded-rectangle" aria-hidden="true"></span></button>
    <button id="rail-vector-ellipse" aria-label="Elipse vectorial" title="Elipse vectorial (9) · arrastrá para crear una forma editable"><span class="tool-icon tool-icon--vector-ellipse" aria-hidden="true"></span></button>
    <button id="rail-vector-line" aria-label="Línea vectorial" title="Línea vectorial (0) · arrastrá para crear una línea editable"><span class="tool-icon tool-icon--vector-line" aria-hidden="true"></span></button>
    <button id="rail-vector-polyline" aria-label="Polilínea vectorial" title="Polilínea vectorial (Shift + Z) · arrastrá para crear una ruta de segmentos editable"><span class="tool-icon tool-icon--vector-polyline" aria-hidden="true"></span></button>
    <button id="rail-vector-pen" aria-label="Pluma vectorial" title="Pluma vectorial (Shift + N) · arrastrá para crear una curva Bézier editable"><span class="tool-icon tool-icon--vector-pen" aria-hidden="true"></span></button>
    <button id="rail-vector-polygon" aria-label="Polígono vectorial" title="Polígono vectorial (Shift + S) · arrastrá para crear un polígono editable"><span class="tool-icon tool-icon--vector-polygon" aria-hidden="true"></span></button>
    <button id="rail-vector-star" aria-label="Estrella vectorial" title="Estrella vectorial (Shift + G) · arrastrá para crear una estrella editable"><span class="tool-icon tool-icon--vector-star" aria-hidden="true"></span></button>
    <button id="rail-vector-spiral" aria-label="Espiral vectorial" title="Espiral vectorial (Shift + D) · arrastrá para crear una espiral editable"><span class="tool-icon tool-icon--vector-spiral" aria-hidden="true"></span></button>
    <button id="rail-vector-freehand" aria-label="Trazo vectorial libre" title="Trazo vectorial libre (Shift + C) · dibujá una ruta editable con el puntero"><span class="tool-icon tool-icon--vector-freehand" aria-hidden="true"></span></button>
      </div>
    </details>
    <div class="tools-rail-divider" aria-hidden="true"></div>
    <details class="tools-rail-group" id="comic-guides-group">
      <summary aria-label="Cómic y guías" title="Cómic y guías"><span class="tool-icon tool-icon--comic-panel" aria-hidden="true"></span></summary>
      <div class="tools-rail-group-items">
        <button id="rail-comic-panel" aria-label="Marco y viñetas de cómic" title="Marco y viñetas (P) · requiere una capa vectorial"><span class="tool-icon tool-icon--comic-panel" aria-hidden="true"></span></button>
        <button id="rail-speech-bubble" aria-label="Bocadillo" title="Bocadillo (Shift + W) · crea un globo vectorial"><span class="tool-icon tool-icon--speech-bubble" aria-hidden="true"></span></button>
        <button id="rail-flash" aria-label="Flash" title="Flash (Shift + F) · crea un efecto gráfico vectorial"><span class="tool-icon tool-icon--flash" aria-hidden="true"></span></button>
        <button id="rail-vector-parallel-lines" aria-label="Líneas paralelas" title="Líneas paralelas (Shift + O)"><span class="tool-icon tool-icon--vector-parallel-lines" aria-hidden="true"></span></button>
        <button id="rail-vector-radial-lines" aria-label="Líneas radiales" title="Líneas radiales (Shift + P)"><span class="tool-icon tool-icon--vector-radial-lines" aria-hidden="true"></span></button>
      </div>
    </details>
    <div class="swatches"><span id="foreground-swatch"></span><span id="secondary-swatch"></span></div>
  </aside>
  <section class="canvas-area"><div class="canvas-label"><span id="canvas-name">Sin título</span><span id="canvas-meta">1280 × 720 px · RGB/8</span></div><div id="canvas-preview-toolbar" class="canvas-preview-toolbar" hidden><span class="canvas-preview-toolbar__title">Vista previa de efectos y máscaras</span><label id="mask-preview-control" class="mask-preview-control"><span class="sr-only">Modo de comparación</span><select id="mask-preview-mode" aria-label="Comparación de máscaras"><option value="before">Antes de modificar</option><option value="split">Dividir antes/después</option><option value="after">Después de modificar</option></select></label></div><div class="canvas-stage"><canvas id="canvas"></canvas><canvas id="tool-preview" aria-hidden="true"></canvas><canvas id="selection-preview" aria-hidden="true"></canvas><div id="mask-before-preview-clip" hidden aria-hidden="true"><canvas id="mask-before-preview"></canvas></div><div id="mask-preview-before-label" class="mask-preview-label mask-preview-label--before" hidden aria-hidden="true">Antes</div><div id="mask-preview-after-label" class="mask-preview-label mask-preview-label--after" hidden aria-hidden="true">Después</div><div id="mask-preview-divider" hidden aria-hidden="true"></div></div><div class="zoom-controls"><button id="zoom-out" title="Alejar" aria-label="Alejar"><span class="tool-icon tool-icon--zoom-out" aria-hidden="true"></span></button><span id="zoom-value">Ajustar</span><button id="zoom-in" title="Acercar" aria-label="Acercar"><span class="tool-icon tool-icon--zoom-in" aria-hidden="true"></span></button><button id="zoom-fit" title="Ajustar al lienzo"><span class="tool-icon tool-icon--zoom-fit" aria-hidden="true"></span><span>Ajustar</span></button><button id="toggle-comic-guides" type="button" aria-pressed="false" title="Mostrar guías editoriales">Guías</button><button id="toggle-comic-symmetry-vertical" class="symmetry-toggle" type="button" aria-pressed="false" title="Activar o desactivar la simetría respecto del eje vertical">Simetría V</button><button id="toggle-comic-symmetry-horizontal" class="symmetry-toggle" type="button" aria-pressed="false" title="Activar o desactivar la simetría respecto del eje horizontal">Simetría H</button><label class="ruler-mode-control" for="ruler-guide-mode">Regla <select id="ruler-guide-mode" aria-label="Tipo de regla"><option value="linear">Lineal</option><option value="curved">Curva</option><option value="perspective">Perspectiva</option><option value="fisheye">Ojo de pez</option><option value="parallel">Paralelas</option><option value="radial">Radial</option><option value="concentric">Concéntrica</option></select></label><button id="toggle-ruler-guides" type="button" aria-pressed="false" title="Mostrar u ocultar la regla seleccionada">Regla</button></div></section>
  <aside class="right-dock">
${ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE}
${HISTORY_PANEL_TEMPLATE}
${LAYERS_PANEL_TEMPLATE}
${COMIC_MANAGER_PANEL_TEMPLATE}
${STORYBOARD_PANEL_TEMPLATE}
${ANIMATION_TIMELINE_PANEL_TEMPLATE}
${LAYER_EFFECTS_PANEL_TEMPLATE}
${LAYER_MASK_PANEL_TEMPLATE}
${FILTER_PANEL_TEMPLATE}
  </aside>
  <aside class="animation-timeline-dock" aria-label="Panel inferior de animación"></aside>
</main>
${VECTOR_EDITOR_PANEL_TEMPLATE}`;
