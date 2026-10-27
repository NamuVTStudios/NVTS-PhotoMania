import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let FILTER_KINDS;
let isFilterKind;

before(async () => {
  vite = await createViteTestServer();
  ({ FILTER_KINDS, isFilterKind } = await vite.ssrLoadModule('/packages/shared/src/nvtsphoto.ts'));
});

after(async () => {
  await vite?.close();
});

test('el catálogo valida todos los filtros soportados y rechaza valores ajenos', () => {
  assert.equal(FILTER_KINDS.length, 17);
  for (const kind of FILTER_KINDS) assert.equal(isFilterKind(kind), true);
  assert.equal(isFilterKind('unknown-filter'), false);
  assert.equal(isFilterKind(undefined), false);
});
