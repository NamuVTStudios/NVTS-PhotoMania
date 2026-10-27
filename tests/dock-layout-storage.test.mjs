import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let readDockLayout;
let writeDockLayout;
const originalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

before(async () => {
  vite = await createViteTestServer();
  ({ readDockLayout, writeDockLayout } = await vite.ssrLoadModule('/packages/ui/src/panels/DockLayoutStorage.ts'));
});

after(async () => {
  await vite?.close();
  if (originalStorageDescriptor) Object.defineProperty(globalThis, 'localStorage', originalStorageDescriptor);
  else delete globalThis.localStorage;
});

function useStorage(value = null, { getError = false, setError = false } = {}) {
  const entries = new Map(value === null ? [] : [['nvts-photomania-dock-layout-v1', value]]);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key) {
        if (getError) throw new Error('storage read denied');
        return entries.get(key) ?? null;
      },
      setItem(key, nextValue) {
        if (setError) throw new Error('storage write denied');
        entries.set(key, nextValue);
      },
    },
  });
  return entries;
}

test('usa un layout vacío ante datos corruptos o versiones incompatibles', () => {
  useStorage('{invalid');
  assert.deepEqual(readDockLayout(), { version: 1, workspaces: {} });

  useStorage(JSON.stringify({ version: 2, workspaces: {} }));
  assert.deepEqual(readDockLayout(), { version: 1, workspaces: {} });
});

test('persiste y restaura el estado del workspace sin cambiar su formato', () => {
  const storage = useStorage();
  const state = {
    version: 1,
    workspaces: {
      general: {
        dockWidth: 320,
        panelsHidden: false,
        order: ['layers'],
        panels: { layers: { visible: true, floating: false, x: 0, y: 0, width: 360, height: 310, dockHeight: 310 } },
      },
    },
  };

  writeDockLayout(state);
  assert.deepEqual(readDockLayout(), state);
  assert.equal(storage.get('nvts-photomania-dock-layout-v1'), JSON.stringify(state));
});

test('tolera almacenamiento bloqueado tanto al leer como al escribir', () => {
  useStorage(null, { getError: true, setError: true });
  assert.deepEqual(readDockLayout(), { version: 1, workspaces: {} });
  const originalWarn = console.warn;
  console.warn = () => {};
  try { assert.doesNotThrow(() => writeDockLayout({ version: 1, workspaces: {} })); }
  finally { console.warn = originalWarn; }
});
