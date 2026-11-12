// Shared application shell markup used by the welcome screen and editor.
import { MENU_DEFINITIONS } from '../menus/MenuDefinitions.mjs';
import { renderDeclaredMenu } from '../menus/MenuMarkupRenderer';
export const LOGO_URL = `${import.meta.env.BASE_URL}branding/nvts-photo-mania-icon.svg`;
export const LOGO_PNG_URL = `${import.meta.env.BASE_URL}branding/nvts-photo-mania-icon.png`;
export const NVTS_PHOTO_FILE_ICON_URL = `${import.meta.env.BASE_URL}branding/file-types/nvtsphoto-pmd.png`;

export function logoImageMarkup(className = '', alt = ''): string {
  const classAttribute = className ? ` class=\"${className}\"` : '';
  const accessibilityAttributes = alt ? ` alt=\"${alt}\"` : ' alt=\"\" aria-hidden=\"true\"';
  return `<img${classAttribute} src=\"${LOGO_URL}\"${accessibilityAttributes} onerror=\"this.onerror=null;this.src='${LOGO_PNG_URL}'\"/>`;
}
export const UI_ICON_URL = `${import.meta.env.BASE_URL}icons/ui/`;

export function uiIcon(name: string): string {
  return `<span class="ui-icon" style="--ui-icon-url: url('${UI_ICON_URL}${name}.svg')" aria-hidden="true"></span>`;
}

function menuLabel(iconName: string, label: string): string {
  return `<span class="menu-item-label">${uiIcon(iconName)}<span>${label}</span></span>`;
}

