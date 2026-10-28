import type { LayerType } from '@nvts/shared';

export type ToolId =
  | 'brush' | 'eraser' | 'eyedropper' | 'line' | 'rectangle' | 'ellipse'
  | 'fill' | 'hand' | 'text' | 'vector-select' | 'clone-stamp' | 'comic-panel'
  | 'gradient' | 'smudge' | 'liquify'
  | 'pixel-rounded-rectangle' | 'pixel-polyline' | 'pixel-bezier' | 'pixel-polygon' | 'pixel-star' | 'pixel-spiral'
  | 'vector-rectangle' | 'vector-rounded-rectangle' | 'vector-ellipse' | 'vector-line' | 'vector-pen' | 'vector-polygon' | 'vector-star' | 'vector-freehand' | 'vector-polyline' | 'vector-spiral';

export type VectorDrawingToolId =
  | 'vector-rectangle' | 'vector-rounded-rectangle' | 'vector-ellipse' | 'vector-line' | 'vector-pen' | 'vector-polygon' | 'vector-star' | 'vector-freehand' | 'vector-polyline' | 'vector-spiral';

const VECTOR_DRAWING_TOOL_IDS: readonly VectorDrawingToolId[] = [
  'vector-rectangle', 'vector-rounded-rectangle', 'vector-ellipse', 'vector-line', 'vector-pen', 'vector-polygon', 'vector-star', 'vector-freehand', 'vector-polyline', 'vector-spiral',
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

export type ToolTarget = 'any' | 'raster' | 'vector';

/** Common metadata and layer-compatibility contract for every editor tool. */
export abstract class ToolsBase {
  protected constructor(
    readonly id: ToolId,
    readonly label: string,
    readonly target: ToolTarget,
  ) {}

  canUseLayer(layerType: LayerType | null): boolean {
    if (this.target === 'any') return true;
    if (this.target === 'raster') return layerType === 'paint' || layerType === 'raster';
    return layerType === 'vector';
  }
}
