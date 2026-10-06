// engine.d.ts — Tipos del módulo Wasm generado por Emscripten (embind).
// Declara el módulo que importa `../build/engine.js`.

declare module '*/build/engine.js' {
  /** Instancia nativa expuesta por embind. Debe liberarse con delete(). */
  export interface ImageProcessor {
    width(): number;
    height(): number;
    byteLength(): number;
    /** Offset en la memoria lineal de Wasm donde empiezan los píxeles RGBA8. */
    dataPtr(): number;
    loadFromJS(bytes: Uint8ClampedArray | Uint8Array): void;
    /** amount en [-255, 255]. */
    applyBrightness(amount: number): void;
    /** Libera memoria C++ (embind NO usa el GC de JS para esto). */
    delete(): void;
  }

  /** Capa en mosaicos de TILE_SIZE x TILE_SIZE con seguimiento de tiles sucios. */
  export interface TiledLayer {
    width(): number;
    height(): number;
    tilesX(): number;
    tilesY(): number;
    /** Cantidad de tiles realmente reservados en memoria (los vacíos no cuentan). */
    allocatedTiles(): number;
    /** Escribe una región RGBA8 (recortada al lienzo). false si faltan bytes. */
    writeRectFromJS(x: number, y: number, w: number, h: number, bytes: Uint8Array | Uint8ClampedArray): boolean;
    /** Carga el lienzo completo (width*height*4 bytes). */
    loadFromRGBA(bytes: Uint8Array | Uint8ClampedArray): boolean;
    applyBrightness(amount: number): void;
    markRectDirty(x: number, y: number, w: number, h: number): void;
    markAllDirty(): void;
    /** Declara una edición directa vía tilePtr(): crea tiles faltantes y avisa al historial. Luego markRectDirty(). */
    touchRect(x: number, y: number, w: number, h: number): void;
    /** Copia una región a `dst` (RGBA8, w*h*4 bytes). Lo inexistente sale transparente. false si dst es corto. */
    readRectToJS(x: number, y: number, w: number, h: number, dst: Uint8Array): boolean;
    /** Pincel redondo (borde suave de 1 px). erase=true reduce el alfa en vez de pintar. r,g,b,a en 0..255. */
    stampDisc(cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number, erase: boolean): void;
    /** Consume la lista de sucios; devuelve la cantidad y prepara los descriptores. */
    flushDirty(): number;
    /** Offset del buffer de descriptores [tx, ty, ptr] x uint32 por tile sucio. */
    dirtyDescPtr(): number;
    /** Offset de los píxeles de un tile, o 0 si no existe. */
    tilePtr(tx: number, ty: number): number;
    delete(): void;
  }

  /** Undo/Redo por tiles. Destruir (delete) ANTES que el Compositor al que apunta. */
  export interface HistoryManager {
    /** Abre una acción vigilando la capa; false si ya hay una abierta o la capa no existe. */
    beginAction(layerId: number): boolean;
    /** Vigila una capa adicional dentro de la acción abierta. */
    watchLayer(layerId: number): boolean;
    /** Sella la acción. Devuelve los tiles guardados (0 = sin cambios, no se crea paso). */
    saveState(label: string): number;
    /** Aborta la acción abierta y revierte lo editado. */
    cancelAction(): void;
    /** Marcan tiles como sucios: luego compositor.composite() + flushDirtyTiles(). */
    undo(): boolean;
    redo(): boolean;
    canUndo(): boolean;
    canRedo(): boolean;
    undoCount(): number;
    redoCount(): number;
    memoryBytes(): number;
    undoLabel(): string;
    redoLabel(): string;
    clear(): void;
    delete(): void;
  }

  /** Árbol de capas + composición por tiles. Dueño de todas sus capas y del buffer de salida. */
  export interface Compositor {
    /** id lo asigna TS (0 = raíz reservada). index: 0 = abajo; <0 = arriba del todo. false si falla. */
    addGroup(id: number, parentId: number, index: number): boolean;
    addRaster(id: number, parentId: number, index: number): boolean;
    removeLayer(id: number): boolean;
    moveLayer(id: number, newParentId: number, index: number): boolean;
    /** blendMode: valores de BlendMode (ver BlendMode.ts). */
    setProps(id: number, visible: boolean, opacity: number, blendMode: number): boolean;
    invalidateAll(): void;
    /** Recompone solo los tiles sucios; devuelve cuántos. */
    composite(): number;
    /** Capa raster (referencia no propietaria: NO llamar a delete()). null si no existe. */
    layer(id: number): TiledLayer | null;
    /** Buffer de salida: pásalo a flushDirtyTiles() para subir a WebGPU. No llamar a delete(). */
    output(): TiledLayer;
    delete(): void;
  }

  export interface NvtsEngineModule {
    Compositor: new (width: number, height: number) => Compositor;
    /** maxMegabytes: tope de memoria del historial (p. ej. 512). */
    HistoryManager: new (compositor: Compositor, maxMegabytes: number) => HistoryManager;
    TILE_SIZE: number;
    TiledLayer: new (width: number, height: number) => TiledLayer;
    ImageProcessor: new (width: number, height: number) => ImageProcessor;
    /** Vista actual de la memoria; se reemplaza si la memoria crece. */
    HEAPU8: Uint8Array;
  }

  const createNvtsEngine: (opts?: {
    locateFile?: (path: string) => string;
  }) => Promise<NvtsEngineModule>;

  export default createNvtsEngine;
}
