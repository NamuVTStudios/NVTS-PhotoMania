import { applyBrushStamp, type StampOperation } from '@nvts/image-processing';
import type { FillOperation, FillResult, Tool } from './AppBase';

/** Interchangeable algorithms for applying a raster stamp. */
export interface BrushStrategy {
  apply(pixels: Uint8Array, operation: StampOperation): boolean;
}

export class PaintBrushStrategy implements BrushStrategy {
  apply(pixels: Uint8Array, operation: StampOperation): boolean {
    return applyBrushStamp(pixels, { ...operation, erase: false });
  }
}

export class EraserStrategy implements BrushStrategy {
  apply(pixels: Uint8Array, operation: StampOperation): boolean {
    return applyBrushStamp(pixels, { ...operation, erase: true });
  }
}

export type FillStrategyContext = {
  matches(operation: FillOperation, offset: number): boolean;
  paintPixel(operation: FillOperation, result: FillResult, pixel: number): void;
};

/** Interchangeable flood-fill algorithms: connected region or every matching pixel. */
export interface FillStrategy {
  execute(operation: FillOperation, result: FillResult, context: FillStrategyContext): void;
}

export class ContiguousFillStrategy implements FillStrategy {
  execute(operation: FillOperation, result: FillResult, context: FillStrategyContext): void {
    const { width, height } = operation;
    const total = width * height;
    const stack = new Uint32Array(total);
    const seen = new Uint8Array(total);
    let top = 0;
    const seed = operation.seedY * width + operation.seedX;
    stack[top++] = seed;
    seen[seed] = 1;

    while (top > 0) top = this.processFillStackPixel(stack[--top], operation, result, context, width, height, stack, seen, top);
  }

  private processFillStackPixel(
    pixel: number, operation: FillOperation, result: FillResult, context: FillStrategyContext,
    width: number, height: number, stack: Uint32Array, seen: Uint8Array, top: number,
  ): number {
    if (!context.matches(operation, pixel * 4)) return top;
    context.paintPixel(operation, result, pixel);
    return this.pushNeighbors(pixel, width, height, stack, seen, top);
  }

  private pushNeighbors(pixel: number, width: number, height: number, stack: Uint32Array, seen: Uint8Array, top: number): number {
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const push = (next: number): void => {
      if (seen[next]) return;
      seen[next] = 1;
      stack[top++] = next;
    };
    if (x > 0) push(pixel - 1);
    if (x + 1 < width) push(pixel + 1);
    if (y > 0) push(pixel - width);
    if (y + 1 < height) push(pixel + width);
    return top;
  }
}

export class GlobalFillStrategy implements FillStrategy {
  execute(operation: FillOperation, result: FillResult, context: FillStrategyContext): void {
    const total = operation.width * operation.height;
    for (let pixel = 0; pixel < total; pixel++) paintGlobalFillPixel(operation, result, context, pixel);
  }
}

function paintGlobalFillPixel(operation: FillOperation, result: FillResult, context: FillStrategyContext, pixel: number): void {
  if (!context.matches(operation, pixel * 4)) return;
  context.paintPixel(operation, result, pixel);
}

/** Strategy contract for tools that act immediately on pointer-down. */
export type ImmediateToolActions = {
  pickColor(x: number, y: number): void;
  createText(x: number, y: number): void;
  beginVectorSelection(point: { x: number; y: number }, event: PointerEvent): void;
};

export interface ImmediateToolStrategy {
  readonly tool: Extract<Tool, 'eyedropper' | 'text' | 'vector-select'>;
  execute(point: { x: number; y: number }, event: PointerEvent, actions: ImmediateToolActions): void;
}

export class EyedropperStrategy implements ImmediateToolStrategy {
  readonly tool = 'eyedropper' as const;
  execute(point: { x: number; y: number }, _event: PointerEvent, actions: ImmediateToolActions): void {
    actions.pickColor(Math.floor(point.x), Math.floor(point.y));
  }
}

export class TextCreationStrategy implements ImmediateToolStrategy {
  readonly tool = 'text' as const;
  execute(point: { x: number; y: number }, _event: PointerEvent, actions: ImmediateToolActions): void {
    actions.createText(Math.round(point.x), Math.round(point.y));
  }
}

