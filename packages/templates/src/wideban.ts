import type { TemplateDef } from './types';

/** Manga Wideban. Print measurements are starting points and must be confirmed with the printer. */
export const WidebanTemplate: TemplateDef = {
  id: 'wideban',
  extendsId: 'kanzenban',
  title: 'Manga Wideban',
  category: 'Cómic e ilustración',
  width: 1748,
  height: 2480,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 148, finishedHeightMm: 210, bleedMm: 3, safeMarginMm: 6,
    innerMarginMm: 12, outerMarginMm: 6, topMarginMm: 6, bottomMarginMm: 6,
    readingDirection: 'rtl', colorMode: 'grayscale',
  },
};
