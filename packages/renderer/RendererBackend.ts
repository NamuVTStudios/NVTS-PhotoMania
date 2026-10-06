// RendererBackend.ts — Contrato común: la app no sabe si dibuja con WebGPU o WebGL2.

export interface RendererBackend {
  readonly kind: 'webgpu' | 'webgl2';
  /** Crea (o recrea) la textura del lienzo. Si recrea, el contenido se pierde: re-subir todo. */
  ensureSize(width: number, height: number): void;
  /**
   * Sube una región RGBA8 (p. ej. un tile). `bytesPerRow` = stride del buffer origen
   * (para un tile completo: TILE_SIZE * 4), aunque w sea menor (tiles del borde).
   */
  writeRegion(x: number, y: number, w: number, h: number, pixels: Uint8Array, bytesPerRow: number): void;
  setOpacity(value: number): void;
  render(): void;
  destroy(): void;
}
