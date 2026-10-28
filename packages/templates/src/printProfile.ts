import type { TemplateDef } from './types';

export interface PrintBoundsMm {
  pageWidthMm: number;
  pageHeightMm: number;
  bleedMm: number;
  safeMarginMm: number;
  innerMarginMm: number;
  outerMarginMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
}

export interface PrintGuideRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Converts millimetres to pixels at the requested effective print resolution. */
export function millimetresToPixels(valueMm: number, dpi: number): number {
  return Math.round((Math.max(0, valueMm) * Math.max(1, dpi)) / 25.4);
}

/** Calculates canvas, trim and safe-area rectangles without mutating the template. */
export function calculatePrintGuideRects(profile: PrintBoundsMm, dpi: number): {
  canvas: PrintGuideRect;
  trim: PrintGuideRect;
  safe: PrintGuideRect;
} {
  const bleed = millimetresToPixels(profile.bleedMm, dpi);
  const pageWidth = millimetresToPixels(profile.pageWidthMm, dpi);
  const pageHeight = millimetresToPixels(profile.pageHeightMm, dpi);
  const leftSafe = millimetresToPixels(profile.innerMarginMm, dpi);
  const rightSafe = millimetresToPixels(profile.outerMarginMm, dpi);
  const topSafe = millimetresToPixels(profile.topMarginMm, dpi);
  const bottomSafe = millimetresToPixels(profile.bottomMarginMm, dpi);
  const trim = { x: bleed, y: bleed, width: pageWidth, height: pageHeight };
  return {
    canvas: { x: 0, y: 0, width: pageWidth + bleed * 2, height: pageHeight + bleed * 2 },
    trim,
    safe: {
      x: trim.x + leftSafe,
      y: trim.y + topSafe,
      width: Math.max(0, pageWidth - leftSafe - rightSafe),
      height: Math.max(0, pageHeight - topSafe - bottomSafe),
    },
  };
}

export function getTemplatePrintProfile(template: TemplateDef): TemplateDef['printProfile'] {
  return template.printProfile;
}
