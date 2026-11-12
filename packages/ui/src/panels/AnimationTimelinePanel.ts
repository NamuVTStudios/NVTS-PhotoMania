import { Panel } from './Panel';
import { uiIcon } from '../components/ShellTemplates';

export const ANIMATION_TIMELINE_PANEL_TEMPLATE = `
<section id="animation-timeline-panel" class="dock-panel animation-timeline-panel" hidden aria-label="Línea de tiempo de animación">
  <header><strong class="panel-title-icon">${uiIcon('timeline')}<span>Línea de tiempo de animación</span></strong><div class="panel-spacer"></div><label class="timeline-fps">FPS <input id="timeline-fps" type="number" min="1" max="120" value="24"></label><button id="timeline-add-frame" type="button">${uiIcon('plus')}<span>Fotograma</span></button></header>
  <div class="timeline-toolbar"><button id="timeline-first" type="button" title="Primer fotograma" aria-label="Primer fotograma">${uiIcon('frame-first')}</button><button id="timeline-prev" type="button" title="Fotograma anterior" aria-label="Fotograma anterior">${uiIcon('frame-previous')}</button><button id="timeline-play" type="button">${uiIcon('play')}<span>Reproducir</span></button><button id="timeline-next" type="button" title="Fotograma siguiente" aria-label="Fotograma siguiente">${uiIcon('frame-next')}</button><label>Fotograma <input id="timeline-current" type="number" min="1" max="48" value="1"></label><span id="timeline-status" role="status">Fotograma 1 · 24 FPS</span></div>
  <div class="timeline-scroll"><div id="timeline-grid" class="timeline-grid"></div></div>
  <p class="panel-hint">Cada fotograma utiliza su propia capa de pintura. Al cambiar de celda se activa su capa; los trazos de los demás fotogramas permanecen separados.</p>
</section>`;

interface TimelineElements {
  grid: HTMLElement;
  current: HTMLInputElement;
  fps: HTMLInputElement;
  status: HTMLElement;
  play: HTMLButtonElement;
}

const MAX_VISIBLE_FRAMES = 48;

export function wireAnimationTimelinePanel(root: HTMLElement): void {
  const elements = getTimelineElements(root);
  if (!elements || elements.play.dataset.wired) return;
  elements.play.dataset.wired = 'true';
  new AnimationTimelineController(root, elements).mount();
}

function getRulerFrameLabel(frame: number): string {
  return frame % 4 === 1 ? String(frame) : '·';
}

function getTimelineElements(root: HTMLElement): TimelineElements | null {
  const grid = root.querySelector<HTMLElement>('#timeline-grid');
  const current = root.querySelector<HTMLInputElement>('#timeline-current');
  const fps = root.querySelector<HTMLInputElement>('#timeline-fps');
  const status = root.querySelector<HTMLElement>('#timeline-status');
  const play = root.querySelector<HTMLButtonElement>('#timeline-play');
  if (!grid || !current || !fps || !status || !play) return null;
  return { grid, current, fps, status, play };
}

class AnimationTimelineController extends Panel {
  private readonly storageKey = 'nvts-photomania-timeline-v2';
  private readonly createdFrames = new Set<number>([1]);
  private playbackTimer: number | null = null;
  private playing = false;

  constructor(root: HTMLElement, private readonly elements: TimelineElements) {
    super(root, '#animation-timeline-panel');
  }

  mount(): void {
    this.loadFrames();
    this.bindFrameActions();
    this.bindFrameNavigation();
    this.bindPlayback();
    this.render();
  }

