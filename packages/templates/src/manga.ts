import type { TemplateDef } from './types';

/* Manga: 1600 × 2400 px. */
export const mangaTemplate: TemplateDef = {
  id: 'manga',
  title: 'Manga',
  category: 'Cómic e ilustración',
  width: 1600,
  height: 2400,
  icon: '▤',
  preview: 'portrait',
  printProfile: { finishedWidthMm: 128, finishedHeightMm: 182, bleedMm: 3, safeMarginMm: 5, innerMarginMm: 10, outerMarginMm: 5, topMarginMm: 5, bottomMarginMm: 5, readingDirection: 'rtl', colorMode: 'grayscale' },
};
