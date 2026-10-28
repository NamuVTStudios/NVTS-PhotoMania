import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const toolSource = readFileSync(resolve(root, 'packages/ui/src/tools/ToolsBase.ts'), 'utf8');
const panelSource = readFileSync(resolve(root, 'packages/ui/src/panels/AdvancedToolOptionsPanel.ts'), 'utf8');
const controllerSource = readFileSync(resolve(root, 'packages/ui/src/panels/advanced-tool-options/AdvancedToolOptionsController.ts'), 'utf8');
const registrySource = readFileSync(resolve(root, 'packages/ui/src/panels/advanced-tool-options/ToolOptionsRegistry.ts'), 'utf8');
const toolOptionsDir = resolve(root, 'packages/ui/src/panels/advanced-tool-options/tools');
const editorTemplate = readFileSync(resolve(root, 'packages/ui/src/components/EditorTemplate.ts'), 'utf8');
const cssSource = readFileSync(resolve(root, 'apps/web/src/styles.css'), 'utf8');

const toolIds = [
  'brush', 'eraser', 'eyedropper', 'line', 'rectangle', 'ellipse', 'fill', 'hand', 'text',
  'vector-select', 'clone-stamp', 'comic-panel', 'gradient', 'smudge', 'liquify',
  'vector-rectangle', 'vector-rounded-rectangle', 'vector-ellipse', 'vector-line', 'vector-pen', 'vector-polygon', 'vector-star', 'vector-freehand', 'vector-polyline', 'vector-spiral',
  'pixel-rounded-rectangle', 'pixel-polyline', 'pixel-bezier', 'pixel-polygon', 'pixel-star', 'pixel-spiral',
];

const toolIcons = {
  brush: 'brush.svg', eraser: 'eraser.svg', eyedropper: 'eyedropper.svg', line: 'line.svg',
  rectangle: 'rectangle.svg', ellipse: 'ellipse.svg', fill: 'fill.svg', hand: 'hand.svg',
  text: 'text.svg', 'vector-select': 'vector-select.svg', 'clone-stamp': 'clone-stamp.svg',
  'comic-panel': 'comic-panel.svg', gradient: 'gradient.svg', smudge: 'smudge.svg', liquify: 'liquify.svg',
  'vector-rectangle': 'vector-rectangle.svg', 'vector-ellipse': 'vector-ellipse.svg',
  'vector-line': 'vector-line.svg', 'vector-pen': 'vector-pen.svg',
  'vector-polygon': 'vector-polygon.svg', 'vector-star': 'vector-star.svg',
  'vector-freehand': 'vector-freehand.svg',
  'vector-rounded-rectangle': 'vector-rounded-rectangle.svg', 'vector-polyline': 'vector-polyline.svg', 'vector-spiral': 'vector-spiral.svg',
  'pixel-rounded-rectangle': 'pixel-rounded-rectangle.svg', 'pixel-polyline': 'pixel-polyline.svg', 'pixel-bezier': 'pixel-bezier.svg',
  'pixel-polygon': 'pixel-polygon.svg', 'pixel-star': 'pixel-star.svg', 'pixel-spiral': 'pixel-spiral.svg',
};

test('cada herramienta dispone de un archivo propio para sus opciones avanzadas', () => {
  for (const tool of toolIds) {
    assert.ok(toolSource.includes(`'${tool}'`), `La herramienta ${tool} no aparece en ToolId.`);
    const fileName = `${tool.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')}ToolOptions.ts`;
    assert.equal(existsSync(resolve(toolOptionsDir, fileName)), true, `Falta el módulo de opciones para ${tool}.`);
    assert.ok(registrySource.includes(`${tool}:`) || registrySource.includes(`'${tool}':`), `La herramienta ${tool} no está registrada.`);
  }
  assert.match(panelSource, /ADVANCED_TOOL_OPTIONS_PANEL_TEMPLATE/);
  assert.doesNotMatch(panelSource, /switch \(tool\)|function get[A-Z]/);
  assert.match(controllerSource, /ADVANCED_TOOL_OPTIONS_REGISTRY/);
});

test('la simetría tiene controles horizontales y verticales independientes', () => {
  assert.match(editorTemplate, /toggle-comic-symmetry-vertical/);
  assert.match(editorTemplate, /toggle-comic-symmetry-horizontal/);
  const overlay = readFileSync(resolve(root, 'packages/ui/src/features/comics/ComicGuideOverlay.ts'), 'utf8');
  assert.match(overlay, /toggleSymmetryAxis\('vertical'\)/);
  assert.match(overlay, /toggleSymmetryAxis\('horizontal'\)/);
});

test('cada herramienta de la barra tiene SVG propio y una máscara CSS conectada', () => {
  for (const [tool, iconFile] of Object.entries(toolIcons)) {
    const iconPath = resolve(root, 'apps/web/src/icons/tools', iconFile);
    assert.equal(existsSync(iconPath), true, `Falta el SVG de ${tool}.`);
    const svg = readFileSync(iconPath, 'utf8');
    assert.match(svg, /<svg\b/, `El icono de ${tool} no parece SVG.`);
    assert.match(svg, /viewBox=/, `El icono de ${tool} no define viewBox.`);
    assert.ok(cssSource.includes(`tool-icon--${tool}`), `Falta la clase CSS para ${tool}.`);
    assert.ok(cssSource.includes(`./icons/tools/${iconFile}`), `La máscara CSS no carga ${iconFile}.`);
  }
});
