// SafeMemory.ts — Acceso seguro a la memoria lineal de Wasm, con o sin SharedArrayBuffer.
//
// Dos modos posibles según cómo se compile el motor:
//  • Sin -pthread (actual): HEAPU8.buffer es un ArrayBuffer normal. Todo funciona sin copias.
//  • Con -pthread: la memoria es compartida y HEAPU8.buffer es un SharedArrayBuffer. Entonces
//    muchas APIs web (ImageData, Blob, escritura de archivos, algunas rutas de WebGL...) RECHAZAN
//    vistas sobre ese buffer. Para esos casos hay que pasar una copia en un buffer NO compartido.
// Regla común a ambos: las vistas se piden en cada uso, porque memory.grow reemplaza el buffer.

import type { NvtsEngineModule } from '../build/engine.js';

export function isSharedBuffer(b: ArrayBufferLike): boolean {
  return typeof SharedArrayBuffer !== 'undefined' && b instanceof SharedArrayBuffer;
}

export class HeapAccess {
  constructor(private readonly mod: NvtsEngineModule) {}

  /** ¿La memoria de Wasm es compartida (motor compilado con hilos)? */
  get shared(): boolean { return isSharedBuffer(this.mod.HEAPU8.buffer); }

  /**
   * Vista SIN copia sobre [ptr, ptr+length). Puede ser un SharedArrayBuffer: no la pases a APIs
   * que rechacen buffers compartidos y no la guardes (memory.grow la invalida). Valida límites.
   */
  view(ptr: number, length: number): Uint8Array {
    const heap = this.mod.HEAPU8; // se lee en cada llamada: tras memory.grow es otro objeto
    if (!Number.isInteger(ptr) || !Number.isInteger(length) || ptr < 0 || length < 0 || ptr + length > heap.length) {
      throw new RangeError(`Rango fuera de la memoria de Wasm: ptr=${ptr}, length=${length}, heap=${heap.length}`);
    }
    return new Uint8Array(heap.buffer, ptr, length);
  }

  /**
   * Copia [ptr, ptr+length) a un buffer NO compartido, seguro para cualquier API web.
   * Si pasas `dst` (de al menos `length` bytes) lo reutiliza y evita reservar memoria cada vez.
   */
  copyOut(ptr: number, length: number, dst?: Uint8Array): Uint8Array {
    const src = this.view(ptr, length);
    const out = dst && dst.length >= length ? dst.subarray(0, length) : new Uint8Array(length);
    out.set(src); // set() entre buffers distintos (compartido -> normal) está permitido
    return out;
  }

  /** Escribe bytes de JS en la memoria de Wasm a partir de `ptr` (src puede ser compartido o no). */
  copyIn(ptr: number, src: Uint8Array | Uint8ClampedArray): void {
    this.view(ptr, src.length).set(src); // view() ya valida el rango
  }
}
