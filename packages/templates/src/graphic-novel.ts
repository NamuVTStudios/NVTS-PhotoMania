import type { TemplateDef } from './types';

/** Novela gráfica. Print measurements are starting points and must be confirmed with the printer. */
export const GraphicNovelTemplate: TemplateDef = {
  id: 'graphic-novel',
  extendsId: 'comic-eu',
  title: 'Novela gráfica',
  category: 'Cómic e ilustración',
  width: 1795,
  height: 2705,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 152, finishedHeightMm: 229, bleedMm: 3, safeMarginMm: 3,
    innerMarginMm: 8, outerMarginMm: 8, topMarginMm: 8, bottomMarginMm: 8,
    readingDirection: 'ltr', colorMode: 'cmyk-convert',
  },
};
