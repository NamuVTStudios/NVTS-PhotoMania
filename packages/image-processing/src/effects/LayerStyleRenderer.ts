import type { BlendMode, LayerStyleBevelEmboss, LayerStyleColorOverlay, LayerStyleDropShadow, LayerStyleInnerGlow, LayerStyleOuterGlow, LayerStylePatternOverlay, LayerStyleSatin, LayerStyles } from '@nvts/shared';

interface LayerStyleCanvases {
  source: HTMLCanvasElement;
  alphaMask: HTMLCanvasElement;
  effect: HTMLCanvasElement;
  bevel: HTMLCanvasElement;
}

interface RgbaColor { red: number; green: number; blue: number }

const CANVAS_CACHE = new WeakMap<HTMLCanvasElement, LayerStyleCanvases>();
const STROKE_DIRECTIONS = 16;

const CANVAS_BLEND_MODES: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
};

function toCanvasBlendMode(mode: BlendMode): GlobalCompositeOperation {
  return CANVAS_BLEND_MODES[mode];
}

export function hasEnabledLayerStyles(styles?: LayerStyles): boolean {
  if (!styles) return false;
  return getStrokeInstances(styles).some((stroke) => stroke.enabled) || getOuterGlowInstances(styles).some((effect) => effect.enabled) || getDropShadowInstances(styles).some((effect) => effect.enabled) || getBevelInstances(styles).some((effect) => effect.enabled) || [styles.gradientOverlay, ...(styles.gradientOverlays ?? [])].some((effect) => effect?.enabled) || [styles.innerShadow, ...(styles.innerShadows ?? [])].some((effect) => effect?.enabled) || [styles.innerGlow, ...(styles.innerGlows ?? [])].some((effect) => effect?.enabled) || [styles.satin, ...(styles.satins ?? [])].some((effect) => effect?.enabled) || [styles.colorOverlay, ...(styles.colorOverlays ?? [])].some((effect) => effect?.enabled) || [styles.patternOverlay, ...(styles.patternOverlays ?? [])].some((effect) => effect?.enabled);
}

export function getLayerStylePadding(styles?: LayerStyles): number {
  if (!styles) return 0;
  return Math.max(
    getStrokePadding(styles),
    getGlowPadding(styles),
    getShadowPadding(styles),
    getBevelPadding(styles),
    ...[styles.innerShadow, ...(styles.innerShadows ?? [])].filter((effect) => effect.enabled).map((effect) => Math.ceil(effect.size * 2 + effect.distance + 2)),
    ...[styles.innerGlow, ...(styles.innerGlows ?? [])].filter((effect) => effect.enabled).map((effect) => Math.ceil(effect.size * 2 + 2)),
  );
}

function getStrokeInstances(styles: LayerStyles): LayerStyles['stroke'][] {
  return [styles.stroke, ...(styles.strokes ?? [])];
}

function getOuterGlowInstances(styles: LayerStyles): LayerStyles['outerGlow'][] {
  return [styles.outerGlow, ...(styles.outerGlows ?? [])];
}

function getDropShadowInstances(styles: LayerStyles): LayerStyles['dropShadow'][] {
  return [styles.dropShadow, ...(styles.dropShadows ?? [])];
}

function getBevelInstances(styles: LayerStyles): LayerStyles['bevelEmboss'][] {
  return [styles.bevelEmboss, ...(styles.bevelEmbosses ?? [])];
}

function renderStrokeStack(target: HTMLCanvasElement, resources: LayerStyleCanvases, strokes: LayerStyles['stroke'][]): void {
  strokes.forEach((stroke) => renderStroke(target, resources, stroke));
}

function getStrokePadding(styles: LayerStyles): number {
  return getStrokeInstances(styles).reduce((padding, stroke) => stroke.enabled ? padding + Math.ceil(stroke.size + 2) : padding, 0);
}

function getGlowPadding(styles: LayerStyles): number {
  return getOuterGlowInstances(styles).reduce((padding, effect) => effect.enabled ? Math.max(padding, Math.ceil(effect.size * 3)) : padding, 0);
}

