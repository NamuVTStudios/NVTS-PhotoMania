import type { WorkspacePanelId } from '../workspaces/types';

const STORAGE_KEY = 'nvts-photomania-dock-layout-v1';

export type DockablePanelId = WorkspacePanelId;
export type PanelSavedState = {
  visible: boolean;
  floating: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  dockHeight: number;
};
export type WorkspaceSavedState = {
  dockWidth: number;
  timelineDockHeight?: number;
  panelsHidden: boolean;
  order: DockablePanelId[];
  panels: Partial<Record<DockablePanelId, PanelSavedState>>;
};
export type PersistedDockLayout = { version: 1; workspaces: Record<string, WorkspaceSavedState> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function emptyDockLayout(): PersistedDockLayout {
  return { version: 1, workspaces: {} };
}

function parseDockLayout(raw: string | null): PersistedDockLayout {
  if (!raw) return emptyDockLayout();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { return emptyDockLayout(); }
  if (!isRecord(parsed) || parsed.version !== 1 || !isRecord(parsed.workspaces)) return emptyDockLayout();
  return parsed as unknown as PersistedDockLayout;
}

/** Reads and validates the saved workspace layout without leaking storage errors. */
export function readDockLayout(): PersistedDockLayout {
  try { return parseDockLayout(localStorage.getItem(STORAGE_KEY)); }
  catch { return emptyDockLayout(); }
}

/** Persists layout state while keeping private-mode quota/security errors non-fatal. */
export function writeDockLayout(layout: PersistedDockLayout): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); }
  catch (error) { console.warn('No se pudo guardar la disposición de paneles:', error); }
}
