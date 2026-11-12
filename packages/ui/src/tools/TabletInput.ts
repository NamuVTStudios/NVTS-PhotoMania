export type TabletPointerType = 'mouse' | 'pen' | 'touch';

export interface TabletInputPreferences {
  pressureAffectsSize: boolean;
  pressureAffectsOpacity: boolean;
  tiltControlsAngle: boolean;
  pressureCurve: number;
}

export interface BrushPointerSample {
  pointerType: TabletPointerType;
  pressure: number;
  tiltX: number;
  tiltY: number;
}

export const DEFAULT_TABLET_INPUT_PREFERENCES: Readonly<TabletInputPreferences> = {
  pressureAffectsSize: true,
  pressureAffectsOpacity: true,
  tiltControlsAngle: true,
  pressureCurve: 1,
};


/** Pen pointerup coordinates are unreliable on some tablet drivers after pen lift.
 * Brush strokes are finalized from the last contact pointermove/coalesced sample instead.
 */
export function shouldUsePointerUpSample(pointerType: TabletPointerType): boolean {
  return pointerType !== 'pen';
}

/** A pen hover event after tip lift must not extend an active paint stroke. */
export function isPenContactSample(pointerType: TabletPointerType, buttons: number, pressure: number): boolean {
  if (pointerType !== 'pen') return true;
  return buttons !== 0 || pressure > 0;
}

/** Rejects samples from another pointer or from a stroke already finalized by pointerup. */
export function isCurrentStrokePointer(
  activePointerId: number | null,
  eventPointerId: number,
  strokeEnded = false,
): boolean {
  if (strokeEnded) return false;
  return activePointerId === null || activePointerId === eventPointerId;
}

export function readBrushPointerSample(event: PointerEvent): BrushPointerSample {
  const pointerType = event.pointerType === 'pen' || event.pointerType === 'touch' ? event.pointerType : 'mouse';
  const rawPressure = Number.isFinite(event.pressure) ? event.pressure : 0.5;
  return {
    pointerType,
    pressure: pointerType === 'pen' ? clamp(rawPressure || 0.02, 0.02, 1) : 1,
    tiltX: pointerType === 'pen' ? clamp(Number(event.tiltX) || 0, -90, 90) : 0,
    tiltY: pointerType === 'pen' ? clamp(Number(event.tiltY) || 0, -90, 90) : 0,
  };
}

export function interpolateBrushPointerSample(
  start: BrushPointerSample,
  end: BrushPointerSample,
  progress: number,
): BrushPointerSample {
  const t = clamp(progress, 0, 1);
  return {
    pointerType: end.pointerType,
    pressure: lerp(start.pressure, end.pressure, t),
    tiltX: lerp(start.tiltX, end.tiltX, t),
    tiltY: lerp(start.tiltY, end.tiltY, t),
  };
}

export function getPressureScale(sample: BrushPointerSample, curve: number): number {
  if (sample.pointerType !== 'pen') return 1;
  const exponent = clamp(curve, 0.5, 2.5);
  return 0.16 + 0.84 * Math.pow(clamp(sample.pressure, 0, 1), exponent);
}

export function getTiltAngle(sample: BrushPointerSample): number {
  return Math.atan2(sample.tiltY, sample.tiltX);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
