import GeneralWorkspace from './GeneralWorkspace';
import DigitalIllustrationWorkspace from './DigitalIllustrationWorkspace';
import VectorIllustrationWorkspace from './VectorIllustrationWorkspace';
import ImageManipulationWorkspace from './ImageManipulationWorkspace';
import ComicsWorkspace from './ComicsWorkspace';
import StoryboardingWorkspace from './StoryboardingWorkspace';
import AnimationWorkspace from './AnimationWorkspace';
import type { WorkspaceDefinition, WorkspaceId } from './types';

export type { WorkspaceDefinition, WorkspaceId, WorkspacePanelId } from './types';

/** Registro central. El diseño y los paneles de cada espacio viven en su propio archivo. */
export const WORKSPACES: WorkspaceDefinition[] = [
  GeneralWorkspace,
  DigitalIllustrationWorkspace,
  VectorIllustrationWorkspace,
  ImageManipulationWorkspace,
  ComicsWorkspace,
  StoryboardingWorkspace,
  AnimationWorkspace,
];

export function getWorkspaceDefinition(id: WorkspaceId): WorkspaceDefinition {
  return WORKSPACES.find((workspace) => workspace.id === id) ?? GeneralWorkspace;
}
