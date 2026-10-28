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
export class PixelRoundedRectangleTool extends ToolsRaster { constructor() { super('pixel-rounded-rectangle', 'Rectángulo redondeado de píxeles'); } }
export class PixelPolylineTool extends ToolsRaster { constructor() { super('pixel-polyline', 'Polilínea de píxeles'); } }
export class PixelBezierTool extends ToolsRaster { constructor() { super('pixel-bezier', 'Curva Bézier de píxeles'); } }
export class PixelPolygonTool extends ToolsRaster { constructor() { super('pixel-polygon', 'Polígono de píxeles'); } }
export class PixelStarTool extends ToolsRaster { constructor() { super('pixel-star', 'Estrella de píxeles'); } }
export class PixelSpiralTool extends ToolsRaster { constructor() { super('pixel-spiral', 'Espiral de píxeles'); } }

export class VectorSelectionTool extends ToolsVectors { constructor() { super('vector-select', 'Selección vectorial'); } }
export class VectorRectangleTool extends ToolsVectors { constructor() { super('vector-rectangle', 'Rectángulo vectorial'); } }
export class VectorRoundedRectangleTool extends ToolsVectors { constructor() { super('vector-rounded-rectangle', 'Rectángulo redondeado vectorial'); } }
export class VectorEllipseTool extends ToolsVectors { constructor() { super('vector-ellipse', 'Elipse vectorial'); } }
export class VectorLineTool extends ToolsVectors { constructor() { super('vector-line', 'Línea vectorial'); } }
export class VectorPenTool extends ToolsVectors { constructor() { super('vector-pen', 'Pluma vectorial'); } }
export class VectorPolygonTool extends ToolsVectors { constructor() { super('vector-polygon', 'Polígono vectorial'); } }
export class VectorStarTool extends ToolsVectors { constructor() { super('vector-star', 'Estrella vectorial'); } }
export class VectorFreehandTool extends ToolsVectors { constructor() { super('vector-freehand', 'Trazo vectorial libre'); } }
export class VectorPolylineTool extends ToolsVectors { constructor() { super('vector-polyline', 'Polilínea vectorial'); } }
export class VectorSpiralTool extends ToolsVectors { constructor() { super('vector-spiral', 'Espiral vectorial'); } }
export class ComicPanelTool extends ToolsVectors { constructor() { super('comic-panel', 'Marco y viñetas'); } }

/** Tools that operate on the canvas/view or create independent text layers. */
export class HandTool extends ToolsBase { constructor() { super('hand', 'Mover lienzo', 'any'); } }
export class EyedropperTool extends ToolsBase { constructor() { super('eyedropper', 'Cuentagotas', 'any'); } }
export class TextTool extends ToolsBase { constructor() { super('text', 'Texto', 'any'); } }

export function createToolCatalog(): ReadonlyMap<ToolId, ToolsBase> {
  const tools: ToolsBase[] = [
    new BrushTool(), new EraserTool(), new LineTool(), new RectangleTool(), new EllipseTool(),
    new FillTool(), new CloneStampTool(), new GradientTool(), new SmudgeTool(), new LiquifyTool(),
    new PixelRoundedRectangleTool(), new PixelPolylineTool(), new PixelBezierTool(), new PixelPolygonTool(), new PixelStarTool(), new PixelSpiralTool(), new VectorSelectionTool(),
    new VectorRectangleTool(), new VectorRoundedRectangleTool(), new VectorEllipseTool(), new VectorLineTool(), new VectorPenTool(),
    new VectorPolygonTool(), new VectorStarTool(), new VectorFreehandTool(), new VectorPolylineTool(), new VectorSpiralTool(), new ComicPanelTool(),
    new HandTool(), new EyedropperTool(), new TextTool(),
  ];
  return new Map<ToolId, ToolsBase>(tools.map((tool) => [tool.id, tool] as const));
}
