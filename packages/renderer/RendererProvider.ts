import type { RendererBackend } from './RendererBackend';

/** Adapter/provider contract that hides backend-specific initialization details. */
export interface RendererProvider {
  readonly id: RendererBackend['kind'];
  isSupported(): boolean;
  create(canvas: HTMLCanvasElement): Promise<RendererBackend>;
}
