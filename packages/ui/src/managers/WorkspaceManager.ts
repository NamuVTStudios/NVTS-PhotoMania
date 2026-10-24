import { getWorkspaceDefinition, WORKSPACES, type WorkspaceDefinition, type WorkspaceId } from '../workspaces';
import { readWorkspace, writeWorkspace } from '../workspaces/persistence';

/** Centraliza la validación, consulta y persistencia de los espacios de trabajo. */
export class WorkspaceManager {
  getCurrent(): WorkspaceId {
    return readWorkspace();
  }

  setCurrent(value: string): WorkspaceId | null {
    if (!this.isWorkspaceId(value)) return null;
    writeWorkspace(value);
    return value;
  }

  isWorkspaceId(value: string | undefined): value is WorkspaceId {
    return value !== undefined && WORKSPACES.some((workspace) => workspace.id === value);
  }

  getDefinition(id: WorkspaceId): WorkspaceDefinition {
    return getWorkspaceDefinition(id);
  }

  getLabel(id: WorkspaceId): string {
    return this.getDefinition(id).label;
  }

  list(): readonly WorkspaceDefinition[] {
    return WORKSPACES;
  }
}
