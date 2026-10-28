import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let templates;
let TEMPLATES;
let calculatePrintGuideRects;
let millimetresToPixels;

before(async () => {
  vite = await createViteTestServer();
  ({ TEMPLATES, calculatePrintGuideRects, millimetresToPixels } = await vite.ssrLoadModule('/packages/templates/src/index.ts'));
  templates = TEMPLATES;
});

after(async () => { await vite?.close(); });

test('comic and manga print templates expose editable print profiles', () => {
  const ids = ['tankobon', 'kanzenban', 'shinchoban', 'bunkoban', 'manga-b5', 'wideban', 'aizoban', 'soshuhen', 'doujinshi-b5', 'manhwa-print', 'comic-eu', 'comic-eu-album'];
  ids.forEach((id) => assert.ok(templates.find((template) => template.id === id)?.printProfile, `missing print profile: ${id}`));
});

test('webtoon template does not apply physical print bleed', () => {
  const template = templates.find((item) => item.id === 'webtoon-vertical');
  assert.ok(template);
  assert.equal(template.printProfile.bleedMm, 0);
  assert.equal(template.printProfile.readingDirection, 'vertical');
});

test('print guide rectangles separate bleed, trim and safe area', () => {
  assert.equal(millimetresToPixels(25.4, 300), 300);
  const rects = calculatePrintGuideRects({ pageWidthMm: 100, pageHeightMm: 200, bleedMm: 3, safeMarginMm: 5, innerMarginMm: 10, outerMarginMm: 5, topMarginMm: 6, bottomMarginMm: 8 }, 300);
  assert.ok(rects.canvas.width > rects.trim.width);
  assert.equal(rects.trim.x, millimetresToPixels(3, 300));
  assert.ok(rects.safe.width < rects.trim.width);
  assert.ok(rects.safe.height < rects.trim.height);
});
