import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('los grupos de herramientas conservan botones únicos y panel flotante asociado', () => {
  const template = read('packages/ui/src/components/EditorTemplate.ts');
  const controller = read('packages/ui/src/managers/ToolGroupFlyoutController.ts');
  const groupIds = ['direct-drawing-group', 'correction-tools-group', 'pixel-shapes-group', 'fill-color-group', 'selection-tools-group', 'vector-shapes-group', 'comic-guides-group'];
  groupIds.forEach((id) => assert.ok(template.includes(`id="${id}"`), `Falta el grupo ${id}`));
  const expectedCounts = new Map([
    ['direct-drawing-group', 5],
    ['correction-tools-group', 7],
    ['pixel-shapes-group', 9],
    ['fill-color-group', 3],
    ['selection-tools-group', 8],
    ['vector-shapes-group', 10],
    ['comic-guides-group', 5],
  ]);
  for (const [id, expected] of expectedCounts) {
    const group = template.match(new RegExp(`<details class=\"tools-rail-group\" id=\"${id}\"[^>]*>([\\s\\S]*?)</details>`));
    assert.ok(group, `No se pudo leer ${id}`);
    assert.equal((group[1].match(/<button\b/g) ?? []).length, expected, `Cantidad de herramientas incorrecta en ${id}`);
  }
  assert.ok(template.includes('id="tool-group-flyout-host"'));
  assert.ok(controller.includes('this.flyout.replaceChildren(items)'));
  assert.ok(controller.includes('group.appendChild(items)'));
  assert.ok(controller.includes('summaryRect.top - workspaceRect.top'));
});

test('el panel flotante ajusta su altura al contenido sin imponer una lista de tamaño fijo', () => {
  const styles = read('apps/web/src/styles.css');
  assert.match(styles, /\.tool-group-flyout\s*\{/);
  assert.match(styles, /\.tool-group-flyout\s*>\s*\.tools-rail-group-items\s*\{[\s\S]*?width:\s*50px/);
  assert.match(styles, /\.tool-group-flyout\s*>\s*\.tools-rail-group-items\s*\{[\s\S]*?overflow-y:\s*auto/);
});

test('el bote de pintura expone el catálogo de preajustes y utiliza el mismo estado de textura', () => {
  const state = read('packages/ui/src/app/AppLayerStateFeatures.ts');
  const drawing = read('packages/ui/src/app/AppDrawingFeatures.ts');
  assert.ok(state.includes('id="tool-fill-brush-preset"'));
  assert.ok(state.includes("fillPreset.onchange = () => this.applyBrushPreset(fillPreset.value)"));
  assert.ok(state.includes("host.querySelector<HTMLSelectElement>('#tool-brush-preset, #tool-fill-brush-preset')"));
  assert.ok(drawing.includes('texturePattern: this.brush.texturePattern'));
  assert.ok(drawing.includes('textureSeed: this.brush.textureSeed'));
});
