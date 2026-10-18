import { WORKSPACES, type WorkspaceId } from './index';

const WORKSPACE_STORAGE_KEY = 'nvts-photomania-workspace-v1';

/** Reads the last selected workspace and falls back to General when storage is unavailable. */
export function readWorkspace(): WorkspaceId {
  try {
    const value = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    return WORKSPACES.some((workspace) => workspace.id === value) ? value as WorkspaceId : 'general';
  } catch {
    return 'general';
  }
}

/** Persists the selected workspace without preventing the editor from opening in restricted contexts. */
export function writeWorkspace(workspace: WorkspaceId): void {
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace);
  } catch (error) {
    console.warn('No se pudo guardar el espacio de trabajo:', error);
  }
}
