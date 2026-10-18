import type { BlendMode, LayerType } from '@nvts/shared';

// Panel template and markup. Behavior is wired by the application controller.

export const PLUGINS_PANEL_TEMPLATE = `<section id="plugins-overlay" class="preferences-overlay" hidden><div class="preferences-dialog plugins-dialog" role="dialog" aria-modal="true" aria-labelledby="plugins-title"><header><div><strong id="plugins-title">Plugins de NVTS PhotoMania</strong><p>Extensiones instaladas en este navegador.</p></div><button type="button" id="plugins-close" class="preferences-close" aria-label="Cerrar plugins">×</button></header><div class="preferences-content"><p class="plugins-warning">Instalá únicamente plugins de autores en los que confíes. Los módulos JavaScript se ejecutan con los permisos de la aplicación. Los plugins de esta primera versión deben ser módulos autocontenidos, sin imports relativos.</p><div id="plugins-installed-list" class="plugins-installed-list"></div><p id="plugins-status" class="preferences-note" role="status">La API inicial permite añadir acciones al menú, consultar el documento y administrar capas.</p><details><summary>API para desarrolladores</summary><pre><code>export const name = 'Mi plugin';
export function activate(api) {
  api.registerMenuAction('Saludar', () => api.notify('Hola desde el plugin'));
}</code></pre><p class="preferences-note">Referencia completa: sección “Plugins” del README en la raíz del repositorio.</p></details></div><footer><button type="button" id="plugins-install" class="primary">Instalar plugin (.js)…</button><button type="button" id="plugins-close-footer">Cerrar</button><input id="plugins-file-input" type="file" accept=".js,.mjs,text/javascript" hidden /></footer></div></section>`;


export interface PluginApi {
  appName: string;
  version: string;
  registerMenuAction: (label: string, callback: () => void) => void;
  notify: (message: string) => void;
  getDocumentInfo: () => { name: string; width: number; height: number; activeLayerId: string | null } | null;
  getLayers: () => Array<{ id: string; name: string; type: LayerType; visible: boolean; locked: boolean; opacity: number }>;
  createLayer: (type: Exclude<LayerType, 'file' | 'raster'>, name?: string) => { id: string; name: string; type: LayerType } | null;
  renameLayer: (id: string, name: string) => boolean;
  setLayerProperties: (id: string, properties: { visible?: boolean; locked?: boolean; opacity?: number; blendMode?: BlendMode }) => boolean;
}
interface StoredPlugin { id: string; name: string; fileName: string; source: string; installedAt: number }
const PLUGINS_STORAGE_KEY = 'nvts-photomania-plugins-v1';

function readStoredPlugins(): StoredPlugin[] {
  let value: unknown;
  try { value = JSON.parse(localStorage.getItem(PLUGINS_STORAGE_KEY) ?? '[]') as unknown; }
  catch { return []; }
  return normalizeStoredPlugins(value);
}

function normalizeStoredPlugins(value: unknown): StoredPlugin[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StoredPlugin => !!item && typeof item === 'object'
    && typeof (item as StoredPlugin).id === 'string' && typeof (item as StoredPlugin).name === 'string'
    && typeof (item as StoredPlugin).fileName === 'string' && typeof (item as StoredPlugin).source === 'string');
}

function writeStoredPlugins(plugins: StoredPlugin[]): void {
  localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(plugins));
}

type PluginActivate = (api: PluginApi) => void | (() => void);
type PluginDefaultExport = PluginActivate | { activate?: PluginActivate; name?: string; version?: string };
type PluginModule = { name?: string; version?: string; activate?: unknown; default?: unknown };
type PluginAction = { label: string; callback: () => void };
type PluginModuleShape = { name?: string; version?: string; activate?: PluginActivate; default?: PluginDefaultExport };

/** Small entry point; lifecycle, installation, activation and rendering live in the controller. */
export function wirePlugins(root: HTMLElement, getContext: () => Partial<PluginApi> = () => ({})): void {
  new PluginPanelController(root, getContext).mount();
}

class PluginPanelController {
  private overlay: HTMLElement | null = null;
  private list: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private actionsHost: HTMLElement | null = null;
  private readonly actionGroups = new Map<string, PluginAction[]>();

  constructor(private readonly root: HTMLElement, private readonly getContext: () => Partial<PluginApi>) {}

  mount(): void {
    this.cacheElements();
    if (!this.hasRequiredElements()) return;
    this.bindMenuActions();
    this.bindDialogActions();
    this.bindInstallActions();
    void this.activateStoredPlugins();
  }

  private cacheElements(): void {
    this.overlay = this.root.querySelector<HTMLElement>('#plugins-overlay');
    this.list = this.root.querySelector<HTMLElement>('#plugins-installed-list');
    this.status = this.root.querySelector<HTMLElement>('#plugins-status');
    this.fileInput = this.root.querySelector<HTMLInputElement>('#plugins-file-input');
    this.actionsHost = this.root.querySelector<HTMLElement>('#plugin-actions');
  }

