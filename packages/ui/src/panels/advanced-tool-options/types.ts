
export interface AdvancedBrushSettings {
  size: number;
  opacity: number;
  hardness: number;
  spacing: number;
  smoothing: number;
  tolerance: number;
  contiguous: boolean;
  sampleMerged: boolean;
  sampleRadius: 1 | 3 | 5;
  shapeFill: boolean;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  gradientType: 'linear' | 'radial';
  gradientReverse: boolean;
  panSensitivity: number;
  zoomIncrement: number;
  vectorKeepAspectRatio: boolean;
  shapeCornerRadius: number;
  polygonSides: number;
  starPoints: number;
  spiralTurns: number;
}

export interface AdvancedTextSettings {
  fontFamily: string;
  fontSize: number;
  style: string;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  strokeColor: string;
  strokeWidth: number;
  backgroundColor: string;
}

export interface AdvancedComicSettings {
  mode: 'frame' | 'panel' | 'split';
  borderWidth: number;
  splitLineCount: 1 | 2;
  splitDistance: number;
}

export interface AdvancedToolOptionsCallbacks {
  adjustActiveLayerBrightness(delta: number): void;
  applyTextSettingsToSelectedLayer(): void;
  editVectorLayer(): void;
  updateComicSettings(settings: Partial<AdvancedComicSettings>): void;
}

export interface AdvancedToolOptionsContext {
  host: HTMLElement;
  brush: AdvancedBrushSettings;
  textSettings: AdvancedTextSettings;
  comicSettings: AdvancedComicSettings;
  callbacks: AdvancedToolOptionsCallbacks;
}

export interface ToolAdvancedOptionsDefinition {
  render(context: AdvancedToolOptionsContext): string;
  bind(context: AdvancedToolOptionsContext): void;
}
