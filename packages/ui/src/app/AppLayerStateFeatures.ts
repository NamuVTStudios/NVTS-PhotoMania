// Editor state synchronization and layer UI.
import { AppComicFeatures } from './AppComicFeatures';
import { runEdit, type LayerNode } from '@nvts/document-model';
import { isPixelLayerType, type TextLayerStyle } from '@nvts/shared';
import { renderAdvancedToolOptionsPanel } from '../panels/AdvancedToolOptionsPanel';
import { renderHistoryPanel } from '../panels/HistoryPanel';
import { readPreferences } from '../panels/PreferencesPanel';
import { packNvtsPhoto, rememberRecentProject } from '@nvts/storage';
import type { Tool, TextToolSettings } from './AppBase';

export abstract class AppLayerStateFeatures extends AppComicFeatures {
  protected syncUI(): void {
      this.syncDocumentHeader();
      this.renderLayers();
      this.syncToolbarProps();
      this.updateHistoryUI();
      this.q('#status').textContent =
        `${this.renderer.kind === 'webgpu' ? 'WebGPU' : 'WebGL2'} · ${this.ctl.doc.width}×${this.ctl.doc.height}`;
    }

  protected syncDocumentHeader(): void {
      const { name, width, height } = this.ctl.doc;
      const title = this.root.querySelector<HTMLElement>('.doc-title');
      if (title?.firstChild) title.firstChild.textContent = `${name} `;
      const canvasName = this.root.querySelector<HTMLElement>('#canvas-name');
      if (canvasName) canvasName.textContent = name;
      const size = this.root.querySelector<HTMLElement>('#doc-size');
      if (size) size.textContent = `${width} × ${height}`;
      const meta = this.root.querySelector<HTMLElement>('#canvas-meta');
      if (meta) meta.textContent = `${width} × ${height} px · RGB/8`;
    }

  protected updateHistoryUI(): void {
      const list = this.root.querySelector<HTMLElement>('#history-list');
      const count = this.root.querySelector<HTMLElement>('#history-count');
      if (!list || !count) return;
      renderHistoryPanel(list, count, this.ctl.historyEntries.slice(0, 30), this.ctl.historyMemoryBytes);
      this.queueRecentSnapshot();
    }

  protected queueRecentSnapshot(): void {
      if (!this.ctl || !readPreferences().rememberRecentProjects) return;
      if (this.recentSaveTimer !== null) clearTimeout(this.recentSaveTimer);
      const doc = this.ctl.doc;
      let rasterLayers = 0;
      const countRaster = (nodes: LayerNode[]) => nodes.forEach((node) => { if (isPixelLayerType(node.type)) rasterLayers++; countRaster(node.children); });
      countRaster(doc.layers);
      // Evita copiar potencialmente cientos de MiB en cada pausa de edición; esos proyectos se guardan al pulsar Guardar.
      if (doc.width * doc.height * Math.max(1, rasterLayers) * 4 > 64 * 1024 * 1024) return;
      this.recentSaveTimer = setTimeout(() => {
        this.recentSaveTimer = null;
        const current = this.ctl;
        if (!readPreferences().rememberRecentProjects) return;
        try {
          const bytes = packNvtsPhoto(current.doc, (layer) => current.readPixels(layer));
          void rememberRecentProject(current.doc, bytes).catch((error) => console.warn('No se pudo actualizar el proyecto reciente:', error));
        } catch (error) {
          console.warn('No se pudo preparar la copia reciente:', error);
        }
      }, 1200);
    }

  protected syncToolbarProps(): void {
      const layer = this.ctl ? this.active() : undefined;
      this.syncLayerControlValues(layer);
      this.syncLayerActionAvailability(layer);
      this.syncToolAvailability(layer);
    }

  protected syncLayerControlValues(layer: LayerNode | undefined): void {
      const opacity = this.root.querySelector<HTMLInputElement>('#layer-opacity');
      const blend = this.root.querySelector<HTMLSelectElement>('#dock-blend');
      if (layer && opacity) opacity.value = String(Math.round(layer.opacity * 100));
      if (layer && blend) blend.value = layer.blendMode;
      this.updateLayerTypeButtons(layer);
      if (this.tool === 'text' && layer?.type === 'text') this.syncTextLayerSettings(layer);
    }

