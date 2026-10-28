import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let DocumentFormatRegistry;
let NvtsPhotoFormatAdapter;

before(async () => {
  vite = await createViteTestServer();
  ({ DocumentFormatRegistry } = await vite.ssrLoadModule('/packages/storage/src/adapters/DocumentFormatRegistry.ts'));
  ({ NvtsPhotoFormatAdapter } = await vite.ssrLoadModule('/packages/storage/src/adapters/NvtsPhotoFormatAdapter.ts'));
});

after(async () => {
  await vite?.close();
});

function makeRegistry() {
  return new DocumentFormatRegistry([new NvtsPhotoFormatAdapter()]);
}

function makeDocument() {
  return {
    id: 'adapter-document',
    name: 'Adapter test',
    width: 1,
    height: 1,
    layers: [{
      id: 'adapter-layer', type: 'paint', name: 'Layer', visible: true, locked: false,
      opacity: 1, blendMode: 'normal', children: [],
    }],
  };
}

test('format registry normalizes extensions and round-trips through the native adapter', () => {
  const registry = makeRegistry();
  const writer = registry.findWriter('NVTSPhoto');
  const bytes = writer.encode(makeDocument(), () => Uint8Array.from([10, 20, 30, 255]));
  const reader = registry.findReader(bytes, 'project.nvtsphoto');
  const restored = reader.decode(bytes);

  assert.equal(writer.id, 'nvtsphoto');
  assert.equal(reader.id, 'nvtsphoto');
  assert.equal(restored.doc.name, 'Adapter test');
  assert.equal(restored.doc.layers[0].id, 'adapter-layer');
  assert.deepEqual([...restored.pixels.get('adapter-layer')], [10, 20, 30, 255]);
});

test('format registry rejects unsupported readers and writers explicitly', () => {
  const registry = makeRegistry();
  assert.throws(() => registry.findWriter('.psd'), /No hay un adaptador de escritura/);
  assert.throws(() => registry.findReader(new Uint8Array([0, 0, 0]), 'unknown.bin'), /No hay un adaptador compatible/);
});
