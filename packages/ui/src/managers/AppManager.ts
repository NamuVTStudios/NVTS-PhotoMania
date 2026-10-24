import { initializePreferences } from '../panels/PreferencesPanel';
import { HomeScreenController } from '../HomeScreenController';

export type LaunchProject = (
  root: HTMLElement,
  wasmBaseUrl: string,
  name: string,
  width: number,
  height: number,
  file?: File,
) => Promise<void>;

/** Coordina el arranque de PhotoMania y la transición desde la pantalla de inicio al editor. */
export class AppManager {
  private homeScreen: HomeScreenController | null = null;

  async start(root: HTMLElement, wasmBaseUrl: string, launchProject: LaunchProject): Promise<void> {
    await initializePreferences();
    this.homeScreen = new HomeScreenController(root, (name, width, height, file) =>
      launchProject(root, wasmBaseUrl, name, width, height, file),
    );
    this.homeScreen.mount();
  }
}