  protected updateLayerTypeButtons(layer: LayerNode | undefined): void {
      const fill = this.root.querySelector<HTMLButtonElement>('#l-fill-color');
      const filter = this.root.querySelector<HTMLButtonElement>('#l-filter-options');
      const vector = this.root.querySelector<HTMLButtonElement>('#l-vector-add');
      const text = this.root.querySelector<HTMLButtonElement>('#l-text-edit');
      if (fill) this.updateFillLayerButton(fill, layer);
      if (filter) filter.hidden = layer?.type !== 'filter';
      if (vector) vector.hidden = layer?.type !== 'vector';
      if (text) text.hidden = layer?.type !== 'text';
    }

  private updateFillLayerButton(button: HTMLButtonElement, layer: LayerNode | undefined): void {
    button.hidden = layer?.type !== 'fill';
    if (layer?.type !== 'fill') return;
    button.textContent = `Color ${layer.fillColor ?? '#ffffff'}…`;
  }

  protected syncTextLayerSettings(layer: LayerNode): void {
      if (layer.type !== 'text') return;
      this.textSettings = this.textSettingsFromLayer(layer);
      const settings = this.textSettings;
      const values: Array<[string, string]> = [
        ['#tool-text-font', settings.fontFamily],
        ['#tool-text-style', settings.style],
        ['#tool-text-size', String(settings.fontSize)],
        ['#tool-text-color', settings.color],
        ['#advanced-text-align', settings.align],
        ['#advanced-text-line-height', String(settings.lineHeight)],
        ['#advanced-text-letter-spacing', String(settings.letterSpacing)],
        ['#advanced-text-stroke-color', settings.strokeColor],
        ['#advanced-text-stroke-width', String(settings.strokeWidth)],
        ['#advanced-text-background', settings.backgroundColor],
      ];
      values.forEach(([selector, value]) => this.setInputValue(selector, value));
    }

  protected setInputValue(selector: string, value: string): void {
      const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
      if (input) input.value = value;
    }

  protected syncLayerActionAvailability(layer: LayerNode | undefined): void {
      const canUseVectorTool = layer?.type === 'vector'
        && !this.ctl.isEffectivelyLocked(layer.id)
        && this.ctl.isEffectivelyVisible(layer.id);
      const vectorTool = this.root.querySelector<HTMLButtonElement>('#rail-vector-select');
      if (vectorTool) vectorTool.disabled = !canUseVectorTool;
      const duplicate = this.root.querySelector<HTMLButtonElement>('#l-duplicate');
      const remove = this.root.querySelector<HTMLButtonElement>('#l-del');
      if (duplicate) duplicate.disabled = !layer;
      if (remove) remove.disabled = !layer;
    }

  protected syncToolAvailability(layer: LayerNode | undefined): void {
      const canUseActiveLayer = (tool: Tool): boolean => {
        if (!layer || !this.toolManager.canUseLayer(tool, layer.type)) return false;
        return this.ctl.isEffectivelyVisible(layer.id) && !this.ctl.isEffectivelyLocked(layer.id);
      };
      const canPaint = canUseActiveLayer('brush');
      const canUseVector = canUseActiveLayer('comic-panel');
      this.setToolButtonsDisabled(['#rail-brush', '#rail-eraser', '#rail-line', '#rail-rectangle', '#rail-ellipse', '#rail-fill', '#rail-clone-stamp'], !canPaint);
      this.setToolButtonsDisabled(['#advanced-brightness-down', '#advanced-brightness-up'], !canPaint);
      this.setToolButtonsDisabled(['#rail-eyedropper', '#rail-hand'], false);
      this.setToolButtonsDisabled(['#rail-vector-select', '#rail-comic-panel'], !canUseVector);
      const swatch = this.root.querySelector<HTMLElement>('#foreground-swatch');
      if (swatch) swatch.style.background = this.foregroundHex();
    }

