// Panel template. Event behavior lives in its panel renderer/controller.

export const COMIC_MANAGER_PANEL_TEMPLATE = `
    <section id="comic-manager-panel" class="dock-panel comic-manager-panel" hidden aria-label="Gestor de cómics">
      <header><strong>▤ Gestor de cómics</strong><div class="panel-spacer"></div><span id="comic-config-status" class="comic-status" role="status">Configuración local</span></header>
      <div class="comic-manager-content">
        <section class="comic-project-setup" aria-label="Estructura del proyecto de cómic">
          <div class="comic-project-section-title"><strong>Proyecto y carpetas</strong><span>comicConfig.json</span></div>
          <label class="comic-field">Nombre del proyecto<input id="comic-project-name" type="text" maxlength="160" value="Mi cómic" /></label>
          <label class="comic-field">Ruta del proyecto<input id="comic-project-location" type="text" readonly value="Elegí una carpeta base para crear el proyecto" /></label>
          <div class="comic-project-actions">
            <button id="comic-select-location" type="button">Elegir carpeta base…</button>
            <button id="comic-link-project" type="button">Vincular proyecto existente…</button>
          </div>
          <div class="comic-field-grid comic-folder-grid">
            <label class="comic-field">Directorio de páginas<input id="comic-pages-dir-name" type="text" value="páginas" readonly /></label>
            <label class="comic-field">Directorio de exportación<input id="comic-export-dir-name" type="text" value="exportación" readonly /></label>
          </div>
          <button id="comic-create-project" class="primary comic-create-project" type="button">Crear estructura del proyecto</button>
          <button id="comic-export-project" type="button">Exportar copia del proyecto</button>
          <p class="comic-note">En la carpeta del proyecto se guardará <code>comicConfig.json</code>, junto con <code>páginas/</code> y <code>exportación/</code>. El navegador puede ocultar la ruta absoluta por privacidad.</p>
        </section>
        <label class="comic-field">Título de la serie<input id="comic-title" type="text" maxlength="160" value="Mi cómic" /></label>
        <label class="comic-field">Autor/a<input id="comic-author" type="text" maxlength="160" value="" /></label>
        <div class="comic-field-grid">
          <label class="comic-field">Formato de página<select id="comic-preset"><option value="custom">Personalizado</option><option value="us">Cómic USA</option><option value="european">Cómic europeo / A4</option><option value="manga">Manga</option><option value="manhwa">Manhwa / Webtoon</option></select></label>
          <label class="comic-field">Lectura<select id="comic-direction"><option value="ltr">Izquierda a derecha</option><option value="rtl">Derecha a izquierda</option></select></label>
          <label class="comic-field">Ancho (px)<input id="comic-page-width" type="number" min="1" max="8192" value="1650" /></label>
          <label class="comic-field">Alto (px)<input id="comic-page-height" type="number" min="1" max="8192" value="2550" /></label>
          <label class="comic-field">Resolución (DPI)<input id="comic-dpi" type="number" min="72" max="1200" value="300" /></label>
          <label class="comic-field">Sangrado (mm)<input id="comic-bleed" type="number" min="0" max="100" step="0.5" value="3" /></label>
          <label class="comic-field">Margen seguro (mm)<input id="comic-margin" type="number" min="0" max="500" step="0.5" value="15" /></label>
          <label class="comic-field">Canaleta (mm)<input id="comic-gutter" type="number" min="0" max="500" step="0.5" value="5" /></label>
        </div>
        <label class="comic-check"><input id="comic-facing-pages" type="checkbox" checked /> <span>Usar páginas enfrentadas (portada separada)</span></label>
        <div class="comic-pages-heading"><strong>Páginas</strong><span id="comic-page-count">0 páginas</span></div>
        <div id="comic-pages-list" class="comic-pages-list"></div>
        <div class="comic-page-actions">
          <button id="comic-add-page" type="button" title="Añadir página">＋ Página</button>
          <button id="comic-duplicate-page" type="button" title="Duplicar página" disabled>Duplicar</button>
          <button id="comic-page-up" type="button" title="Mover página arriba" disabled>↑</button>
          <button id="comic-page-down" type="button" title="Mover página abajo" disabled>↓</button>
          <button id="comic-delete-page" type="button" title="Eliminar página" disabled>−</button>
        </div>
        <button id="comic-create-canvas" class="primary comic-create-canvas" type="button" disabled>Crear lienzo de la página seleccionada</button>
        <button id="comic-page-open-file" type="button" disabled>Abrir archivo .nvtsphoto para esta página…</button>
        <input id="comic-page-open-input" type="file" accept=".nvtsphoto,application/x-nvtsphoto" hidden />
        <p class="comic-note">Cada página se trabaja como documento independiente <code>.nvtsphoto</code> y se guarda en el directorio <code>páginas/</code> si el proyecto está configurado. La configuración del tomo vive en <code>comicConfig.json</code>.</p>
      </div>
      <footer class="comic-manager-footer"><button id="comic-config-import" type="button">Importar comicConfig.json…</button><button id="comic-config-export" class="primary" type="button">Guardar comicConfig.json</button><input id="comic-config-file" type="file" accept=".json,application/json" hidden /></footer>
    </section>
`;