  private hasRequiredElements(): boolean {
    return Boolean(this.overlay && this.list && this.status && this.fileInput && this.actionsHost);
  }

  private bindMenuActions(): void {
    this.root.querySelector<HTMLButtonElement>('#menu-plugins')?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.togglePluginMenu();
    });
    this.root.querySelector<HTMLButtonElement>('#plugins-manage')?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.closeViewMenu();
      this.openManager();
    });
  }

  private togglePluginMenu(): void {
    const dropdown = this.root.querySelector<HTMLElement>('#plugins-menu-dropdown');
    if (!dropdown) return;
    const panels = this.root.querySelector<HTMLElement>('#panels-menu-dropdown');
    if (panels) panels.hidden = true;
    dropdown.hidden = !dropdown.hidden;
    this.root.querySelector<HTMLButtonElement>('#menu-plugins')?.setAttribute('aria-expanded', String(!dropdown.hidden));
  }

  private closeViewMenu(): void {
    const dropdown = this.root.querySelector<HTMLElement>('#view-menu-dropdown');
    if (dropdown) dropdown.hidden = true;
    this.root.querySelector<HTMLButtonElement>('#menu-view')?.setAttribute('aria-expanded', 'false');
  }

  private bindDialogActions(): void {
    this.root.querySelector<HTMLButtonElement>('#plugins-close')?.addEventListener('click', () => this.closeManager());
    this.root.querySelector<HTMLButtonElement>('#plugins-close-footer')?.addEventListener('click', () => this.closeManager());
    this.overlay?.addEventListener('click', (event) => {
      if (event.target === this.overlay) this.closeManager();
    });
    this.overlay?.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.closeManager();
    });
  }

  private bindInstallActions(): void {
    const startInstall = () => {
      if (!this.fileInput) return;
      this.fileInput.value = '';
      this.fileInput.click();
    };
    this.root.querySelector<HTMLButtonElement>('#plugins-install')?.addEventListener('click', startInstall);
    this.root.querySelector<HTMLButtonElement>('#plugins-install-menu')?.addEventListener('click', startInstall);
    this.fileInput?.addEventListener('change', () => this.handleInstallSelection());
  }

  private openManager(): void {
    this.renderPluginList();
    if (this.overlay) this.overlay.hidden = false;
    this.root.querySelector<HTMLButtonElement>('#plugins-close')?.focus();
  }

  private closeManager(): void {
    if (this.overlay) this.overlay.hidden = true;
  }

  private async activateStoredPlugins(): Promise<void> {
    if (!this.actionsHost) return;
    this.actionsHost.replaceChildren();
    this.actionGroups.clear();
    for (const plugin of readStoredPlugins()) {
      await this.activateStoredPlugin(plugin);
    }
    this.renderPluginList();
    this.renderPluginActions(readStoredPlugins());
  }

  private async activateStoredPlugin(plugin: StoredPlugin): Promise<void> {
    try {
      const module = await this.importPluginSource(plugin.source);
      const activate = this.getPluginActivator(module);
      const actions: PluginAction[] = [];
      this.actionGroups.set(plugin.id, actions);
      await activate(this.createPluginApi(plugin, actions));
      this.setStatus(`Plugin cargado: ${plugin.name}`);
    } catch (error) {
      this.setStatus(`No se pudo cargar ${plugin.fileName}: ${this.errorMessage(error)}`);
    }
  }

  private createPluginApi(plugin: StoredPlugin, actions: PluginAction[]): PluginApi {
    const context = this.getContext();
    return {
      appName: 'NVTS-PhotoMania',
      version: '0.1.0',
      registerMenuAction: (label, callback) => this.registerPluginAction(plugin, actions, label, callback),
      notify: (message) => this.setStatus(String(message).slice(0, 500)),
      getDocumentInfo: context.getDocumentInfo ?? (() => null),
      getLayers: context.getLayers ?? (() => []),
      createLayer: context.createLayer ?? (() => null),
      renameLayer: context.renameLayer ?? (() => false),
      setLayerProperties: context.setLayerProperties ?? (() => false),
    };
  }

  private registerPluginAction(plugin: StoredPlugin, actions: PluginAction[], label: string, callback: () => void): void {
    if (typeof callback !== 'function' || !label.trim()) return;
    actions.push({ label: label.trim().slice(0, 72), callback });
    this.renderPluginActions(readStoredPlugins());
  }

  private renderPluginActions(plugins: StoredPlugin[]): void {
    if (!this.actionsHost) return;
    this.actionsHost.replaceChildren();
    for (const plugin of plugins) this.appendPluginActionGroup(plugin);
    if (this.actionsHost.childElementCount) return;
    const empty = document.createElement('div');
    empty.className = 'plugin-menu-empty';
    empty.textContent = 'No hay acciones de plugins';
    this.actionsHost.append(empty);
  }

  private appendPluginActionGroup(plugin: StoredPlugin): void {
    const actions = this.actionGroups.get(plugin.id) ?? [];
    if (!actions.length || !this.actionsHost) return;
    this.actionsHost.append(this.createPluginActionGroup(plugin, actions));
  }

  private createPluginActionGroup(plugin: StoredPlugin, actions: PluginAction[]): HTMLDivElement {
    const section = document.createElement('div');
    section.className = 'plugin-action-group';
    const title = document.createElement('div');
    title.className = 'plugin-action-title';
    title.textContent = plugin.name;
    section.append(title);
    actions.forEach((action) => section.append(this.createPluginActionButton(action)));
    return section;
  }

  private createPluginActionButton(action: PluginAction): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu-item plugin-action-item';
    button.setAttribute('role', 'menuitem');
    button.textContent = action.label;
    button.addEventListener('click', () => {
      try {
        action.callback();
      } catch (error) {
        this.setStatus(this.errorMessage(error));
      }
    });
    return button;
  }

  private renderPluginList(): void {
    if (!this.list) return;
    this.list.replaceChildren();
    const plugins = readStoredPlugins();
    if (!plugins.length) {
      const empty = document.createElement('p');
      empty.className = 'plugins-empty';
      empty.textContent = 'No hay plugins instalados en este navegador.';
      this.list.append(empty);
      return;
    }
    plugins.forEach((plugin) => this.list?.append(this.createInstalledPluginRow(plugin)));
  }

  private createInstalledPluginRow(plugin: StoredPlugin): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'plugin-installed-row';
    const details = document.createElement('div');
    details.className = 'plugin-installed-info';
    const name = document.createElement('strong');
    name.textContent = plugin.name;
    const meta = document.createElement('small');
    meta.textContent = `${plugin.fileName} · instalado ${new Date(plugin.installedAt).toLocaleDateString()}`;
    details.append(name, meta);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Quitar';
    remove.className = 'danger-button';
    remove.addEventListener('click', () => this.removePlugin(plugin));
    row.append(details, remove);
    return row;
  }

  private removePlugin(plugin: StoredPlugin): void {
    if (!confirm(`¿Quitar el plugin «${plugin.name}» de PhotoMania?`)) return;
    try {
      writeStoredPlugins(readStoredPlugins().filter((entry) => entry.id !== plugin.id));
      void this.activateStoredPlugins();
    } catch (error) {
      this.setStatus(this.errorMessage(error));
    }
  }

  private handleInstallSelection(): void {
    const file = this.fileInput?.files?.[0];
    if (!file) return;
    if (file.size > 300_000) {
      this.setStatus('El plugin supera 300 KB. Esta primera versión limita el tamaño del archivo.');
      return;
    }
    const trusted = confirm(`Vas a ejecutar código JavaScript de «${file.name}». Solo instalá plugins de fuentes confiables. ¿Continuar?`);
    if (!trusted) return;
    void this.installPluginFile(file);
  }

  private async installPluginFile(file: File): Promise<void> {
    try {
      const source = await file.text();
      const module = await this.importPluginSource(source);
      this.getPluginActivator(module);
      const plugins = readStoredPlugins();
      this.checkPluginStorageLimit(plugins, source);
      const plugin = this.createStoredPlugin(file, source, module);
      writeStoredPlugins([...plugins, plugin]);
      this.setStatus(`Plugin instalado: ${plugin.name}`);
      await this.activateStoredPlugins();
    } catch (error) {
      this.setStatus(this.errorMessage(error));
    }
  }

  private checkPluginStorageLimit(plugins: StoredPlugin[], source: string): void {
    const totalSize = plugins.reduce((sum, plugin) => sum + plugin.source.length, 0) + source.length;
    if (totalSize > 1_000_000) throw new Error('El espacio de almacenamiento para plugins llegó a 1 MB. Quitá plugins que no uses.');
  }

  private createStoredPlugin(file: File, source: string, module: PluginModule): StoredPlugin {
    const defaultObject = this.getDefaultObject(module);
    const defaultName = file.name.replace(/\.(m?js)$/i, '');
    return {
      id: crypto.randomUUID(),
      name: String(module.name ?? defaultObject?.name ?? defaultName).slice(0, 80),
      fileName: file.name,
      source,
      installedAt: Date.now(),
    };
  }

  private async importPluginSource(source: string): Promise<PluginModule> {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      return await import(/* @vite-ignore */ url) as PluginModule;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private getPluginActivator(module: PluginModule): PluginActivate {
    const typedModule = module as PluginModuleShape;
    const defaultExport = typedModule.default;
    const defaultObject = typeof defaultExport === 'object' && defaultExport ? defaultExport : undefined;
    const activate = typedModule.activate ?? (typeof defaultExport === 'function' ? defaultExport : defaultObject?.activate);
    if (typeof activate !== 'function') {
      throw new Error('El módulo debe exportar activate(api) o una función por defecto.');
    }
    return activate;
  }

  private getDefaultObject(module: PluginModule): { name?: string; version?: string; activate?: PluginActivate } | undefined {
    const value = module.default;
    return typeof value === 'object' && value ? value as { name?: string; version?: string; activate?: PluginActivate } : undefined;
  }

  private setStatus(message: string): void {
    if (this.status) this.status.textContent = message;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
