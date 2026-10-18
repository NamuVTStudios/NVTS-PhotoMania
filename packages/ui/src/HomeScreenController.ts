import { listRecentProjects, loadRecentProject, removeRecentProject, type RecentProjectInfo } from '@nvts/storage';
import { TEMPLATES } from '@nvts/templates';
import { PREFERENCES_PANEL_TEMPLATE, readPreferences, wirePreferences } from './panels/PreferencesPanel';
import { PLUGINS_PANEL_TEMPLATE, wirePlugins } from './panels/PluginsPanel';
import { HOME_TEMPLATE } from './ShellTemplates';
import { WORKSPACES, type WorkspaceId } from './workspaces';
import { readWorkspace, writeWorkspace } from './workspaces/persistence';

type HomeSection = 'new' | 'open' | 'recent';
type LaunchProject = (name: string, width: number, height: number, file?: File) => Promise<void>;
type HomeMenu = { button: HTMLButtonElement; dropdown: HTMLElement };
type RecentContextMenuState = { container: HTMLDivElement; removeButton: HTMLButtonElement };

/** Owns the welcome screen, template picker, recent projects and file selection. */
export class HomeScreenController {
  private selectedTemplate = TEMPLATES.find((template) => template.id === 'full-hd')!;
  private width = this.selectedTemplate.width;
  private height = this.selectedTemplate.height;
  private recentItems: RecentProjectInfo[] = [];
  private removeRecentId: string | null = null;
  private openPreferences: () => void = () => {};
  private homeStatus!: HTMLElement;
  private templateGallery!: HTMLElement;
  private categorySelect!: HTMLSelectElement;
  private sectionTitle!: HTMLElement;
  private recentContextMenu!: RecentContextMenuState;

  constructor(private readonly root: HTMLElement, private readonly launchProject: LaunchProject) {}

  mount(): void {
    this.renderShell();
    this.cacheElements();
    this.bindCorePanels();
    this.bindHomeControls();
    this.initializeHomeView();
  }

  private renderShell(): void {
    this.root.innerHTML = HOME_TEMPLATE;
    this.root.insertAdjacentHTML('beforeend', PREFERENCES_PANEL_TEMPLATE);
    this.root.insertAdjacentHTML('beforeend', PLUGINS_PANEL_TEMPLATE);
  }

  private cacheElements(): void {
    this.homeStatus = this.q<HTMLElement>('#home-status');
    this.templateGallery = this.q<HTMLElement>('#home-template-grid');
    this.categorySelect = this.q<HTMLSelectElement>('#home-category');
    this.sectionTitle = this.q<HTMLElement>('#home-section-title');
    this.recentContextMenu = this.createRecentContextMenu();
  }

  private bindCorePanels(): void {
    this.openPreferences = wirePreferences(this.root, async () => this.refreshRecent());
    wirePlugins(this.root);
    this.installRecentContextMenu();
  }

  private bindHomeControls(): void {
    this.bindHomeNavigation();
    this.bindHomeMenus();
    this.bindWorkspaceSelector();
    this.bindHomeToolbar();
    this.bindTemplateGallery();
    this.bindDimensionControls();
    this.bindProjectCreation();
    this.bindFileSelection();
    this.bindDropzone();
  }

  private initializeHomeView(): void {
    this.renderTemplates();
    void this.refreshRecent();
    this.showSection('new');
  }

  private createRecentContextMenu(): RecentContextMenuState {
    const container = document.createElement('div');
    container.className = 'recent-context-menu';
    container.hidden = true;
    container.setAttribute('role', 'menu');
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.textContent = 'Eliminar de recientes';
    removeButton.setAttribute('role', 'menuitem');
    container.append(removeButton);
    return { container, removeButton };
  }

