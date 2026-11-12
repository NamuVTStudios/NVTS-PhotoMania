// Application entry point. Feature implementations live in focused app modules.
import { AppFileFeatures } from './app/AppFileFeatures';
import { documentNameFromFile } from './app/AppUtilities';
import { AppManager } from './managers/AppManager';
import { AppStartupManager } from './managers/AppStartupManager';
import { wirePreferences } from './panels/PreferencesPanel';

export class App extends AppFileFeatures {
  static async start(root: HTMLElement, wasmBase = '/wasm/', initialFile?: File): Promise<void> {
    const startup = new AppStartupManager(
      (appRoot, canvas, engine, renderer) => new App(appRoot, canvas, engine, renderer),
      () => { void App.start(root, wasmBase); },
    );
    await new AppManager().start(
      root,
      wasmBase,
      (projectRoot, baseUrl, name, width, height, file) =>
        startup.launchProject(projectRoot, baseUrl, name, width, height, file),
      initialFile,
    );
  }

  bindEditorPreferences(root: HTMLElement): void {
    wirePreferences(root, async (next, previous) => {
      this.setTabletInputPreferences(next.tabletInput);
      if (!previous.rememberRecentProjects && next.rememberRecentProjects) {
        this.queueRecentSnapshot();
      }
    });
  }

  async initializeEditor(width: number, height: number, name: string, file?: File): Promise<void> {
    // Tool availability and layer panels read ctl.doc while the editor controls are bound.
    // Install the initial document before bind() performs its first UI synchronization.
    this.newDocument(width, height, file ? documentNameFromFile(file.name) : name);
    this.bind();
    await this.openInitialFile(file, name);
  }
}
