/** Tipos compartidos por las configuraciones de espacios de trabajo. */
export type WorkspaceId =
  | 'general'
  | 'digital-illustration'
  | 'vector-illustration'
  | 'image-manipulation'
  | 'comics'
  | 'storyboarding'
  | 'animation';

export type WorkspacePanelId = 'advanced' | 'history' | 'layers' | 'comic' | 'storyboard' | 'timeline';

export interface WorkspaceDefinition {
  id: WorkspaceId;
  label: string;
  visible: Record<WorkspacePanelId, boolean>;
  /** Orden de arriba hacia abajo en el dock derecho. */
  order: WorkspacePanelId[];
}
