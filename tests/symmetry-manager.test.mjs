import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let symmetry;

before(async () => {
  vite = await createViteTestServer();
  symmetry = await vite.ssrLoadModule('/packages/ui/src/managers/SymmetryManager.ts');
});

after(async () => {
  await vite?.close();
});

test('la simetría desactivada conserva solo el punto original', () => {
  const manager = new symmetry.SymmetryManager();
  assert.deepEqual(manager.getSymmetryPoints({ x: 12, y: 24 }, 100, 80), [{ x: 12, y: 24 }]);
});

test('la simetría en ambos ejes produce cuatro posiciones reflejadas', () => {
  const manager = new symmetry.SymmetryManager();
  manager.setEnabled(true);
  assert.deepEqual(manager.getSymmetryPoints({ x: 10, y: 20 }, 100, 80), [
    { x: 10, y: 20 },
    { x: 90, y: 20 },
    { x: 10, y: 60 },
    { x: 90, y: 60 },
  ]);
});

test('la simetría evita duplicar puntos que caen sobre los ejes', () => {
  const manager = new symmetry.SymmetryManager();
  manager.setEnabled(true);
  assert.deepEqual(manager.getSymmetryPoints({ x: 50, y: 40 }, 100, 80), [{ x: 50, y: 40 }]);
});

test('la configuración de ejes controla la reflexión correspondiente', () => {
  const manager = new symmetry.SymmetryManager();
  manager.setEnabled(true);
  manager.setAxes(true, false);
  assert.deepEqual(manager.getSymmetryPoints({ x: 10, y: 20 }, 100, 80), [
    { x: 10, y: 20 },
    { x: 90, y: 20 },
  ]);
});

test('toggle actualiza el estado encapsulado del gestor', () => {
  const manager = new symmetry.SymmetryManager();
  assert.equal(manager.isEnabled(), false);
  assert.equal(manager.toggle(), true);
  assert.equal(manager.toggle(), false);
});


test('la simetría vertical se puede activar sin activar la horizontal', () => {
  const manager = new symmetry.SymmetryManager();
  assert.equal(manager.toggleAxis('vertical'), true);
  assert.deepEqual(manager.getSettings(), { enabled: true, verticalAxis: true, horizontalAxis: false, centerX: 0.5, centerY: 0.5 });
  assert.deepEqual(manager.getSymmetryPoints({ x: 10, y: 20 }, 100, 80), [
    { x: 10, y: 20 },
    { x: 90, y: 20 },
  ]);
});

test('la simetría horizontal se puede activar y desactivar por separado', () => {
  const manager = new symmetry.SymmetryManager();
  assert.equal(manager.toggleAxis('horizontal'), true);
  assert.equal(manager.toggleAxis('horizontal'), false);
  assert.equal(manager.isEnabled(), false);
  assert.deepEqual(manager.getSymmetryPoints({ x: 10, y: 20 }, 100, 80), [{ x: 10, y: 20 }]);
});
