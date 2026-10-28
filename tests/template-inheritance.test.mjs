import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let resolveTemplateInheritance;
let templates;

before(async () => {
  vite = await createViteTestServer();
  ({ resolveTemplateInheritance } = await vite.ssrLoadModule('/packages/templates/src/inheritance.ts'));
  ({ TEMPLATES: templates } = await vite.ssrLoadModule('/packages/templates/src/index.ts'));
});

after(async () => {
  await vite?.close();
});

test('resolves inherited template fields and lets the child override parent values', () => {
  const result = resolveTemplateInheritance([
    { id: 'base', title: 'Base', category: 'Test', width: 100, height: 200, icon: 'x', preview: 'portrait', printProfile: { finishedWidthMm: 10, finishedHeightMm: 20, bleedMm: 3, safeMarginMm: 5, innerMarginMm: 8, outerMarginMm: 5, topMarginMm: 5, bottomMarginMm: 5, readingDirection: 'rtl', colorMode: 'grayscale' } },
    { id: 'child', extendsId: 'base', title: 'Child', category: 'Test', width: 120, height: 240, icon: 'y', preview: 'portrait', printProfile: { finishedWidthMm: 12, finishedHeightMm: 24, bleedMm: 4, safeMarginMm: 5, innerMarginMm: 8, outerMarginMm: 5, topMarginMm: 5, bottomMarginMm: 5, readingDirection: 'rtl', colorMode: 'grayscale' } },
  ]);
  assert.equal(result[1].title, 'Child');
  assert.equal(result[1].width, 120);
  assert.equal(result[1].printProfile.bleedMm, 4);
  assert.equal('extendsId' in result[1], false);
});

test('rejects missing parents and inheritance cycles', () => {
  assert.throws(() => resolveTemplateInheritance([{ id: 'child', extendsId: 'missing', title: 'Child', category: 'Test', width: 1, height: 1, icon: 'x', preview: 'square' }]), /inexistente/);
  assert.throws(() => resolveTemplateInheritance([
    { id: 'a', extendsId: 'b', title: 'A', category: 'Test', width: 1, height: 1, icon: 'x', preview: 'square' },
    { id: 'b', extendsId: 'a', title: 'B', category: 'Test', width: 1, height: 1, icon: 'x', preview: 'square' },
  ]), /circular/);
});

test('catalog exposes fully resolved manga and print presets', () => {
  const tankobon = templates.find((template) => template.id === 'tankobon');
  const kanzenban = templates.find((template) => template.id === 'kanzenban');
  assert.ok(tankobon?.printProfile);
  assert.ok(kanzenban?.printProfile);
  assert.equal('extendsId' in kanzenban, false);
  assert.equal(kanzenban.printProfile.readingDirection, 'rtl');
});