function getShadowPadding(styles: LayerStyles): number {
  return getDropShadowInstances(styles).reduce((padding, effect) => effect.enabled ? Math.max(padding, Math.ceil(effect.size * 3 + effect.distance + 2)) : padding, 0);
}

function getBevelPadding(styles: LayerStyles): number {
  return getBevelInstances(styles).reduce((padding, effect) => effect.enabled ? Math.max(padding, Math.ceil(effect.size + 2)) : padding, 0);
}

/** Renders all enabled effects into a preview surface; original layer pixels remain unchanged. */
export function applyLayerStyles(canvas: HTMLCanvasElement, styles?: LayerStyles): void {
  if (!hasEnabledLayerStyles(styles)) return;
  const source = getLayerStyleCanvases(canvas);
  copyCanvas(canvas, source.source);
  createAlphaMask(source.source, source.alphaMask);
  clearCanvas(canvas);
  getDropShadowInstances(styles!).forEach((effect) => renderDropShadow(canvas, source, effect));
  getOuterGlowInstances(styles!).forEach((effect) => renderOuterGlow(canvas, source, effect));
  renderStrokeStack(canvas, source, getStrokeInstances(styles!));
  drawSourceOver(canvas, source.source);
  getBevelInstances(styles!).forEach((effect) => renderBevel(canvas, source, effect));
  [styles!.gradientOverlay, ...(styles!.gradientOverlays ?? [])].forEach((effect) => renderGradientOverlay(canvas, source, effect));
  [styles!.colorOverlay, ...(styles!.colorOverlays ?? [])].forEach((effect) => renderColorOverlay(canvas, source, effect));
  [styles!.patternOverlay, ...(styles!.patternOverlays ?? [])].forEach((effect) => renderPatternOverlay(canvas, source, effect));
  [styles!.innerGlow, ...(styles!.innerGlows ?? [])].forEach((effect) => renderInnerGlow(canvas, source, effect));
  [styles!.satin, ...(styles!.satins ?? [])].forEach((effect) => renderSatin(canvas, source, effect));
  [styles!.innerShadow, ...(styles!.innerShadows ?? [])].forEach((effect) => renderInnerShadow(canvas, source, effect));
}

function renderGradientOverlay(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyles['gradientOverlay']): void {
  if (!style.enabled || style.opacity <= 0) return;
  const overlay = resources.effect; const context = contextOf(overlay); clearCanvas(overlay);
  const radians = style.angle * Math.PI / 180; const cx = overlay.width / 2; const cy = overlay.height / 2;
  const span = Math.hypot(overlay.width, overlay.height) / 2;
  const gradient = context.createLinearGradient(cx - Math.cos(radians) * span, cy - Math.sin(radians) * span, cx + Math.cos(radians) * span, cy + Math.sin(radians) * span);
  gradient.addColorStop(0, style.startColor); gradient.addColorStop(1, style.endColor);
  context.fillStyle = gradient; context.globalAlpha = style.opacity; context.fillRect(0, 0, overlay.width, overlay.height); context.globalAlpha = 1;
  context.globalCompositeOperation = 'destination-in'; context.drawImage(resources.alphaMask, 0, 0); context.globalCompositeOperation = 'source-over';
  contextOf(target).drawImage(overlay, 0, 0);
}


function renderColorOverlay(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyleColorOverlay): void {
  if (!style.enabled || style.opacity <= 0) return;
  const overlay = resources.effect;
  const context = contextOf(overlay);
  clearCanvas(overlay);
  context.fillStyle = style.color;
  context.fillRect(0, 0, overlay.width, overlay.height);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(resources.alphaMask, 0, 0);
  context.globalCompositeOperation = 'source-over';
  const targetContext = contextOf(target);
  targetContext.save();
  targetContext.globalAlpha = style.opacity;
  targetContext.globalCompositeOperation = toCanvasBlendMode(style.blendMode);
  targetContext.drawImage(overlay, 0, 0);
  targetContext.restore();
}

