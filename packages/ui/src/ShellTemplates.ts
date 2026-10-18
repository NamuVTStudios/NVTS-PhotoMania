// Shared application shell markup used by the welcome screen and editor.
export const LOGO_URL = `${import.meta.env.BASE_URL}branding/photomania-icon.svg`;

export const MAIN_MENU = `<nav class="menus" aria-label="Menú principal">
    <div class="menu-wrap">
      <button id="menu-file" aria-haspopup="menu" aria-expanded="false" aria-controls="file-menu-dropdown">Archivo</button>
      <div id="file-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Archivo" hidden>
        <button id="b-new" class="menu-item" role="menuitem" type="button"><span>Nuevo proyecto</span><kbd>Ctrl+N</kbd></button>
        <button id="b-open" class="menu-item" role="menuitem" type="button"><span>Abrir archivo…</span><kbd>Ctrl+O</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <button id="b-save" class="menu-item" role="menuitem" type="button"><span>Guardar</span><kbd>Ctrl+S</kbd></button>
        <button id="b-save-as" class="menu-item" role="menuitem" type="button"><span>Guardar como…</span><kbd>Ctrl+Shift+S</kbd></button>
      </div>
    </div>
    <div class="menu-wrap">
      <button id="menu-edit" aria-haspopup="menu" aria-expanded="false" aria-controls="edit-menu-dropdown">Editar</button>
      <div id="edit-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Editar" hidden>
        <button id="b-preferences" class="menu-item" role="menuitem" type="button"><span>Preferencias…</span><kbd></kbd></button>
      </div>
    </div>
    <button id="menu-image">Imagen</button><button id="menu-layer">Capa</button><button id="menu-select">Seleccionar</button><button id="menu-filter">Filtro</button>
    <div class="menu-wrap view-menu-wrap">
      <button id="menu-view" aria-haspopup="menu" aria-expanded="false" aria-controls="view-menu-dropdown">Ver</button>
      <div id="view-menu-dropdown" class="file-menu-dropdown" role="menu" aria-label="Ver" hidden>
        <button id="toggle-panels" class="menu-item" role="menuitem" type="button"><span>Mostrar paneles</span><kbd>Tab</kbd></button>
        <div class="menu-divider" role="separator"></div>
        <div class="menu-subwrap">
          <button id="menu-panels" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="panels-menu-dropdown"><span>Paneles</span><span class="submenu-arrow">›</span></button>
          <div id="panels-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Paneles" hidden>
            <button id="toggle-panel-advanced" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button"><span>Opciones avanzadas de herramienta</span><span class="menu-check">✓</span></button>
            <button id="toggle-panel-history" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button"><span>Historial</span><span class="menu-check">✓</span></button>
            <button id="toggle-panel-layers" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="true" type="button"><span>Capas</span><span class="menu-check">✓</span></button>
            <button id="toggle-panel-comic" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button"><span>Gestor de cómics</span><span class="menu-check"></span></button>
            <button id="toggle-panel-storyboard" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button"><span>Guion gráfico</span><span class="menu-check"></span></button>
            <button id="toggle-panel-timeline" class="menu-item panel-visibility-item" role="menuitemcheckbox" aria-checked="false" type="button"><span>Línea de tiempo de animación</span><span class="menu-check"></span></button>
          </div>
        </div>
        <div class="menu-subwrap">
          <button id="menu-plugins" class="menu-item submenu-trigger" role="menuitem" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="plugins-menu-dropdown"><span>Plugins</span><span class="submenu-arrow">›</span></button>
          <div id="plugins-menu-dropdown" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="Plugins" hidden>
            <button id="plugins-manage" class="menu-item" role="menuitem" type="button"><span>Administrar plugins…</span></button>
            <button id="plugins-install-menu" class="menu-item" role="menuitem" type="button"><span>Instalar plugin (.js)…</span></button>
            <div class="menu-divider" role="separator"></div>
            <div id="plugin-actions" class="plugin-actions"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="menu-wrap workspace-menu-wrap">
      <button id="menu-workspace" aria-haspopup="menu" aria-expanded="false" aria-controls="workspace-menu-dropdown">Espacio de trabajo</button>
      <div id="workspace-menu-dropdown" class="file-menu-dropdown workspace-menu-dropdown" role="menu" aria-label="Espacios de trabajo" hidden>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="true" data-workspace="general" type="button"><span>General</span><span class="menu-check">✓</span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="digital-illustration" type="button"><span>Ilustración digital</span><span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="vector-illustration" type="button"><span>Ilustración vectorial</span><span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="image-manipulation" type="button"><span>Manipulación de imágenes</span><span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="comics" type="button"><span>Cómics</span><span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="storyboarding" type="button"><span>Storyboarding</span><span class="menu-check"></span></button>
        <button class="menu-item workspace-menu-item" role="menuitemradio" aria-checked="false" data-workspace="animation" type="button"><span>Animación</span><span class="menu-check"></span></button>
      </div>
    </div>
    <button id="menu-help">Ayuda</button>
  </nav>`;

