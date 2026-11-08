import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const projectRoot = resolve(import.meta.dirname, '..');
const ecosystemRoot = resolve(projectRoot, '..');
const sharedCoreRoot = resolve(ecosystemRoot, 'NVTS-Shared-Core');

const libraries = [
  ['CanvasKit', 'libraries/rendering/canvaskit/index.mjs', 'loadCanvasKit'],
  ['PixiJS', 'libraries/rendering/pixijs/index.mjs', 'loadPixiJS'],
  ['OpenImageIO', 'libraries/imaging/openimageio/index.mjs', 'loadOpenImageIO'],
  ['OpenColorIO', 'libraries/imaging/opencolorio/index.mjs', 'loadOpenColorIO'],
];

test('PhotoMania resolves the four agreed runtimes from Shared Core', async () => {
  for (const [name, relativePath, loaderName] of libraries) {
    const module = await import(pathToFileURL(resolve(sharedCoreRoot, relativePath)));
    assert.equal(typeof module[loaderName], 'function', `${name} loader must be exported`);
  }
});

test('PixiJS runtime is consumed through the PhotoMania renderer boundary', async () => {
  const source = await readFile(resolve(projectRoot, 'packages/renderer/SharedCorePixiRuntime.ts'), 'utf8');
  assert.match(source, /@nvts\/shared-core\/libraries\/pixijs/);
  assert.match(source, /loadPixiJS/);
  assert.match(source, /application\.init\(options\)/);
});

test('Duplicate and rename layer commands remain only in the unchanged Layer menu', async () => {
  const source = await readFile(resolve(projectRoot, 'packages/ui/src/components/ShellTemplates.ts'), 'utf8');
  assert.match(source, /renderDeclaredMenu\(MENU_DEFINITIONS\.edit, uiIcon\)/);
  assert.match(source, /data-layer-action=\"duplicate\"/);
  assert.match(source, /data-layer-action=\"rename\"/);
  const definitions = await import(pathToFileURL(resolve(projectRoot, 'packages/ui/src/menus/MenuDefinitions.mjs')));
  const editItems = definitions.MENU_DEFINITIONS.edit.items.flatMap((item) => item.submenu ?? [item]);
  assert.doesNotMatch(JSON.stringify(editItems), /Duplicar capa|Cambiar nombre de capa|edit-duplicate-layer|edit-rename-layer/);
  const bindings = await readFile(resolve(projectRoot, 'packages/ui/src/app/AppEventFeatures.ts'), 'utf8');
  assert.doesNotMatch(bindings, /#edit-duplicate-layer|#edit-rename-layer/);
});
