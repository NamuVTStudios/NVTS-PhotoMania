import { ToolsBase } from './ToolsBase';
import type { ToolId } from './ToolsBase';
import { ToolsRaster } from './ToolsRaster';
import { ToolsVectors } from './ToolsVectors';

export class BrushTool extends ToolsRaster { constructor() { super('brush', 'Pincel'); } }
export class PenTool extends ToolsRaster { constructor() { super('pen', 'Plumilla'); } }
export class PencilTool extends ToolsRaster { constructor() { super('pencil', 'Lápiz'); } }
export class AirbrushTool extends ToolsRaster { constructor() { super('airbrush', 'Aerógrafo'); } }
export class DecorationTool extends ToolsRaster { constructor() { super('decoration', 'Decoración'); } }
export class EraserTool extends ToolsRaster { constructor() { super('eraser', 'Borrador'); } }
export class DustRemovalTool extends ToolsRaster { constructor() { super('dust-removal', 'Eliminar polvo'); } }
export class VectorEraserTool extends ToolsVectors { constructor() { super('vector-eraser', 'Goma vectorial'); } }
export class LineTool extends ToolsRaster { constructor() { super('line', 'Línea'); } }
export class RectangleTool extends ToolsRaster { constructor() { super('rectangle', 'Rectángulo'); } }
export class EllipseTool extends ToolsRaster { constructor() { super('ellipse', 'Elipse'); } }
export class FillTool extends ToolsRaster { constructor() { super('fill', 'Relleno'); } }
export class CloneStampTool extends ToolsRaster { constructor() { super('clone-stamp', 'Tampón de clonar'); } }
export class GradientTool extends ToolsRaster { constructor() { super('gradient', 'Degradado'); } }
export class SmudgeTool extends ToolsRaster { constructor() { super('smudge', 'Dedo'); } }
export class LiquifyTool extends ToolsRaster { constructor() { super('liquify', 'Licuar'); } }
export class RectangleSelectionTool extends ToolsBase { constructor() { super('select-rectangle', 'Selección rectangular', 'any'); } }
export class EllipseSelectionTool extends ToolsBase { constructor() { super('select-ellipse', 'Selección elíptica', 'any'); } }
export class LassoSelectionTool extends ToolsBase { constructor() { super('select-lasso', 'Lazo', 'any'); } }
export class MagicWandTool extends ToolsBase { constructor() { super('magic-wand', 'Varita mágica', 'any'); } }
export class ClearSelectionTool extends ToolsBase { constructor() { super('selection-clear', 'Borrar selección', 'any'); } }
export class PolygonSelectionTool extends ToolsBase { constructor() { super('select-polygon', 'Selección poligonal', 'any'); } }
export class SelectionBrushTool extends ToolsBase { constructor() { super('selection-brush', 'Pincel de selección', 'any'); } }
export class SelectionEraseTool extends ToolsBase { constructor() { super('selection-erase', 'Borrador de selección', 'any'); } }
export class PixelRoundedRectangleTool extends ToolsRaster { constructor() { super('pixel-rounded-rectangle', 'Rectángulo redondeado de píxeles'); } }
export class PixelPolylineTool extends ToolsRaster { constructor() { super('pixel-polyline', 'Polilínea de píxeles'); } }
export class PixelBezierTool extends ToolsRaster { constructor() { super('pixel-bezier', 'Curva Bézier de píxeles'); } }
export class PixelPolygonTool extends ToolsRaster { constructor() { super('pixel-polygon', 'Polígono de píxeles'); } }
export class PixelStarTool extends ToolsRaster { constructor() { super('pixel-star', 'Estrella de píxeles'); } }
export class PixelSpiralTool extends ToolsRaster { constructor() { super('pixel-spiral', 'Espiral de píxeles'); } }

export class VectorSelectionTool extends ToolsVectors { constructor() { super('vector-select', 'Selección vectorial'); } }
export class VectorLineCorrectionTool extends ToolsVectors { constructor() { super('vector-line-correction', 'Corrección de línea vectorial'); } }
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
export class SpeechBubbleTool extends ToolsVectors { constructor() { super('speech-bubble', 'Bocadillo'); } }
export class FlashTool extends ToolsVectors { constructor() { super('flash', 'Flash'); } }
export class VectorParallelLinesTool extends ToolsVectors { constructor() { super('vector-parallel-lines', 'Líneas paralelas'); } }
export class VectorRadialLinesTool extends ToolsVectors { constructor() { super('vector-radial-lines', 'Líneas radiales'); } }

/** Tools that operate on the canvas/view or create independent text layers. */
export class HandTool extends ToolsBase { constructor() { super('hand', 'Mover lienzo', 'any'); } }
export class MoveTool extends ToolsBase { constructor() { super('move', 'Mover elementos', 'any'); } }
export class EyedropperTool extends ToolsBase { constructor() { super('eyedropper', 'Cuentagotas', 'any'); } }
export class TextTool extends ToolsBase { constructor() { super('text', 'Texto', 'any'); } }

export function createToolCatalog(): ReadonlyMap<ToolId, ToolsBase> {
  const tools: ToolsBase[] = [
    new BrushTool(), new PenTool(), new PencilTool(), new AirbrushTool(), new DecorationTool(), new EraserTool(), new DustRemovalTool(), new VectorEraserTool(), new LineTool(), new RectangleTool(), new EllipseTool(),
    new FillTool(), new CloneStampTool(), new GradientTool(), new SmudgeTool(), new LiquifyTool(),
    new RectangleSelectionTool(), new EllipseSelectionTool(), new LassoSelectionTool(), new MagicWandTool(), new ClearSelectionTool(), new PolygonSelectionTool(), new SelectionBrushTool(), new SelectionEraseTool(),
    new PixelRoundedRectangleTool(), new PixelPolylineTool(), new PixelBezierTool(), new PixelPolygonTool(), new PixelStarTool(), new PixelSpiralTool(), new VectorSelectionTool(), new VectorLineCorrectionTool(),
    new VectorRectangleTool(), new VectorRoundedRectangleTool(), new VectorEllipseTool(), new VectorLineTool(), new VectorPenTool(),
    new VectorPolygonTool(), new VectorStarTool(), new VectorFreehandTool(), new VectorPolylineTool(), new VectorSpiralTool(), new VectorParallelLinesTool(), new VectorRadialLinesTool(), new ComicPanelTool(), new SpeechBubbleTool(), new FlashTool(),
    new HandTool(), new MoveTool(), new EyedropperTool(), new TextTool(),
  ];
  return new Map<ToolId, ToolsBase>(tools.map((tool) => [tool.id, tool] as const));
}
