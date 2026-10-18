import type { WorkspaceDefinition } from './types';

const StoryboardingWorkspace: WorkspaceDefinition = {
  id: 'storyboarding',
  label: 'Storyboarding',
  // La línea de tiempo queda disponible abajo del todo para ordenar los fotogramas junto al guion.
  visible: { advanced: true, history: true, layers: true, comic: false, storyboard: true, timeline: true },
  order: ['storyboard', 'layers', 'history', 'advanced', 'comic', 'timeline'],
};
export default StoryboardingWorkspace;
