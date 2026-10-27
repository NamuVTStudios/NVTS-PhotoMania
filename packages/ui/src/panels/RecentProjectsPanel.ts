import {
  listRecentProjects,
  loadRecentProject,
  removeRecentProject,
  type RecentProjectInfo,
} from '@nvts/storage';
import { readPreferences } from './PreferencesPanel';
import { Panel } from './Panel';
import { uiIcon } from '../components/ShellTemplates';

type LaunchProject = (name: string, width: number, height: number, file?: File) => Promise<void>;
type RecentContextMenu = { container: HTMLDivElement; removeButton: HTMLButtonElement };

/** Owns recent-project storage, rendering, and the list's contextual actions. */
export class RecentProjectsPanel extends Panel {
  private items: RecentProjectInfo[] = [];
  private removeItemId: string | null = null;
  private contextMenu: RecentContextMenu;

  constructor(
    root: HTMLElement,
    private readonly launchProject: LaunchProject,
    private readonly reportError: (error: unknown) => void,
    private readonly openPreferences: () => void,
  ) {
    super(root, 'section[data-home-view="recent"]');
    this.contextMenu = this.createContextMenu();
  }

  mount(): void {
    this.root.append(this.contextMenu.container);
    this.bindContextMenu();
  }

  async refresh(): Promise<void> {
    if (!readPreferences().rememberRecentProjects) {
      this.items = [];
      this.render();
      return;
    }
    await this.loadProjects();
    this.render();
  }

  show(): void {
    super.show();
    this.render();
  }

  private createContextMenu(): RecentContextMenu {
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

  private bindContextMenu(): void {
    this.contextMenu.removeButton.onclick = () => { void this.removeSelectedProject(); };
    this.root.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Node && !this.contextMenu.container.contains(event.target)) this.closeContextMenu();
    });
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeContextMenu();
    });
  }

  private closeContextMenu(): void {
    this.contextMenu.container.hidden = true;
    this.removeItemId = null;
  }

  private async removeSelectedProject(): Promise<void> {
    const id = this.removeItemId;
    this.closeContextMenu();
    if (!id) return;
    try {
      await removeRecentProject(id);
      this.items = this.items.filter((item) => item.id !== id);
      this.render();
    } catch (error) {
      this.reportError(error);
    }
  }

  private async loadProjects(): Promise<void> {
    try { this.items = await listRecentProjects(); }
    catch (error) {
      console.warn('No se pudieron cargar los proyectos recientes:', error);
      this.items = [];
    }
  }

  private render(): void {
    const host = this.root.querySelector<HTMLElement>('#home-recents');
    const count = this.root.querySelector<HTMLElement>('#home-recent-count');
    if (!host || !count) return;
    host.replaceChildren();
    count.textContent = String(this.items.length);
    if (!readPreferences().rememberRecentProjects) {
      this.renderDisabled(host);
      return;
    }
    if (this.items.length === 0) {
      this.renderEmpty(host);
      return;
    }
    this.items.forEach((item) => host.append(this.createCard(item)));
  }

  private renderDisabled(host: HTMLElement): void {
    host.innerHTML = `<div class="home-empty">${uiIcon('recent')}<strong>Proyectos recientes desactivados</strong><p>Podés activarlos desde Preferencias cuando quieras guardar una lista local.</p><button type="button" class="home-secondary" id="enable-recent-preference">${uiIcon('preferences')}<span>Abrir preferencias</span></button></div>`;
    host.querySelector<HTMLButtonElement>('#enable-recent-preference')!.onclick = this.openPreferences;
  }

  private renderEmpty(host: HTMLElement): void {
    host.innerHTML = `<div class="home-empty">${uiIcon('recent')}<strong>Todavía no hay proyectos recientes</strong><p>Los proyectos guardados en este navegador aparecerán acá.</p></div>`;
  }

  private createCard(item: RecentProjectInfo): HTMLButtonElement {
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
    button.oncontextmenu = (event) => this.openContextMenu(event, item.id);
    button.onclick = () => { void this.openProject(item, button); };
    return button;
  }

  private openContextMenu(event: MouseEvent, id: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.removeItemId = id;
    const { container, removeButton } = this.contextMenu;
    container.hidden = false;
    container.style.left = `${Math.max(8, Math.min(event.clientX, window.innerWidth - 218))}px`;
    container.style.top = `${Math.max(8, Math.min(event.clientY, window.innerHeight - 56))}px`;
    removeButton.focus();
  }

  private async openProject(item: RecentProjectInfo, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      await this.openProjectFile(item);
    } catch (error) {
      this.reportError(error);
    } finally {
      button.disabled = false;
    }
  }

  private async openProjectFile(item: RecentProjectInfo): Promise<void> {
    const bytes = await loadRecentProject(item.id);
    if (!bytes) throw new Error('No se encontró la copia local de este proyecto.');
    const fileBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const file = new File([fileBytes], `${item.name || 'Proyecto'}.nvtsphoto`, { type: 'application/x-nvtsphoto' });
    await this.launchProject(item.name, item.width, item.height, file);
  }
}