export class VectorSelectionStrategy implements ImmediateToolStrategy {
  readonly tool = 'vector-select' as const;
  execute(point: { x: number; y: number }, event: PointerEvent, actions: ImmediateToolActions): void {
    actions.beginVectorSelection(point, event);
  }
}

export type CloneStampOperation = {
  sourcePixels: Uint8Array;
  sourceLeft: number;
  sourceTop: number;
  sourceWidth: number;
  sourceHeight: number;
  documentWidth: number;
  documentHeight: number;
  sourcePoint: { x: number; y: number };
  destinationStart: { x: number; y: number };
};

/** Copies sampled RGBA pixels through the same circular opacity mask as a brush stamp. */
export class CloneStampStrategy {
  apply(target: Uint8Array, stamp: StampOperation, source: CloneStampOperation): boolean {
    const state = { changed: false, target, stamp, source };
    for (let localY = 0; localY < stamp.region.height; localY++) this.applyCloneStampRow(localY, state);
    return state.changed;
  }

  private applyCloneStampRow(localY: number, state: {
    changed: boolean; target: Uint8Array; stamp: StampOperation; source: CloneStampOperation;
  }): void {
    for (let localX = 0; localX < state.stamp.region.width; localX++) {
      state.changed = this.applyCloneStampPixel(localX, localY, state) || state.changed;
    }
  }

  private applyCloneStampPixel(localX: number, localY: number, state: {
    changed: boolean; target: Uint8Array; stamp: StampOperation; source: CloneStampOperation;
  }): boolean {
    const { stamp, source, target } = state;
    const x = stamp.region.left + localX;
    const y = stamp.region.top + localY;
    const coverage = this.coverage(x, y, stamp);
    if (coverage <= 0) return false;
    const sourceX = Math.round(source.sourcePoint.x + x - source.destinationStart.x);
    const sourceY = Math.round(source.sourcePoint.y + y - source.destinationStart.y);
    if (!this.isInsideSource(sourceX, sourceY, source.documentWidth, source.documentHeight)) return false;
    if (!this.isInsideSample(sourceX, sourceY, source)) return false;
    const sourceOffset = ((sourceY - source.sourceTop) * source.sourceWidth + sourceX - source.sourceLeft) * 4;
    const targetOffset = (localY * stamp.region.width + localX) * 4;
    return this.copyPixel(source.sourcePixels, sourceOffset, target, targetOffset, coverage * stamp.opacity);
  }

  private coverage(x: number, y: number, stamp: StampOperation): number {
    const distance = Math.hypot(x + 0.5 - stamp.centerX, y + 0.5 - stamp.centerY);
    if (distance > stamp.radius) return 0;
    if (distance <= stamp.hardEdge) return 1;
    return Math.max(0, 1 - (distance - stamp.hardEdge) / stamp.fadeWidth);
  }

  private isInsideSource(x: number, y: number, width: number, height: number): boolean {
    return x >= 0 && y >= 0 && x < width && y < height;
  }

  private isInsideSample(x: number, y: number, source: CloneStampOperation): boolean {
    return x >= source.sourceLeft && y >= source.sourceTop
      && x < source.sourceLeft + source.sourceWidth
      && y < source.sourceTop + source.sourceHeight;
  }

  private copyPixel(source: Uint8Array, sourceOffset: number, target: Uint8Array, targetOffset: number, opacity: number): boolean {
    const sourceAlpha = source[sourceOffset + 3] / 255 * opacity;
    if (sourceAlpha <= 0) return false;
    const targetAlpha = target[targetOffset + 3] / 255;
    const outputAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);
    const targetWeight = targetAlpha * (1 - sourceAlpha);
    target[targetOffset] = Math.round((source[sourceOffset] * sourceAlpha + target[targetOffset] * targetWeight) / outputAlpha);
    target[targetOffset + 1] = Math.round((source[sourceOffset + 1] * sourceAlpha + target[targetOffset + 1] * targetWeight) / outputAlpha);
    target[targetOffset + 2] = Math.round((source[sourceOffset + 2] * sourceAlpha + target[targetOffset + 2] * targetWeight) / outputAlpha);
    target[targetOffset + 3] = Math.round(outputAlpha * 255);
    return true;
  }
}
