import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../apps/web/src');
const names = ['pixel-star', 'vector-star', 'pixel-spiral', 'vector-spiral', 'pixel-polygon', 'vector-polygon', 'pixel-polyline', 'vector-polyline', 'group-drawing', 'group-correction', 'group-pixel', 'group-fill', 'group-selection', 'group-vector', 'group-comic'];

test('cada herramienta raster/vector y grupo tiene un SVG propio mapeado', async () => {
  const css = await readFile(resolve(root, 'styles.css'), 'utf8');
  const hashes = new Set();
  for (const name of names) {
    const svg = await readFile(resolve(root, 'icons/tools', `${name}.svg`));
    const hash = createHash('sha256').update(svg).digest('hex');
    assert.ok(!hashes.has(hash), `Icono duplicado: ${name}`);
    hashes.add(hash);
    assert.ok(css.includes(`tool-icon--${name}`), `Falta el mapeo CSS de ${name}`);
  }
});
