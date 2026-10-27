import { ToolsBase } from './ToolsBase';
import type { ToolId } from './ToolsBase';

/** Base class for tools that create or manipulate editable vector objects. */
export abstract class ToolsVectors extends ToolsBase {
  protected constructor(id: ToolId, label: string) {
    super(id, label, 'vector');
  }
}