export const MAIN_MENU = `<nav class="menus" aria-label="Menú principal">
    <div class="menu-wrap">
      <button id="menu-file" aria-haspopup="menu" aria-expanded="false" aria-controls="file-menu-dropdown">${uiIcon('file')}<span>Archivo</span></button>
      <div id="file-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Archivo" hidden>
        <button id="b-new" class="menu-item" role="menuitem" type="button">${menuLabel('new-project', 'Nuevo proyecto')}<kbd>Ctrl+N</kbd></button>
        <button id="b-open" class="menu-item" role="menuitem" type="button">${menuLabel('open-file', 'Abrir archivo…')}<kbd>Ctrl+O</kbd></button>
        <button id="b-import-image" class="menu-item" role="menuitem" type="button">${menuLabel('import-image', 'Importar imagen como capa…')}<kbd>Ctrl+Alt+I</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <button id="b-save" class="menu-item" role="menuitem" type="button">${menuLabel('save', 'Guardar')}<kbd>Ctrl+S</kbd></button>
        <button id="b-save-as" class="menu-item" role="menuitem" type="button">${menuLabel('save-as', 'Guardar como…')}<kbd>Ctrl+Shift+S</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <button id="b-export" class="menu-item" role="menuitem" type="button">${menuLabel('export', 'Exportar…')}<kbd>Ctrl+Shift+E</kbd></button>
        <button id="b-render-animation" class="menu-item" role="menuitem" type="button">${menuLabel('timeline', 'Renderizar animación…')}</button>
      </div>
    </div>
    ${renderDeclaredMenu(MENU_DEFINITIONS.edit, uiIcon)}
    ${renderDeclaredMenu(MENU_DEFINITIONS.image, uiIcon)}
    <div class="menu-wrap">
      <button id="menu-layer" aria-haspopup="menu" aria-expanded="false" aria-controls="layer-menu-dropdown">${uiIcon('layer')}<span>Capa</span></button>
      <div id="layer-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Capa" hidden>
        <div class="menu-subwrap">
          <button id="menu-new-layer-types" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="layer-types-menu-dropdown">${menuLabel('new-project', 'Nueva capa')}<span class="submenu-arrow">›</span></button>
          <div id="layer-types-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Tipos de capa" hidden>
            <button class="menu-item" role="menuitem" data-create-layer-type="paint" type="button">${menuLabel('new-project', 'Capa de pintura')}<kbd>Ctrl+Shift+N</kbd></button>
            <button class="menu-item" role="menuitem" data-create-layer-type="filter" type="button">${menuLabel('filter', 'Capa de filtro')}<kbd>Ctrl+Alt+Shift+N</kbd></button>
            <button class="menu-item" role="menuitem" data-create-layer-type="fill" type="button">${menuLabel('layer', 'Capa de relleno…')}<kbd>Ctrl+Shift+F</kbd></button>
            <button class="menu-item" role="menuitem" data-create-layer-type="file" type="button">${menuLabel('import-image', 'Capa de archivo…')}<kbd>Ctrl+Alt+I</kbd></button>
            <button class="menu-item" role="menuitem" data-create-layer-type="vector" type="button">${menuLabel('select', 'Capa vectorial')}<kbd>Ctrl+Alt+Shift+V</kbd></button>
            <button class="menu-item" role="menuitem" data-create-layer-type="text" type="button">${menuLabel('edit', 'Capa de texto')}<kbd>Ctrl+Alt+Shift+T</kbd></button>
            <button class="menu-item" role="menuitem" data-create-layer-type="group" type="button">${menuLabel('layer', 'Grupo vacío')}<kbd>Ctrl+Alt+Shift+G</kbd></button>
          </div>
        </div>
        <div class="menu-divider" role="separator"></div>
        <button class="menu-item" role="menuitem" data-layer-action="group" type="button">${menuLabel('layer', 'Agrupar capa seleccionada')}<kbd>Ctrl+G</kbd></button>
        <button class="menu-item" role="menuitem" data-layer-action="transform" type="button">${menuLabel('vector-select', 'Transformación no destructiva…')}<kbd>Ctrl+Shift+T</kbd></button>
        <button class="menu-item" role="menuitem" data-layer-action="duplicate" type="button">${menuLabel('duplicate', 'Duplicar capa…')}<kbd>Ctrl+J</kbd></button>
        <button class="menu-item" role="menuitem" data-layer-action="rename" type="button">${menuLabel('edit', 'Cambiar nombre de capa…')}<kbd>F2</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <button class="menu-item" role="menuitem" data-layer-action="move-up" type="button">${menuLabel('move-up', 'Subir capa')}<kbd>Ctrl+]</kbd></button>
        <button class="menu-item" role="menuitem" data-layer-action="move-down" type="button">${menuLabel('move-down', 'Bajar capa')}<kbd>Ctrl+[</kbd></button>
        <button class="menu-item" role="menuitem" data-layer-action="visibility" type="button">${menuLabel('view', 'Mostrar / ocultar capa')}<kbd>Ctrl+Shift+H</kbd></button>
        <button class="menu-item" role="menuitem" data-layer-action="lock" type="button">${menuLabel('lock', 'Bloquear / desbloquear capa')}<kbd>Ctrl+Shift+L</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <button class="menu-item" role="menuitem" data-layer-action="effects" type="button">${menuLabel('effects', 'Estilos de capa…')}<kbd>Ctrl+Shift+K</kbd></button>
        <button class="menu-item" role="menuitem" data-layer-action="opacity" type="button">${menuLabel('opacity', 'Opacidad…')}<kbd>Ctrl+Shift+O</kbd></button>
        <button class="menu-item" role="menuitem" data-layer-action="blend" type="button">${menuLabel('layer', 'Modo de fusión…')}<kbd>Ctrl+Shift+B</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <button class="menu-item danger" role="menuitem" data-layer-action="delete" type="button">${menuLabel('delete', 'Eliminar capa')}<kbd>Shift+Delete</kbd></button>
      </div>
    </div>
    ${renderDeclaredMenu(MENU_DEFINITIONS.select, uiIcon)}
    <button id="menu-filter">${uiIcon('filter')}<span>Filtro</span></button>
    <div class="menu-wrap view-menu-wrap">
      <button id="menu-view" aria-haspopup="menu" aria-expanded="false" aria-controls="view-menu-dropdown">${uiIcon('view')}<span>Ver</span></button>
      <div id="view-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Ver" hidden>
        <button id="toggle-panels" class="menu-item" role="menuitem" type="button">${menuLabel('panels-visible', 'Mostrar paneles')}<kbd>Tab</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <div class="menu-subwrap">
          <button id="menu-panels" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="panels-menu-dropdown">${menuLabel('panels', 'Paneles')}<span class="submenu-arrow">›</span></button>
          <div id="panels-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Paneles" hidden>
            <button id="toggle-panel-advanced" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button">${menuLabel('preferences', 'Opciones avanzadas de herramienta')}<kbd>Ctrl+Alt+1</kbd><span class="menu-check">✓</span></button>
            <button id="toggle-panel-history" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button">${menuLabel('recent', 'Historial')}<kbd>Ctrl+Alt+2</kbd><span class="menu-check">✓</span></button>
            <button id="toggle-panel-layers" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button">${menuLabel('layer', 'Capas')}<kbd>Ctrl+Alt+3</kbd><span class="menu-check">✓</span></button>
            <button id="toggle-panel-comic" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button">${menuLabel('workspace-comics', 'Gestor de cómics')}<kbd>Ctrl+Alt+5</kbd><span class="menu-check"></span></button>
            <button id="toggle-panel-storyboard" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button">${menuLabel('workspace-storyboard', 'Guion gráfico')}<kbd>Ctrl+Alt+6</kbd><span class="menu-check"></span></button>
            <button id="toggle-panel-timeline" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button">${menuLabel('workspace-animation', 'Línea de tiempo de animación')}<kbd>Ctrl+Alt+4</kbd><span class="menu-check"></span></button>
          </div>
        </div>
        <div class="menu-subwrap">
          <button id="menu-plugins" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="plugins-menu-dropdown">${menuLabel('plugins', 'Plugins')}<span class="submenu-arrow">›</span></button>
          <div id="plugins-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Plugins" hidden>
            <button id="plugins-manage" class="menu-item" role="menuitem" type="button">${menuLabel('plugin-manage', 'Administrar plugins…')}<kbd>Ctrl+Alt+P</kbd></button>
            <button id="plugins-install-menu" class="menu-item" role="menuitem" type="button">${menuLabel('plugin-install', 'Instalar plugin (.js)…')}<kbd>Ctrl+Alt+Shift+P</kbd></button>
            <div class="menu-divider" role="separator"></div>
            <div id="plugin-actions" class="plugin-actions"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="menu-wrap workspace-menu-wrap">
      <button id="menu-workspace" aria-haspopup="menu" aria-expanded="false" aria-controls="workspace-menu-dropdown">${uiIcon('workspace')}<span>Espacio de trabajo</span></button>
      <div id="workspace-menu-dropdown" class="file-menu-dropdown workspace-menu-dropdown" role="menu" aria-label="Espacios de trabajo" hidden>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="true" data-workspace="general" type="button">${menuLabel('workspace-general', 'General')}<span class="menu-check">✓</span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="digital-illustration" type="button">${menuLabel('workspace-illustration', 'Ilustración digital')}<span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="vector-illustration" type="button">${menuLabel('workspace-vector', 'Ilustración vectorial')}<span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="image-manipulation" type="button">${menuLabel('workspace-image', 'Manipulación de imágenes')}<span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="comics" type="button">${menuLabel('workspace-comics', 'Cómics')}<span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="storyboarding" type="button">${menuLabel('workspace-storyboard', 'Storyboarding')}<span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="animation" type="button">${menuLabel('workspace-animation', 'Animación')}<span class="menu-check"></span></button>
        <div class="menu-divider" role="separator"></div>
        <button id="workspace-reset-defaults" class="menu-item" role="menuitem" type="button">${menuLabel('workspace', 'Restaurar espacio de trabajo actual')}</button>
      </div>
    </div>
    ${renderDeclaredMenu(MENU_DEFINITIONS.help, uiIcon)}
  </nav>`;