function renderPatternOverlay(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStylePatternOverlay): void {
  if (!style.enabled || style.opacity <= 0) return;
  const overlay = resources.effect;
  const context = contextOf(overlay);
  clearCanvas(overlay);
  const tile = createPatternTile(style);
  const pattern = context.createPattern(tile, 'repeat');
  if (!pattern) return;
  const span = Math.hypot(overlay.width, overlay.height);
  context.save();
  context.translate(overlay.width / 2, overlay.height / 2);
  context.rotate(style.angle * Math.PI / 180);
  context.fillStyle = pattern;
  context.globalAlpha = style.opacity;
  context.fillRect(-span, -span, span * 2, span * 2);
  context.restore();
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(resources.alphaMask, 0, 0);
  context.globalCompositeOperation = 'source-over';
  const targetContext = contextOf(target);
  targetContext.save();
  targetContext.globalCompositeOperation = toCanvasBlendMode(style.blendMode);
  targetContext.drawImage(overlay, 0, 0);
  targetContext.restore();
}

function createPatternTile(style: LayerStylePatternOverlay): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  const size = Math.max(6, Math.min(96, Math.round(24 * style.scale / 100)));
  tile.width = size;
  tile.height = size;
  const context = contextOf(tile);
  context.fillStyle = style.backgroundColor;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = style.color;
  context.fillStyle = style.color;
  context.lineWidth = Math.max(1, size / 12);
  if (style.pattern === 'dots') {
    context.beginPath();
    context.arc(size / 2, size / 2, Math.max(1, size / 10), 0, Math.PI * 2);
    context.fill();
  }
  if (style.pattern === 'checkerboard') {
    context.fillRect(0, 0, size / 2, size / 2);
    context.fillRect(size / 2, size / 2, size / 2, size / 2);
  }
  if (style.pattern === 'grid') {
    context.beginPath();
    context.moveTo(0, 0); context.lineTo(0, size); context.moveTo(size / 2, 0); context.lineTo(size / 2, size);
    context.moveTo(0, 0); context.lineTo(size, 0); context.moveTo(0, size / 2); context.lineTo(size, size / 2);
    context.stroke();
  }
  if (style.pattern === 'diagonal' || style.pattern === 'crosshatch') {
    drawDiagonalPattern(context, size, style.pattern);
  }
  return tile;
}

function drawDiagonalPattern(
  context: CanvasRenderingContext2D,
  size: number,
  pattern: LayerStylePatternOverlay['pattern'],
): void {
  context.beginPath();
  context.moveTo(-size / 2, size / 2); context.lineTo(size / 2, -size / 2);
  context.moveTo(0, size); context.lineTo(size, 0);
  context.moveTo(size / 2, size * 1.5); context.lineTo(size * 1.5, size / 2);
  if (pattern === 'crosshatch') drawCrosshatchLines(context, size);
  context.stroke();
}

function drawCrosshatchLines(context: CanvasRenderingContext2D, size: number): void {
  context.moveTo(-size / 2, size / 2); context.lineTo(size / 2, size * 1.5);
  context.moveTo(0, 0); context.lineTo(size, size);
  context.moveTo(size / 2, -size / 2); context.lineTo(size * 1.5, size / 2);
}

function renderInnerGlow(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyleInnerGlow): void {
  if (!style.enabled || style.opacity <= 0 || style.size <= 0) return;
  const effect = resources.effect;
  const context = contextOf(effect);
  clearCanvas(effect);
  context.filter = `blur(${Math.max(0.5, style.size / 2)}px)`;
  context.drawImage(resources.alphaMask, 0, 0);
  context.filter = 'none';
  const blurred = context.getImageData(0, 0, effect.width, effect.height);
  const source = contextOf(resources.alphaMask).getImageData(0, 0, effect.width, effect.height);
  const output = context.createImageData(effect.width, effect.height);
  const color = parseHexColor(style.color);
  const threshold = style.choke * 2.55;
  for (let index = 0; index < source.data.length; index += 4) {
    writeInnerGlowPixel(output.data, index, source.data[index + 3], blurred.data[index + 3], color, style.opacity, threshold);
  }
  context.putImageData(output, 0, 0);
  contextOf(target).drawImage(effect, 0, 0);
}

