import type { LayerStyleBevelEmboss, LayerStyleDropShadow, LayerStyleOuterGlow, LayerStyles } from '@nvts/shared';

interface LayerStyleCanvases {
  source: HTMLCanvasElement;
  alphaMask: HTMLCanvasElement;
  effect: HTMLCanvasElement;
  bevel: HTMLCanvasElement;
}

interface RgbaColor { red: number; green: number; blue: number }

const CANVAS_CACHE = new WeakMap<HTMLCanvasElement, LayerStyleCanvases>();
const STROKE_DIRECTIONS = 16;

export function hasEnabledLayerStyles(styles?: LayerStyles): boolean {
  if (!styles) return false;
  return getStrokeInstances(styles).some((stroke) => stroke.enabled) || getOuterGlowInstances(styles).some((effect) => effect.enabled) || getDropShadowInstances(styles).some((effect) => effect.enabled) || getBevelInstances(styles).some((effect) => effect.enabled) || [styles.gradientOverlay, ...(styles.gradientOverlays ?? [])].some((effect) => effect?.enabled) || [styles.innerShadow, ...(styles.innerShadows ?? [])].some((effect) => effect?.enabled);
}

export function getLayerStylePadding(styles?: LayerStyles): number {
  if (!styles) return 0;
  return Math.max(
    getStrokePadding(styles),
    getGlowPadding(styles),
    getShadowPadding(styles),
    getBevelPadding(styles),
    ...[styles.innerShadow, ...(styles.innerShadows ?? [])].filter((effect) => effect.enabled).map((effect) => Math.ceil(effect.size * 2 + effect.distance + 2)),
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
