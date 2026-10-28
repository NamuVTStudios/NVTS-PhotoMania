import type { RendererBackend } from './RendererBackend';
import { createRendererFromProviders } from './RendererProviders';

/** Selects a backend through providers; callers depend only on RendererBackend. */
export async function createRenderer(canvas: HTMLCanvasElement): Promise<RendererBackend> {
  return createRendererFromProviders(canvas);
}
