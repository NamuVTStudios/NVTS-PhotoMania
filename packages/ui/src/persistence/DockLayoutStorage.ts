import type { WorkspacePanelId } from '../workspaces/types';

const STORAGE_KEY = 'nvts-photomania-dock-layout-v1';
const DOCK_SIZE_MIGRATION_KEY = 'nvts-photomania-dock-size-360x420-migrated';

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


/** Enlarges older saved workspace docks once while preserving any user widths/heights above the new defaults. */
export function migrateDockSizes(
  layout: PersistedDockLayout,
  defaultDockWidth: number,
  defaultLayersHeight: number,
): PersistedDockLayout {
  if (hasDockSizeMigrationRun()) return layout;
  const workspaces = Object.fromEntries(Object.entries(layout.workspaces).map(([id, workspace]) => [
    id,
    migrateWorkspaceDockSizes(workspace, defaultDockWidth, defaultLayersHeight),
  ]));
  const nextLayout: PersistedDockLayout = { ...layout, workspaces };
  writeDockLayout(nextLayout);
  markDockSizeMigrationComplete();
  return nextLayout;
}

function migrateWorkspaceDockSizes(
  workspace: WorkspaceSavedState,
  defaultDockWidth: number,
  defaultLayersHeight: number,
): WorkspaceSavedState {
  const panels = workspace.panels ?? {};
  const savedLayers = panels.layers;
  const layers = savedLayers
    ? { ...savedLayers, dockHeight: Math.max(defaultLayersHeight, Number(savedLayers.dockHeight) || defaultLayersHeight) }
    : savedLayers;
  return {
    ...workspace,
    dockWidth: Math.max(defaultDockWidth, Number(workspace.dockWidth) || defaultDockWidth),
    panels: { ...panels, ...(layers ? { layers } : {}) },
  };
}

function hasDockSizeMigrationRun(): boolean {
  try { return localStorage.getItem(DOCK_SIZE_MIGRATION_KEY) === 'true'; }
  catch { return false; }
}

function markDockSizeMigrationComplete(): void {
  try { localStorage.setItem(DOCK_SIZE_MIGRATION_KEY, 'true'); }
  catch { /* Storage errors must not prevent the workspace from loading. */ }
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

/** Removes saved customizations for one workspace, preserving all other workspaces. */
export function resetDockLayout(
  workspaceId?: string,
  currentLayout?: PersistedDockLayout,
): PersistedDockLayout {
  if (!workspaceId) return resetAllDockLayouts();
  const layout = currentLayout ?? readDockLayout();
  const workspaces = { ...layout.workspaces };
  delete workspaces[workspaceId];
  const nextLayout: PersistedDockLayout = { version: 1, workspaces };
  writeDockLayout(nextLayout);
  return nextLayout;
}

/** Deletes all saved customizations. Kept for migrations and explicit global resets. */
function resetAllDockLayouts(): PersistedDockLayout {
  const defaults = emptyDockLayout();
  writeDockLayout(defaults);
  return defaults;
}