function writeInnerGlowPixel(
  output: Uint8ClampedArray,
  index: number,
  sourceAlpha: number,
  blurredAlpha: number,
  color: RgbaColor,
  opacity: number,
  threshold: number,
): void {
  if (sourceAlpha === 0) return;
  const edge = Math.max(0, sourceAlpha - blurredAlpha - threshold);
  const alpha = Math.round(edge * opacity);
  if (alpha === 0) return;
  output[index] = color.red;
  output[index + 1] = color.green;
  output[index + 2] = color.blue;
  output[index + 3] = alpha;
}

function renderSatin(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyleSatin): void {
  if (!style.enabled || style.opacity <= 0) return;
  const width = resources.alphaMask.width;
  const height = resources.alphaMask.height;
  const alpha = contextOf(resources.alphaMask).getImageData(0, 0, width, height).data;
  const effect = resources.effect;
  const context = contextOf(effect);
  const output = context.createImageData(width, height);
  const color = parseHexColor(style.color);
  const radians = style.angle * Math.PI / 180;
  const offsetX = Math.round(Math.cos(radians) * style.distance);
  const offsetY = Math.round(Math.sin(radians) * style.distance);
  const radius = Math.max(1, Math.round(style.size / 2));
  const pixelContext = { alpha, width, height, offsetX, offsetY, radius, color, invert: style.invert, opacity: style.opacity, output: output.data };
  for (let y = 0; y < height; y++) renderSatinRow(y, pixelContext);
  clearCanvas(effect);
  context.putImageData(output, 0, 0);
  contextOf(target).drawImage(effect, 0, 0);
}

type SatinPixelContext = {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  radius: number;
  color: RgbaColor;
  invert: boolean;
  opacity: number;
  output: Uint8ClampedArray;
};

function renderSatinRow(y: number, pixelContext: SatinPixelContext): void {
  for (let x = 0; x < pixelContext.width; x++) writeSatinPixel(x, y, pixelContext);
}

function writeSatinPixel(x: number, y: number, pixelContext: SatinPixelContext): void {
  const index = (y * pixelContext.width + x) * 4;
  const ownAlpha = pixelContext.alpha[index + 3];
  if (ownAlpha === 0) return;
  const left = readMaskAlpha(pixelContext.alpha, pixelContext.width, pixelContext.height, x - pixelContext.offsetX - pixelContext.radius, y - pixelContext.offsetY - pixelContext.radius);
  const right = readMaskAlpha(pixelContext.alpha, pixelContext.width, pixelContext.height, x + pixelContext.offsetX + pixelContext.radius, y + pixelContext.offsetY + pixelContext.radius);
  const intensity = getSatinIntensity(left, right, pixelContext.invert);
  const edgeStrength = Math.min(1, intensity * 1.8);
  const outputAlpha = Math.round(ownAlpha * edgeStrength * pixelContext.opacity);
  if (outputAlpha === 0) return;
  pixelContext.output[index] = pixelContext.color.red;
  pixelContext.output[index + 1] = pixelContext.color.green;
  pixelContext.output[index + 2] = pixelContext.color.blue;
  pixelContext.output[index + 3] = outputAlpha;
}

function getSatinIntensity(left: number, right: number, invert: boolean): number {
  const intensity = Math.abs(left - right) / 255;
  return invert ? 1 - intensity : intensity;
}

function readMaskAlpha(alpha: Uint8ClampedArray, width: number, height: number, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return alpha[(y * width + x) * 4 + 3];
}

function renderInnerShadow(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyles['innerShadow']): void {
  if (!style.enabled || style.opacity <= 0) return;
  const effect = resources.effect; const context = contextOf(effect); clearCanvas(effect);
  const offset = getShadowOffset(style.angle, style.distance);
  context.save(); context.shadowColor = colorWithOpacity(style.color, style.opacity); context.shadowBlur = style.size;
  context.shadowOffsetX = -offset.x; context.shadowOffsetY = -offset.y;
  context.drawImage(resources.alphaMask, 0, 0); context.restore();
  removeOriginalSilhouette(effect, resources.alphaMask);
  context.globalCompositeOperation = 'destination-in'; context.drawImage(resources.alphaMask, 0, 0); context.globalCompositeOperation = 'source-over';
  contextOf(target).drawImage(effect, 0, 0);
}

