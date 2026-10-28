import type { TemplateDef } from './types';

/* Cómic USA: 1650 × 2550 px. */
export const comicUsTemplate: TemplateDef = {
  id: 'comic-us',
  title: 'Cómic USA',
  category: 'Cómic e ilustración',
  width: 1650,
  height: 2550,
  icon: '▤',
  preview: 'portrait',
  printProfile: { finishedWidthMm: 168, finishedHeightMm: 260, bleedMm: 3, safeMarginMm: 6, innerMarginMm: 12, outerMarginMm: 6, topMarginMm: 6, bottomMarginMm: 6, readingDirection: 'ltr', colorMode: 'cmyk-convert' },
};
