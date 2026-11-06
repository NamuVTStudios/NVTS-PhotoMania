import { ToolObject } from '@nvts/app-object';
import type { LayerType } from '@nvts/shared';

export type ToolId =
  | 'brush' | 'pen' | 'pencil' | 'airbrush' | 'decoration' | 'eraser' | 'vector-eraser' | 'dust-removal' | 'eyedropper' | 'line' | 'rectangle' | 'ellipse'
  | 'fill' | 'hand' | 'move' | 'text' | 'vector-select' | 'clone-stamp' | 'comic-panel' | 'select-polygon' | 'selection-brush' | 'selection-erase'
  | 'gradient' | 'smudge' | 'liquify' | 'select-rectangle' | 'select-ellipse' | 'select-lasso' | 'magic-wand' | 'selection-clear'
  | 'pixel-rounded-rectangle' | 'pixel-polyline' | 'pixel-bezier' | 'pixel-polygon' | 'pixel-star' | 'pixel-spiral'
  | 'vector-line-correction' | 'vector-rectangle' | 'vector-rounded-rectangle' | 'vector-ellipse' | 'vector-line' | 'vector-pen' | 'vector-polygon' | 'vector-star' | 'vector-freehand' | 'vector-polyline' | 'vector-spiral' | 'vector-parallel-lines' | 'vector-radial-lines' | 'speech-bubble' | 'flash';

export type VectorDrawingToolId =
  | 'vector-rectangle' | 'vector-rounded-rectangle' | 'vector-ellipse' | 'vector-line' | 'vector-pen' | 'vector-polygon' | 'vector-star' | 'vector-freehand' | 'vector-polyline' | 'vector-spiral' | 'vector-parallel-lines' | 'vector-radial-lines' | 'speech-bubble' | 'flash';

const VECTOR_DRAWING_TOOL_IDS: readonly VectorDrawingToolId[] = [
  'vector-rectangle', 'vector-rounded-rectangle', 'vector-ellipse', 'vector-line', 'vector-pen', 'vector-polygon', 'vector-star', 'vector-freehand', 'vector-polyline', 'vector-spiral', 'vector-parallel-lines', 'vector-radial-lines', 'speech-bubble', 'flash',
];

export function isVectorDrawingTool(tool: ToolId): tool is VectorDrawingToolId {
  return VECTOR_DRAWING_TOOL_IDS.includes(tool as VectorDrawingToolId);
}


export type PixelShapeToolId =
  | 'pixel-rounded-rectangle' | 'pixel-polyline' | 'pixel-bezier'
  | 'pixel-polygon' | 'pixel-star' | 'pixel-spiral';

const PIXEL_SHAPE_TOOL_IDS: readonly PixelShapeToolId[] = [
  'pixel-rounded-rectangle', 'pixel-polyline', 'pixel-bezier',
  'pixel-polygon', 'pixel-star', 'pixel-spiral',
];

export function isPixelShapeTool(tool: ToolId | null): tool is PixelShapeToolId {
  return tool !== null && PIXEL_SHAPE_TOOL_IDS.includes(tool as PixelShapeToolId);
}

export type BrushStrokeToolId = 'brush' | 'pen' | 'pencil' | 'airbrush' | 'decoration' | 'eraser' | 'dust-removal' | 'clone-stamp' | 'smudge' | 'liquify';
const BRUSH_STROKE_TOOL_IDS: readonly BrushStrokeToolId[] = [
  'brush', 'pen', 'pencil', 'airbrush', 'decoration', 'eraser', 'dust-removal', 'clone-stamp', 'smudge', 'liquify',
];

export function isBrushStrokeTool(tool: ToolId | null): tool is BrushStrokeToolId {
  return tool !== null && BRUSH_STROKE_TOOL_IDS.includes(tool as BrushStrokeToolId);
}

export type ToolTarget = 'any' | 'raster' | 'vector';

/** Common metadata and layer-compatibility contract for every editor tool. */
export abstract class ToolsBase extends ToolObject {
  protected constructor(
    id: ToolId,
    readonly label: string,
    readonly target: ToolTarget,
  ) {
    super(id, label);
  }

  canUseLayer(layerType: LayerType | null): boolean {
    if (this.target === 'any') return true;
    if (this.target === 'raster') return layerType === 'paint' || layerType === 'raster';
    return layerType === 'vector';
  }
}
