import { ThemeController } from '@nvts/shared-ui';
import { clearRecentProjects } from '@nvts/storage';
import { uiIcon } from '../components/ShellTemplates';

// Panel template and markup. Behavior is wired by the application controller.

export const PREFERENCES_PANEL_TEMPLATE = `
<aside id="preferences-overlay" class="preferences-dock" hidden aria-labelledby="preferences-title">
  <header><div><strong id="preferences-title">Preferencias</strong><p>Personalizá NVTS PhotoMania.</p></div><button type="button" id="preferences-close" class="preferences-close" aria-label="Cerrar preferencias">${uiIcon('close')}</button></header>
  <nav class="preferences-sections" aria-label="Secciones de preferencias">
    <button type="button" class="active" data-preference-section="general" aria-pressed="true">General</button>
    <button type="button" data-preference-section="appearance" aria-pressed="false">Apariencia</button>
    <button type="button" data-preference-section="editing" aria-pressed="false">Edición</button>
    <button type="button" data-preference-section="layers" aria-pressed="false">Capas y máscaras</button>
  </nav>
  <div class="preferences-content">
    <section data-preference-content="general"><h3>General</h3>
      <label class="preference-row" for="pref-recent-projects"><span><strong>Guardar proyectos recientes</strong><small>Recordar documentos creados o abiertos en este navegador. Se guardan copias locales para poder recuperarlos.</small></span><input id="pref-recent-projects" type="checkbox" /></label>
      <p class="preferences-note">Al desactivar esta opción, PhotoMania borra las copias y la lista guardadas para esta función.</p>
    </section>
    <section data-preference-content="appearance" hidden><h3>Apariencia</h3>
      <div class="preference-row"><span><strong>Tema de la interfaz</strong><small>Cambiá entre la apariencia oscura y la clara.</small></span><select id="pref-theme"><option value="system">Automático (sistema)</option><option value="light">Tema claro</option><option value="dark">Tema oscuro</option></select></div>
    </section>
    <section data-preference-content="editing" hidden><h3>Edición</h3>
      <p class="preferences-note">Los cambios de edición se registran en el historial del documento. Podés deshacerlos y rehacerlos desde el menú Editar.</p>
    </section>
    <section data-preference-content="layers" hidden><h3>Capas y máscaras</h3>
      <div class="preference-row"><span><strong>Tecla Supr en capas</strong><small>Elegí si Supr elimina la capa o solamente borra su contenido.</small></span><select id="pref-layer-delete-behavior"><option value="remove">Eliminar capa</option><option value="clear">Borrar contenido</option></select></div>
      <div class="preference-row"><span><strong>Tecla Supr en máscaras</strong><small>Elegí si Supr elimina la máscara o restablece su contenido.</small></span><select id="pref-mask-delete-behavior"><option value="remove">Eliminar máscara</option><option value="clear">Borrar contenido</option></select></div>
    </section>
  </div>
  <footer><button type="button" id="preferences-cancel">Cerrar</button><button type="button" class="primary" id="preferences-save">Guardar preferencias</button></footer>
</aside>`;

const PREFERENCES_KEY = 'nvts-photomania-preferences';
type UiTheme = 'dark' | 'light' | 'system';
export type DeleteBehavior = 'remove' | 'clear';
export interface AppPreferences { rememberRecentProjects: boolean; theme: UiTheme; layerDeleteBehavior: DeleteBehavior; maskDeleteBehavior: DeleteBehavior }
const DEFAULT_PREFERENCES: AppPreferences = { rememberRecentProjects: false, theme: 'system', layerDeleteBehavior: 'remove', maskDeleteBehavior: 'remove' };
const themeController = new ThemeController({ storageKey: 'nvts-photomania-theme', defaultPreference: 'system' });

export function readPreferences(): AppPreferences {
  let raw: string | null;
  try { raw = localStorage.getItem(PREFERENCES_KEY); }
  catch { return { ...DEFAULT_PREFERENCES }; }
  return parsePreferences(raw);
}

function parsePreferences(raw: string | null): AppPreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES };
  let parsed: Partial<AppPreferences>;
  try { parsed = JSON.parse(raw) as Partial<AppPreferences>; }
  catch { return { ...DEFAULT_PREFERENCES }; }
  return {
    rememberRecentProjects: parsed.rememberRecentProjects === true,
    theme: parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system' ? parsed.theme : 'system',
    layerDeleteBehavior: parsed.layerDeleteBehavior === 'clear' ? 'clear' : 'remove',
    maskDeleteBehavior: parsed.maskDeleteBehavior === 'clear' ? 'clear' : 'remove',
  };
}

export function writePreferences(prefs: AppPreferences): void {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs)); }
  catch (error) { console.warn('No se pudieron guardar las preferencias:', error); }
  themeController.setPreference(prefs.theme, { persist: false });
}

