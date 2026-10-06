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

  /** Crea el renderer. Lanza error si no hay WebGPU (aquí se activaría el fallback WebGL2). */
  static async create(canvas: HTMLCanvasElement): Promise<WebGPURenderer> {
    if (!navigator.gpu) throw new Error('WebGPU no disponible');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('Sin adaptador WebGPU');
    const device = await adapter.requestDevice();
    device.lost.then((i) => console.error('GPU device lost:', i.message));

    // Contexto del canvas con alpha premultiplicado (coincide con el shader).
    const ctx = canvas.getContext('webgpu')!;
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'premultiplied' });

    const module = device.createShaderModule({ code: shaderCode });
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{
          format,
          // Blend "source-over" para alpha premultiplicado.
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    const uniforms = device.createBuffer({
      size: 16, // vec2f scale + f32 opacity + f32 pad
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // 'nearest' al ampliar: ves los píxeles reales (importante en un editor).
    const sampler = device.createSampler({ magFilter: 'nearest', minFilter: 'linear' });

    return new WebGPURenderer(canvas, device, ctx, pipeline, uniforms, sampler);
  }

  /**
   * Sube píxeles RGBA8 a la GPU. `pixels` puede ser la vista sin copia de Wasm
   * (ImageHandle.getPixels()): writeTexture copia directo desde esa memoria.
   */
  setLayerPixels(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number): void {
    // Recrea la textura solo si cambió el tamaño (evita alocar en cada frame).
    if (!this.tex || width !== this.texW || height !== this.texH) {
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
          { binding: 1, resource: this.tex.createView() },
          { binding: 2, resource: this.sampler },
        ],
      });
    }
    // writeTexture NO exige bytesPerRow múltiplo de 256 (a diferencia de copyBufferToTexture).
    this.device.queue.writeTexture(
      { texture: this.tex },
      pixels,
      { bytesPerRow: width * 4, rowsPerImage: height },
      [width, height],
    );
  }

  /** Crea (o recrea) la textura del lienzo. Si recrea, el contenido se pierde: re-subir todo. */
  ensureSize(width: number, height: number): void {
    if (this.tex && width === this.texW && height === this.texH) return;
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
        { binding: 1, resource: this.tex.createView() },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  /** Sube una región (p. ej. un tile). bytesPerRow = stride del buffer origen (tile completo: 1024). */
  writeRegion(x: number, y: number, w: number, h: number, pixels: Uint8Array, bytesPerRow: number): void {
    if (!this.tex) return;
    this.device.queue.writeTexture({ texture: this.tex, origin: [x, y] }, pixels, { bytesPerRow }, [w, h]);
  }

  setOpacity(value: number): void {
    this.opacity = Math.min(1, Math.max(0, value));
  }

  /** Dibuja la capa ajustada ("contain") al tamaño actual del canvas. */
  render(): void {
    if (!this.bindGroup) return;

    // Ajusta la resolución interna del canvas a su tamaño real en pantalla.
    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }

    // Escala "contain": mantiene la proporción de la imagen dentro del canvas.
    const imgAspect = this.texW / this.texH;
    const canvasAspect = cw / ch;
    const sx = imgAspect > canvasAspect ? 1 : imgAspect / canvasAspect;
    const sy = imgAspect > canvasAspect ? canvasAspect / imgAspect : 1;
    this.device.queue.writeBuffer(this.uniforms, 0, new Float32Array([sx, sy, this.opacity, 0]));

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.ctx.getCurrentTexture().createView(),
        clearValue: { r: 0.12, g: 0.12, b: 0.12, a: 1 }, // fondo gris oscuro
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
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

/* Integración con el motor (ejemplo):
const engine = await EngineClient.create();
const renderer = await WebGPURenderer.create(document.querySelector('canvas')!);
using img = engine.createProcessor(1024, 1024);
img.applyBrightness(30);
renderer.setLayerPixels(img.getPixels(), img.width, img.height); // Wasm -> GPU
renderer.setOpacity(0.8);
renderer.render();
*/
