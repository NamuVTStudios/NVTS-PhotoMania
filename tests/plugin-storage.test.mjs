import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let readStoredPlugins;
let writeStoredPlugins;
let storageValues;
const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

before(async () => {
  vite = await createViteTestServer();
  ({ readStoredPlugins, writeStoredPlugins } = await vite.ssrLoadModule('/packages/ui/src/panels/PluginStorage.ts'));
});

after(async () => {
  await vite?.close();
  if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor);
  else delete globalThis.localStorage;
});

function installStorage(value = null, shouldThrow = false) {
  storageValues = new Map(value === null ? [] : [['nvts-photomania-plugins-v1', value]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        if (shouldThrow) throw new Error('storage blocked');
        return storageValues.get(key) ?? null;
      },
      setItem(key, nextValue) {
        if (shouldThrow) throw new Error('storage blocked');
        storageValues.set(key, nextValue);
      },
    },
  });
}

test('normaliza entradas inválidas y recupera una lista vacía ante JSON corrupto', () => {
  const validPlugin = { id: 'plugin-1', name: 'Ejemplo', fileName: 'ejemplo.js', source: 'export function activate() {}', installedAt: 10 };
  installStorage(JSON.stringify([validPlugin, null, { id: 3, name: 'Inválido' }]));
  assert.deepEqual(readStoredPlugins(), [validPlugin]);

  installStorage('{bad json');
  assert.deepEqual(readStoredPlugins(), []);
});

test('conserva la clave y estructura actual al persistir plugins', () => {
  installStorage();
  const plugins = [{ id: 'plugin-2', name: 'Otro', fileName: 'otro.mjs', source: 'export default () => {}', installedAt: 20 }];

  writeStoredPlugins(plugins);
  assert.equal(storageValues.get('nvts-photomania-plugins-v1'), JSON.stringify(plugins));
  assert.deepEqual(readStoredPlugins(), plugins);
});

test('continúa con una lista vacía si el navegador bloquea el acceso de lectura', () => {
  installStorage(null, true);
  assert.deepEqual(readStoredPlugins(), []);
});