export async function initializePreferences(): Promise<AppPreferences> {
  let isFirstRun = false;
  try { isFirstRun = localStorage.getItem(PREFERENCES_KEY) === null; } catch { /* preferencias predeterminadas */ }
  const prefs = readPreferences();
  if (isFirstRun) {
    writePreferences(prefs);
    // Las entradas generadas por versiones anteriores no se consideran consentimiento para guardar recientes.
    await clearRecentProjects().catch((error) => console.warn('No se pudieron limpiar los recientes anteriores:', error));
  }
  themeController.setPreference(prefs.theme, { persist: false });
  return prefs;
}

interface PreferenceElements {
  overlay: HTMLElement;
  recent: HTMLInputElement;
  theme: HTMLSelectElement;
  layerDeleteBehavior: HTMLSelectElement;
  maskDeleteBehavior: HTMLSelectElement;
}

export function wirePreferences(root: HTMLElement, onSaved?: (next: AppPreferences, previous: AppPreferences) => void | Promise<void>): () => void {
  const elements = getPreferenceElements(root);
  const close = () => { elements.overlay.hidden = true; };
  const open = () => openPreferences(root, elements);
  bindPreferenceOpenButtons(root, open);
  bindPreferenceSections(root);
  bindPreferenceCloseActions(root, elements.overlay, close);
  bindPreferenceSave(root, elements, close, onSaved);
  return open;
}


function bindPreferenceSections(root: HTMLElement): void {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-preference-section]'));
  const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-preference-content]'));
  buttons.forEach((button) => button.addEventListener('click', () => {
    const selected = button.dataset.preferenceSection;
    buttons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    sections.forEach((section) => { section.hidden = section.dataset.preferenceContent !== selected; });
  }));
}

function getPreferenceElements(root: HTMLElement): PreferenceElements {
  return {
    overlay: root.querySelector<HTMLElement>('#preferences-overlay')!,
    recent: root.querySelector<HTMLInputElement>('#pref-recent-projects')!,
    theme: root.querySelector<HTMLSelectElement>('#pref-theme')!,
    layerDeleteBehavior: root.querySelector<HTMLSelectElement>('#pref-layer-delete-behavior')!,
    maskDeleteBehavior: root.querySelector<HTMLSelectElement>('#pref-mask-delete-behavior')!,
  };
}

function openPreferences(root: HTMLElement, elements: PreferenceElements): void {
  const current = readPreferences();
  elements.recent.checked = current.rememberRecentProjects;
  elements.theme.value = current.theme;
  elements.layerDeleteBehavior.value = current.layerDeleteBehavior;
  elements.maskDeleteBehavior.value = current.maskDeleteBehavior;
  elements.overlay.hidden = false;
  root.querySelector<HTMLButtonElement>('#preferences-close')?.focus();
}

function bindPreferenceOpenButtons(root: HTMLElement, open: () => void): void {
  root.querySelector<HTMLButtonElement>('#b-preferences')?.addEventListener('click', open);
  root.querySelector<HTMLButtonElement>('#home-preferences')?.addEventListener('click', open);
}

function bindPreferenceCloseActions(root: HTMLElement, overlay: HTMLElement, close: () => void): void {
  root.querySelector<HTMLButtonElement>('#preferences-close')?.addEventListener('click', close);
  root.querySelector<HTMLButtonElement>('#preferences-cancel')?.addEventListener('click', close);
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}

function bindPreferenceSave(
  root: HTMLElement,
  elements: PreferenceElements,
  close: () => void,
  onSaved?: (next: AppPreferences, previous: AppPreferences) => void | Promise<void>,
): void {
  root.querySelector<HTMLButtonElement>('#preferences-save')?.addEventListener('click', () => {
    void savePreferences(elements, close, onSaved);
  });
}

async function savePreferences(
  elements: PreferenceElements,
  close: () => void,
  onSaved?: (next: AppPreferences, previous: AppPreferences) => void | Promise<void>,
): Promise<void> {
  const previous = readPreferences();
  const next = readPreferenceControls(elements);
  writePreferences(next);
  close();
  await clearRecentProjectsWhenDisabled(previous, next);
  await onSaved?.(next, previous);
}

function readPreferenceControls(elements: PreferenceElements): AppPreferences {
  return {
    rememberRecentProjects: elements.recent.checked,
    theme: elements.theme.value === 'light' || elements.theme.value === 'dark' || elements.theme.value === 'system' ? elements.theme.value : 'system',
    layerDeleteBehavior: elements.layerDeleteBehavior.value === 'clear' ? 'clear' : 'remove',
    maskDeleteBehavior: elements.maskDeleteBehavior.value === 'clear' ? 'clear' : 'remove',
  };
}

async function clearRecentProjectsWhenDisabled(previous: AppPreferences, next: AppPreferences): Promise<void> {
  if (!previous.rememberRecentProjects || next.rememberRecentProjects) return;
  await clearRecentProjects().catch((error) => console.warn('No se pudieron borrar los proyectos recientes:', error));
}
