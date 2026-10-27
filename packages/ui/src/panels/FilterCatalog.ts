import type { FilterKind } from '@nvts/shared';

type FilterDefinition = { kind: FilterKind; label: string };
type FilterGroup = { title: string; filters: readonly FilterDefinition[] };

/** Single source of truth for filter names and their presentation categories. */
export const FILTER_GROUPS = [
  {
    title: 'Ajustes fotográficos',
    filters: [
      { kind: 'grayscale', label: 'Escala de grises' },
      { kind: 'brightness', label: 'Brillo' },
      { kind: 'contrast', label: 'Contraste' },
      { kind: 'saturation', label: 'Saturación' },
      { kind: 'hue-rotate', label: 'Rotación de tono' },
      { kind: 'sepia', label: 'Sepia' },
      { kind: 'invert', label: 'Invertir colores' },
      { kind: 'blur', label: 'Desenfoque gaussiano' },
      { kind: 'sharpen', label: 'Enfocar' },
    ],
  },
  {
    title: 'Ilustración y cómic',
    filters: [
      { kind: 'posterize', label: 'Posterizar' },
      { kind: 'threshold', label: 'Umbral blanco y negro' },
      { kind: 'duotone', label: 'Duotono' },
      { kind: 'solarize', label: 'Solarizar' },
      { kind: 'pixelate', label: 'Pixelar / mosaico' },
      { kind: 'edge-detect', label: 'Bordes / contorno' },
    ],
  },
  {
    title: 'Textura y acabado',
    filters: [
      { kind: 'noise', label: 'Grano / ruido' },
      { kind: 'vignette', label: 'Viñeta' },
    ],
  },
] as const satisfies readonly FilterGroup[];

export const FILTER_LABELS: Record<FilterKind, string> = Object.fromEntries(
  FILTER_GROUPS.flatMap((group) => group.filters.map(({ kind, label }) => [kind, label])),
) as Record<FilterKind, string>;

/** Builds the category list from the same catalog used to label selected filters. */
export function renderFilterGroups(): string {
  return FILTER_GROUPS.map(({ title, filters }) => {
    const buttons = filters.map(({ kind, label }) => {
      const active = kind === 'grayscale' ? ' class="active"' : '';
      return `<button${active} data-filter="${kind}">${label}</button>`;
    }).join('');
    return `<div class="filter-group"><strong>${title}</strong>${buttons}</div>`;
  }).join('');
}
