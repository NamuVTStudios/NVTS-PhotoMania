import { clearRecentProjects } from '@nvts/storage';
import { uiIcon } from '../components/ShellTemplates';

// Panel template and markup. Behavior is wired by the application controller.

export const PREFERENCES_PANEL_TEMPLATE = `
<section id="preferences-overlay" class="preferences-overlay" hidden>
  <div class="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
    <header><div><strong id="preferences-title">Preferencias</strong><p>Personalizá NVTS PhotoMania.</p></div><button type="button" id="preferences-close" class="preferences-close" aria-label="Cerrar preferencias">${uiIcon('close')}</button></header>
    <div class="preferences-content">
      <label class="preference-row" for="pref-recent-projects">
        <span><strong>Guardar proyectos recientes</strong><small>Recordar documentos creados o abiertos en este navegador. Se guardan copias locales para poder recuperarlos.</small></span>
        <input id="pref-recent-projects" type="checkbox" />
      </label>
      <div class="preference-row">
        <span><strong>Tema de la interfaz</strong><small>Cambiá entre la apariencia oscura y la clara.</small></span>
        <select id="pref-theme"><option value="dark">Tema oscuro</option><option value="light">Tema claro</option></select>
      </div>
      <p class="preferences-note">Al desactivar los proyectos recientes, PhotoMania borra las copias y la lista guardadas para esta función.</p>
    </div>
    <footer><button type="button" id="preferences-cancel">Cancelar</button><button type="button" class="primary" id="preferences-save">Guardar preferencias</button></footer>
  </div>
</section>`;

const PREFERENCES_KEY = 'nvts-photomania-preferences';
type UiTheme = 'dark' | 'light';
export interface AppPreferences { rememberRecentProjects: boolean; theme: UiTheme }
const DEFAULT_PREFERENCES: AppPreferences = { rememberRecentProjects: false, theme: 'dark' };

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
    theme: parsed.theme === 'light' ? 'light' : 'dark',
  };
}

export function writePreferences(prefs: AppPreferences): void {
  try { localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs)); }
  catch (error) { console.warn('No se pudieron guardar las preferencias:', error); }
  document.documentElement.dataset.theme = prefs.theme;
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
  document.documentElement.dataset.theme = prefs.theme;
  return prefs;
}

interface PreferenceElements {
  overlay: HTMLElement;
  recent: HTMLInputElement;
  theme: HTMLSelectElement;
}

export function wirePreferences(root: HTMLElement, onSaved?: (next: AppPreferences, previous: AppPreferences) => void | Promise<void>): () => void {
  const elements = getPreferenceElements(root);
  const close = () => { elements.overlay.hidden = true; };
  const open = () => openPreferences(root, elements);
  bindPreferenceOpenButtons(root, open);
  bindPreferenceCloseActions(root, elements.overlay, close);
  bindPreferenceSave(root, elements, close, onSaved);
  return open;
}

function getPreferenceElements(root: HTMLElement): PreferenceElements {
  return {
    overlay: root.querySelector<HTMLElement>('#preferences-overlay')!,
    recent: root.querySelector<HTMLInputElement>('#pref-recent-projects')!,
    theme: root.querySelector<HTMLSelectElement>('#pref-theme')!,
  };
}

function openPreferences(root: HTMLElement, elements: PreferenceElements): void {
  const current = readPreferences();
  elements.recent.checked = current.rememberRecentProjects;
  elements.theme.value = current.theme;
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
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
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
    theme: elements.theme.value === 'light' ? 'light' : 'dark',
  };
}

async function clearRecentProjectsWhenDisabled(previous: AppPreferences, next: AppPreferences): Promise<void> {
  if (!previous.rememberRecentProjects || next.rememberRecentProjects) return;
  await clearRecentProjects().catch((error) => console.warn('No se pudieron borrar los proyectos recientes:', error));
}