function getLayerStyleCanvases(canvas: HTMLCanvasElement): LayerStyleCanvases {
  const existing = CANVAS_CACHE.get(canvas);
  if (existing) return resizeLayerStyleCanvases(existing, canvas.width, canvas.height);
  const created = createLayerStyleCanvases(canvas.width, canvas.height);
  CANVAS_CACHE.set(canvas, created);
  return created;
}

function createLayerStyleCanvases(width: number, height: number): LayerStyleCanvases {
  return {
    source: createSizedCanvas(width, height),
    alphaMask: createSizedCanvas(width, height),
    effect: createSizedCanvas(width, height),
    bevel: createSizedCanvas(width, height),
  };
}

function resizeLayerStyleCanvases(canvases: LayerStyleCanvases, width: number, height: number): LayerStyleCanvases {
  resizeCanvas(canvases.source, width, height);
  resizeCanvas(canvases.alphaMask, width, height);
  resizeCanvas(canvases.effect, width, height);
  resizeCanvas(canvases.bevel, width, height);
  return canvases;
}

function createSizedCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  resizeCanvas(canvas, width, height);
  return canvas;
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width;
  canvas.height = height;
}

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return canvas.getContext('2d', { willReadFrequently: true })!;
}

function clearCanvas(canvas: HTMLCanvasElement): void {
  contextOf(canvas).clearRect(0, 0, canvas.width, canvas.height);
}

function copyCanvas(source: HTMLCanvasElement, target: HTMLCanvasElement): void {
  clearCanvas(target);
  contextOf(target).drawImage(source, 0, 0);
}

function createAlphaMask(source: HTMLCanvasElement, target: HTMLCanvasElement): void {
  copyCanvas(source, target);
  const context = contextOf(target);
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, target.width, target.height);
  context.globalCompositeOperation = 'source-over';
}

function renderDropShadow(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyleDropShadow): void {
  if (!style.enabled || style.opacity <= 0) return;
  const offset = getShadowOffset(style.angle, style.distance);
  renderBlurredAlphaEffect(target, resources, style.color, style.opacity, style.size, offset.x, offset.y);
}

function renderOuterGlow(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyleOuterGlow): void {
  if (!style.enabled || style.opacity <= 0) return;
  renderBlurredAlphaEffect(target, resources, style.color, style.opacity, style.size, 0, 0);
}

function renderBlurredAlphaEffect(
  target: HTMLCanvasElement,
  resources: LayerStyleCanvases,
  color: string,
  opacity: number,
  blur: number,
  offsetX: number,
  offsetY: number,
): void {
  const effect = resources.effect;
  const context = contextOf(effect);
  clearCanvas(effect);
  context.shadowColor = colorWithOpacity(color, opacity);
  context.shadowBlur = blur;
  context.shadowOffsetX = offsetX;
  context.shadowOffsetY = offsetY;
  context.drawImage(resources.alphaMask, 0, 0);
  removeOriginalSilhouette(effect, resources.alphaMask);
  contextOf(target).drawImage(effect, 0, 0);
}

function renderStroke(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyles['stroke']): void {
  if (!style.enabled || style.opacity <= 0 || style.size < 1) return;
  const effect = resources.effect;
  const context = contextOf(effect);
  clearCanvas(effect);
  context.shadowColor = colorWithOpacity(style.color, style.opacity);
  context.shadowBlur = Math.max(0.35, style.size * 0.1);
  drawStrokeDirections(context, resources.alphaMask, style.size);
  removeOriginalSilhouette(effect, resources.alphaMask);
  contextOf(target).drawImage(effect, 0, 0);
}

function drawStrokeDirections(context: CanvasRenderingContext2D, mask: HTMLCanvasElement, size: number): void {
  for (let direction = 0; direction < STROKE_DIRECTIONS; direction++) {
    drawStrokeDirection(context, mask, direction, size);
  }
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.shadowBlur = 0;
  context.shadowColor = 'transparent';
}

