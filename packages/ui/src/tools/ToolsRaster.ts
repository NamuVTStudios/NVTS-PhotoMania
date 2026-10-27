import { ToolsBase } from './ToolsBase';
import type { ToolId } from './ToolsBase';

/** Base class for tools that write directly into raster/paint layers. */
export abstract class ToolsRaster extends ToolsBase {
  protected constructor(id: ToolId, label: string) {
    super(id, label, 'raster');
  }
}
