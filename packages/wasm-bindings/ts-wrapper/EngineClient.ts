// EngineClient.ts — Capa segura sobre el módulo Wasm.
// Centraliza: carga del módulo, vistas de memoria válidas y liberación de recursos.

import createNvtsEngine, {
  type NvtsEngineModule,
  type ImageProcessor,
} from '../build/engine.js';

export class EngineClient {
  private constructor(private readonly mod: NvtsEngineModule) {}

  /** Carga e inicializa el Wasm (una sola vez por worker). */
  static async create(wasmBaseUrl = '/wasm/'): Promise<EngineClient> {
    const mod = await createNvtsEngine({
      locateFile: (p) => wasmBaseUrl + p, // dónde servir engine.wasm
    });
    return new EngineClient(mod);
  }

  /** Módulo Wasm crudo: permite crear `new module.Compositor(...)`, `new module.HistoryManager(...)`, etc. */
  get module(): NvtsEngineModule { return this.mod; }

  /** Crea un procesador de imagen RGBA8 del tamaño dado. */
  createProcessor(width: number, height: number): ImageHandle {
    return new ImageHandle(this.mod, new this.mod.ImageProcessor(width, height));
  }
}

/** Envuelve ImageProcessor: vista sin copia + liberación determinista. */
export class ImageHandle implements Disposable {
  private disposed = false;

  constructor(
    private readonly mod: NvtsEngineModule,
    private readonly native: ImageProcessor,
  ) {}

  get width(): number { return this.native.width(); }
  get height(): number { return this.native.height(); }

  /**
   * Vista de los píxeles SIN copiar. NO la guardes: se invalida si la memoria
   * de Wasm crece. Pídela de nuevo cada vez que la necesites.
   */
  getPixels(): Uint8ClampedArray {
    this.assertAlive();
    // HEAPU8.buffer siempre apunta al buffer vigente tras memory.grow.
    return new Uint8ClampedArray(
      this.mod.HEAPU8.buffer,
      this.native.dataPtr(),
      this.native.byteLength(),
    );
  }

  /** Carga píxeles desde un ImageData (copia JS -> Wasm). */
  load(data: ImageData): void {
    this.assertAlive();
    this.native.loadFromJS(data.data);
  }

  applyBrightness(amount: number): void {
    this.assertAlive();
    // Validación en TS: evita valores fuera de rango antes de cruzar al Wasm.
    this.native.applyBrightness(Math.max(-255, Math.min(255, Math.round(amount))));
  }

  /** Libera memoria C++. Obligatorio (embind no usa el GC de JS). */
  dispose(): void {
    if (!this.disposed) { this.native.delete(); this.disposed = true; }
  }
  [Symbol.dispose](): void { this.dispose(); }

  private assertAlive(): void {
    if (this.disposed) throw new Error('ImageHandle ya fue liberado');
  }
}

/* Ejemplo de uso:
const engine = await EngineClient.create();
using img = engine.createProcessor(512, 512);   // se libera solo al salir del scope
img.load(ctx.getImageData(0, 0, 512, 512));
img.applyBrightness(40);
ctx.putImageData(new ImageData(img.getPixels(), 512, 512), 0, 0);
*/