export const HOME_TEMPLATE = `
<div class="home-shell">
  <header class="home-topbar"><button class="home-back" title="Volver al selector" aria-label="Volver al selector">${uiIcon('arrow-left')}</button><div class="home-mini-brand">${logoImageMarkup()}<strong>PhotoMania</strong></div><span class="home-top-divider"></span>${MAIN_MENU}</header>
  <main class="home-card">
    <header class="home-brand">${logoImageMarkup('', 'Logo de NVTS PhotoMania')}<div><h1>Photo<span>Mania</span></h1><p>Crea algo increíble. Diseñá, editá y da vida a tus ideas.</p></div></header>
    <div class="home-layout">
      <aside class="home-sidebar">
        <button data-home-nav="new" class="active">${uiIcon('new-project')}<span class="home-nav-label">Nuevo proyecto</span></button>
        <button data-home-nav="open">${uiIcon('open-file')}<span class="home-nav-label">Abrir archivo</span></button>
        <button data-home-nav="recent">${uiIcon('recent')}<span class="home-nav-label">Proyectos recientes</span><small id="home-recent-count">0</small></button>
        <div class="home-sidebar-divider"></div><span class="home-side-caption">${uiIcon('import-image')}<span>Importar desde…</span></span>
        <button data-home-open="device">${uiIcon('device')}<span class="home-nav-label">Tu dispositivo</span></button>
        <button class="home-disabled" title="Integración futura"><img class="provider-icon" src="${UI_ICON_URL}google-drive.svg" alt="" aria-hidden="true"/><span class="home-nav-label">Google Drive</span><em>Próximamente</em></button>
        <button class="home-disabled" title="Integración futura"><img class="provider-icon" src="${UI_ICON_URL}dropbox.svg" alt="" aria-hidden="true"/><span class="home-nav-label">Dropbox</span><em>Próximamente</em></button>
        <button id="home-paste-hint" class="home-drop-hint">${uiIcon('drop-paste')}<span class="home-nav-label">Arrastrá un archivo o pegá una imagen (Ctrl+V)</span></button>
      </aside>
      <section class="home-main">
        <section data-home-view="new" class="home-view">
          <div class="home-section-head"><h2 id="home-section-title">Nuevo proyecto</h2><span>Elegí una plantilla para empezar</span></div>
          <div id="home-template-gallery"></div>
          <div class="home-create-settings"><label class="home-field home-name-field"><span class="home-field-label">${uiIcon('project-name')}Nombre del proyecto</span><input id="home-project-name" maxlength="120" value="Sin título" /></label><div class="home-dimensions"><label class="home-field"><span class="home-field-label">${uiIcon('ruler-horizontal')}Ancho</span><input id="home-width" type="number" min="1" max="8192" value="1920" /></label><label class="home-lock"><input id="home-lock" type="checkbox" checked aria-label="Mantener proporción"/>${uiIcon('ratio-lock')}</label><label class="home-field"><span class="home-field-label">${uiIcon('ruler-vertical')}Alto</span><input id="home-height" type="number" min="1" max="8192" value="1080" /></label><span class="home-px">px</span><button id="home-create" class="home-primary"><span>Crear proyecto</span>${uiIcon('arrow-right')}</button></div>
          </div>
        </section>
        <section data-home-view="open" class="home-view" hidden>
          <div class="home-section-head"><h2>Abrir archivo</h2><span>Continuá trabajando en una imagen</span></div>
          <div id="home-dropzone" class="home-dropzone"><div class="home-download-icon home-download-icon--filetype"><img src="${NVTS_PHOTO_FILE_ICON_URL}" alt="Icono del formato PMD de PhotoMania" /></div><h3>Arrastrá una imagen o <span>seleccioná un archivo</span></h3><p>También podés examinar tu dispositivo</p><button id="home-browse" class="home-secondary">${uiIcon('browse')}<span>Examinar archivos</span></button><div class="home-filetypes"><span class="native-filetype-chip">PMD · .nvtsphoto</span><span>.psd</span><span>.ai</span><span>.kra</span><span>.png</span><span>.jpg</span><span>.gif</span><span>.svg</span><span>.webp</span><span>.tif</span><span>.bmp</span><span>.tga</span><span>.ppm</span></div><input id="home-file-input" type="file" accept="image/*,.nvtsphoto,.psd,.ai,.kra,.tga,.ppm" hidden /></div>
        </section>
        <section data-home-view="recent" class="home-view" hidden><div class="home-section-head"><h2>Proyectos recientes</h2><span>Seguí donde lo dejaste</span></div><div id="home-recents" class="home-recent-grid"></div></section>
        <p id="home-status" class="home-status" role="status"></p>
      </section>
    </div>
  </main>
</div>`;
