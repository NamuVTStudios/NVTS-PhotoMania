export type BrushCategory = 'sketch' | 'inking' | 'decoration' | 'texture' | 'painting';
export type BrushTipShape = 'round' | 'square' | 'diamond' | 'star' | 'flower' | 'leaf' | 'lace';

export interface BrushPreset {
  id: string;
  name: string;
  category: BrushCategory;
  size: number;
  opacity: number;
  hardness: number;
  spacing: number;
  smoothing: number;
  tipShape: BrushTipShape;
  texture: number;
}

export const BRUSH_PRESETS: readonly BrushPreset[] = [
  { id: 'graphite-hb', name: 'Grafito HB', category: 'sketch', size: 9, opacity: 48, hardness: 54, spacing: 12, smoothing: 8, tipShape: 'round', texture: 0.32 },
  { id: 'graphite-2b', name: 'Grafito 2B', category: 'sketch', size: 13, opacity: 62, hardness: 48, spacing: 10, smoothing: 6, tipShape: 'round', texture: 0.45 },
  { id: 'soft-pencil', name: 'Lápiz suave', category: 'sketch', size: 18, opacity: 42, hardness: 28, spacing: 8, smoothing: 5, tipShape: 'round', texture: 0.2 },
  { id: 'colored-pencil', name: 'Lápiz de color', category: 'sketch', size: 8, opacity: 74, hardness: 72, spacing: 14, smoothing: 7, tipShape: 'round', texture: 0.52 },
  { id: 'charcoal', name: 'Carboncillo', category: 'sketch', size: 28, opacity: 66, hardness: 35, spacing: 9, smoothing: 0, tipShape: 'square', texture: 0.82 },
  { id: 'g-pen', name: 'Plumilla G', category: 'inking', size: 5, opacity: 100, hardness: 100, spacing: 5, smoothing: 18, tipShape: 'round', texture: 0 },
  { id: 'maru-pen', name: 'Plumilla Maru', category: 'inking', size: 2, opacity: 100, hardness: 100, spacing: 4, smoothing: 22, tipShape: 'round', texture: 0 },
  { id: 'saji-pen', name: 'Plumilla Saji', category: 'inking', size: 8, opacity: 100, hardness: 100, spacing: 7, smoothing: 15, tipShape: 'diamond', texture: 0.05 },
  { id: 'technical-pen', name: 'Bolígrafo técnico', category: 'inking', size: 3, opacity: 100, hardness: 100, spacing: 5, smoothing: 25, tipShape: 'round', texture: 0 },
  { id: 'comic-ink', name: 'Tinta de cómic', category: 'inking', size: 6, opacity: 100, hardness: 96, spacing: 6, smoothing: 20, tipShape: 'round', texture: 0.03 },
  { id: 'star-stamp', name: 'Estrellas', category: 'decoration', size: 32, opacity: 100, hardness: 100, spacing: 85, smoothing: 0, tipShape: 'star', texture: 0 },
  { id: 'flower-stamp', name: 'Flores', category: 'decoration', size: 34, opacity: 90, hardness: 90, spacing: 95, smoothing: 0, tipShape: 'flower', texture: 0.05 },
  { id: 'leaf-stamp', name: 'Hojas', category: 'decoration', size: 26, opacity: 90, hardness: 85, spacing: 75, smoothing: 0, tipShape: 'leaf', texture: 0.08 },
  { id: 'lace-stamp', name: 'Encaje', category: 'decoration', size: 22, opacity: 80, hardness: 40, spacing: 40, smoothing: 0, tipShape: 'lace', texture: 0.35 },
  { id: 'canvas-grain', name: 'Grano de lienzo', category: 'texture', size: 24, opacity: 68, hardness: 40, spacing: 18, smoothing: 0, tipShape: 'round', texture: 0.65 },
  { id: 'dry-brush', name: 'Pincel seco', category: 'texture', size: 30, opacity: 76, hardness: 66, spacing: 22, smoothing: 0, tipShape: 'square', texture: 0.9 },
  { id: 'spray-grain', name: 'Pulverizado', category: 'texture', size: 46, opacity: 36, hardness: 12, spacing: 10, smoothing: 0, tipShape: 'round', texture: 0.95 },
  { id: 'paper-chalk', name: 'Tiza sobre papel', category: 'texture', size: 19, opacity: 72, hardness: 42, spacing: 16, smoothing: 0, tipShape: 'square', texture: 0.74 },
  { id: 'watercolor', name: 'Acuarela suave', category: 'painting', size: 30, opacity: 34, hardness: 18, spacing: 10, smoothing: 3, tipShape: 'round', texture: 0.16 },
  { id: 'oil-paint', name: 'Óleo', category: 'painting', size: 26, opacity: 92, hardness: 86, spacing: 12, smoothing: 0, tipShape: 'round', texture: 0.24 },
  { id: 'acrylic', name: 'Acrílico', category: 'painting', size: 20, opacity: 94, hardness: 76, spacing: 9, smoothing: 4, tipShape: 'round', texture: 0.12 },
  { id: 'soft-airbrush', name: 'Aerógrafo suave', category: 'painting', size: 64, opacity: 24, hardness: 0, spacing: 7, smoothing: 0, tipShape: 'round', texture: 0 },
  { id: 'rough-pencil', name: 'Lápiz rugoso', category: 'sketch', size: 14, opacity: 55, hardness: 44, spacing: 8, smoothing: 2, tipShape: 'square', texture: 0.88 },
  { id: 'blue-pencil', name: 'Lápiz azul de boceto', category: 'sketch', size: 7, opacity: 52, hardness: 60, spacing: 9, smoothing: 12, tipShape: 'round', texture: 0.38 },
  { id: 'mapping-pen', name: 'Plumilla de mapa', category: 'inking', size: 4, opacity: 100, hardness: 100, spacing: 4, smoothing: 30, tipShape: 'round', texture: 0 },
  { id: 'dry-ink', name: 'Tinta seca', category: 'inking', size: 9, opacity: 88, hardness: 72, spacing: 11, smoothing: 9, tipShape: 'square', texture: 0.42 },
  { id: 'confetti-stamp', name: 'Confeti', category: 'decoration', size: 18, opacity: 92, hardness: 70, spacing: 100, smoothing: 0, tipShape: 'star', texture: 0.18 },
  { id: 'petal-stamp', name: 'Pétalos', category: 'decoration', size: 24, opacity: 96, hardness: 84, spacing: 80, smoothing: 0, tipShape: 'flower', texture: 0 },
  { id: 'stone-texture', name: 'Piedra', category: 'texture', size: 40, opacity: 74, hardness: 42, spacing: 18, smoothing: 0, tipShape: 'diamond', texture: 0.96 },
  { id: 'fabric-texture', name: 'Tejido', category: 'texture', size: 34, opacity: 70, hardness: 64, spacing: 15, smoothing: 0, tipShape: 'square', texture: 0.82 },
  { id: 'cloud-brush', name: 'Nubes', category: 'painting', size: 72, opacity: 28, hardness: 8, spacing: 12, smoothing: 4, tipShape: 'flower', texture: 0.3 },
  { id: 'wet-watercolor', name: 'Acuarela húmeda', category: 'painting', size: 36, opacity: 48, hardness: 14, spacing: 7, smoothing: 2, tipShape: 'round', texture: 0.42 },
  { id: 'soft-graphite-6b', name: 'Grafito suave 6B', category: 'sketch', size: 22, opacity: 70, hardness: 30, spacing: 7, smoothing: 2, tipShape: 'square', texture: 0.93 },
  { id: 'blue-pencil-rough', name: 'Lápiz azul rugoso', category: 'sketch', size: 10, opacity: 46, hardness: 48, spacing: 8, smoothing: 1, tipShape: 'diamond', texture: 0.86 },
  { id: 'comic-hatching', name: 'Entintado rayado', category: 'inking', size: 4, opacity: 96, hardness: 92, spacing: 16, smoothing: 16, tipShape: 'square', texture: 0.22 },
  { id: 'fine-liner', name: 'Microfibra fina', category: 'inking', size: 1.5, opacity: 100, hardness: 100, spacing: 3, smoothing: 28, tipShape: 'round', texture: 0 },
  { id: 'stippling', name: 'Punteado', category: 'decoration', size: 14, opacity: 80, hardness: 100, spacing: 130, smoothing: 0, tipShape: 'round', texture: 0.15 },
  { id: 'petal-chain', name: 'Cadena de pétalos', category: 'decoration', size: 28, opacity: 90, hardness: 88, spacing: 70, smoothing: 0, tipShape: 'flower', texture: 0.08 },
  { id: 'sponge-grain', name: 'Esponja', category: 'texture', size: 50, opacity: 58, hardness: 20, spacing: 26, smoothing: 0, tipShape: 'lace', texture: 1 },
  { id: 'sand-grain', name: 'Arena', category: 'texture', size: 42, opacity: 72, hardness: 36, spacing: 14, smoothing: 0, tipShape: 'diamond', texture: 1 },
  { id: 'watercolor-edge', name: 'Acuarela con borde', category: 'painting', size: 40, opacity: 56, hardness: 34, spacing: 8, smoothing: 0, tipShape: 'flower', texture: 0.72 },
  { id: 'opaque-gouache', name: 'Gouache opaco', category: 'painting', size: 24, opacity: 100, hardness: 76, spacing: 8, smoothing: 1, tipShape: 'round', texture: 0.28 },
  { id: 'sanguine-pencil', name: 'Sanguina', category: 'sketch', size: 16, opacity: 64, hardness: 42, spacing: 10, smoothing: 1, tipShape: 'diamond', texture: 0.7 },
  { id: 'rough-charcoal', name: 'Carboncillo rugoso', category: 'sketch', size: 32, opacity: 68, hardness: 28, spacing: 7, smoothing: 0, tipShape: 'square', texture: 0.98 },
  { id: 'mechanical-pencil', name: 'Portaminas 0.5', category: 'sketch', size: 1.2, opacity: 92, hardness: 90, spacing: 4, smoothing: 22, tipShape: 'round', texture: 0.04 },
  { id: 'soft-crayon', name: 'Crayón suave', category: 'sketch', size: 23, opacity: 82, hardness: 56, spacing: 12, smoothing: 0, tipShape: 'square', texture: 0.68 },
  { id: 'g-pen-taper', name: 'Plumilla G con presión', category: 'inking', size: 6, opacity: 100, hardness: 100, spacing: 3, smoothing: 30, tipShape: 'round', texture: 0 },
  { id: 'mapping-pen-hard', name: 'Plumilla cartográfica dura', category: 'inking', size: 2, opacity: 100, hardness: 100, spacing: 2, smoothing: 36, tipShape: 'round', texture: 0 },
  { id: 'brush-pen', name: 'Pincel de tinta', category: 'inking', size: 10, opacity: 98, hardness: 82, spacing: 7, smoothing: 22, tipShape: 'diamond', texture: 0.16 },
  { id: 'screen-tone-dots', name: 'Tramado de puntos', category: 'decoration', size: 18, opacity: 76, hardness: 100, spacing: 110, smoothing: 0, tipShape: 'round', texture: 0.34 },
  { id: 'sparkle-stamp', name: 'Destellos', category: 'decoration', size: 28, opacity: 100, hardness: 100, spacing: 90, smoothing: 0, tipShape: 'star', texture: 0 },
  { id: 'lace-border', name: 'Borde de encaje', category: 'decoration', size: 22, opacity: 88, hardness: 64, spacing: 52, smoothing: 0, tipShape: 'lace', texture: 0.28 },
  { id: 'rough-pastel', name: 'Pastel rugoso', category: 'texture', size: 38, opacity: 78, hardness: 34, spacing: 12, smoothing: 0, tipShape: 'square', texture: 1 },
  { id: 'paper-fiber', name: 'Fibra de papel', category: 'texture', size: 44, opacity: 62, hardness: 26, spacing: 19, smoothing: 0, tipShape: 'lace', texture: 0.96 },
  { id: 'granite-speckle', name: 'Granulado mineral', category: 'texture', size: 36, opacity: 70, hardness: 50, spacing: 36, smoothing: 0, tipShape: 'diamond', texture: 0.99 },
  { id: 'wet-oil-blend', name: 'Óleo húmedo', category: 'painting', size: 34, opacity: 72, hardness: 36, spacing: 6, smoothing: 6, tipShape: 'round', texture: 0.42 },
  { id: 'flat-acrylic', name: 'Acrílico plano', category: 'painting', size: 25, opacity: 96, hardness: 92, spacing: 8, smoothing: 3, tipShape: 'square', texture: 0.18 },
  { id: 'gestural-pencil', name: 'Lápiz de gesto', category: 'sketch', size: 19, opacity: 38, hardness: 24, spacing: 8, smoothing: 1, tipShape: 'round', texture: 0.58 },
  { id: 'rough-conte', name: 'Conté rugoso', category: 'sketch', size: 21, opacity: 76, hardness: 46, spacing: 11, smoothing: 0, tipShape: 'diamond', texture: 0.88 },
  { id: 'blue-layout-pencil', name: 'Lápiz azul de layout', category: 'sketch', size: 5, opacity: 44, hardness: 45, spacing: 7, smoothing: 9, tipShape: 'round', texture: 0.22 },
  { id: 'maru-micro-pen', name: 'Maru ultrafina', category: 'inking', size: 1, opacity: 100, hardness: 100, spacing: 2, smoothing: 34, tipShape: 'round', texture: 0 },
  { id: 'saji-dry-pen', name: 'Saji seca', category: 'inking', size: 11, opacity: 91, hardness: 72, spacing: 12, smoothing: 12, tipShape: 'diamond', texture: 0.48 },
  { id: 'comic-brush-pen', name: 'Pincel de entintado cómic', category: 'inking', size: 13, opacity: 100, hardness: 84, spacing: 6, smoothing: 24, tipShape: 'round', texture: 0.08 },
  { id: 'rose-vine-stamp', name: 'Enredadera floral', category: 'decoration', size: 34, opacity: 92, hardness: 82, spacing: 62, smoothing: 0, tipShape: 'leaf', texture: 0.12 },
  { id: 'lace-flower-stamp', name: 'Encaje floral', category: 'decoration', size: 42, opacity: 82, hardness: 52, spacing: 58, smoothing: 0, tipShape: 'lace', texture: 0.42 },
  { id: 'starburst-stamp', name: 'Ráfaga de estrellas', category: 'decoration', size: 38, opacity: 100, hardness: 96, spacing: 120, smoothing: 0, tipShape: 'star', texture: 0.02 },
  { id: 'crosshatch-paper', name: 'Trama de papel', category: 'texture', size: 31, opacity: 64, hardness: 38, spacing: 22, smoothing: 0, tipShape: 'square', texture: 0.91 },
  { id: 'chalk-dust', name: 'Polvo de tiza', category: 'texture', size: 55, opacity: 34, hardness: 12, spacing: 8, smoothing: 0, tipShape: 'round', texture: 0.99 },
  { id: 'rough-stone', name: 'Piedra erosionada', category: 'texture', size: 47, opacity: 68, hardness: 44, spacing: 28, smoothing: 0, tipShape: 'diamond', texture: 0.97 },
  { id: 'pastel-blender', name: 'Difuminador pastel', category: 'painting', size: 29, opacity: 42, hardness: 18, spacing: 5, smoothing: 12, tipShape: 'round', texture: 0.34 },
  { id: 'acrylic-bristle', name: 'Acrílico de cerdas', category: 'painting', size: 32, opacity: 88, hardness: 78, spacing: 20, smoothing: 0, tipShape: 'square', texture: 0.62 },
  { id: 'soft-glaze', name: 'Veladura suave', category: 'painting', size: 58, opacity: 18, hardness: 8, spacing: 6, smoothing: 18, tipShape: 'round', texture: 0.06 },
] as const;

export const BRUSH_CATEGORY_LABELS: Record<BrushCategory, string> = {
  sketch: 'Boceto',
  inking: 'Entintado',
  decoration: 'Decoración',
  texture: 'Texturas',
  painting: 'Pintura',
};

export function findBrushPreset(id: string): BrushPreset | undefined {
  return BRUSH_PRESETS.find((preset) => preset.id === id);
}
