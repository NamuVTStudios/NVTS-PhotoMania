import { ThemeController } from '@nvts/shared-ui';
import { clearRecentProjects } from '@nvts/storage';
import { uiIcon } from '../components/ShellTemplates';
import { DEFAULT_TABLET_INPUT_PREFERENCES, type TabletInputPreferences } from '../tools/TabletInput';

// Panel template and markup. Behavior is wired by the application controller.

export const PREFERENCES_PANEL_TEMPLATE = `
<aside id="preferences-overlay" class="preferences-dock" hidden aria-labelledby="preferences-title">
  <header><div><strong id="preferences-title">Preferencias</strong><p>Personalizá NVTS PhotoMania.</p></div><button type="button" id="preferences-close" class="preferences-close" aria-label="Cerrar preferencias">${uiIcon('close')}</button></header>
  <nav class="preferences-sections" aria-label="Secciones de preferencias">
    <button type="button" class="active" data-preference-section="general" aria-pressed="true">General</button>
    <button type="button" data-preference-section="appearance" aria-pressed="false">Apariencia</button>
    <button type="button" data-preference-section="editing" aria-pressed="false">Edición</button>
    <button type="button" data-preference-section="layers" aria-pressed="false">Capas y máscaras</button>
    <button type="button" data-preference-section="tablet" aria-pressed="false">Tabletas y lápices</button>
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
    <section data-preference-content="tablet" hidden><h3>Tabletas y lápices</h3>
      <p class="preferences-note">Compatibilidad mediante Pointer Events. La presión y la inclinación dependen del controlador, el navegador y el dispositivo. Esta sección no modifica los ajustes del controlador del fabricante.</p>
      <label class="preference-row" for="pref-pen-pressure-size"><span><strong>La presión controla el tamaño</strong><small>A mayor presión del lápiz, mayor grosor del trazo.</small></span><input id="pref-pen-pressure-size" type="checkbox" /></label>
      <label class="preference-row" for="pref-pen-pressure-opacity"><span><strong>La presión controla la opacidad</strong><small>A mayor presión, mayor depósito de pigmento.</small></span><input id="pref-pen-pressure-opacity" type="checkbox" /></label>
      <label class="preference-row" for="pref-pen-tilt"><span><strong>Usar inclinación del lápiz</strong><small>Orienta la textura y las cerdas cuando el dispositivo informa inclinación.</small></span><input id="pref-pen-tilt" type="checkbox" /></label>
      <div class="preference-row"><span><strong>Curva de presión</strong><small>Ajusta la respuesta de presión del lápiz.</small></span><input id="pref-pen-pressure-curve" type="range" min="0.5" max="2.5" step="0.1" /></div>
      <label class="preference-row" for="pref-tablet-test-color"><span><strong>Color de prueba</strong><small>Elegí un color para el trazo de prueba.</small></span><input id="pref-tablet-test-color" type="color" value="#202020" /></label>
      <canvas id="pref-tablet-test-pad" width="480" height="120" aria-label="Área para probar presión e inclinación del lápiz"></canvas>
      <div class="preferences-tablet-actions"><button type="button" id="pref-tablet-test-clear">Limpiar prueba</button><button type="button" id="pref-tablet-reset">Restaurar configuración de tabletas</button></div><p id="pref-tablet-reset-status" class="preferences-note" role="status"></p>
    </section>
  </div>
  <footer><button type="button" id="preferences-cancel">Cerrar</button><button type="button" class="primary" id="preferences-save">Guardar preferencias</button></footer>
</aside>`;

const PREFERENCES_KEY = 'nvts-photomania-preferences';
type UiTheme = 'dark' | 'light' | 'system';
export type DeleteBehavior = 'remove' | 'clear';
export interface AppPreferences { rememberRecentProjects: boolean; theme: UiTheme; layerDeleteBehavior: DeleteBehavior; maskDeleteBehavior: DeleteBehavior; tabletInput: TabletInputPreferences }
const DEFAULT_PREFERENCES: AppPreferences = { rememberRecentProjects: false, theme: 'system', layerDeleteBehavior: 'remove', maskDeleteBehavior: 'remove', tabletInput: { ...DEFAULT_TABLET_INPUT_PREFERENCES } };
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
    tabletInput: normalizeTabletPreferences(parsed.tabletInput),
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
  pressureSize: HTMLInputElement;
  pressureOpacity: HTMLInputElement;
  tilt: HTMLInputElement;
  pressureCurve: HTMLInputElement;
  testColor: HTMLInputElement;
  testPad: HTMLCanvasElement;
  resetTablet: HTMLButtonElement;
  tabletResetStatus: HTMLElement;
}

