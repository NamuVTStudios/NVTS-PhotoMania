import type { TemplateDef } from './types';

/** Manga Sōshūhen recopilatorio. Print measurements are starting points and must be confirmed with the printer. */
export const SoshuhenTemplate: TemplateDef = {
  id: 'soshuhen',
  extendsId: 'manga',
  title: 'Manga Sōshūhen recopilatorio',
  category: 'Cómic e ilustración',
  width: 2480,
  height: 3508,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 210, finishedHeightMm: 297, bleedMm: 3, safeMarginMm: 3,
    innerMarginMm: 12, outerMarginMm: 15, topMarginMm: 15, bottomMarginMm: 15,
    readingDirection: 'rtl', colorMode: 'grayscale',
  },
};