export const HOME_TEMPLATE = `
<div class="home-shell">
  <header class="home-topbar"><button class="home-back" title="Volver al selector" aria-label="Volver al selector">←</button><div class="home-mini-brand"><img src="${LOGO_URL}" alt=""/><strong>PhotoMania</strong></div><span class="home-top-divider"></span>${MAIN_MENU}</header>
  <main class="home-card">
    <header class="home-brand"><img src="${LOGO_URL}" alt="Logo de NVTS PhotoMania"/><div><h1>Photo<span>Mania</span></h1><p>Crea algo increíble. Diseñá, editá y da vida a tus ideas.</p></div></header>
    <div class="home-layout">
      <aside class="home-sidebar">
        <button data-home-nav="new" class="active"><span>♧</span>Nuevo proyecto</button>
        <button data-home-nav="open"><span>▱</span>Abrir archivo</button>
        <button data-home-nav="recent"><span>◷</span>Proyectos recientes <small id="home-recent-count">0</small></button>
        <div class="home-sidebar-divider"></div><span class="home-side-caption">Importar desde…</span>
        <button data-home-open="device"><span>▣</span>Tu dispositivo</button>
        <button class="home-disabled" title="Integración futura"><span>△</span>Google Drive <em>Próximamente</em></button>
        <button class="home-disabled" title="Integración futura"><span>❖</span>Dropbox <em>Próximamente</em></button>
        <button id="home-paste-hint" class="home-drop-hint">Arrastrá un archivo o pegá una imagen (Ctrl+V)</button>
      </aside>
      <section class="home-main">
        <section data-home-view="new" class="home-view">
          <div class="home-section-head"><h2 id="home-section-title">Nuevo proyecto</h2><span>Elegí una plantilla para empezar</span></div>
          <div class="home-template-toolbar"><label for="home-category">Categoría</label><select id="home-category"><option>Todas</option><option>Redes sociales</option><option>Pantallas</option><option>Impresión</option><option>Cómic e ilustración</option><option>Storyboard</option><option>Animación 2D</option><option>Animación vertical</option><option>Texturas</option></select></div>
          <div id="home-template-grid" class="home-template-grid"></div>
          <div class="home-create-settings"><label class="home-field home-name-field">Nombre del proyecto<input id="home-project-name" maxlength="120" value="Sin título" /></label><div class="home-dimensions"><label class="home-field">Ancho<input id="home-width" type="number" min="1" max="8192" value="1920" /></label><label class="home-lock"><input id="home-lock" type="checkbox" checked aria-label="Mantener proporción"/><span>🔒</span></label><label class="home-field">Alto<input id="home-height" type="number" min="1" max="8192" value="1080" /></label><span class="home-px">px</span><button id="home-create" class="home-primary">Crear proyecto <span>→</span></button></div>
          </div>
        </section>
        <section data-home-view="open" class="home-view" hidden>
          <div class="home-section-head"><h2>Abrir archivo</h2><span>Continuá trabajando en una imagen</span></div>
          <div id="home-dropzone" class="home-dropzone"><div class="home-download-icon">↓</div><h3>Arrastrá una imagen o <span>seleccioná un archivo</span></h3><p>También podés examinar tu dispositivo</p><button id="home-browse" class="home-secondary">▱ &nbsp; Examinar archivos</button><div class="home-filetypes"><span>.nvtsphoto</span><span>.png</span><span>.jpg</span><span>.webp</span><span>.gif</span></div><input id="home-file-input" type="file" accept="image/*,.nvtsphoto" hidden /></div>
        </section>
        <section data-home-view="recent" class="home-view" hidden><div class="home-section-head"><h2>Proyectos recientes</h2><span>Seguí donde lo dejaste</span></div><div id="home-recents" class="home-recent-grid"></div></section>
        <p id="home-status" class="home-status" role="status"></p>
      </section>
    </div>
  </main>
</div>`;
