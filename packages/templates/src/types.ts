/** Shared document-preset contract for NVTS creative applications. */

export type TemplateDef = {
  /** Stable identifier suitable for saved preferences/configuration. */
  id: string;
  /** Optional parent preset. Child values override inherited values. */
  extendsId?: string;
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
  /** Physical print metadata. Values are editable and are not universal printer specifications. */
  printProfile?: {
    finishedWidthMm: number;
    finishedHeightMm: number;
    bleedMm: number;
    safeMarginMm: number;
    innerMarginMm: number;
    outerMarginMm: number;
    topMarginMm: number;
    bottomMarginMm: number;
    readingDirection: 'rtl' | 'ltr' | 'vertical';
    colorMode: 'grayscale' | 'rgb' | 'cmyk-convert';
  };
};
