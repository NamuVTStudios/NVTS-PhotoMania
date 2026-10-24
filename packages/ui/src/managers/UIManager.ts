import { wireAnimationTimelinePanel } from '../panels/AnimationTimelinePanel';
import { wireStoryboardPanel } from '../panels/StoryboardPanel';

/** Monta el shell del editor y conecta los paneles compartidos de la interfaz. */
export class UIManager {
  mountEditorShell(
    root: HTMLElement,
    editorTemplate: string,
    preferencesTemplate: string,
    pluginsTemplate: string,
  ): HTMLCanvasElement {
    root.innerHTML = editorTemplate;
    root.insertAdjacentHTML('beforeend', preferencesTemplate);
    root.insertAdjacentHTML('beforeend', pluginsTemplate);

    const canvas = root.querySelector<HTMLCanvasElement>('#canvas');
    if (!canvas) throw new Error('No se encontró el lienzo del editor en la plantilla de PhotoMania.');
    return canvas;
  }

  bindSharedPanels(root: HTMLElement): void {
    wireStoryboardPanel(root);
    wireAnimationTimelinePanel(root);
  }

  renderLaunchError(root: HTMLElement, error: unknown, onBack: () => void): void {
    root.innerHTML = '<main class="home-fatal"><h1>No se pudo iniciar PhotoMania</h1><p id="home-error"></p><button id="home-back">Volver al inicio</button></main>';
    const message = root.querySelector<HTMLElement>('#home-error');
    if (message) message.textContent = error instanceof Error ? error.message : String(error);
    root.querySelector<HTMLButtonElement>('#home-back')?.addEventListener('click', onBack);
    console.error(error);
  }
}
