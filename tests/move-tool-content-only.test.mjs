import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const currentDir = dirname(fileURLToPath(import.meta.url));
const drawingSource = await readFile(resolve(currentDir, '../packages/ui/src/app/AppDrawingFeatures.ts'), 'utf8');

function extractMethod(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `Missing method: ${signature}`);
  const end = source.indexOf(nextSignature, start);
  assert.notEqual(end, -1, `Missing method boundary: ${nextSignature}`);
  return source.slice(start, end);
}

test('Move gesture edits layer content and does not create transform masks', () => {
  const move = extractMethod(drawingSource, 'protected beginElementMove(', '  private reportMoveUnavailable(');
  const finish = extractMethod(drawingSource, '  private finishElementMove(', '  private commitLayerContentMove(');
  const commit = extractMethod(drawingSource, '  private commitLayerContentMove(', '  private commitTextLayerMove(');
  assert.match(move, /content-only/);
  assert.doesNotMatch(move, /beginLayerTransformSession|createLayerMask/);
  assert.doesNotMatch(finish, /beginLayerTransformSession|createLayerMask/);
  assert.doesNotMatch(commit, /beginLayerTransformSession|createLayerMask/);
});
