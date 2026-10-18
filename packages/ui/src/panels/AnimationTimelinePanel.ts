/** Línea de tiempo de animación: pistas y fotogramas clave básicos. */
export const ANIMATION_TIMELINE_PANEL_TEMPLATE = `
<section id="animation-timeline-panel" class="dock-panel animation-timeline-panel" hidden aria-label="Línea de tiempo de animación">
  <header><strong>▥ Línea de tiempo de animación</strong><div class="panel-spacer"></div><label class="timeline-fps">FPS <input id="timeline-fps" type="number" min="1" max="120" value="24"></label><button id="timeline-add-track" type="button">＋ Pista</button></header>
  <div class="timeline-toolbar"><button id="timeline-first" type="button" title="Primer fotograma">|◀</button><button id="timeline-prev" type="button" title="Fotograma anterior">◀</button><button id="timeline-play" type="button">▶ Reproducir</button><button id="timeline-next" type="button" title="Fotograma siguiente">▶|</button><label>Fotograma <input id="timeline-current" type="number" min="1" value="1"></label><span id="timeline-status" role="status">Fotograma 1 · 24 FPS</span></div>
  <div class="timeline-scroll"><div id="timeline-grid" class="timeline-grid"></div></div>
  <p class="panel-hint">Pistas y celdas de fotogramas clave. Esta primera versión organiza la exposición; la reproducción todavía no renderiza una secuencia animada del lienzo.</p>
</section>`;

type TimelineTrack = { id: string; name: string; keys: number[] };

interface TimelineElements {
  grid: HTMLElement;
  current: HTMLInputElement;
  fps: HTMLInputElement;
  status: HTMLElement;
  play: HTMLButtonElement;
}

/** Connects timeline controls and keeps timeline state local to this panel. */
export function wireAnimationTimelinePanel(root: HTMLElement): void {
  const elements = getTimelineElements(root);
  if (!elements || elements.play.dataset.wired) return;
  elements.play.dataset.wired = 'true';
  new AnimationTimelineController(root, elements).mount();
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

class AnimationTimelineController {
  private readonly storageKey = 'nvts-photomania-timeline-v1';
  private tracks: TimelineTrack[] = [];
  private playing = false;

  constructor(private readonly root: HTMLElement, private readonly elements: TimelineElements) {}

  mount(): void {
    this.loadTracks();
    this.bindTrackActions();
    this.bindFrameNavigation();
    this.bindPlayback();
    this.render();
  }

  private loadTracks(): void {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || '[]') as TimelineTrack[];
      this.tracks = Array.isArray(saved) ? saved : [];
    } catch {
      this.tracks = [];
    }
    if (!this.tracks.length) this.tracks = [{ id: 'track-1', name: 'Capa 1', keys: [1] }];
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.tracks));
    } catch {
      // La persistencia de la línea de tiempo es opcional.
    }
  }

  private render(): void {
    this.elements.grid.replaceChildren();
    this.renderRuler();
    this.tracks.forEach((track) => this.renderTrack(track));
    this.updateStatus();
  }

  private renderRuler(): void {
    const ruler = document.createElement('div');
    ruler.className = 'timeline-ruler';
    ruler.append(document.createElement('span'));
    for (let frame = 1; frame <= 48; frame++) {
      const cell = document.createElement('span');
      cell.textContent = frame % 4 === 1 ? String(frame) : '·';
      ruler.append(cell);
    }
    this.elements.grid.append(ruler);
  }

  private renderTrack(track: TimelineTrack): void {
    const row = document.createElement('div');
    row.className = 'timeline-track';
    const name = document.createElement('strong');
    name.textContent = track.name;
    row.append(name);
    for (let frame = 1; frame <= 48; frame++) row.append(this.createFrameCell(track, frame));
    this.elements.grid.append(row);
  }

  private createFrameCell(track: TimelineTrack, frame: number): HTMLButtonElement {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = this.getFrameClass(track, frame);
    cell.title = `Fotograma ${frame}`;
    cell.setAttribute('aria-label', `${track.name}, fotograma ${frame}`);
    cell.addEventListener('click', () => this.selectFrame(frame));
    cell.addEventListener('dblclick', () => this.toggleKeyframe(track, frame));
    return cell;
  }

  private getFrameClass(track: TimelineTrack, frame: number): string {
    const keyframe = track.keys.includes(frame) ? ' keyframe' : '';
    const current = Number(this.elements.current.value) === frame ? ' current-frame' : '';
    return `timeline-cell${keyframe}${current}`;
  }

  private selectFrame(frame: number): void {
    this.elements.current.value = String(frame);
    this.updateStatus();
    this.render();
  }

  private toggleKeyframe(track: TimelineTrack, frame: number): void {
    track.keys = track.keys.includes(frame)
      ? track.keys.filter((value) => value !== frame)
      : [...track.keys, frame].sort((a, b) => a - b);
    this.persist();
    this.render();
  }

  private updateStatus(): void {
    const frame = Math.max(1, Number(this.elements.current.value) || 1);
    const fps = Math.max(1, Number(this.elements.fps.value) || 24);
    this.elements.status.textContent = `Fotograma ${frame} · ${fps} FPS`;
  }

  private bindTrackActions(): void {
    this.root.querySelector('#timeline-add-track')?.addEventListener('click', () => this.addTrack());
  }

  private addTrack(): void {
    this.tracks.push({
      id: `track-${Date.now()}`,
      name: `Capa ${this.tracks.length + 1}`,
      keys: [Math.max(1, Number(this.elements.current.value) || 1)],
    });
    this.persist();
    this.render();
  }

  private bindFrameNavigation(): void {
    this.elements.current.addEventListener('change', () => {
      this.elements.current.value = String(Math.max(1, Math.min(9999, Number(this.elements.current.value) || 1)));
      this.render();
    });
    this.elements.fps.addEventListener('change', () => this.updateStatus());
    this.root.querySelector('#timeline-first')?.addEventListener('click', () => this.goToFrame(1));
    this.root.querySelector('#timeline-prev')?.addEventListener('click', () => this.goToFrame(Math.max(1, Number(this.elements.current.value) - 1)));
    this.root.querySelector('#timeline-next')?.addEventListener('click', () => this.goToFrame(Number(this.elements.current.value) + 1));
  }

  private goToFrame(frame: number): void {
    this.elements.current.value = String(frame);
    this.render();
  }

  private bindPlayback(): void {
    this.elements.play.addEventListener('click', () => this.togglePlayback());
  }

  private togglePlayback(): void {
    this.playing = !this.playing;
    this.elements.play.textContent = this.playing ? 'Ⅱ Pausar' : '▶ Reproducir';
    this.elements.status.textContent = this.playing
      ? 'Vista previa temporal activa (sin render de lienzo)'
      : `Fotograma ${this.elements.current.value} · ${this.elements.fps.value} FPS`;
    if (!this.playing) return;
    window.setTimeout(() => this.stopPlaybackPreview(), 500);
  }

  private stopPlaybackPreview(): void {
    this.playing = false;
    this.elements.play.textContent = '▶ Reproducir';
    this.updateStatus();
  }
}
