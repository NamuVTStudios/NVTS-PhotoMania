import type { TemplateDef } from './types';

/** Manga Tankōbon B6. Print measurements are starting points and must be confirmed with the printer. */
export const TankobonTemplate: TemplateDef = {
  id: 'tankobon',
  title: 'Manga Tankōbon B6',
  category: 'Cómic e ilustración',
  width: 1512,
  height: 2150,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 128, finishedHeightMm: 182, bleedMm: 3, safeMarginMm: 5,
    innerMarginMm: 10, outerMarginMm: 5, topMarginMm: 5, bottomMarginMm: 5,
    readingDirection: 'rtl', colorMode: 'grayscale',
  },
};
