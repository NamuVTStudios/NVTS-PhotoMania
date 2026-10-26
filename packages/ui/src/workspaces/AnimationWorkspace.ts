import type { WorkspaceDefinition } from './types';

const AnimationWorkspace: WorkspaceDefinition = {
  id: 'animation',
  label: 'Animación',
  visible: { advanced: true, history: true, layers: true, comic: false, storyboard: false, timeline: true },
  // La línea de tiempo se muestra en el dock inferior independiente.
  order: ['layers', 'history', 'advanced', 'comic', 'storyboard', 'timeline'],
};
export default AnimationWorkspace;
