// DirtyTiles.ts — Expone a TS solo los tiles modificados, sin copiar píxeles.

import type { NvtsEngineModule, TiledLayer } from '../build/engine.js';

const TILE_BYTES_PER_PIXEL = 4;

/**
 * Consume los tiles sucios de la capa y llama a `upload` por cada uno.
 * `pixels` es una VISTA sobre la memoria de Wasm (256x256 RGBA8, bytesPerRow = TILE_SIZE*4):
 * úsala dentro del callback y NO la guardes. Debe ejecutarse antes de cualquier otra
 * operación del motor que pueda mutar o liberar tiles (otra escritura, undo, etc.).
 * @returns cantidad de tiles subidos.
 */
export function flushDirtyTiles(
  mod: NvtsEngineModule,
  layer: TiledLayer,
  upload: (tx: number, ty: number, pixels: Uint8Array) => void,
): number {
  const count = layer.flushDirty();
  if (count === 0) return 0;

  const tileBytes = mod.TILE_SIZE * mod.TILE_SIZE * TILE_BYTES_PER_PIXEL;
  // Se crean las vistas DESPUÉS de flushDirty(): la memoria pudo crecer y el buffer cambiar.
  const buffer = mod.HEAPU8.buffer;
  const desc = new Uint32Array(buffer, layer.dirtyDescPtr(), count * 3); // [tx, ty, ptr] * count

  for (let i = 0; i < count; i++) {
    const tx = desc[i * 3], ty = desc[i * 3 + 1], ptr = desc[i * 3 + 2];
    upload(tx, ty, new Uint8Array(buffer, ptr, tileBytes));
  }
  return count;
}

/* Ejemplo con WebGPU (textura del tamaño del lienzo, se actualiza solo la región del tile):

const T = mod.TILE_SIZE;
flushDirtyTiles(mod, layer, (tx, ty, pixels) => {
  const x = tx * T, y = ty * T;
  const w = Math.min(T, layer.width()  - x);   // tiles del borde: recorta al lienzo
  const h = Math.min(T, layer.height() - y);
  device.queue.writeTexture(
    { texture, origin: [x, y] },
    pixels,
    { bytesPerRow: T * 4 },                    // stride del tile, no del recorte
    [w, h],
  );
});
renderer.render();

Flujo completo:
  layer.writeRectFromJS(x, y, w, h, bytes);    // o applyBrightness(), pincel, etc.
  flushDirtyTiles(mod, layer, uploadTile);     // solo viajan los tiles cambiados
*/
