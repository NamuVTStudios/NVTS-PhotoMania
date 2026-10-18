import type { TemplateDef } from './types';
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
import { textureUvTemplate } from './texture-uv';
import { textureUv4KTemplate } from './texture-uv-4k';
import { texture2DTemplate } from './texture-2d';
import { texture2DWideTemplate } from './texture-2d-wide';

export type { TemplateDef } from './types';

// Export individual definitions so other NVTS applications can import only
// the presets they need, without depending on PhotoMania's UI.
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
  textureUvTemplate,
  textureUv4KTemplate,
  texture2DTemplate,
  texture2DWideTemplate,
};

/** Shared template catalog for NVTS applications. Each preset lives in its own module. */
export const TEMPLATES: readonly TemplateDef[] = [
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
  textureUvTemplate,
  textureUv4KTemplate,
  texture2DTemplate,
  texture2DWideTemplate,
];
