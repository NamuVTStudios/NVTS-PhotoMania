/** A point in document coordinates. Immutable helpers keep geometry independent of UI state. */
export type SymmetryPoint = Readonly<{ x: number; y: number }>;

/** A vertical axis mirrors X; a horizontal axis mirrors Y. */
export type SymmetryAxis = 'vertical' | 'horizontal';

export type SymmetrySettings = Readonly<{
  enabled: boolean;
  verticalAxis: boolean;
  horizontalAxis: boolean;
  centerX: number;
  centerY: number;
}>;

export const DEFAULT_SYMMETRY_SETTINGS: SymmetrySettings = Object.freeze({
  enabled: false,
  verticalAxis: false,
  horizontalAxis: false,
  centerX: 0.5,
  centerY: 0.5,
});

const POINT_EPSILON = 0.0001;

/** Pure function: calculates the original and reflected points without changing state. */
export function createSymmetryPoints(
  point: SymmetryPoint,
  documentWidth: number,
  documentHeight: number,
  settings: SymmetrySettings,
): SymmetryPoint[] {
  if (!settings.enabled) return [{ x: point.x, y: point.y }];

  const centerX = documentWidth * clampUnit(settings.centerX);
  const centerY = documentHeight * clampUnit(settings.centerY);
  const points: SymmetryPoint[] = [{ x: point.x, y: point.y }];
  const mirrorX = settings.verticalAxis ? { x: 2 * centerX - point.x, y: point.y } : null;
  const mirrorY = settings.horizontalAxis ? { x: point.x, y: 2 * centerY - point.y } : null;

  if (mirrorX) points.push(mirrorX);
  if (mirrorY) points.push(mirrorY);
  if (mirrorX && mirrorY) points.push({ x: mirrorX.x, y: mirrorY.y });
  return removeDuplicatePoints(points);
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
}

function removeDuplicatePoints(points: SymmetryPoint[]): SymmetryPoint[] {
  return points.filter((point, index) => points.findIndex((candidate) => samePoint(candidate, point)) === index);
}

function samePoint(first: SymmetryPoint, second: SymmetryPoint): boolean {
  return Math.abs(first.x - second.x) < POINT_EPSILON
    && Math.abs(first.y - second.y) < POINT_EPSILON;
}

/** Encapsulates independent axis toggles and exposes immutable setting snapshots. */
export class SymmetryManager {
  private settings: SymmetrySettings = { ...DEFAULT_SYMMETRY_SETTINGS };

  isEnabled(): boolean {
    return this.settings.enabled;
  }

  toggle(): boolean {
    this.setEnabled(!this.settings.enabled);
    return this.settings.enabled;
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) {
      this.settings = { ...this.settings, enabled: false };
      return;
    }
    const hasAxis = this.settings.verticalAxis || this.settings.horizontalAxis;
    this.settings = {
      ...this.settings,
      enabled: true,
      verticalAxis: hasAxis ? this.settings.verticalAxis : true,
      horizontalAxis: hasAxis ? this.settings.horizontalAxis : true,
    };
  }

  getSettings(): SymmetrySettings {
    return { ...this.settings };
  }

  setAxes(verticalAxis: boolean, horizontalAxis: boolean): void {
    this.settings = {
      ...this.settings,
      enabled: verticalAxis || horizontalAxis,
      verticalAxis,
      horizontalAxis,
    };
  }

  setAxis(axis: SymmetryAxis, enabled: boolean): void {
    if (axis === 'vertical') {
      this.settings = { ...this.settings, verticalAxis: enabled, enabled: enabled || this.settings.horizontalAxis };
      return;
    }
    this.settings = { ...this.settings, horizontalAxis: enabled, enabled: enabled || this.settings.verticalAxis };
  }

  toggleAxis(axis: SymmetryAxis): boolean {
    const settings = this.getSettings();
    const isActive = axis === 'vertical' ? settings.verticalAxis : settings.horizontalAxis;
    this.setAxis(axis, !isActive);
    return axis === 'vertical' ? this.settings.verticalAxis : this.settings.horizontalAxis;
  }

  setCenter(centerX: number, centerY: number): void {
    this.settings = {
      ...this.settings,
      centerX: clampUnit(centerX),
      centerY: clampUnit(centerY),
    };
  }

  getSymmetryPoints(point: SymmetryPoint, documentWidth: number, documentHeight: number): SymmetryPoint[] {
    return createSymmetryPoints(point, documentWidth, documentHeight, this.settings);
  }
}

export const symmetryManager = new SymmetryManager();
