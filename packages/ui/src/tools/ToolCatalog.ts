import { ToolsBase } from './ToolsBase';
import type { ToolId } from './ToolsBase';
import { ToolsRaster } from './ToolsRaster';
import { ToolsVectors } from './ToolsVectors';

export class BrushTool extends ToolsRaster { constructor() { super('brush', 'Pincel'); } }
export class EraserTool extends ToolsRaster { constructor() { super('eraser', 'Borrador'); } }
export class LineTool extends ToolsRaster { constructor() { super('line', 'Línea'); } }
export class RectangleTool extends ToolsRaster { constructor() { super('rectangle', 'Rectángulo'); } }
export class EllipseTool extends ToolsRaster { constructor() { super('ellipse', 'Elipse'); } }
export class FillTool extends ToolsRaster { constructor() { super('fill', 'Relleno'); } }
export class CloneStampTool extends ToolsRaster { constructor() { super('clone-stamp', 'Tampón de clonar'); } }
export class GradientTool extends ToolsRaster { constructor() { super('gradient', 'Degradado'); } }
export class SmudgeTool extends ToolsRaster { constructor() { super('smudge', 'Dedo'); } }
export class LiquifyTool extends ToolsRaster { constructor() { super('liquify', 'Licuar'); } }

export class VectorSelectionTool extends ToolsVectors { constructor() { super('vector-select', 'Selección vectorial'); } }
export class ComicPanelTool extends ToolsVectors { constructor() { super('comic-panel', 'Marco y viñetas'); } }

/** Tools that operate on the canvas/view or create independent text layers. */
export class HandTool extends ToolsBase { constructor() { super('hand', 'Mover lienzo', 'any'); } }
export class EyedropperTool extends ToolsBase { constructor() { super('eyedropper', 'Cuentagotas', 'any'); } }
export class TextTool extends ToolsBase { constructor() { super('text', 'Texto', 'any'); } }

export function createToolCatalog(): ReadonlyMap<ToolId, ToolsBase> {
  const tools: ToolsBase[] = [
    new BrushTool(), new EraserTool(), new LineTool(), new RectangleTool(), new EllipseTool(),
    new FillTool(), new CloneStampTool(), new GradientTool(), new SmudgeTool(), new LiquifyTool(), new VectorSelectionTool(), new ComicPanelTool(),
    new HandTool(), new EyedropperTool(), new TextTool(),
  ];
  return new Map<ToolId, ToolsBase>(tools.map((tool) => [tool.id, tool] as const));
}
