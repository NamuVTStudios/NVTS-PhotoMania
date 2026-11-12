export type BrushTexturePattern =
  | 'none' | 'graphite-fine' | 'graphite-tooth' | 'graphite-rough' | 'colored-pencil-wax'
  | 'charcoal-coarse' | 'ink-smooth' | 'ink-dry' | 'ink-brush' | 'comic-hatching'
  | 'oil-impasto' | 'oil-glaze' | 'watercolor-cold-press' | 'watercolor-hot-press'
  | 'acrylic-bristle' | 'gouache-tooth' | 'airbrush-soft' | 'marker-streak'
  | 'pastel-paper' | 'chalk-dust' | 'sanguine-paper' | 'paper-smooth' | 'paper-fiber'
  | 'paper-tooth' | 'paper-cotton' | 'paper-manga' | 'paper-screen-tone'
  | 'canvas-weave' | 'fabric-weave' | 'stone-grain' | 'granite-speckle'
  | 'spray-speckle' | 'sponge-cell' | 'stamp-scatter' | 'star-stamp' | 'flower-stamp'
  | 'leaf-stamp' | 'lace-pattern' | 'petal-chain' | 'screen-tone' | 'dry-bristle'
  | 'cloud-soft' | 'watercolor-edge' | 'oil-ridge' | 'flat-paint' | 'crayon-wax'
  | 'layout-pencil' | 'saji-fiber' | 'micro-ink' | 'soft-pastel' | 'wet-pigment';

export interface BrushTextureSample {
  coverage: number;
  brightness: number;
}

