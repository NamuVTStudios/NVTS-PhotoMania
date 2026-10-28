import type { TemplateDef } from './types';

/** Webtoon vertical. Print measurements are starting points and must be confirmed with the printer. */
export const WebtoonVerticalTemplate: TemplateDef = {
  id: 'webtoon-vertical',
  title: 'Webtoon vertical',
  category: 'Cómic e ilustración',
  width: 800,
  height: 3200,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 0, finishedHeightMm: 0, bleedMm: 0, safeMarginMm: 0,
    innerMarginMm: 40, outerMarginMm: 0, topMarginMm: 0, bottomMarginMm: 0,
    readingDirection: 'vertical', colorMode: 'rgb',
  },
};
