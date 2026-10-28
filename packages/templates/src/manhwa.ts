import type { TemplateDef } from './types';

/* Manhwa / Webtoon: 800 × 1280 px. */
export const manhwaTemplate: TemplateDef = {
  id: 'manhwa',
  title: 'Manhwa / Webtoon',
  category: 'Cómic e ilustración',
  width: 800,
  height: 1280,
  icon: '▥',
  preview: 'portrait',
  printProfile: { finishedWidthMm: 148, finishedHeightMm: 210, bleedMm: 3, safeMarginMm: 5, innerMarginMm: 8, outerMarginMm: 5, topMarginMm: 5, bottomMarginMm: 5, readingDirection: 'vertical', colorMode: 'rgb' },
};