function drawStrokeDirection(context: CanvasRenderingContext2D, mask: HTMLCanvasElement, direction: number, size: number): void {
  const angle = direction / STROKE_DIRECTIONS * Math.PI * 2;
  context.shadowOffsetX = Math.cos(angle) * size * 0.62;
  context.shadowOffsetY = Math.sin(angle) * size * 0.62;
  context.drawImage(mask, 0, 0);
}

function removeOriginalSilhouette(effect: HTMLCanvasElement, mask: HTMLCanvasElement): void {
  const context = contextOf(effect);
  context.shadowColor = 'transparent';
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = 'source-over';
}

function drawSourceOver(target: HTMLCanvasElement, source: HTMLCanvasElement): void {
  contextOf(target).drawImage(source, 0, 0);
}

function renderBevel(target: HTMLCanvasElement, resources: LayerStyleCanvases, style: LayerStyleBevelEmboss): void {
  if (!style.enabled || style.opacity <= 0) return;
  const sourceContext = contextOf(resources.source);
  const sourcePixels = sourceContext.getImageData(0, 0, resources.source.width, resources.source.height);
  const bevelPixels = createBevelPixels(sourcePixels, style);
  const bevelContext = contextOf(resources.bevel);
  bevelContext.clearRect(0, 0, resources.bevel.width, resources.bevel.height);
  bevelContext.putImageData(bevelPixels, 0, 0);
  contextOf(target).drawImage(resources.bevel, 0, 0);
}

function createBevelPixels(source: ImageData, style: LayerStyleBevelEmboss): ImageData {
  const result = new ImageData(source.width, source.height);
  const lightColor = parseHexColor(style.highlightColor);
  const shadeColor = parseHexColor(style.shadowColor);
  const radians = style.angle * Math.PI / 180;
  const lightX = Math.cos(radians);
  const lightY = Math.sin(radians);
  const altitudeScale = Math.sin(style.altitude * Math.PI / 180);
  for (let index = 0; index < source.data.length; index += 4) {
    writeBevelPixel(source, result, index, style, lightColor, shadeColor, lightX, lightY, altitudeScale);
  }
  return result;
}

function writeBevelPixel(
  source: ImageData,
  result: ImageData,
  index: number,
  style: LayerStyleBevelEmboss,
  lightColor: RgbaColor,
  shadeColor: RgbaColor,
  lightX: number,
  lightY: number,
  altitudeScale: number,
): void {
  const pixel = index / 4;
  const x = pixel % source.width;
  const y = Math.floor(pixel / source.width);
  const alpha = source.data[index + 3];
  if (alpha <= 0) return;
  const radius = Math.max(1, Math.round(style.size));
  const dx = readAlpha(source, x - radius, y) - readAlpha(source, x + radius, y);
  const dy = readAlpha(source, x, y - radius) - readAlpha(source, x, y + radius);
  const light = ((dx * lightX + dy * lightY) / 255) * altitudeScale * Math.min(1, style.depth / 5);
  if (Math.abs(light) < 0.015) return;
  const color = light > 0 ? lightColor : shadeColor;
  const alphaOut = Math.round(Math.abs(light) * style.opacity * alpha);
  writeColor(result.data, index, color, alphaOut);
}

function readAlpha(image: ImageData, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return 0;
  return image.data[(y * image.width + x) * 4 + 3];
}

function writeColor(data: Uint8ClampedArray, index: number, color: RgbaColor, alpha: number): void {
  data[index] = color.red;
  data[index + 1] = color.green;
  data[index + 2] = color.blue;
  data[index + 3] = alpha;
}

function parseHexColor(value: string): RgbaColor {
  const normalized = normalizeHexColor(value);
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function normalizeHexColor(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  return '#ffffff';
}

function colorWithOpacity(color: string, opacity: number): string {
  const rgb = parseHexColor(color);
  return `rgba(${rgb.red}, ${rgb.green}, ${rgb.blue}, ${Math.max(0, Math.min(1, opacity))})`;
}

function getShadowOffset(angle: number, distance: number): { x: number; y: number } {
  const radians = angle * Math.PI / 180;
  return { x: Math.cos(radians) * distance, y: Math.sin(radians) * distance };
}
