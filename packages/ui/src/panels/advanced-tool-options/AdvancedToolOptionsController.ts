import { ADVANCED_TOOL_OPTIONS_REGISTRY } from './ToolOptionsRegistry';
import type {
  AdvancedBrushSettings,
  AdvancedComicSettings,
  AdvancedTextSettings,
  AdvancedToolOptionsCallbacks,
  AdvancedToolOptionsContext,
} from './types';

export type {
  AdvancedBrushSettings,
  AdvancedComicSettings,
  AdvancedTextSettings,
  AdvancedToolOptionsCallbacks,
} from './types';

/** Coordinates the selected tool definition without owning any individual tool's UI. */
export function renderAdvancedToolOptionsPanel(
  host: HTMLElement,
  tool: string,
  brush: AdvancedBrushSettings,
  textSettings: AdvancedTextSettings,
  callbacks: AdvancedToolOptionsCallbacks,
  comicSettings: AdvancedComicSettings,
): void {
  const definition = ADVANCED_TOOL_OPTIONS_REGISTRY[tool];
  const context: AdvancedToolOptionsContext = { host, brush, textSettings, callbacks, comicSettings };
  host.innerHTML = definition?.render(context) ?? '<p class="hint">Esta herramienta no tiene opciones avanzadas registradas.</p>';
  definition?.bind(context);
}
