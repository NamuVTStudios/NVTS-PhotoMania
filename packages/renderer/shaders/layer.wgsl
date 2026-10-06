// layer.wgsl — Dibuja una capa RGBA8 en un quad, con opacidad y ajuste a pantalla.

struct Params {
  scale   : vec2f, // Escala del quad en clip-space (ajuste "contain" de la imagen)
  opacity : f32,   // Opacidad de la capa [0..1]
  _pad    : f32,   // Relleno: el uniform debe ocupar 16 bytes
};

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var layerTex : texture_2d<f32>;
@group(0) @binding(2) var layerSamp : sampler;

struct VSOut {
  @builtin(position) pos : vec4f,
  @location(0) uv : vec2f,
};

// Quad de 2 triángulos generado en el shader: no necesita vertex buffer.
@vertex
fn vs(@builtin(vertex_index) i : u32) -> VSOut {
  var p = array<vec2f, 6>(
    vec2f(-1, -1), vec2f(1, -1), vec2f(-1, 1),
    vec2f(-1,  1), vec2f(1, -1), vec2f( 1, 1)
  );
  let xy = p[i];
  var o : VSOut;
  o.pos = vec4f(xy * params.scale, 0, 1);
  // clip-space (-1..1) -> uv (0..1), con Y invertida (origen arriba-izquierda)
  o.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
  return o;
}

@fragment
fn fs(in : VSOut) -> @location(0) vec4f {
  let c = textureSample(layerTex, layerSamp, in.uv); // RGBA straight (no premultiplicado)
  let a = c.a * params.opacity;
  // Salida PREMULTIPLICADA: coincide con el blend de la pipeline y alphaMode del canvas.
  return vec4f(c.rgb * a, a);
}
