// WebGPURenderer.ts — Inicializa WebGPU sobre un <canvas> y dibuja una capa
// cuyos píxeles viven en la memoria de Wasm.
// Requiere: `pnpm add -D @webgpu/types` y "types": ["@webgpu/types"] en tsconfig.

import type { RendererBackend } from '../RendererBackend';
import shaderCode from '../shaders/layer.wgsl?raw'; // Vite: importa el WGSL como string

export class WebGPURenderer implements RendererBackend {
  readonly kind = 'webgpu' as const;
  private tex?: GPUTexture;
  private bindGroup?: GPUBindGroup;
  private texW = 0;
  private texH = 0;
  private opacity = 1;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly device: GPUDevice,
    private readonly ctx: GPUCanvasContext,
    private readonly pipeline: GPURenderPipeline,
    private readonly uniforms: GPUBuffer,
    private readonly sampler: GPUSampler,
  ) {}

  /** Crea el renderer y coordina la inicialización de sus recursos GPU. */
  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    const device = await this.requestDevice();
    const { ctx, format } = this.configureCanvas(canvas, device);
    const pipeline = this.createPipeline(device, format);
    const uniforms = this.createUniformBuffer(device);
    const sampler = this.createSampler(device);
    return new WebGPURenderer(canvas, device, ctx, pipeline, uniforms, sampler);
  }

  private static async requestDevice(): Promise<GPUDevice> {
    if (!navigator.gpu) throw new Error('WebGPU no disponible');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('Sin adaptador WebGPU');
    const device = await adapter.requestDevice();
    device.lost.then((info) => console.error('GPU device lost:', info.message));
    return device;
  }

  private static configureCanvas(canvas: HTMLCanvasElement, device: GPUDevice): { ctx: GPUCanvasContext; format: GPUTextureFormat } {
    const ctx = canvas.getContext('webgpu')!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'premultiplied' });
    return { ctx, format };
  }

  private static createPipeline(device: GPUDevice, format: GPUTextureFormat): GPURenderPipeline {
    const module = device.createShaderModule({ code: shaderCode });
    return device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private static createUniformBuffer(device: GPUDevice): GPUBuffer {
    return device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private static createSampler(device: GPUDevice): GPUSampler {
    // Nearest al ampliar: muestra los píxeles reales del documento.
    return device.createSampler({ magFilter: 'nearest', minFilter: 'linear' });
  }

  /**
   * Sube píxeles RGBA8 a la GPU. `pixels` puede ser la vista sin copia de Wasm
   * (ImageHandle.getPixels()): writeTexture copia directo desde esa memoria.
   */
  setLayerPixels(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): void {
    if (!this.tex || width !== this.texW || height !== this.texH) this.createLayerTexture(width, height);
    this.device.queue.writeTexture(
      { texture: this.tex! },
      toGPUBuffer(pixels),
      { bytesPerRow: width * 4, rowsPerImage: height },
      [width, height],
    );
  }

  private createLayerTexture(width: number, height: number): void {
    this.tex?.destroy();
    this.tex = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.texW = width;
    this.texH = height;
    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniforms } },
        { binding: 1, resource: this.tex!.createView() },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  /** Crea (o recrea) la textura del lienzo. Si recrea, el contenido se pierde: re-subir todo. */
  ensureSize(width: number, height: number): void {
    if (this.tex && width === this.texW && height === this.texH) return;
    this.createLayerTexture(width, height);
  }

  /** Sube una región (p. ej. un tile). bytesPerRow = stride del buffer origen (tile completo: 1024). */
  writeRegion(x: number, y: number, w: number, h: number, pixels: Uint8Array, bytesPerRow: number): void {
    if (!this.tex) return;
    this.device.queue.writeTexture(
      { texture: this.tex, origin: [x, y] },
      toGPUBuffer(pixels),
      { bytesPerRow },
      [w, h],
    );
  }

  setOpacity(value: number): void {
    this.opacity = Math.min(1, Math.max(0, value));
  }

  /** Dibuja la capa ajustada ("contain") al tamaño actual del canvas. */
  render(): void {
    if (!this.bindGroup) return;
    const size = this.resizeCanvasToDisplaySize();
    const scale = this.calculateContainScale(size.width, size.height);
    this.device.queue.writeBuffer(this.uniforms, 0, new Float32Array([scale.x, scale.y, this.opacity, 0]));
    this.submitRenderPass();
  }

  private resizeCanvasToDisplaySize(): { width: number; height: number } {
    const dpr = window.devicePixelRatio || 1;
    const renderScale = Math.min(4, Math.max(1, Number(this.canvas.dataset.renderScale) || 1));
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * dpr * renderScale));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * dpr * renderScale));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    return { width, height };
  }

  private calculateContainScale(width: number, height: number): { x: number; y: number } {
    const imageAspect = this.texW / this.texH;
    const canvasAspect = width / height;
    return {
      x: imageAspect > canvasAspect ? 1 : imageAspect / canvasAspect,
      y: imageAspect > canvasAspect ? canvasAspect / imageAspect : 1,
    };
  }

  private submitRenderPass(): void {
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.12, g: 0.12, b: 0.12, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup!);
    pass.draw(6);
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.tex?.destroy();
    this.uniforms.destroy();
    this.device.destroy();
  }
}

function toGPUBuffer(
  pixels: Uint8Array | Uint8ClampedArray,
): BufferSource {
  if (pixels.buffer instanceof ArrayBuffer) return pixels as BufferSource;
  const copy = new Uint8Array(pixels.byteLength);
  copy.set(pixels);
  return copy;
}

/* Integración con el motor (ejemplo):
const engine = await EngineClient.create();
const renderer = await WebGPURenderer.create(document.querySelector('canvas')!);
using img = engine.createProcessor(1024, 1024);
img.applyBrightness(30);
renderer.setLayerPixels(img.getPixels(), img.width, img.height); // Wasm -> GPU
renderer.setOpacity(0.8);
renderer.render();
*/