export function getBrushTextureSample(
  x: number,
  y: number,
  pattern: BrushTexturePattern = 'none',
  angle = 0.35,
  seed = 0,
): BrushTextureSample {
  if (pattern === 'none') return { coverage: 1, brightness: 1 };
  const offsetX = (seed >>> 0) % 997 * 0.137;
  const offsetY = (Math.imul(seed >>> 0, 31) >>> 0) % 991 * 0.113;
  const sampleX = x + offsetX;
  const sampleY = y + offsetY;
  const scaleVariant = 0.84 + ((seed >>> 0) % 17) * 0.01;
  const patternX = sampleX * scaleVariant;
  const patternY = sampleY * scaleVariant;
  const textureAngle = angle + ((seed >>> 0) % 360) * Math.PI / 1800;
  const coarse = noise(Math.floor(patternX * 0.72), Math.floor(patternY * 0.72));
  const medium = noise(Math.floor(patternX * 1.9 + 17), Math.floor(patternY * 1.9 - 11));
  const fine = noise(Math.floor(patternX * 4.7 - 31), Math.floor(patternY * 4.7 + 23));
  const across = -patternX * Math.sin(textureAngle) + patternY * Math.cos(textureAngle);
  const along = patternX * Math.cos(textureAngle) + patternY * Math.sin(textureAngle);
  const ridge = 0.5 + 0.5 * Math.sin(across * 0.78 + Math.sin(along * 0.12) * 1.7);
  const weave = 0.5 + 0.5 * Math.sin(sampleX * 0.92) * Math.sin(sampleY * 0.92);
  let coverage = 1;
  let brightness = 1;

  switch (pattern) {
    case 'graphite-fine': coverage = 0.48 + fine * 0.48; brightness = 0.88 + fine * 0.12; break;
    case 'graphite-tooth': coverage = 0.24 + medium * 0.76; brightness = 0.76 + medium * 0.2; break;
    case 'graphite-rough': coverage = fine < 0.16 ? 0.22 : 0.52 + coarse * 0.45; brightness = 0.78 + fine * 0.18; break;
    case 'colored-pencil-wax': coverage = 0.34 + fine * 0.44 + ridge * 0.2; brightness = 0.82 + fine * 0.16; break;
    case 'charcoal-coarse': coverage = coarse < 0.2 ? 0.12 : 0.5 + coarse * 0.5; brightness = 0.74 + coarse * 0.2; break;
    case 'ink-smooth': coverage = 0.96 + fine * 0.04; brightness = 0.98; break;
    case 'ink-dry': coverage = fine < 0.22 ? 0.2 : 0.62 + fine * 0.36; brightness = 0.86 + fine * 0.1; break;
    case 'ink-brush': coverage = 0.6 + ridge * 0.32 + medium * 0.08; brightness = 0.9 + ridge * 0.1; break;
    case 'comic-hatching': coverage = 0.72 + 0.28 * Math.abs(Math.sin(across * 1.4)); brightness = 0.94; break;
    case 'oil-impasto': coverage = 0.36 + ridge * 0.5 + medium * 0.18; brightness = 0.74 + ridge * 0.22 + coarse * 0.12; break;
    case 'oil-glaze': coverage = 0.82 + fine * 0.18; brightness = 0.9 + medium * 0.08; break;
    case 'watercolor-cold-press': coverage = 0.22 + coarse * 0.62 + medium * 0.16; brightness = 0.76 + coarse * 0.2; break;
    case 'watercolor-hot-press': coverage = 0.58 + fine * 0.38; brightness = 0.87 + fine * 0.1; break;
    case 'acrylic-bristle': coverage = 0.48 + ridge * 0.48; brightness = 0.84 + ridge * 0.14; break;
    case 'gouache-tooth': coverage = 0.55 + medium * 0.42; brightness = 0.86 + medium * 0.1; break;
    case 'airbrush-soft': coverage = 0.86 + fine * 0.14; brightness = 0.96 + fine * 0.04; break;
    case 'marker-streak': coverage = 0.76 + 0.2 * (0.5 + 0.5 * Math.sin(across * 0.32)); brightness = 0.93 + medium * 0.05; break;
    case 'pastel-paper': coverage = medium < 0.14 ? 0.16 : 0.4 + medium * 0.58; brightness = 0.78 + medium * 0.2; break;
    case 'chalk-dust': coverage = coarse < 0.25 ? 0.1 : 0.48 + fine * 0.48; brightness = 0.78 + fine * 0.18; break;
    case 'sanguine-paper': coverage = 0.34 + medium * 0.44 + ridge * 0.18; brightness = 0.8 + medium * 0.16; break;
    case 'paper-smooth': coverage = 0.9 + fine * 0.1; brightness = 0.96 + fine * 0.04; break;
    case 'paper-fiber': coverage = 0.38 + fine * 0.36 + Math.abs(Math.sin(across * 0.26)) * 0.22; brightness = 0.84 + medium * 0.12; break;
    case 'paper-tooth': coverage = 0.28 + coarse * 0.7; brightness = 0.8 + coarse * 0.15; break;
    case 'paper-cotton': coverage = 0.44 + coarse * 0.46 + medium * 0.1; brightness = 0.82 + coarse * 0.14; break;
    case 'paper-manga': coverage = 0.86 + fine * 0.1; brightness = 0.96; break;
    case 'paper-screen-tone': coverage = 0.52 + 0.48 * (Math.sin(patternX * 0.78) > 0.1 ? 1 : 0.18); brightness = 0.92; break;
    case 'canvas-weave': coverage = 0.48 + weave * 0.46; brightness = 0.82 + weave * 0.12; break;
    case 'fabric-weave': coverage = 0.3 + weave * 0.64; brightness = 0.82 + weave * 0.12; break;
    case 'stone-grain': coverage = 0.3 + coarse * 0.7; brightness = 0.78 + coarse * 0.18; break;
    case 'granite-speckle': coverage = coarse < 0.18 ? 0.2 : 0.62 + fine * 0.36; brightness = 0.8 + medium * 0.18; break;
    case 'spray-speckle': coverage = fine > 0.28 ? 1 : 0.08; brightness = 0.9 + fine * 0.1; break;
    case 'sponge-cell': coverage = medium < 0.2 ? 0.12 : 0.48 + coarse * 0.5; brightness = 0.78 + medium * 0.18; break;
    case 'stamp-scatter': coverage = 0.58 + fine * 0.42; brightness = 0.92 + fine * 0.08; break;
    case 'star-stamp': coverage = 0.82 + medium * 0.18; brightness = 0.9 + fine * 0.1; break;
    case 'flower-stamp': coverage = 0.7 + medium * 0.28; brightness = 0.88 + fine * 0.1; break;
    case 'leaf-stamp': coverage = 0.76 + ridge * 0.2; brightness = 0.86 + medium * 0.12; break;
    case 'lace-pattern': coverage = fine > 0.2 ? 0.9 : 0.28; brightness = 0.88 + medium * 0.1; break;
    case 'petal-chain': coverage = 0.8 + fine * 0.18; brightness = 0.9 + medium * 0.08; break;
    case 'screen-tone': coverage = 0.5 + 0.5 * (Math.sin(patternX * 1.1) * Math.sin(patternY * 1.1) > -0.1 ? 1 : 0.25); brightness = 0.94; break;
    case 'dry-bristle': coverage = 0.18 + ridge * 0.78; brightness = 0.8 + ridge * 0.16; break;
    case 'cloud-soft': coverage = 0.58 + coarse * 0.4; brightness = 0.9 + coarse * 0.08; break;
    case 'watercolor-edge': coverage = 0.44 + coarse * 0.4 + (Math.abs(Math.sin(across * 0.18)) * 0.16); brightness = 0.76 + coarse * 0.18; break;
    case 'oil-ridge': coverage = 0.28 + ridge * 0.66; brightness = 0.72 + ridge * 0.25; break;
    case 'flat-paint': coverage = 0.88 + fine * 0.12; brightness = 0.94 + fine * 0.05; break;
    case 'crayon-wax': coverage = 0.36 + medium * 0.42 + ridge * 0.18; brightness = 0.82 + medium * 0.14; break;
    case 'layout-pencil': coverage = 0.5 + fine * 0.46; brightness = 0.84 + fine * 0.12; break;
    case 'saji-fiber': coverage = 0.62 + ridge * 0.3; brightness = 0.92 + fine * 0.07; break;
    case 'micro-ink': coverage = 0.98; brightness = 1; break;
    case 'soft-pastel': coverage = 0.4 + coarse * 0.56; brightness = 0.8 + fine * 0.16; break;
    case 'wet-pigment': coverage = 0.42 + coarse * 0.42 + medium * 0.14; brightness = 0.78 + coarse * 0.16; break;
    default: break;
  }
  return { coverage: clamp(coverage, 0.04, 1), brightness: clamp(brightness, 0.45, 1.18) };
}

function noise(x: number, y: number): number {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
