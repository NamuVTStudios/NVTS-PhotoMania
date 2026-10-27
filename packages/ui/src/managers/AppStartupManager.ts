import { WasmRuntimeManager, type EngineClient } from '@nvts/wasm-bindings';
import { createRenderer, type RendererBackend } from '@nvts/renderer';
import { documentNameFromFile } from '../app/AppUtilities';
import { EDITOR_TEMPLATE } from '../components/EditorTemplate';
import { PLUGINS_PANEL_TEMPLATE } from '../panels/PluginsPanel';
import { PREFERENCES_PANEL_TEMPLATE } from '../panels/PreferencesPanel';
import { UIManager } from './UIManager';

export interface StartupApplication {
  bindEditorPreferences(root: HTMLElement): void;
  initializeEditor(width: number, height: number, name: string, file?: File): Promise<void>;
}

export type StartupApplicationFactory = (
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  engine: EngineClient,
  renderer: RendererBackend,
) => StartupApplication;

/** Orchestrates editor startup without coupling the entry point to rendering or UI templates. */
export class AppStartupManager {
  constructor(
    private readonly createApp: StartupApplicationFactory,
    private readonly restartApplication: () => void,
  ) {}

  async launchProject(
    root: HTMLElement,
    wasmBase: string,
    name: string,
    width: number,
    height: number,
    file?: File,
  ): Promise<void> {
    try {
      const uiManager = new UIManager();
      const canvas = this.mountEditorShell(root, uiManager);
      const runtime = await this.initializeRuntime(canvas, wasmBase);
      const app = this.createApp(root, canvas, runtime.engine, runtime.renderer);
      uiManager.bindSharedPanels(root);
      app.bindEditorPreferences(root);
      await app.initializeEditor(width, height, name, file);
    } catch (error) {
      this.renderLaunchError(root, error);
    }
  }

  private mountEditorShell(root: HTMLElement, uiManager: UIManager): HTMLCanvasElement {
    return uiManager.mountEditorShell(
      root,
      EDITOR_TEMPLATE,
      PREFERENCES_PANEL_TEMPLATE,
      PLUGINS_PANEL_TEMPLATE,
    );
  }

  private async initializeRuntime(canvas: HTMLCanvasElement, wasmBase: string): Promise<{
    engine: EngineClient;
    renderer: RendererBackend;
  }> {
    const [engine, renderer] = await Promise.all([
      WasmRuntimeManager.getInstance().getEngine(wasmBase),
      createRenderer(canvas),
    ]);
    return { engine, renderer };
  }

  private renderLaunchError(root: HTMLElement, error: unknown): void {
    new UIManager().renderLaunchError(root, error, this.restartApplication);
  }
}