export interface ComicPageEntry {
  id: string;
  number: number;
  name: string;
  fileName: string;
  width: number;
  height: number;
  notes: string;
}

export interface ComicConfig {
  format: 'nvts-comic-config';
  version: 1;
  projectName: string;
  projectDirectoryName: string;
  projectLocation: string;
  pagesDirectoryName: string;
  exportDirectoryName: string;
  title: string;
  author: string;
  readingDirection: 'ltr' | 'rtl';
  pageWidth: number;
  pageHeight: number;
  dpi: number;
  bleedMm: number;
  marginMm: number;
  gutterMm: number;
  facingPages: boolean;
  pages: ComicPageEntry[];
  updatedAt: number;
}

export interface ComicManagerPanelCallbacks {
  onSelectPage(pageId: string): void;
  onRenamePage(page: ComicPageEntry, nextName: string): void;
}

function setComicFieldValue(root: HTMLElement, id: string, value: string): void {
  const input = root.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  if (input) input.value = value;
}

function renderComicSettings(root: HTMLElement, config: ComicConfig, projectLocationDisplay: string): void {
  const values: Array<[string, string]> = [
    ['comic-project-name', config.projectName],
    ['comic-project-location', projectLocationDisplay],
    ['comic-pages-dir-name', config.pagesDirectoryName || 'páginas'],
    ['comic-export-dir-name', config.exportDirectoryName || 'exportación'],
    ['comic-title', config.title],
    ['comic-author', config.author],
    ['comic-direction', config.readingDirection],
    ['comic-page-width', String(config.pageWidth)],
    ['comic-page-height', String(config.pageHeight)],
    ['comic-dpi', String(config.dpi)],
    ['comic-bleed', String(config.bleedMm)],
    ['comic-margin', String(config.marginMm)],
    ['comic-gutter', String(config.gutterMm)],
  ];
  values.forEach(([id, value]) => setComicFieldValue(root, id, value));
  const facing = root.querySelector<HTMLInputElement>('#comic-facing-pages');
  if (facing) facing.checked = config.facingPages;
}

function createComicPageSelect(page: ComicPageEntry, activePageId: string | null, callbacks: ComicManagerPanelCallbacks): HTMLButtonElement {
  const select = document.createElement('button');
  select.type = 'button';
  select.className = 'comic-page-select';
  select.setAttribute('aria-pressed', String(page.id === activePageId));
  const thumbnail = document.createElement('span');
  thumbnail.className = 'comic-page-thumb';
  thumbnail.textContent = String(page.number).padStart(2, '0');
  const detail = document.createElement('span');
  detail.className = 'comic-page-detail';
  const name = document.createElement('strong');
  name.textContent = page.name;
  const meta = document.createElement('small');
  meta.textContent = `${page.width} × ${page.height} px · ${page.fileName}`;
  detail.append(name, meta);
  select.append(thumbnail, detail);
  select.onclick = () => callbacks.onSelectPage(page.id);
  return select;
}

