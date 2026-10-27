// Shared application shell markup used by the welcome screen and editor.
export const LOGO_URL = `${import.meta.env.BASE_URL}branding/photomania-icon.svg`;
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
        <button id="b-import-image" class="menu-item" role="menuitem" type="button">${menuLabel('import-image', 'Importar imagen como capa…')}</button>
        <div class="menu-divider" role="separator"></div>
        <button id="b-save" class="menu-item" role="menuitem" type="button">${menuLabel('save', 'Guardar')}<kbd>Ctrl+S</kbd></button>
        <button id="b-save-as" class="menu-item" role="menuitem" type="button">${menuLabel('save-as', 'Guardar como…')}<kbd>Ctrl+Shift+S</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <button id="b-export-png" class="menu-item" role="menuitem" type="button">${menuLabel('export-png', 'Exportar composición como PNG…')}</button>
        <button id="b-export-jpeg" class="menu-item" role="menuitem" type="button">${menuLabel('export-jpeg', 'Exportar composición como JPEG…')}</button>
      </div>
    </div>
    <div class="menu-wrap">
      <button id="menu-edit" aria-haspopup="menu" aria-expanded="false" aria-controls="edit-menu-dropdown">${uiIcon('edit')}<span>Editar</span></button>
      <div id="edit-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Editar" hidden>
        <button id="b-preferences" class="menu-item" role="menuitem" type="button">${menuLabel('preferences', 'Preferencias…')}<kbd></kbd></button>
      </div>
    </div>
    <button id="menu-image">${uiIcon('image')}<span>Imagen</span></button><button id="menu-layer">${uiIcon('layer')}<span>Capa</span></button><button id="menu-select">${uiIcon('select')}<span>Seleccionar</span></button><button id="menu-filter">${uiIcon('filter')}<span>Filtro</span></button>
    <div class="menu-wrap view-menu-wrap">
      <button id="menu-view" aria-haspopup="menu" aria-expanded="false" aria-controls="view-menu-dropdown">${uiIcon('view')}<span>Ver</span></button>
      <div id="view-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Ver" hidden>
        <button id="toggle-panels" class="menu-item" role="menuitem" type="button">${menuLabel('panels-visible', 'Mostrar paneles')}<kbd>Tab</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <div class="menu-subwrap">
          <button id="menu-panels" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="panels-menu-dropdown">${menuLabel('panels', 'Paneles')}<span class="submenu-arrow">›</span></button>
          <div id="panels-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Paneles" hidden>
            <button id="toggle-panel-advanced" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button">${menuLabel('preferences', 'Opciones avanzadas de herramienta')}<span class="menu-check">✓</span></button>
            <button id="toggle-panel-history" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button">${menuLabel('recent', 'Historial')}<span class="menu-check">✓</span></button>
            <button id="toggle-panel-layers" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button">${menuLabel('layer', 'Capas')}<span class="menu-check">✓</span></button>
            <button id="toggle-panel-comic" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button">${menuLabel('workspace-comics', 'Gestor de cómics')}<span class="menu-check"></span></button>
            <button id="toggle-panel-storyboard" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button">${menuLabel('workspace-storyboard', 'Guion gráfico')}<span class="menu-check"></span></button>
            <button id="toggle-panel-timeline" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button">${menuLabel('workspace-animation', 'Línea de tiempo de animación')}<span class="menu-check"></span></button>
          </div>
        </div>
        <div class="menu-subwrap">
          <button id="menu-plugins" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="plugins-menu-dropdown">${menuLabel('plugins', 'Plugins')}<span class="submenu-arrow">›</span></button>
          <div id="plugins-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Plugins" hidden>
            <button id="plugins-manage" class="menu-item" role="menuitem" type="button">${menuLabel('plugin-manage', 'Administrar plugins…')}</button>
            <button id="plugins-install-menu" class="menu-item" role="menuitem" type="button">${menuLabel('plugin-install', 'Instalar plugin (.js)…')}</button>
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
      </div>
    </div>
    <button id="menu-help">${uiIcon('help')}<span>Ayuda</span></button>
  </nav>`;

export const HOME_TEMPLATE = `
<div class="home-shell">
  <header class="home-topbar"><button class="home-back" title="Volver al selector" aria-label="Volver al selector">${uiIcon('arrow-left')}</button><div class="home-mini-brand"><img src="${LOGO_URL}" alt=""/><strong>PhotoMania</strong></div><span class="home-top-divider"></span>${MAIN_MENU}</header>
  <main class="home-card">
    <header class="home-brand"><img src="${LOGO_URL}" alt="Logo de NVTS PhotoMania"/><div><h1>Photo<span>Mania</span></h1><p>Crea algo increíble. Diseñá, editá y da vida a tus ideas.</p></div></header>
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
          <div class="home-template-toolbar"><label for="home-category">${uiIcon('workspace')}Categoría</label><select id="home-category"><option>Todas</option><option>Redes sociales</option><option>Pantallas</option><option>Impresión</option><option>Cómic e ilustración</option><option>Storyboard</option><option>Animación 2D</option><option>Animación vertical</option><option>Texturas</option></select></div>
          <div id="home-template-grid" class="home-template-grid"></div>
          <div class="home-create-settings"><label class="home-field home-name-field"><span class="home-field-label">${uiIcon('project-name')}Nombre del proyecto</span><input id="home-project-name" maxlength="120" value="Sin título" /></label><div class="home-dimensions"><label class="home-field"><span class="home-field-label">${uiIcon('ruler-horizontal')}Ancho</span><input id="home-width" type="number" min="1" max="8192" value="1920" /></label><label class="home-lock"><input id="home-lock" type="checkbox" checked aria-label="Mantener proporción"/>${uiIcon('ratio-lock')}</label><label class="home-field"><span class="home-field-label">${uiIcon('ruler-vertical')}Alto</span><input id="home-height" type="number" min="1" max="8192" value="1080" /></label><span class="home-px">px</span><button id="home-create" class="home-primary"><span>Crear proyecto</span>${uiIcon('arrow-right')}</button></div>
          </div>
        </section>
        <section data-home-view="open" class="home-view" hidden>
          <div class="home-section-head"><h2>Abrir archivo</h2><span>Continuá trabajando en una imagen</span></div>
          <div id="home-dropzone" class="home-dropzone"><div class="home-download-icon">${uiIcon('open-file')}</div><h3>Arrastrá una imagen o <span>seleccioná un archivo</span></h3><p>También podés examinar tu dispositivo</p><button id="home-browse" class="home-secondary">${uiIcon('browse')}<span>Examinar archivos</span></button><div class="home-filetypes"><span>.nvtsphoto</span><span>.png</span><span>.jpg</span><span>.webp</span><span>.gif</span></div><input id="home-file-input" type="file" accept="image/*,.nvtsphoto" hidden /></div>
        </section>
        <section data-home-view="recent" class="home-view" hidden><div class="home-section-head"><h2>Proyectos recientes</h2><span>Seguí donde lo dejaste</span></div><div id="home-recents" class="home-recent-grid"></div></section>
        <p id="home-status" class="home-status" role="status"></p>
      </section>
    </div>
  </main>
</div>`;
