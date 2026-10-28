import type { TemplateDef } from './types';

/** Doujinshi B5. Print measurements are starting points and must be confirmed with the printer. */
export const DoujinshiB5Template: TemplateDef = {
  id: 'doujinshi-b5',
  extendsId: 'manga-b5',
  title: 'Doujinshi B5',
  category: 'Cómic e ilustración',
  width: 2150,
  height: 3035,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 182, finishedHeightMm: 257, bleedMm: 3, safeMarginMm: 3,
    innerMarginMm: 8, outerMarginMm: 8, topMarginMm: 8, bottomMarginMm: 8,
    readingDirection: 'rtl', colorMode: 'grayscale',
  },
};