  protected setToolButtonsDisabled(selectors: string[], disabled: boolean): void {
      selectors.forEach((selector) => {
        const button = this.root.querySelector<HTMLButtonElement>(selector);
        if (button) button.disabled = disabled;
      });
    }

  protected foregroundHex(): string {
      return `#${this.brush.rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
    }

  protected setForegroundHex(hex: string): void {
      if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
      this.brush.rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
      const colorInput = this.root.querySelector<HTMLInputElement>('#tool-color');
      if (colorInput) colorInput.value = hex;
      const swatch = this.root.querySelector<HTMLElement>('#foreground-swatch');
      if (swatch) swatch.style.background = hex;
    }

  protected renderToolOptions(): void {
      this.prepareToolOptions();
      this.mountToolOptions(this.q<HTMLElement>('#toolbar'));
      this.refreshToolOptionsView();
    }

  protected prepareToolOptions(): void {
      const selectedText = this.active();
      if (this.tool === 'text' && selectedText?.type === 'text') {
        this.textSettings = this.textSettingsFromLayer(selectedText);
      }
      const labels: Record<Tool, string> = {
        brush: 'Pincel', eraser: 'Borrador', eyedropper: 'Cuentagotas', line: 'Línea',
        rectangle: 'Rectángulo', ellipse: 'Elipse', fill: 'Relleno', hand: 'Mover lienzo',
        text: 'Texto', 'vector-select': 'Selección vectorial',
        'clone-stamp': 'Tampón de clonar', 'comic-panel': 'Marco y viñetas',
      };
      this.q<HTMLElement>('#tool-current-label').textContent = labels[this.tool];
    }

  protected mountToolOptions(host: HTMLElement): void {
      host.innerHTML = this.createToolOptionsMarkup();
      this.bindToolOptionEvents(host);
    }

  protected createToolOptionsMarkup(): string {
    const fields = this.createCommonToolFields();
    const fontOptions = this.createFontOptions();
    return this.createToolSpecificOptions(fields, fontOptions);
  }

  private createCommonToolFields(): { color: string; size: string; opacity: string } {
    const color = `<label class="tool-setting">Color <input id="tool-color" type="color" value="${this.foregroundHex()}" /></label>`;
    const sizeLabel = this.tool === 'line' || this.tool === 'rectangle' || this.tool === 'ellipse' ? 'Grosor' : 'Tamaño';
    const size = `<label class="tool-setting">${sizeLabel} <input id="tool-size" type="range" min="1" max="256" value="${this.brush.size}" /><output id="tool-size-value">${this.brush.size}px</output></label>`;
    const opacity = `<label class="tool-setting">Opacidad <input id="tool-opacity" type="range" min="1" max="100" value="${this.brush.opacity}" /><output id="tool-opacity-value">${this.brush.opacity}%</output></label>`;
    return { color, size, opacity };
  }

  private createFontOptions(): string {
    return ['Arial','Inter','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS','Courier New','monospace','serif','sans-serif']
      .map((name) => this.createFontOption(name)).join('');
  }

  private createFontOption(name: string): string {
    const selected = this.textSettings.fontFamily === name ? 'selected' : '';
    return `<option value="${name}" ${selected}>${name}</option>`;
  }

  private createToolSpecificOptions(fields: { color: string; size: string; opacity: string }, fontOptions: string): string {
    if (this.tool === 'brush') return `${fields.color}${fields.size}${fields.opacity}`;
    if (this.tool === 'clone-stamp') return this.createCloneStampToolMarkup(fields);
    if (this.tool === 'comic-panel') return this.createComicToolMarkup();
    if (this.tool === 'eraser') return `${fields.size}${fields.opacity}`;
    if (this.tool === 'line') return `${fields.color}${fields.size}${fields.opacity}`;
    if (this.tool === 'rectangle' || this.tool === 'ellipse') return this.createShapeToolMarkup(fields);
    if (this.tool === 'fill') return this.createFillToolMarkup(fields.color);
    if (this.tool === 'text') return this.createTextToolMarkup(fontOptions);
    if (this.tool === 'eyedropper') return '<span class="tool-help">Hacé clic en el lienzo para tomar un color.</span>';
    if (this.tool === 'vector-select') return '<span class="tool-help">Seleccioná un objeto vectorial; arrastralo para moverlo o usá el control inferior derecho para cambiar su tamaño.</span>';
    return '<span class="tool-help">Arrastrá el lienzo para desplazarte. Usá − / + o la rueda con Ctrl para cambiar el zoom.</span>';
  }

  private createCloneStampToolMarkup(fields: { size: string; opacity: string }): string {
    return `${fields.size}${fields.opacity}<span class="tool-help">Alt + clic para definir el origen; después arrastrá para copiar píxeles desde ese punto.</span>`;
  }

  private createComicToolMarkup(): string {
    const frameSelected = this.comicToolMode === 'frame' ? 'selected' : '';
    const panelSelected = this.comicToolMode === 'panel' ? 'selected' : '';
    const splitSelected = this.comicToolMode === 'split' ? 'selected' : '';
    const splitHidden = this.comicToolMode !== 'split' ? 'hidden' : '';
    const singleSelected = this.comicSplitLineCount === 1 ? 'selected' : '';
    const doubleSelected = this.comicSplitLineCount === 2 ? 'selected' : '';
    return `<label class="tool-setting">Tipo <select id="comic-tool-mode"><option value="frame" ${frameSelected}>Marco exterior</option><option value="panel" ${panelSelected}>Viñeta rectangular</option><option value="split" ${splitSelected}>Cortar / dividir marco</option></select></label><label class="tool-setting">Grosor del borde <input id="comic-border-width" type="range" min=1 max=20 value="${this.comicBorderWidth}"/><output id="comic-border-value">${this.comicBorderWidth}px</output></label><div class="comic-split-options" ${splitHidden}><label class="tool-setting">Líneas de corte <select id="comic-split-line-count"><option value="1" ${singleSelected}>1 línea</option><option value="2" ${doubleSelected}>2 líneas paralelas</option></select></label><label class="tool-setting">Distancia <input id="comic-split-distance" type="range" min="4" max="240" step="1" value="${this.comicSplitDistance}"/><output id="comic-split-distance-value">${this.comicSplitDistance}px</output></label></div><span class="tool-help">Viñeta rectangular: arrastrá para crear un panel y su capa de dibujo recortada. Cortar/dividir: dibujá un trazo libre desde un borde del marco hasta otro; podés crear una o dos divisiones paralelas. Si el marco exterior ocupa toda la página, sus bordes se abren en los puntos de unión. El dibujo de las capas de viñeta queda limitado a sus bordes.</span>`;
  }

  private createShapeToolMarkup(fields: { color: string; size: string; opacity: string }): string {
    const checked = this.brush.shapeFill ? 'checked' : '';
    return `${fields.color}${fields.size}${fields.opacity}<label class="tool-setting tool-check"><input id="tool-shape-fill" type="checkbox" ${checked}/> Rellenar figura</label>`;
  }

  private createFillToolMarkup(color: string): string {
    return `${color}<label class="tool-setting">Tolerancia <input id="tool-tolerance" type="range" min="0" max="255" value="${this.brush.tolerance}"/><output id="tool-tolerance-value">${this.brush.tolerance}</output></label><label class="tool-setting">Opacidad <input id="tool-opacity" type="range" min="1" max="100" value="${this.brush.opacity}"/><output id="tool-opacity-value">${this.brush.opacity}%</output></label>`;
  }

  protected createTextToolMarkup(fontOptions: string): string {
      const settings = this.textSettings;
      const styles: Array<[TextLayerStyle, string]> = [
        ['normal', 'Normal'], ['bold', 'Negrita'], ['italic', 'Cursiva'], ['bold-italic', 'Negrita cursiva'],
      ];
      const styleOptions = styles.map(([value, label]) =>
        `<option value="${value}" ${settings.style === value ? 'selected' : ''}>${label}</option>`).join('');
      return `<label class="tool-setting">Fuente <select id="tool-text-font">${fontOptions}</select></label><label class="tool-setting">Estilo <select id="tool-text-style">${styleOptions}</select></label><label class="tool-setting">Tamaño <input id="tool-text-size" type="number" min="1" max="1000" value="${settings.fontSize}"/></label><label class="tool-setting">Color <input id="tool-text-color" type="color" value="${settings.color}"/></label>`;
    }

  protected bindToolOptionEvents(host: HTMLElement): void {
      this.bindBrushToolControls(host);
      this.bindFillToolControls(host);
      this.bindTextToolControls(host);
      this.bindComicToolControls(host);
    }

  protected bindBrushToolControls(host: HTMLElement): void {
      const color = host.querySelector<HTMLInputElement>('#tool-color');
      if (color) color.oninput = () => this.setForegroundHex(color.value);
      const size = host.querySelector<HTMLInputElement>('#tool-size');
      if (size) size.oninput = () => {
        this.brush.size = Number(size.value);
        this.updateToolOutput(host, '#tool-size-value', `${this.brush.size}px`);
      };
      const opacity = host.querySelector<HTMLInputElement>('#tool-opacity');
      if (opacity) opacity.oninput = () => {
        this.brush.opacity = Number(opacity.value);
        this.updateToolOutput(host, '#tool-opacity-value', `${this.brush.opacity}%`);
      };
    }

  protected bindFillToolControls(host: HTMLElement): void {
      const shapeFill = host.querySelector<HTMLInputElement>('#tool-shape-fill');
      if (shapeFill) shapeFill.onchange = () => { this.brush.shapeFill = shapeFill.checked; };
      const tolerance = host.querySelector<HTMLInputElement>('#tool-tolerance');
      if (tolerance) tolerance.oninput = () => {
        this.brush.tolerance = Number(tolerance.value);
        this.updateToolOutput(host, '#tool-tolerance-value', tolerance.value);
      };
    }

  protected bindComicToolControls(host: HTMLElement): void {
      const mode = host.querySelector<HTMLSelectElement>('#comic-tool-mode');
      if (mode) mode.onchange = () => {
        this.comicToolMode = mode.value === 'panel' || mode.value === 'split' ? mode.value : 'frame';
        this.syncComicSplitControls(host);
      };
      const lineCount = host.querySelector<HTMLSelectElement>('#comic-split-line-count');
      if (lineCount) lineCount.onchange = () => {
        this.comicSplitLineCount = lineCount.value === '2' ? 2 : 1;
        this.syncComicSplitControls(host);
      };
      const distance = host.querySelector<HTMLInputElement>('#comic-split-distance');
      if (distance) distance.oninput = () => {
        this.comicSplitDistance = Math.max(4, Math.min(240, Number(distance.value) || 48));
        this.updateToolOutput(host, '#comic-split-distance-value', `${this.comicSplitDistance}px`);
      };
      this.syncComicSplitControls(host);
      const width = host.querySelector<HTMLInputElement>('#comic-border-width');
      if (width) width.oninput = () => {
        this.comicBorderWidth = Math.max(1, Math.min(20, Number(width.value) || 5));
        this.updateToolOutput(host, '#comic-border-value', `${this.comicBorderWidth}px`);
      };
    }

  protected syncComicSplitControls(host: HTMLElement): void {
      const options = host.querySelector<HTMLElement>('.comic-split-options');
      options?.toggleAttribute('hidden', this.comicToolMode !== 'split');
      const distance = host.querySelector<HTMLInputElement>('#comic-split-distance');
      if (distance) distance.disabled = this.comicSplitLineCount !== 2;
    }

  protected bindTextToolControls(host: HTMLElement): void {
      const font = host.querySelector<HTMLSelectElement>('#tool-text-font');
      if (font) font.onchange = () => {
        this.textSettings.fontFamily = font.value;
        this.applyTextSettingsToSelectedLayer();
      };
      const style = host.querySelector<HTMLSelectElement>('#tool-text-style');
      if (style) style.onchange = () => {
        this.textSettings.style = style.value as TextLayerStyle;
        this.applyTextSettingsToSelectedLayer();
      };
      const fontSize = host.querySelector<HTMLInputElement>('#tool-text-size');
      if (fontSize) fontSize.onchange = () => {
        this.textSettings.fontSize = Math.max(1, Math.min(1000, Number(fontSize.value) || 64));
        fontSize.value = String(this.textSettings.fontSize);
        this.applyTextSettingsToSelectedLayer();
      };
      const textColor = host.querySelector<HTMLInputElement>('#tool-text-color');
      if (textColor) textColor.onchange = () => {
        this.textSettings.color = textColor.value;
        this.applyTextSettingsToSelectedLayer();
      };
    }

  protected updateToolOutput(host: HTMLElement, selector: string, value: string): void {
      const output = host.querySelector<HTMLOutputElement>(selector);
      if (output) output.value = value;
    }

  protected refreshToolOptionsView(): void {
      this.updateSelectedToolButton();
      this.updateToolCursor();
      this.syncToolbarProps();
    }

  protected updateSelectedToolButton(): void {
      const toolButtons: Record<Tool, string> = {
        hand: '#rail-hand', brush: '#rail-brush', eraser: '#rail-eraser', line: '#rail-line',
        rectangle: '#rail-rectangle', ellipse: '#rail-ellipse', fill: '#rail-fill',
        eyedropper: '#rail-eyedropper', text: '#rail-text', 'vector-select': '#rail-vector-select',
        'clone-stamp': '#rail-clone-stamp', 'comic-panel': '#rail-comic-panel',
      };
      Object.values(toolButtons).forEach((selector) => this.root.querySelector<HTMLElement>(selector)?.classList.remove('selected'));
      this.root.querySelector<HTMLElement>(toolButtons[this.tool])?.classList.add('selected');
    }

  protected updateToolCursor(): void {
      const cursors: Record<Tool, string> = {
        hand: 'grab', eyedropper: 'copy', text: 'text', 'vector-select': 'default',
        brush: 'crosshair', eraser: 'crosshair', line: 'crosshair', rectangle: 'crosshair',
        ellipse: 'crosshair', fill: 'crosshair', 'clone-stamp': 'crosshair', 'comic-panel': 'crosshair',
      };
      this.canvas.style.cursor = cursors[this.tool];
    }

  protected renderAdvancedToolOptions(): void {
      renderAdvancedToolOptionsPanel(
        this.q<HTMLElement>('#advanced-tool-options'),
        this.tool,
        this.brush,
        this.textSettings,
        {
          adjustActiveLayerBrightness: (delta) => this.adjustActiveLayerBrightness(delta),
          applyTextSettingsToSelectedLayer: () => this.applyTextSettingsToSelectedLayer(),
          editVectorLayer: () => { const layer = this.active(); if (layer?.type === 'vector') this.editVectorLayer(layer); },
        },
      );
    }

  protected textSettingsFromLayer(layer: LayerNode): TextToolSettings {
      return {
        fontFamily: layer.textFontFamily ?? 'Arial', fontSize: layer.textFontSize ?? 64, style: layer.textStyle ?? 'normal', color: layer.textColor ?? '#e03030',
        align: layer.textAlign ?? 'left', lineHeight: layer.textLineHeight ?? 1.2, letterSpacing: layer.textLetterSpacing ?? 0,
        strokeColor: layer.textStrokeColor ?? '#000000', strokeWidth: layer.textStrokeWidth ?? 0, backgroundColor: layer.textBackgroundColor ?? 'transparent',
      };
    }

  protected textLayerPatch(content: string, x: number, y: number, settings: TextToolSettings): Pick<LayerNode, 'textContent' | 'textX' | 'textY' | 'textFontFamily' | 'textFontSize' | 'textColor' | 'textStyle' | 'textAlign' | 'textLineHeight' | 'textLetterSpacing' | 'textStrokeColor' | 'textStrokeWidth' | 'textBackgroundColor'> {
      return { textContent: content, textX: x, textY: y, textFontFamily: settings.fontFamily, textFontSize: settings.fontSize, textColor: settings.color, textStyle: settings.style, textAlign: settings.align, textLineHeight: settings.lineHeight, textLetterSpacing: settings.letterSpacing, textStrokeColor: settings.strokeColor, textStrokeWidth: settings.strokeWidth, textBackgroundColor: settings.backgroundColor };
    }

  protected rasterizeText(content: string, x: number, y: number, settings: TextToolSettings): Uint8Array {
      const canvas = this.createTextCanvas();
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('No se pudo preparar el contenido de texto.');
      this.drawTextContent(ctx, content, x, y, settings);
      return new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
    }

  protected createTextCanvas(): HTMLCanvasElement {
      const canvas = document.createElement('canvas');
      canvas.width = this.ctl.doc.width;
      canvas.height = this.ctl.doc.height;
      return canvas;
    }

  protected drawTextContent(
      ctx: CanvasRenderingContext2D,
      content: string,
      x: number,
      y: number,
      settings: TextToolSettings,
    ): void {
      const layout = this.prepareTextLayout(ctx, content, settings);
      this.drawTextBackground(ctx, x, y, settings, layout);
      this.drawTextLines(ctx, layout.lines, x, y, settings, layout.lineHeight);
    }

  protected prepareTextLayout(
      ctx: CanvasRenderingContext2D,
      content: string,
      settings: TextToolSettings,
    ): { lines: string[]; maxWidth: number; lineHeight: number; totalHeight: number } {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      const fontWeight = settings.style === 'bold' || settings.style === 'bold-italic' ? 'bold' : 'normal';
      const fontStyle = settings.style === 'italic' || settings.style === 'bold-italic' ? 'italic' : 'normal';
      ctx.font = `${fontStyle} ${fontWeight} ${Math.max(1, settings.fontSize)}px "${settings.fontFamily.replace(/["\\]/g, '')}"`;
      ctx.textBaseline = 'top';
      ctx.textAlign = settings.align;
      const spacingCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
      if ('letterSpacing' in spacingCtx) spacingCtx.letterSpacing = `${settings.letterSpacing}px`;
      const lines = content.split('\n');
      const measuredWidths = lines.map((line) => ctx.measureText(line).width + Math.max(0, line.length - 1) * settings.letterSpacing);
      const maxWidth = Math.max(1, ...measuredWidths);
      const lineHeight = settings.fontSize * settings.lineHeight;
      return { lines, maxWidth, lineHeight, totalHeight: Math.max(settings.fontSize, lines.length * lineHeight) };
    }

  protected drawTextBackground(
      ctx: CanvasRenderingContext2D,
      x: number,
      y: number,
      settings: TextToolSettings,
      layout: { maxWidth: number; totalHeight: number },
    ): void {
      const background = settings.backgroundColor;
      if (!background || background === 'transparent') return;
      const rectX = this.getTextBackgroundX(x, settings.align, layout.maxWidth);
      ctx.fillStyle = background;
      ctx.fillRect(rectX - 6, y - 4, layout.maxWidth + 12, layout.totalHeight + 8);
    }

  private getTextBackgroundX(x: number, align: TextToolSettings['align'], width: number): number {
    if (align === 'left') return x;
    if (align === 'center') return x - width / 2;
    return x - width;
  }

  protected drawTextLines(
      ctx: CanvasRenderingContext2D,
      lines: string[],
      x: number,
      y: number,
      settings: TextToolSettings,
      lineHeight: number,
    ): void {
      ctx.lineJoin = 'round';
      ctx.lineWidth = settings.strokeWidth;
      ctx.strokeStyle = settings.strokeColor;
      ctx.fillStyle = settings.color;
      lines.forEach((line, index) => {
        const lineY = y + index * lineHeight;
        if (settings.strokeWidth > 0) ctx.strokeText(line, x, lineY);
        ctx.fillText(line, x, lineY);
      });
    }

  protected async createTextAt(point: { x: number; y: number }, existing?: LayerNode): Promise<void> {
      if (existing && (existing.type !== 'text' || this.ctl.isEffectivelyLocked(existing.id))) return;
      const currentSettings = existing ? this.textSettingsFromLayer(existing) : { ...this.textSettings };
      const content = prompt(existing ? 'Editar texto de la capa' : 'Texto nuevo (podés usar saltos de línea)', existing?.textContent ?? 'Nuevo texto');
      if (content === null || !content.length) return;
      try {
        this.writeTextLayerContent(point, content, existing, currentSettings);
        this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
        this.q<HTMLElement>('#status').textContent = 'Texto actualizado en su propia capa editable.';
      } catch (error) { this.fail(error); }
    }

  protected writeTextLayerContent(
      point: { x: number; y: number },
      content: string,
      existing: LayerNode | undefined,
      settings: TextToolSettings,
    ): void {
      if (existing) {
        const x = existing.textX ?? point.x;
        const y = existing.textY ?? point.y;
        const pixels = this.rasterizeText(content, x, y, settings);
        this.ctl.replaceTextContent(existing.id, this.textLayerPatch(content, x, y, settings), pixels);
        this.activeId = existing.id;
        return;
      }
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      const layer = this.ctl.addLayer('text', content.split('\n')[0].slice(0, 48) || 'Texto');
      this.activeId = layer.id;
      const pixels = this.rasterizeText(content, x, y, settings);
      this.ctl.replaceTextContent(layer.id, this.textLayerPatch(content, x, y, settings), pixels);
    }

  protected applyTextSettingsToSelectedLayer(): void {
      const layer = this.active();
      if (!layer || layer.type !== 'text' || this.ctl.isEffectivelyLocked(layer.id) || !layer.textContent) return;
      try {
        const settings = { ...this.textSettings };
        const x = layer.textX ?? 0, y = layer.textY ?? 0;
        const pixels = this.rasterizeText(layer.textContent, x, y, settings);
        this.ctl.replaceTextContent(layer.id, this.textLayerPatch(layer.textContent, x, y, settings), pixels);
        this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
      } catch (error) { this.fail(error); }
    }

  protected adjustActiveLayerBrightness(delta: number): void {
      const layer = this.active();
      if (!layer || (layer.type !== 'paint' && layer.type !== 'raster') || this.ctl.isEffectivelyLocked(layer.id) || !this.ctl.isEffectivelyVisible(layer.id)) {
        this.q<HTMLElement>('#status').textContent = 'Seleccioná una capa de pintura visible y desbloqueada para ajustar el brillo.';
        return;
      }
      try {
        runEdit(this.ctx, layer.engineId, 'Brillo', (pixels) => pixels.applyBrightness(delta));
        this.ctl.comp.invalidateAll();
        this.syncUI(); this.updateHistoryUI(); this.scheduleRefresh();
        this.q<HTMLElement>('#status').textContent = delta < 0 ? 'Brillo de la capa reducido.' : 'Brillo de la capa aumentado.';
      } catch (error) {
        this.q<HTMLElement>('#status').textContent = error instanceof Error ? error.message : String(error);
      }
    }

  protected applyCanvasView(): void {
      this.canvas.style.transformOrigin = 'center center';
      this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
      // Aumenta la resolución interna al hacer zoom, para que el lienzo no se vea borroso al ampliarlo.
      const renderScale = String(Math.min(4, Math.max(1, this.zoom)));
      const scaleChanged = this.canvas.dataset.renderScale !== renderScale;
      this.canvas.dataset.renderScale = renderScale;
      if (scaleChanged && this.ctl) this.renderer.render();
      const label = this.root.querySelector<HTMLElement>('#zoom-value');
      if (label) label.textContent = this.getZoomLabel();
      this.canvas.style.cursor = this.getCanvasCursor();
    }

  private getZoomLabel(): string {
    if (Math.abs(this.zoom - 1) < 0.005) return 'Ajustar';
    return `${Math.round(this.zoom * 100)}%`;
  }

  private getCanvasCursor(): string {
    if (this.isPanning) return 'grabbing';
    if (this.tool === 'hand') return 'grab';
    if (this.tool === 'eyedropper') return 'copy';
    return 'crosshair';
  }

  protected updatePreviewCanvasSize(): void {
      const preview = this.root.querySelector<HTMLCanvasElement>('#tool-preview');
      if (!preview) return;
      const rect = preview.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (preview.width !== width) preview.width = width;
      if (preview.height !== height) preview.height = height;
    }

  protected clearToolPreview(): void {
      const preview = this.root.querySelector<HTMLCanvasElement>('#tool-preview');
      if (!preview) return;
      const ctx = preview.getContext('2d');
      if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, preview.width, preview.height); }
    }
}
