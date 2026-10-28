import type { TemplateDef } from './types';

/** Álbum europeo ampliado. Print measurements are starting points and must be confirmed with the printer. */
export const ComicEuAlbumTemplate: TemplateDef = {
  id: 'comic-eu-album',
  extendsId: 'comic-eu',
  title: 'Álbum europeo ampliado',
  category: 'Cómic e ilustración',
  width: 2717,
  height: 3780,
  icon: '▤',
  preview: 'portrait',
  printProfile: {
    finishedWidthMm: 230, finishedHeightMm: 320, bleedMm: 3, safeMarginMm: 3,
    innerMarginMm: 12, outerMarginMm: 15, topMarginMm: 14.5, bottomMarginMm: 14.5,
    readingDirection: 'ltr', colorMode: 'cmyk-convert',
  },
};
