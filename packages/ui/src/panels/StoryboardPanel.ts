import { Panel } from './Panel';
import { uiIcon } from '../components/ShellTemplates';

/** Panel de guion gráfico: organiza tomas y notas por plano. */
export const STORYBOARD_PANEL_TEMPLATE = `
<section id="storyboard-panel" class="dock-panel storyboard-panel" hidden aria-label="Guion gráfico">
  <header><strong class="panel-title-icon">${uiIcon('storyboard')}<span>Guion gráfico</span></strong><div class="panel-spacer"></div><button id="storyboard-add-shot" type="button">${uiIcon('plus')}<span>Plano</span></button></header>
  <div class="storyboard-toolbar"><label>Secuencia <input id="storyboard-sequence" value="Secuencia 1" maxlength="100"></label><button id="storyboard-export" type="button">${uiIcon('export')}<span>Exportar JSON</span></button></div>
  <div id="storyboard-shots" class="storyboard-shots" aria-live="polite"></div>
  <p class="panel-hint">Organizá los planos, su descripción y duración. Los datos se guardan en este navegador.</p>
</section>`;

type StoryboardShot = { id: string; title: string; description: string; duration: number };

/** Connects storyboard controls; each operation is delegated to a focused helper. */
export function wireStoryboardPanel(root: HTMLElement): void {
  const elements = getStoryboardElements(root);
  if (!elements || elements.add.dataset.wired) return;
  elements.add.dataset.wired = 'true';
  new StoryboardPanelController(root, elements).mount();
}

interface StoryboardElements {
  list: HTMLElement;
  add: HTMLButtonElement;
}

function getStoryboardElements(root: HTMLElement): StoryboardElements | null {
  const list = root.querySelector<HTMLElement>('#storyboard-shots');
  const add = root.querySelector<HTMLButtonElement>('#storyboard-add-shot');
  if (!list || !add) return null;
  return { list, add };
}

class StoryboardPanelController extends Panel {
  private readonly storageKey = 'nvts-photomania-storyboard-v1';
  private shots: StoryboardShot[] = [];

  constructor(root: HTMLElement, private readonly elements: StoryboardElements) {
    super(root, '#storyboard-panel');
  }

  mount(): void {
    this.loadShots();
    this.bindActions();
    this.render();
  }

  private loadShots(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || '[]') as StoryboardShot[];
      this.shots = Array.isArray(saved) ? saved : [];
    } catch {
      this.shots = [];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.shots));
    } catch {
      // La persistencia del guion gráfico es opcional.
    }
  }

  private bindActions(): void {
    this.elements.add.addEventListener('click', () => this.addShot());
    this.root.querySelector('#storyboard-export')?.addEventListener('click', () => this.exportStoryboard());
  }

  private addShot(): void {
    this.shots.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title: `Plano ${this.shots.length + 1}`,
      description: '',
      duration: 24,
    });
    this.persist();
    this.render();
  }

  private render(): void {
    this.elements.list.replaceChildren();
    this.shots.forEach((shot, index) => this.elements.list.append(this.createShotCard(shot, index)));
  }

  private createShotCard(shot: StoryboardShot, index: number): HTMLElement {
    const card = document.createElement('article');
    card.className = 'storyboard-shot';
    card.append(this.createShotHeading(index), this.createTitleInput(shot), this.createDescriptionInput(shot));
    const duration = this.createDurationInput(shot);
    const durationLabel = document.createElement('label');
    durationLabel.textContent = 'Fotogramas ';
    durationLabel.append(duration);
    card.append(durationLabel, this.createRemoveButton(shot));
    return card;
  }

  private createShotHeading(index: number): HTMLElement {
    const heading = document.createElement('strong');
    heading.textContent = `Plano ${index + 1}`;
    return heading;
  }

  private createTitleInput(shot: StoryboardShot): HTMLInputElement {
    const title = document.createElement('input');
    title.value = shot.title;
    title.setAttribute('aria-label', 'Título del plano');
    title.placeholder = 'Título';
    title.addEventListener('change', () => {
      shot.title = title.value;
      this.persist();
    });
    return title;
  }

  private createDescriptionInput(shot: StoryboardShot): HTMLTextAreaElement {
    const description = document.createElement('textarea');
    description.value = shot.description;
    description.setAttribute('aria-label', 'Descripción del plano');
    description.placeholder = 'Acción, encuadre, diálogo…';
    description.rows = 2;
    description.addEventListener('change', () => {
      shot.description = description.value;
      this.persist();
    });
    return description;
  }

  private createDurationInput(shot: StoryboardShot): HTMLInputElement {
    const duration = document.createElement('input');
    duration.type = 'number';
    duration.min = '1';
    duration.max = '999';
    duration.value = String(shot.duration);
    duration.setAttribute('aria-label', 'Duración en fotogramas');
    duration.addEventListener('change', () => {
      shot.duration = Math.max(1, Number(duration.value) || 1);
      this.persist();
    });
    return duration;
  }

  private createRemoveButton(shot: StoryboardShot): HTMLButtonElement {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', () => this.removeShot(shot.id));
    return remove;
  }

  private removeShot(id: string): void {
    this.shots = this.shots.filter((shot) => shot.id !== id);
    this.persist();
    this.render();
  }

  private exportStoryboard(): void {
    const sequence = this.root.querySelector<HTMLInputElement>('#storyboard-sequence')?.value || 'Secuencia 1';
    const content = JSON.stringify({ sequence, shots: this.shots }, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    this.downloadJson(url);
    URL.revokeObjectURL(url);
  }

  private downloadJson(url: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = 'storyboard.json';
    link.click();
  }
}