  private loadFrames(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || '[1]') as number[];
      saved.filter((frame) => Number.isInteger(frame) && frame >= 1 && frame <= MAX_VISIBLE_FRAMES)
        .forEach((frame) => this.createdFrames.add(frame));
    } catch {
      this.createdFrames.clear();
      this.createdFrames.add(1);
    }
  }

  private persistFrames(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.getSortedFrames()));
    } catch {
      // The frame layers remain in the document even when browser storage is unavailable.
    }
  }

  private getSortedFrames(): number[] {
    return [...this.createdFrames].sort((left, right) => left - right);
  }

  private render(): void {
    this.elements.grid.replaceChildren();
    this.renderRuler();
    this.renderFrameTrack();
    this.updateStatus();
  }

  private renderRuler(): void {
    const ruler = document.createElement('div');
    ruler.className = 'timeline-ruler';
    ruler.append(document.createElement('span'));
    for (let frame = 1; frame <= MAX_VISIBLE_FRAMES; frame++) {
      const cell = document.createElement('span');
      cell.textContent = getRulerFrameLabel(frame);
      ruler.append(cell);
    }
    this.elements.grid.append(ruler);
  }

  private renderFrameTrack(): void {
    const row = document.createElement('div');
    row.className = 'timeline-track';
    const name = document.createElement('strong');
    name.textContent = 'Dibujo';
    row.append(name);
    for (let frame = 1; frame <= MAX_VISIBLE_FRAMES; frame++) row.append(this.createFrameCell(frame));
    this.elements.grid.append(row);
  }

  private createFrameCell(frame: number): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.type = 'button';
    const isCreated = this.createdFrames.has(frame);
    const isCurrent = Number(this.elements.current.value) === frame;
    cell.className = `timeline-cell${isCreated ? ' keyframe' : ''}${isCurrent ? ' current-frame' : ''}`;
    cell.title = isCreated ? `Editar fotograma ${frame}` : `Crear fotograma ${frame}`;
    cell.setAttribute('aria-label', isCreated ? `Fotograma ${frame}` : `Crear fotograma ${frame}`);
    cell.setAttribute('aria-pressed', String(isCurrent));
    cell.addEventListener('click', () => this.selectFrame(frame));
    return cell;
  }

  private selectFrame(frame: number): void {
    const target = this.clampFrame(frame);
    const previous = Number(this.elements.current.value) || 1;
    this.createdFrames.add(target);
    this.elements.current.value = String(target);
    this.persistFrames();
    this.dispatchFrameChange(target, previous);
    this.render();
  }

  private dispatchFrameChange(frame: number, previousFrame: number): void {
    this.root.dispatchEvent(new CustomEvent('nvts:animation-frame-change', {
      bubbles: true,
      detail: { frame, previousFrame },
    }));
  }

  private clampFrame(frame: number): number {
    return Math.max(1, Math.min(MAX_VISIBLE_FRAMES, Math.floor(frame) || 1));
  }

  private updateStatus(): void {
    const frame = this.clampFrame(Number(this.elements.current.value));
    const fps = Math.max(1, Math.min(120, Number(this.elements.fps.value) || 24));
    this.elements.status.textContent = `Fotograma ${frame} · ${fps} FPS · ${this.createdFrames.size} celdas`;
  }

  private bindFrameActions(): void {
    this.root.querySelector('#timeline-add-frame')?.addEventListener('click', () => this.addFrame());
  }

  private addFrame(): void {
    const next = this.getSortedFrames().at(-1)! + 1;
    if (next > MAX_VISIBLE_FRAMES) {
      this.elements.status.textContent = `Límite de ${MAX_VISIBLE_FRAMES} fotogramas visibles alcanzado.`;
      return;
    }
    this.selectFrame(next);
  }

  private bindFrameNavigation(): void {
    this.elements.current.addEventListener('change', () => this.selectFrame(Number(this.elements.current.value)));
    this.elements.fps.addEventListener('change', () => this.updateStatus());
    this.root.querySelector('#timeline-first')?.addEventListener('click', () => this.selectFrame(1));
    this.root.querySelector('#timeline-prev')?.addEventListener('click', () => this.selectFrame(Number(this.elements.current.value) - 1));
    this.root.querySelector('#timeline-next')?.addEventListener('click', () => this.selectFrame(Number(this.elements.current.value) + 1));
  }

  private bindPlayback(): void {
    this.elements.play.addEventListener('click', () => this.togglePlayback());
  }

  private togglePlayback(): void {
    if (this.playing) {
      this.stopPlayback();
      return;
    }
    const frames = this.getSortedFrames();
    if (frames.length < 2) {
      this.elements.status.textContent = 'Creá al menos dos fotogramas para reproducir.';
      return;
    }
    this.playing = true;
    this.elements.play.innerHTML = `${uiIcon('pause')}<span>Pausar</span>`;
    let index = Math.max(0, frames.indexOf(Number(this.elements.current.value)));
    const fps = Math.max(1, Math.min(120, Number(this.elements.fps.value) || 24));
    this.playbackTimer = window.setInterval(() => {
      index = (index + 1) % frames.length;
      this.selectFrame(frames[index]);
    }, 1000 / fps);
  }

  private stopPlayback(): void {
    if (this.playbackTimer !== null) window.clearInterval(this.playbackTimer);
    this.playbackTimer = null;
    this.playing = false;
    this.elements.play.innerHTML = `${uiIcon('play')}<span>Reproducir</span>`;
    this.updateStatus();
  }
}
