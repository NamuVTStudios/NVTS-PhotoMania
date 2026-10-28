import { bindComicSettings } from '../shared';
import type { AdvancedComicSettings, ToolAdvancedOptionsDefinition } from '../types';

export const ComicPanelToolOptions: ToolAdvancedOptionsDefinition = {
  render: ({ comicSettings: comic }) => renderComicOptions(comic),
  bind: (context) => bindComicSettings(context),
};

function renderComicOptions(comic: AdvancedComicSettings): string {
  return `<label class="advanced-setting">Modo<select id="advanced-comic-mode"><option value="frame" ${comic.mode === 'frame' ? 'selected' : ''}>Marco exterior</option><option value="panel" ${comic.mode === 'panel' ? 'selected' : ''}>Viñeta rectangular</option><option value="split" ${comic.mode === 'split' ? 'selected' : ''}>Cortar / dividir marco</option></select></label><label class="advanced-setting">Grosor del borde <output id="advanced-comic-border-value">${comic.borderWidth}px</output><input id="advanced-comic-border" type="range" min="1" max="20" value="${comic.borderWidth}"/></label><div id="advanced-comic-split-options" ${comic.mode !== 'split' ? 'hidden' : ''}><label class="advanced-setting">Líneas de corte<select id="advanced-comic-split-count"><option value="1" ${comic.splitLineCount === 1 ? 'selected' : ''}>1 línea</option><option value="2" ${comic.splitLineCount === 2 ? 'selected' : ''}>2 líneas paralelas</option></select></label><label class="advanced-setting">Distancia <output id="advanced-comic-split-distance-value">${comic.splitDistance}px</output><input id="advanced-comic-split-distance" type="range" min="4" max="240" value="${comic.splitDistance}" ${comic.splitLineCount !== 2 ? 'disabled' : ''}/></label></div><p class="hint">El modo viñeta crea una capa de dibujo recortada. El modo dividir crea una o dos líneas rectas entre los bordes del marco.</p>`;
}
