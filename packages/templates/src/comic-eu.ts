import type { TemplateDef } from './types';

/* Cómic europeo: 2100 × 2970 px. */
export const comicEuTemplate: TemplateDef = {
  id: 'comic-eu',
  title: 'Cómic europeo',
  category: 'Cómic e ilustración',
  width: 2100,
  height: 2970,
  icon: '▤',
  preview: 'portrait',
  printProfile: { finishedWidthMm: 210, finishedHeightMm: 297, bleedMm: 3, safeMarginMm: 12, innerMarginMm: 15, outerMarginMm: 15, topMarginMm: 14.5, bottomMarginMm: 14.5, readingDirection: 'ltr', colorMode: 'cmyk-convert' },
};
