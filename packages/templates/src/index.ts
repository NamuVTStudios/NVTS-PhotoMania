import type { TemplateDef } from './types';
import { createProgramTemplateRegistry } from '@nvts/shared-core/templates';
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
import { comicUsTemplate } from './comic-us';
import { comicEuTemplate } from './comic-eu';
import { mangaTemplate } from './manga';
import { manhwaTemplate } from './manhwa';

export type { TemplateDef } from './types';
export {
    Template,
    TemplateRegistry,
    resolveTemplateInheritance,
    getSharedTemplatesForProgram,
    getSharedTemplateDefinitionsForProgram,
} from '@nvts/shared-core/templates';
export { calculatePrintGuideRects, getTemplatePrintProfile, millimetresToPixels } from './printProfile';
export type { PrintBoundsMm, PrintGuideRect } from './printProfile';

// All generic reusable canvas, print, media, animation and texture presets are owned by Shared Core.
export {
    instagramPostTemplate,
    instagramStoryTemplate,
    youtubeThumbTemplate,
    facebookPostTemplate,
    facebookStoryTemplate,
    tiktokPostTemplate,
    tiktokStoryTemplate,
    fullHdTemplate,
    fourKUhdTemplate,
    a4Template,
    animation2DTemplate,
    animationVerticalTemplate,
    animationWebTemplate,
    storyboardHorizontalTemplate,
    storyboardVerticalTemplate,
    texture2DTemplate,
    texture2DWideTemplate,
    textureUvTemplate,
    textureUv4KTemplate,
} from '@nvts/shared-core/templates';

// Only comic, manga and manhwa formats unique to PhotoMania remain in this package.
export {
    comicUsTemplate,
    comicEuTemplate,
    mangaTemplate,
    manhwaTemplate,
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

const PHOTO_MANIA_SPECIALIST_TEMPLATES: readonly TemplateDef[] = [
    comicUsTemplate,
    comicEuTemplate,
    mangaTemplate,
    manhwaTemplate,
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

export const TEMPLATE_REGISTRY = createProgramTemplateRegistry(
    'NVTS-PhotoMania',
    PHOTO_MANIA_SPECIALIST_TEMPLATES,
);

export const TEMPLATES = TEMPLATE_REGISTRY.list();
