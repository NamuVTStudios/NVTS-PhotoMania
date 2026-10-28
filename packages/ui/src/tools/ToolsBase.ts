import type { LayerType } from '@nvts/shared';

export type ToolId =
  | 'brush' | 'eraser' | 'eyedropper' | 'line' | 'rectangle' | 'ellipse'
  | 'fill' | 'hand' | 'text' | 'vector-select' | 'clone-stamp' | 'comic-panel'
  | 'gradient' | 'smudge' | 'liquify';

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