export function wirePreferences(root: HTMLElement, onSaved?: (next: AppPreferences, previous: AppPreferences) => void | Promise<void>): () => void {
  const elements = getPreferenceElements(root);
  const close = () => { elements.overlay.hidden = true; };
  const open = () => openPreferences(root, elements);
  bindPreferenceOpenButtons(root, open);
  bindPreferenceSections(root);
  bindPreferenceCloseActions(root, elements.overlay, close);
  bindPreferenceSave(root, elements, close, onSaved);
  bindTabletPreferenceReset(elements, onSaved);
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
    pressureSize: root.querySelector<HTMLInputElement>('#pref-pen-pressure-size')!,
    pressureOpacity: root.querySelector<HTMLInputElement>('#pref-pen-pressure-opacity')!,
    tilt: root.querySelector<HTMLInputElement>('#pref-pen-tilt')!,
    pressureCurve: root.querySelector<HTMLInputElement>('#pref-pen-pressure-curve')!,
    testColor: root.querySelector<HTMLInputElement>('#pref-tablet-test-color')!,
    testPad: root.querySelector<HTMLCanvasElement>('#pref-tablet-test-pad')!,
    resetTablet: root.querySelector<HTMLButtonElement>('#pref-tablet-reset')!,
    tabletResetStatus: root.querySelector<HTMLElement>('#pref-tablet-reset-status')!,
  };
}

function openPreferences(root: HTMLElement, elements: PreferenceElements): void {
  const current = readPreferences();
  elements.recent.checked = current.rememberRecentProjects;
  elements.theme.value = current.theme;
  elements.layerDeleteBehavior.value = current.layerDeleteBehavior;
  elements.maskDeleteBehavior.value = current.maskDeleteBehavior;
  elements.pressureSize.checked = current.tabletInput.pressureAffectsSize;
  elements.pressureOpacity.checked = current.tabletInput.pressureAffectsOpacity;
  elements.tilt.checked = current.tabletInput.tiltControlsAngle;
  elements.pressureCurve.value = String(current.tabletInput.pressureCurve);
  bindTabletTestPad(elements);
  elements.tabletResetStatus.textContent = '';
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
    tabletInput: {
      pressureAffectsSize: elements.pressureSize.checked,
      pressureAffectsOpacity: elements.pressureOpacity.checked,
      tiltControlsAngle: elements.tilt.checked,
      pressureCurve: clamp(Number(elements.pressureCurve.value) || 1, 0.5, 2.5),
    },
  };
}

async function clearRecentProjectsWhenDisabled(previous: AppPreferences, next: AppPreferences): Promise<void> {
  if (!previous.rememberRecentProjects || next.rememberRecentProjects) return;
  await clearRecentProjects().catch((error) => console.warn('No se pudieron borrar los proyectos recientes:', error));
}



function bindTabletPreferenceReset(
  elements: PreferenceElements,
  onSaved?: (next: AppPreferences, previous: AppPreferences) => void | Promise<void>,
): void {
  elements.resetTablet.addEventListener('click', () => {
    const previous = readPreferences();
    const next: AppPreferences = { ...previous, tabletInput: { ...DEFAULT_TABLET_INPUT_PREFERENCES } };
    elements.pressureSize.checked = next.tabletInput.pressureAffectsSize;
    elements.pressureOpacity.checked = next.tabletInput.pressureAffectsOpacity;
    elements.tilt.checked = next.tabletInput.tiltControlsAngle;
    elements.pressureCurve.value = String(next.tabletInput.pressureCurve);
    writePreferences(next);
    elements.tabletResetStatus.textContent = 'Configuración de tabletas restaurada y guardada.';
    void onSaved?.(next, previous);
  });
}

function normalizeTabletPreferences(value: unknown): TabletInputPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_TABLET_INPUT_PREFERENCES };
  const candidate = value as Partial<TabletInputPreferences>;
  return {
    pressureAffectsSize: candidate.pressureAffectsSize !== false,
    pressureAffectsOpacity: candidate.pressureAffectsOpacity !== false,
    tiltControlsAngle: candidate.tiltControlsAngle === true,
    pressureCurve: clamp(Number(candidate.pressureCurve) || 1, 0.5, 2.5),
  };
}

function bindTabletTestPad(elements: PreferenceElements): void {
  const canvas = elements.testPad;
  if (canvas.dataset.bound === 'true') return;
  canvas.dataset.bound = 'true';
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#f4f1eb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  let drawing = false;
  let previous: { x: number; y: number } | null = null;
  const point = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };
  canvas.addEventListener('pointerdown', (event) => {
    drawing = true;
    previous = point(event);
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drawing || !previous) return;
    const next = point(event);
    const pressure = event.pointerType === 'pen' ? Math.max(0.08, event.pressure) : 0.65;
    context.strokeStyle = elements.testColor.value;
    context.lineWidth = 1 + 13 * pressure;
    context.lineCap = 'round';
    context.beginPath(); context.moveTo(previous.x, previous.y); context.lineTo(next.x, next.y); context.stroke();
    previous = next;
  });
  const stop = () => { drawing = false; previous = null; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);
  elements.testColor.addEventListener('input', () => { /* El color se aplica al siguiente trazo. */ });
  canvas.parentElement?.querySelector<HTMLButtonElement>('#pref-tablet-test-clear')?.addEventListener('click', () => {
    context.fillStyle = '#f4f1eb'; context.fillRect(0, 0, canvas.width, canvas.height);
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
