import type { TemplateDef } from './types';

/** Manga Bunkoban. Print measurements are starting points and must be confirmed with the printer. */
export const BunkobanTemplate: TemplateDef = {
  id: 'bunkoban',
  extendsId: 'tankobon',
  title: 'Manga Bunkoban',
  category: 'Cómic e ilustración',
  width: 1240,
  height: 1748,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 105, finishedHeightMm: 148, bleedMm: 3, safeMarginMm: 5,
    innerMarginMm: 8, outerMarginMm: 5, topMarginMm: 5, bottomMarginMm: 5,
    readingDirection: 'rtl', colorMode: 'grayscale',
  },
};
