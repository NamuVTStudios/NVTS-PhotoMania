import type { TemplateDef } from './types';

/** Manga Shinchōban. Print measurements are starting points and must be confirmed with the printer. */
export const ShinchobanTemplate: TemplateDef = {
  id: 'shinchoban',
  extendsId: 'tankobon',
  title: 'Manga Shinchōban',
  category: 'Cómic e ilustración',
  width: 1323,
  height: 2055,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 112, finishedHeightMm: 174, bleedMm: 3, safeMarginMm: 5,
    innerMarginMm: 9, outerMarginMm: 5, topMarginMm: 5, bottomMarginMm: 5,
    readingDirection: 'rtl', colorMode: 'grayscale',
  },
};
