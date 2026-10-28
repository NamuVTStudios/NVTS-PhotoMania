import type { TemplateDef } from './types';
import { resolveTemplateInheritance } from './inheritance';
import { TankobonTemplate } from './tankobon';
import { KanzenbanTemplate } from './kanzenban';
import { ShinchobanTemplate } from './shinchoban';
import { BunkobanTemplate } from './bunkoban';
import { MangaB5Template } from './manga-b5';
import { WidebanTemplate } from './wideban';
import { AizobanTemplate } from './aizoban';
import { SoshuhenTemplate } from './soshuhen';
import { DoujinshiB5Template } from './doujinshi-b5';
import { WebtoonVerticalTemplate } from './webtoon-vertical';
import { ManhwaPrintTemplate } from './manhwa-print';
import { GraphicNovelTemplate } from './graphic-novel';
import { ComicEuAlbumTemplate } from './comic-eu-album';
import { instagramPostTemplate } from './instagram-post';
import { instagramStoryTemplate } from './instagram-story';
import { youtubeThumbTemplate } from './youtube-thumb';
import { fullHdTemplate } from './full-hd';
import { fourKUhdTemplate } from './4k-uhd';
import { a4Template } from './a4';
import { comicUsTemplate } from './comic-us';
import { comicEuTemplate } from './comic-eu';
import { mangaTemplate } from './manga';
import { manhwaTemplate } from './manhwa';
import { facebookPostTemplate } from './facebook-post';
import { facebookStoryTemplate } from './facebook-story';
import { tiktokPostTemplate } from './tiktok-post';
import { tiktokStoryTemplate } from './tiktok-story';
import { animationWebTemplate } from './animation-web';
import { animation2DTemplate } from './animation-2d';
import { storyboardHorizontalTemplate } from './storyboard-horizontal';
import { storyboardVerticalTemplate } from './storyboard-vertical';
import { animationVerticalTemplate } from './animation-vertical';
import { textureUvTemplate } from './texture-uv';
import { textureUv4KTemplate } from './texture-uv-4k';
import { texture2DTemplate } from './texture-2d';
import { texture2DWideTemplate } from './texture-2d-wide';

export type { TemplateDef } from './types';
export { resolveTemplateInheritance } from './inheritance';
export { calculatePrintGuideRects, getTemplatePrintProfile, millimetresToPixels } from './printProfile';
export type { PrintBoundsMm, PrintGuideRect } from './printProfile';

// Export individual definitions so other NVTS applications can import only the presets they need, without depending on PhotoMania's UI.
export {
  instagramPostTemplate,
  instagramStoryTemplate,
  youtubeThumbTemplate,
  fullHdTemplate,
  fourKUhdTemplate,
  a4Template,
  comicUsTemplate,
  comicEuTemplate,
  mangaTemplate,
  manhwaTemplate,
  facebookPostTemplate,
  facebookStoryTemplate,
  tiktokPostTemplate,
  tiktokStoryTemplate,
  animationWebTemplate,
  animation2DTemplate,
  storyboardHorizontalTemplate,
  storyboardVerticalTemplate,
  animationVerticalTemplate,
  textureUvTemplate,
  textureUv4KTemplate,
  texture2DTemplate,
  texture2DWideTemplate,
  TankobonTemplate,
  KanzenbanTemplate,
  ShinchobanTemplate,
  BunkobanTemplate,
  MangaB5Template,
  WidebanTemplate,
  AizobanTemplate,
  SoshuhenTemplate,
  DoujinshiB5Template,
  WebtoonVerticalTemplate,
  ManhwaPrintTemplate,
  GraphicNovelTemplate,
  ComicEuAlbumTemplate,
};

/** Shared template catalog for NVTS applications. Each preset lives in its own module. */
const TEMPLATE_DEFINITIONS: readonly TemplateDef[] = [
  instagramPostTemplate,
  instagramStoryTemplate,
  youtubeThumbTemplate,
  fullHdTemplate,
  fourKUhdTemplate,
  a4Template,
  comicUsTemplate,
  comicEuTemplate,
  mangaTemplate,
  manhwaTemplate,
  facebookPostTemplate,
  facebookStoryTemplate,
  tiktokPostTemplate,
  tiktokStoryTemplate,
  animationWebTemplate,
  animation2DTemplate,
  storyboardHorizontalTemplate,
  storyboardVerticalTemplate,
  animationVerticalTemplate,
  textureUvTemplate,
  textureUv4KTemplate,
  texture2DTemplate,
  texture2DWideTemplate,
  TankobonTemplate,
  KanzenbanTemplate,
  ShinchobanTemplate,
  BunkobanTemplate,
  MangaB5Template,
  WidebanTemplate,
  AizobanTemplate,
  SoshuhenTemplate,
  DoujinshiB5Template,
  WebtoonVerticalTemplate,
  ManhwaPrintTemplate,
  GraphicNovelTemplate,
  ComicEuAlbumTemplate,
];

/** Catalog with parent presets resolved; consumers receive complete, independent definitions. */
export const TEMPLATES: readonly TemplateDef[] = resolveTemplateInheritance(TEMPLATE_DEFINITIONS);
