// WebGL2Renderer.ts — Fallback cuando no hay WebGPU. Misma salida que layer.wgsl:
// textura RGBA8 sin premultiplicar -> salida premultiplicada con opacidad, ajustada ("contain") al canvas.

import type { RendererBackend } from '../RendererBackend';

const VS = `#version 300 es
uniform vec2 uScale;
out vec2 vUv;
void main() {
  // Quad de 2 triángulos generado en el shader (sin vertex buffer).
  vec2 p[6] = vec2[6](vec2(-1,-1), vec2(1,-1), vec2(-1,1), vec2(-1,1), vec2(1,-1), vec2(1,1));
  vec2 xy = p[gl_VertexID];
  gl_Position = vec4(xy * uScale, 0.0, 1.0);
  vUv = vec2(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);   // Y invertida: origen arriba-izquierda
}`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform float uOpacity;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  float a = c.a * uOpacity;
  outColor = vec4(c.rgb * a, a);                     // premultiplicado
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'Error de shader');
  return sh;
}

export class WebGL2Renderer implements RendererBackend {
  readonly kind = 'webgl2' as const;
  private tex: WebGLTexture | null = null;
  private texW = 0;
  private texH = 0;
  private opacity = 1;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly gl: WebGL2RenderingContext,
    private readonly prog: WebGLProgram,
    private readonly uScale: WebGLUniformLocation | null,
    private readonly uOpacity: WebGLUniformLocation | null,
  ) {}

  static create(canvas: HTMLCanvasElement): WebGL2Renderer {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error('WebGL2 no disponible');

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Error de enlace');

    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'uTex'), 0);
    return new WebGL2Renderer(canvas, gl, prog,
      gl.getUniformLocation(prog, 'uScale'), gl.getUniformLocation(prog, 'uOpacity'));
  }

  ensureSize(width: number, height: number): void {
    const gl = this.gl;
    if (this.tex && width === this.texW && height === this.texH) return;
    if (this.tex) gl.deleteTexture(this.tex);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);   // ver píxeles reales al ampliar
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texW = width;
    this.texH = height;
  }

  writeRegion(x: number, y: number, w: number, h: number, pixels: Uint8Array, bytesPerRow: number): void {
    const gl = this.gl;
    if (!this.tex) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, bytesPerRow / 4);   // stride del tile, no del recorte
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
  }

  setOpacity(value: number): void { this.opacity = Math.min(1, Math.max(0, value)); }

  render(): void {
    const gl = this.gl;
    if (!this.tex) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);

    // Escala "contain": mantiene la proporción de la imagen dentro del canvas.
    const imgAspect = this.texW / this.texH, canvasAspect = cw / ch;
    const sx = imgAspect > canvasAspect ? 1 : imgAspect / canvasAspect;
    const sy = imgAspect > canvasAspect ? canvasAspect / imgAspect : 1;

    gl.clearColor(0.12, 0.12, 0.12, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);            // source-over premultiplicado

    gl.useProgram(this.prog);
    gl.uniform2f(this.uScale, sx, sy);
    gl.uniform1f(this.uOpacity, this.opacity);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  destroy(): void {
    if (this.tex) this.gl.deleteTexture(this.tex);
    this.gl.deleteProgram(this.prog);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
