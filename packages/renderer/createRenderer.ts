// createRenderer.ts — Elige el backend: WebGPU si existe; si no, WebGL2.

import type { RendererBackend } from './RendererBackend';
import { WebGPURenderer } from './webgpu/WebGPURenderer';
import { WebGL2Renderer } from './webgl2/WebGL2Renderer';

export async function createRenderer(canvas: HTMLCanvasElement): Promise<RendererBackend> {
  try {
    return await WebGPURenderer.create(canvas);
  } catch (e) {
    // Nota: un <canvas> que ya devolvió un contexto 'webgpu' no puede obtener uno 'webgl2'.
    // WebGPURenderer.create() falla antes de pedir el contexto en los casos habituales
    // (sin navigator.gpu / sin adaptador), así que el fallback funciona en el mismo canvas.
    console.warn('WebGPU no disponible; usando WebGL2.', e);
    return WebGL2Renderer.create(canvas);
  }
}