function createComicPageRenameButton(page: ComicPageEntry, callbacks: ComicManagerPanelCallbacks): HTMLButtonElement {
  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'comic-page-rename';
  edit.title = 'Renombrar página';
  edit.setAttribute('aria-label', `Renombrar ${page.name}`);
  edit.textContent = '✎';
  edit.onclick = () => {
    const value = prompt('Nombre de la página', page.name);
    if (value === null) return;
    const nextName = value.trim();
    if (!nextName) {
      alert('El nombre de la página no puede estar vacío.');
      return;
    }
    callbacks.onRenamePage(page, nextName.slice(0, 160));
  };
  return edit;
}

function createComicPageRow(
  page: ComicPageEntry,
  index: number,
  activePageId: string | null,
  callbacks: ComicManagerPanelCallbacks,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'comic-page-row' + (page.id === activePageId ? ' selected' : '');
  row.append(createComicPageSelect(page, activePageId, callbacks), createComicPageRenameButton(page, callbacks));
  row.dataset.index = String(index);
  return row;
}

function renderComicPages(
  root: HTMLElement,
  config: ComicConfig,
  activePageId: string | null,
  callbacks: ComicManagerPanelCallbacks,
): void {
  const list = root.querySelector<HTMLElement>('#comic-pages-list');
  if (!list) return;
  list.replaceChildren(...config.pages.map((page, index) => createComicPageRow(page, index, activePageId, callbacks)));
}

function setComicButtonDisabled(root: HTMLElement, id: string, disabled: boolean): void {
  const button = root.querySelector<HTMLButtonElement>(`#${id}`);
  if (button) button.disabled = disabled;
}

function updateComicPageControls(root: HTMLElement, config: ComicConfig, activePageId: string | null): void {
  const selectedIndex = config.pages.findIndex((page) => page.id === activePageId);
  const hasSelection = selectedIndex >= 0;
  const count = root.querySelector<HTMLElement>('#comic-page-count');
  if (count) count.textContent = `${config.pages.length} ${config.pages.length === 1 ? 'página' : 'páginas'}`;
  ['comic-duplicate-page', 'comic-page-up', 'comic-page-down', 'comic-delete-page', 'comic-create-canvas', 'comic-page-open-file']
    .forEach((id) => setComicButtonDisabled(root, id, !hasSelection));
  setComicButtonDisabled(root, 'comic-page-up', !hasSelection || selectedIndex <= 0);
  setComicButtonDisabled(root, 'comic-page-down', !hasSelection || selectedIndex >= config.pages.length - 1);
}

function updateComicPreset(root: HTMLElement, config: ComicConfig): void {
  const preset = root.querySelector<HTMLSelectElement>('#comic-preset');
  if (!preset) return;
  const matches: Array<[string, number, number, 'ltr' | 'rtl' | undefined]> = [
    ['us', 1650, 2550, 'ltr'],
    ['european', 2100, 2970, 'ltr'],
    ['manga', 1650, 2400, 'rtl'],
    ['manhwa', 1600, 2560, 'ltr'],
  ];
  preset.value = matches.find((entry) => entry[1] === config.pageWidth
    && entry[2] === config.pageHeight
    && (!entry[3] || entry[3] === config.readingDirection))?.[0] ?? 'custom';
}

/** Renders comic settings and pages by delegating each UI task to a focused helper. */
export function renderComicManagerPanel(
  root: HTMLElement,
  config: ComicConfig,
  activePageId: string | null,
  projectLocationDisplay: string,
  callbacks: ComicManagerPanelCallbacks,
): void {
  renderComicSettings(root, config, projectLocationDisplay);
  renderComicPages(root, config, activePageId, callbacks);
  updateComicPageControls(root, config, activePageId);
  updateComicPreset(root, config);
}
