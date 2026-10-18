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
  try {
    const value = JSON.parse(localStorage.getItem(PLUGINS_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is StoredPlugin => !!item && typeof item === 'object'
      && typeof (item as StoredPlugin).id === 'string' && typeof (item as StoredPlugin).name === 'string'
      && typeof (item as StoredPlugin).fileName === 'string' && typeof (item as StoredPlugin).source === 'string');
  } catch { return []; }
}

function writeStoredPlugins(plugins: StoredPlugin[]): void {
  localStorage.setItem(PLUGINS_STORAGE_KEY, JSON.stringify(plugins));
}

/** Cargador inicial de plugins de comunidad. Los módulos instalados son código confiable que el usuario eligió ejecutar. */
export function wirePlugins(root: HTMLElement, getContext: () => Partial<PluginApi> = () => ({})): void {
  const overlay = root.querySelector<HTMLElement>('#plugins-overlay');
  const list = root.querySelector<HTMLElement>('#plugins-installed-list');
  const status = root.querySelector<HTMLElement>('#plugins-status');
  const fileInput = root.querySelector<HTMLInputElement>('#plugins-file-input');
  const actionsHost = root.querySelector<HTMLElement>('#plugin-actions');
  if (!overlay || !list || !status || !fileInput || !actionsHost) return;

  const close = () => { overlay.hidden = true; };
  const open = () => { renderList(); overlay.hidden = false; root.querySelector<HTMLButtonElement>('#plugins-close')?.focus(); };
  root.querySelector<HTMLButtonElement>('#menu-plugins')?.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    const dropdown = root.querySelector<HTMLElement>('#plugins-menu-dropdown')!;
    const panels = root.querySelector<HTMLElement>('#panels-menu-dropdown');
    if (panels) panels.hidden = true;
    dropdown.hidden = !dropdown.hidden;
    root.querySelector<HTMLButtonElement>('#menu-plugins')?.setAttribute('aria-expanded', String(!dropdown.hidden));
  });
  root.querySelector<HTMLButtonElement>('#plugins-manage')?.addEventListener('click', (event) => { event.stopPropagation(); root.querySelector<HTMLElement>('#view-menu-dropdown')!.hidden = true; root.querySelector<HTMLButtonElement>('#menu-view')?.setAttribute('aria-expanded', 'false'); open(); });
  const startInstall = () => { fileInput.value = ''; fileInput.click(); };
  root.querySelector<HTMLButtonElement>('#plugins-install')?.addEventListener('click', startInstall);
  root.querySelector<HTMLButtonElement>('#plugins-install-menu')?.addEventListener('click', startInstall);
  root.querySelector<HTMLButtonElement>('#plugins-close')?.addEventListener('click', close);
  root.querySelector<HTMLButtonElement>('#plugins-close-footer')?.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });

  const actionGroups = new Map<string, Array<{ label: string; callback: () => void }>>();
  const baseApi = (): Partial<PluginApi> => getContext();
  const activateStored = async () => {
    actionsHost.replaceChildren();
    actionGroups.clear();
    for (const plugin of readStoredPlugins()) {
      try {
        const url = URL.createObjectURL(new Blob([plugin.source], { type: 'text/javascript' }));
        let module: { name?: string; version?: string; activate?: (api: PluginApi) => void | (() => void); default?: ((api: PluginApi) => void | (() => void)) | { activate?: (api: PluginApi) => void | (() => void); name?: string; version?: string } };
        try { module = await import(/* @vite-ignore */ url) as typeof module; }
        finally { URL.revokeObjectURL(url); }
        const defaultObject = typeof module.default === 'object' && module.default ? module.default : undefined;
        const activate = module.activate ?? (typeof module.default === 'function' ? module.default : defaultObject?.activate);
        if (typeof activate !== 'function') throw new Error('El módulo no exporta activate(api) ni una función por defecto.');
        const pluginActions: Array<{ label: string; callback: () => void }> = [];
        actionGroups.set(plugin.id, pluginActions);
        const context = baseApi();
        const api: PluginApi = {
          appName: 'NVTS-PhotoMania', version: '0.1.0',
          registerMenuAction: (label, callback) => {
            if (typeof callback !== 'function' || !label.trim()) return;
            pluginActions.push({ label: label.trim().slice(0, 72), callback });
            renderPluginActions(readStoredPlugins());
          },
          notify: (message) => { status.textContent = String(message).slice(0, 500); },
          getDocumentInfo: context.getDocumentInfo ?? (() => null),
          getLayers: context.getLayers ?? (() => []),
          createLayer: context.createLayer ?? (() => null),
          renameLayer: context.renameLayer ?? (() => false),
          setLayerProperties: context.setLayerProperties ?? (() => false),
        };
        await activate(api);
        status.textContent = `Plugin cargado: ${plugin.name}`;
      } catch (error) {
        status.textContent = `No se pudo cargar ${plugin.fileName}: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    renderList();
    renderPluginActions(readStoredPlugins());
  };

  const renderPluginActions = (plugins: StoredPlugin[]) => {
    actionsHost.replaceChildren();
    for (const plugin of plugins) {
      const actions = actionGroups.get(plugin.id) ?? [];
      if (!actions.length) continue;
      const section = document.createElement('div'); section.className = 'plugin-action-group';
      const title = document.createElement('div'); title.className = 'plugin-action-title'; title.textContent = plugin.name; section.append(title);
      actions.forEach((action) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'menu-item plugin-action-item'; button.setAttribute('role', 'menuitem'); button.textContent = action.label;
        button.addEventListener('click', () => { try { action.callback(); } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); } });
        section.append(button);
      });
      actionsHost.append(section);
    }
    if (!actionsHost.childElementCount) {
      const empty = document.createElement('div'); empty.className = 'plugin-menu-empty'; empty.textContent = 'No hay acciones de plugins'; actionsHost.append(empty);
    }
  };

  const renderList = () => {
    list.replaceChildren();
    const plugins = readStoredPlugins();
    if (!plugins.length) {
      const empty = document.createElement('p'); empty.className = 'plugins-empty'; empty.textContent = 'No hay plugins instalados en este navegador.'; list.append(empty); return;
    }
    plugins.forEach((plugin) => {
      const row = document.createElement('div'); row.className = 'plugin-installed-row';
      const details = document.createElement('div'); details.className = 'plugin-installed-info';
      const name = document.createElement('strong'); name.textContent = plugin.name;
      const meta = document.createElement('small'); meta.textContent = `${plugin.fileName} · instalado ${new Date(plugin.installedAt).toLocaleDateString()}`;
      details.append(name, meta);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Quitar'; remove.className = 'danger-button';
      remove.addEventListener('click', () => {
        if (!confirm(`¿Quitar el plugin «${plugin.name}» de PhotoMania?`)) return;
        try { writeStoredPlugins(readStoredPlugins().filter((entry) => entry.id !== plugin.id)); void activateStored(); }
        catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
      });
      row.append(details, remove); list.append(row);
    });
  };

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]; if (!file) return;
    if (file.size > 300_000) { status.textContent = 'El plugin supera 300 KB. Esta primera versión limita el tamaño del archivo.'; return; }
    if (!confirm(`Vas a ejecutar código JavaScript de «${file.name}». Solo instalá plugins de fuentes confiables. ¿Continuar?`)) return;
    void (async () => {
      try {
        const source = await file.text();
        const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        let module: { name?: string; version?: string; activate?: unknown; default?: unknown };
        try { module = await import(/* @vite-ignore */ url) as typeof module; }
        finally { URL.revokeObjectURL(url); }
        const defaultObject = typeof module.default === 'object' && module.default ? module.default as { name?: string; activate?: unknown; version?: string } : undefined;
        const activate = module.activate ?? (typeof module.default === 'function' ? module.default : defaultObject?.activate);
        if (typeof activate !== 'function') throw new Error('El archivo debe exportar activate(api) o una función por defecto.');
        const all = readStoredPlugins();
        const totalSize = all.reduce((sum, plugin) => sum + plugin.source.length, 0) + source.length;
        if (totalSize > 1_000_000) throw new Error('El espacio de almacenamiento para plugins llegó a 1 MB. Quitá plugins que no uses.');
        const plugin: StoredPlugin = { id: crypto.randomUUID(), name: String(module.name ?? defaultObject?.name ?? file.name.replace(/\.(m?js)$/i, '')).slice(0, 80), fileName: file.name, source, installedAt: Date.now() };
        writeStoredPlugins([...all, plugin]);
        status.textContent = `Plugin instalado: ${plugin.name}`;
        await activateStored();
      } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
    })();
  });
  void activateStored();
}

