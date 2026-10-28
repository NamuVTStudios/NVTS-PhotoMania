import type { TemplateDef } from './types';

/** Manga de revista B5. Print measurements are starting points and must be confirmed with the printer. */
export const MangaB5Template: TemplateDef = {
  id: 'manga-b5',
  extendsId: 'manga',
  title: 'Manga de revista B5',
  category: 'Cómic e ilustración',
  width: 2150,
  height: 3035,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 182, finishedHeightMm: 257, bleedMm: 3, safeMarginMm: 6,
    innerMarginMm: 12, outerMarginMm: 6, topMarginMm: 6, bottomMarginMm: 6,
    readingDirection: 'rtl', colorMode: 'grayscale',
  },
};