  private installRecentContextMenu(): void {
    this.root.append(this.recentContextMenu.container);
    this.recentContextMenu.removeButton.onclick = () => { void this.removeSelectedRecentProject(); };
    this.root.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Node && !this.recentContextMenu.container.contains(event.target)) {
        this.closeRecentContextMenu();
      }
    });
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeRecentContextMenu();
    });
  }

  private closeRecentContextMenu(): void {
    this.recentContextMenu.container.hidden = true;
    this.removeRecentId = null;
  }

  private async removeSelectedRecentProject(): Promise<void> {
    const id = this.removeRecentId;
    this.closeRecentContextMenu();
    if (!id) return;
    try {
      await removeRecentProject(id);
      this.recentItems = this.recentItems.filter((item) => item.id !== id);
      this.renderRecent();
    } catch (error) {
      this.setHomeError(error);
    }
  }

  private async refreshRecent(): Promise<void> {
    if (!readPreferences().rememberRecentProjects) {
      this.recentItems = [];
      this.renderRecent();
      return;
    }
    await this.loadRecentProjects();
    this.renderRecent();
  }

  private async loadRecentProjects(): Promise<void> {
    try {
      this.recentItems = await listRecentProjects();
    } catch (error) {
      console.warn('No se pudieron cargar los proyectos recientes:', error);
      this.recentItems = [];
    }
  }

  private renderRecent(): void {
    const host = this.q<HTMLElement>('#home-recents');
    host.replaceChildren();
    this.q<HTMLElement>('#home-recent-count').textContent = String(this.recentItems.length);
    if (!readPreferences().rememberRecentProjects) {
      this.renderRecentDisabled(host);
      return;
    }
    if (!this.recentItems.length) {
      this.renderRecentEmpty(host);
      return;
    }
    this.recentItems.forEach((item) => host.append(this.createRecentCard(item)));
  }

  private renderRecentDisabled(host: HTMLElement): void {
    host.innerHTML = '<div class="home-empty"><span>◷</span><strong>Proyectos recientes desactivados</strong><p>Podés activarlos desde Preferencias cuando quieras guardar una lista local.</p><button type="button" class="home-secondary" id="enable-recent-preference">Abrir preferencias</button></div>';
    host.querySelector<HTMLButtonElement>('#enable-recent-preference')!.onclick = () => this.openPreferences();
  }

  private renderRecentEmpty(host: HTMLElement): void {
    host.innerHTML = '<div class="home-empty"><span>◷</span><strong>Todavía no hay proyectos recientes</strong><p>Los proyectos guardados en este navegador aparecerán acá.</p></div>';
  }

  private createRecentCard(item: RecentProjectInfo): HTMLButtonElement {
    const button = document.createElement('button');
    button.className = 'recent-card';
    button.type = 'button';
    const preview = document.createElement('span');
    preview.className = 'recent-preview';
    const paper = document.createElement('span');
    paper.className = 'recent-paper';
    paper.style.aspectRatio = `${item.width} / ${item.height}`;
    preview.append(paper);
    const label = document.createElement('strong');
    label.textContent = item.name;
    const meta = document.createElement('small');
    meta.textContent = `${item.width} × ${item.height} px · ${new Date(item.updatedAt).toLocaleDateString()}`;
    button.append(preview, label, meta);
    button.oncontextmenu = (event) => this.openRecentContextMenu(event, item.id);
    button.onclick = () => { void this.openRecentProject(item, button); };
    return button;
  }

  private openRecentContextMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.removeRecentId = id;
    const { container, removeButton } = this.recentContextMenu;
    container.hidden = false;
    const menuWidth = 210;
    const menuHeight = 48;
    container.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8))}px`;
    container.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))}px`;
    removeButton.focus();
  }

  private async openRecentProject(item: RecentProjectInfo, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      await this.openRecentProjectFile(item);
    } catch (error) {
      this.setHomeError(error);
    } finally {
      button.disabled = false;
    }
  }

  private async openRecentProjectFile(item: RecentProjectInfo): Promise<void> {
    const bytes = await loadRecentProject(item.id);
    const file = this.createRecentProjectFile(item, bytes);
    await this.launchProject(item.name, item.width, item.height, file);
  }

  private createRecentProjectFile(item: RecentProjectInfo, bytes: Uint8Array | null): File {
    if (!bytes) throw new Error('No se encontró la copia local de este proyecto.');
    const fileBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new File([fileBytes], `${item.name || 'Proyecto'}.nvtsphoto`, { type: 'application/x-nvtsphoto' });
  }

  private bindHomeNavigation(): void {
    this.root.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((element) => {
      element.addEventListener('click', () => this.showSection(element.dataset.homeNav as HomeSection));
    });
    this.q<HTMLElement>('.home-back').addEventListener('click', () => this.showSection('new'));
    this.root.querySelectorAll<HTMLElement>('[data-home-open]').forEach((element) => {
      element.addEventListener('click', () => this.showSection('open'));
    });
  }

  private showSection(section: HomeSection): void {
    this.root.querySelectorAll<HTMLElement>('[data-home-view]').forEach((element) => {
      element.hidden = element.dataset.homeView !== section;
    });
    this.root.querySelectorAll<HTMLElement>('[data-home-nav]').forEach((element) => {
      element.classList.toggle('active', element.dataset.homeNav === section);
    });
    const labels: Record<HomeSection, string> = {
      new: 'Nuevo proyecto', open: 'Abrir archivo', recent: 'Proyectos recientes',
    };
    this.sectionTitle.textContent = labels[section];
    if (section === 'recent') this.renderRecent();
  }

  private bindHomeMenus(): void {
    const menus = this.getHomeMenus();
    menus.forEach((menu) => this.bindOneHomeMenu(menu, menus));
    document.addEventListener('pointerdown', (event) => this.closeHomeMenusOutsideClick(event, menus));
  }

  private getHomeMenus(): HomeMenu[] {
    return [
      { button: this.q<HTMLButtonElement>('#menu-file'), dropdown: this.q<HTMLElement>('#file-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-edit'), dropdown: this.q<HTMLElement>('#edit-menu-dropdown') },
      { button: this.q<HTMLButtonElement>('#menu-workspace'), dropdown: this.q<HTMLElement>('#workspace-menu-dropdown') },
    ];
  }

  private bindOneHomeMenu(menu: HomeMenu, menus: HomeMenu[]): void {
    menu.button.addEventListener('click', (event) => {
      event.stopPropagation();
      const willOpen = menu.dropdown.hidden;
      menus.forEach((entry) => this.closeHomeMenu(entry));
      menu.dropdown.hidden = !willOpen;
      menu.button.setAttribute('aria-expanded', String(willOpen));
    });
    menu.dropdown.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button[role^="menuitem"]')) this.closeHomeMenu(menu);
    });
    menu.dropdown.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      this.closeHomeMenu(menu);
      menu.button.focus();
    });
  }

  private closeHomeMenusOutsideClick(event: PointerEvent, menus: HomeMenu[]): void {
    if (!(event.target instanceof Node)) return;
    menus.forEach((menu) => {
      if (!menu.dropdown.contains(event.target as Node) && !menu.button.contains(event.target as Node)) {
        this.closeHomeMenu(menu);
      }
    });
  }

  private closeHomeMenu(menu: HomeMenu): void {
    menu.dropdown.hidden = true;
    menu.button.setAttribute('aria-expanded', 'false');
  }

  private bindWorkspaceSelector(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
      button.addEventListener('click', () => this.selectWorkspace(button.dataset.workspace));
    });
    this.refreshHomeWorkspaceMenu();
  }

  private selectWorkspace(value: string | undefined): void {
    const candidate = value as WorkspaceId;
    if (!WORKSPACES.some((workspace) => workspace.id === candidate)) return;
    writeWorkspace(candidate);
    this.refreshHomeWorkspaceMenu();
    const label = WORKSPACES.find((workspace) => workspace.id === candidate)?.label ?? candidate;
    this.homeStatus.textContent = `Espacio de trabajo «${label}» seleccionado. Se aplicará al abrir un documento.`;
  }

  private refreshHomeWorkspaceMenu(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-workspace]').forEach((button) => {
      const active = button.dataset.workspace === readWorkspace();
      button.setAttribute('aria-checked', String(active));
      const check = button.querySelector<HTMLElement>('.menu-check');
      if (check) check.textContent = active ? '✓' : '';
    });
  }

  private bindHomeToolbar(): void {
    this.q<HTMLButtonElement>('#b-new').onclick = () => this.showSection('new');
    this.q<HTMLButtonElement>('#b-open').onclick = () => {
      this.showSection('open');
      this.q<HTMLInputElement>('#home-file-input').click();
    };
    this.q<HTMLButtonElement>('#b-save').disabled = true;
    this.q<HTMLButtonElement>('#b-save-as').disabled = true;
    this.setEditorOnlyMenuActionsUnavailable();
    this.q<HTMLElement>('#home-paste-hint').addEventListener('click', () => {
      this.homeStatus.textContent = 'Podés pegar una imagen con Ctrl+V después de abrir el editor.';
    });
  }

  private setEditorOnlyMenuActionsUnavailable(): void {
    ['#menu-image', '#menu-layer', '#menu-select', '#menu-filter', '#menu-view', '#menu-help'].forEach((selector) => {
      this.q<HTMLButtonElement>(selector).onclick = () => {
        this.homeStatus.textContent = 'Esta opción estará disponible después de crear o abrir un documento.';
      };
    });
  }

  private bindTemplateGallery(): void {
    this.categorySelect.onchange = () => this.renderTemplates();
  }

  private renderTemplates(): void {
    const category = this.categorySelect.value;
    const templates = TEMPLATES.filter((template) => category === 'Todas' || template.category === category);
    this.templateGallery.replaceChildren(...templates.map((template) => this.createTemplateCard(template)));
  }

  private createTemplateCard(template: (typeof TEMPLATES)[number]): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'template-card' + (this.selectedTemplate.id === template.id ? ' selected' : '');
    button.setAttribute('aria-pressed', String(this.selectedTemplate.id === template.id));
    const preview = document.createElement('span');
    preview.className = `template-preview preview-${template.preview}`;
    preview.innerHTML = '<span class="preview-paper"></span>';
    const icon = document.createElement('span');
    icon.className = 'template-icon';
    icon.textContent = template.icon;
    const name = document.createElement('strong');
    name.textContent = template.title;
    const dimensions = document.createElement('small');
    dimensions.textContent = `${template.width} × ${template.height} px`;
    button.append(preview, icon, name, dimensions);
    button.onclick = () => this.selectTemplate(template);
    return button;
  }

  private selectTemplate(template: (typeof TEMPLATES)[number]): void {
    this.selectedTemplate = template;
    this.width = template.width;
    this.height = template.height;
    this.q<HTMLInputElement>('#home-width').value = String(this.width);
    this.q<HTMLInputElement>('#home-height').value = String(this.height);
    this.renderTemplates();
  }

  private bindDimensionControls(): void {
    const lock = this.q<HTMLInputElement>('#home-lock');
    const widthInput = this.q<HTMLInputElement>('#home-width');
    const heightInput = this.q<HTMLInputElement>('#home-height');
    lock.onchange = () => {
      if (!lock.checked) return;
      const ratio = this.width / this.height;
      this.height = Math.max(1, Math.round(Number(widthInput.value) / ratio));
      heightInput.value = String(this.height);
    };
    widthInput.oninput = () => {
      this.width = Number(widthInput.value);
      if (!lock.checked || this.width <= 0 || this.height <= 0) return;
      this.height = Math.round(this.width / (this.selectedTemplate.width / this.selectedTemplate.height));
      heightInput.value = String(this.height);
    };
    heightInput.oninput = () => {
      this.height = Number(heightInput.value);
      if (!lock.checked || this.height <= 0) return;
      this.width = Math.round(this.height * this.selectedTemplate.width / this.selectedTemplate.height);
      widthInput.value = String(this.width);
    };
  }

  private bindProjectCreation(): void {
    this.q<HTMLButtonElement>('#home-create').addEventListener('click', () => {
      const name = this.q<HTMLInputElement>('#home-project-name').value.trim() || 'Sin título';
      void this.launchWithDimensions(name, Number(this.q<HTMLInputElement>('#home-width').value), Number(this.q<HTMLInputElement>('#home-height').value));
    });
  }

  private async launchWithDimensions(name: string, width: number, height: number, file?: File): Promise<void> {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192) {
      this.homeStatus.textContent = 'Usá dimensiones entre 1 y 8192 píxeles.';
      return;
    }
    this.homeStatus.textContent = 'Iniciando PhotoMania…';
    await this.launchProject(name, width, height, file);
  }

  private bindFileSelection(): void {
    const input = this.q<HTMLInputElement>('#home-file-input');
    this.q<HTMLButtonElement>('#home-browse').addEventListener('click', () => input.click());
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void this.launchFile(file, 'No se pudo leer ese archivo como imagen.');
    };
  }

  private bindDropzone(): void {
    const drop = this.q<HTMLElement>('#home-dropzone');
    drop.ondragover = (event) => { event.preventDefault(); drop.classList.add('dragging'); };
    drop.ondragleave = () => drop.classList.remove('dragging');
    drop.ondrop = (event) => {
      event.preventDefault();
      drop.classList.remove('dragging');
      const file = event.dataTransfer?.files[0];
      if (file) void this.launchFile(file, 'Ese archivo no parece ser una imagen compatible. Los proyectos compatibles son .nvtsphoto.');
    };
  }

  private async launchFile(file: File, imageErrorMessage: string): Promise<void> {
    if (/\.nvtsphoto$/i.test(file.name)) {
      const name = file.name.replace(/\.[^.]+$/, '') || 'Proyecto';
      await this.launchWithDimensions(name, 1280, 720, file);
      return;
    }
    try {
      const dimensions = await this.readImageDimensions(file);
      const name = file.name.replace(/\.[^.]+$/, '') || 'Imagen importada';
      await this.launchWithDimensions(name, dimensions.width, dimensions.height, file);
    } catch {
      this.homeStatus.textContent = imageErrorMessage;
    }
  }

  private readImageDimensions(file: File): Promise<{ width: number; height: number }> {
    const url = URL.createObjectURL(file);
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer el archivo como imagen.'));
      };
      image.src = url;
    });
  }

  private setHomeError(error: unknown): void {
    this.homeStatus.textContent = error instanceof Error ? error.message : String(error);
  }

  private q<T extends HTMLElement = HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }
}
