// Application entry point. Feature implementations live in focused app modules.
import { AppFileFeatures } from './app/AppFileFeatures';
import { documentNameFromFile } from './app/AppUtilities';
import { AppManager } from './managers/AppManager';
import { AppStartupManager } from './managers/AppStartupManager';
import { wirePreferences } from './panels/PreferencesPanel';

export class App extends AppFileFeatures {
  static async start(root: HTMLElement, wasmBase = '/wasm/'): Promise<void> {
    const startup = new AppStartupManager(
      (appRoot, canvas, engine, renderer) => new App(appRoot, canvas, engine, renderer),
      () => { void App.start(root, wasmBase); },
    );
    await new AppManager().start(root, wasmBase, (projectRoot, baseUrl, name, width, height, file) =>
      startup.launchProject(projectRoot, baseUrl, name, width, height, file),
    );
  }

  bindEditorPreferences(root: HTMLElement): void {
    wirePreferences(root, async (next, previous) => {
      if (!previous.rememberRecentProjects && next.rememberRecentProjects) {
        this.queueRecentSnapshot();
      }
    });
  }

  async initializeEditor(width: number, height: number, name: string, file?: File): Promise<void> {
    this.bind();
    this.newDocument(width, height, file ? documentNameFromFile(file.name) : name);
    await this.openInitialFile(file, name);
  }
}
