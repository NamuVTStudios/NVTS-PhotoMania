import { createToolCatalog } from '../tools/ToolCatalog';
import type { ToolsBase } from '../tools/ToolsBase';
import type { LayerType } from '@nvts/shared';
import type { ToolId } from '../tools/ToolsBase';

export type { ToolId } from '../tools/ToolsBase';

/** Tracks the active tool and exposes the tool hierarchy to the editor. */
export class ToolManager {
  private currentTool: ToolId;
  private readonly tools = createToolCatalog();

  constructor(initialTool: ToolId = 'brush') {
    this.currentTool = initialTool;
    this.getDefinition(initialTool);
  }

  get activeTool(): ToolId {
    return this.currentTool;
  }

  getDefinition(tool: ToolId): ToolsBase {
    const definition = this.tools.get(tool);
    if (!definition) throw new Error(`Herramienta desconocida: ${String(tool)}`);
    return definition;
  }

  canUseLayer(tool: ToolId, layerType: LayerType | null): boolean {
    return this.getDefinition(tool).canUseLayer(layerType);
  }

  setActiveTool(tool: ToolId): void {
    this.getDefinition(tool);
    this.currentTool = tool;
  }
}
