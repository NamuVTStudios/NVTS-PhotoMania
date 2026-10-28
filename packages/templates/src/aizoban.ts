import type { TemplateDef } from './types';

/** Manga Aizōban configurable. Print measurements are starting points and must be confirmed with the printer. */
export const AizobanTemplate: TemplateDef = {
  id: 'aizoban',
  extendsId: 'kanzenban',
  title: 'Manga Aizōban configurable',
  category: 'Cómic e ilustración',
  width: 1748,
  height: 2480,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 148, finishedHeightMm: 210, bleedMm: 3, safeMarginMm: 6,
    innerMarginMm: 12, outerMarginMm: 6, topMarginMm: 6, bottomMarginMm: 6,
    readingDirection: 'rtl', colorMode: 'grayscale',
  },
};
