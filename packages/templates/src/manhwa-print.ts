import type { TemplateDef } from './types';

/** Manhwa impreso A5. Print measurements are starting points and must be confirmed with the printer. */
export const ManhwaPrintTemplate: TemplateDef = {
  id: 'manhwa-print',
  extendsId: 'manhwa',
  title: 'Manhwa impreso A5',
  category: 'Cómic e ilustración',
  width: 1748,
  height: 2480,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 148, finishedHeightMm: 210, bleedMm: 3, safeMarginMm: 3,
    innerMarginMm: 6, outerMarginMm: 6, topMarginMm: 6, bottomMarginMm: 6,
    readingDirection: 'ltr', colorMode: 'rgb',
  },
};
