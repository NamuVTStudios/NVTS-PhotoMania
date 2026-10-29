import type { RendererProvider } from './RendererProvider';
import type { RendererBackend } from './RendererBackend';
import { WebGPURenderer } from './webgpu/WebGPURenderer';
import { WebGL2Renderer } from './webgl2/WebGL2Renderer';

export const rendererProviders: readonly RendererProvider[] = [
  {
    id: 'webgpu',
    isSupported: () => typeof navigator !== 'undefined' && 'gpu' in navigator,
    create: (canvas: HTMLCanvasElement) => WebGPURenderer.create(canvas),
  },
  {
    id: 'webgl2',
    isSupported: () => true,
    create: async (canvas: HTMLCanvasElement) => WebGL2Renderer.create(canvas),
  },
];

type ProviderAttempt = { backend: RendererBackend } | { error: unknown; provider: RendererProvider };

async function attemptProvider(provider: RendererProvider, canvas: HTMLCanvasElement): Promise<ProviderAttempt> {
  try {
    return { backend: await provider.create(canvas) };
  } catch (error) {
    return { error, provider };
  }
}

async function attemptNextProvider(
  candidates: readonly RendererProvider[],
  canvas: HTMLCanvasElement,
  index = 0,
): Promise<RendererBackend> {
  const provider = candidates[index];
  if (!provider) throw new Error('No supported rendering backend is available.');
  const attempt = await attemptProvider(provider, canvas);
  if ('backend' in attempt) return attempt.backend;
  console.warn(`Renderer ${provider.id} unavailable; trying next provider.`, attempt.error);
  return attemptNextProvider(candidates, canvas, index + 1);
}

export async function createRendererFromProviders(canvas: HTMLCanvasElement): Promise<RendererBackend> {
  const candidates = rendererProviders.filter((provider) => provider.isSupported());
  return attemptNextProvider(candidates, canvas);
}
