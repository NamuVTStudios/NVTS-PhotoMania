/** Identificadores de herramientas que puede activar el editor. */
export type ToolId =
  | 'brush'
  | 'eraser'
  | 'eyedropper'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'fill'
  | 'hand'
  | 'text'
  | 'vector-select';

const TOOL_IDS: ReadonlySet<ToolId> = new Set([
  'brush', 'eraser', 'eyedropper', 'line', 'rectangle',
  'ellipse', 'fill', 'hand', 'text', 'vector-select',
]);

/** Mantiene el estado de la herramienta activa, separado de los eventos del editor. */
export class ToolManager {
  private currentTool: ToolId;

  constructor(initialTool: ToolId = 'brush') {
    this.currentTool = initialTool;
  }

  get activeTool(): ToolId {
    return this.currentTool;
  }

  setActiveTool(tool: ToolId): void {
    if (!TOOL_IDS.has(tool)) throw new Error(`Herramienta desconocida: ${String(tool)}`);
    this.currentTool = tool;
  }
}
