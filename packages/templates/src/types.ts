/** Shared document-preset contract for NVTS creative applications. */
export type TemplateDef = {
  /** Stable identifier suitable for saved preferences/configuration. */
  id: string;
  /** Human-readable label shown to the user. */
  title: string;
  /** Category label used to group presets in a template selector. */
  category: string;
  /** Default document size in pixels. */
  width: number;
  height: number;
  /** Icon token understood by the consuming application. */
  icon: string;
  /** Simplified preview shape used by template galleries. */
  preview: 'square' | 'portrait' | 'landscape';
};
