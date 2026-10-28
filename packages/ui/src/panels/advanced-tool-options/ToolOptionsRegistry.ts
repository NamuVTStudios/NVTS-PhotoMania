import type { ToolAdvancedOptionsDefinition } from './types';
import { BrushToolOptions } from './tools/BrushToolOptions';
import { EraserToolOptions } from './tools/EraserToolOptions';
import { EyedropperToolOptions } from './tools/EyedropperToolOptions';
import { LineToolOptions } from './tools/LineToolOptions';
import { RectangleToolOptions } from './tools/RectangleToolOptions';
import { EllipseToolOptions } from './tools/EllipseToolOptions';
import { FillToolOptions } from './tools/FillToolOptions';
import { HandToolOptions } from './tools/HandToolOptions';
import { TextToolOptions } from './tools/TextToolOptions';
import { VectorSelectToolOptions } from './tools/VectorSelectToolOptions';
import { CloneStampToolOptions } from './tools/CloneStampToolOptions';
import { ComicPanelToolOptions } from './tools/ComicPanelToolOptions';
import { GradientToolOptions } from './tools/GradientToolOptions';
import { SmudgeToolOptions } from './tools/SmudgeToolOptions';
import { LiquifyToolOptions } from './tools/LiquifyToolOptions';
import { VectorRectangleToolOptions } from './tools/VectorRectangleToolOptions';
import { VectorRoundedRectangleToolOptions } from './tools/VectorRoundedRectangleToolOptions';
import { VectorEllipseToolOptions } from './tools/VectorEllipseToolOptions';
import { VectorLineToolOptions } from './tools/VectorLineToolOptions';
import { VectorPenToolOptions } from './tools/VectorPenToolOptions';
import { VectorPolygonToolOptions } from './tools/VectorPolygonToolOptions';
import { VectorStarToolOptions } from './tools/VectorStarToolOptions';
import { VectorFreehandToolOptions } from './tools/VectorFreehandToolOptions';
import { VectorPolylineToolOptions } from './tools/VectorPolylineToolOptions';
import { VectorSpiralToolOptions } from './tools/VectorSpiralToolOptions';
import { PixelRoundedRectangleToolOptions } from './tools/PixelRoundedRectangleToolOptions';
import { PixelPolylineToolOptions } from './tools/PixelPolylineToolOptions';
import { PixelBezierToolOptions } from './tools/PixelBezierToolOptions';
import { PixelPolygonToolOptions } from './tools/PixelPolygonToolOptions';
import { PixelStarToolOptions } from './tools/PixelStarToolOptions';
import { PixelSpiralToolOptions } from './tools/PixelSpiralToolOptions';

export const ADVANCED_TOOL_OPTIONS_REGISTRY: Readonly<Record<string, ToolAdvancedOptionsDefinition>> = Object.freeze({
  brush: BrushToolOptions,
  eraser: EraserToolOptions,
  eyedropper: EyedropperToolOptions,
  line: LineToolOptions,
  rectangle: RectangleToolOptions,
  ellipse: EllipseToolOptions,
  fill: FillToolOptions,
  hand: HandToolOptions,
  text: TextToolOptions,
  'vector-select': VectorSelectToolOptions,
  'vector-rectangle': VectorRectangleToolOptions,
  'vector-rounded-rectangle': VectorRoundedRectangleToolOptions,
  'vector-ellipse': VectorEllipseToolOptions,
  'vector-line': VectorLineToolOptions,
  'vector-pen': VectorPenToolOptions,
  'vector-polygon': VectorPolygonToolOptions,
  'vector-star': VectorStarToolOptions,
  'vector-freehand': VectorFreehandToolOptions,
  'vector-polyline': VectorPolylineToolOptions,
  'vector-spiral': VectorSpiralToolOptions,
  'clone-stamp': CloneStampToolOptions,
  'comic-panel': ComicPanelToolOptions,
  gradient: GradientToolOptions,
  smudge: SmudgeToolOptions,
  liquify: LiquifyToolOptions,
  'pixel-rounded-rectangle': PixelRoundedRectangleToolOptions,
  'pixel-polyline': PixelPolylineToolOptions,
  'pixel-bezier': PixelBezierToolOptions,
  'pixel-polygon': PixelPolygonToolOptions,
  'pixel-star': PixelStarToolOptions,
  'pixel-spiral': PixelSpiralToolOptions,
});
