import type { WorkspaceDefinition } from './types';

const AnimationWorkspace: WorkspaceDefinition = {
  id: 'animation',
  label: 'Animación',
  visible: { advanced: true, history: true, layers: true, comic: false, storyboard: false, timeline: true },
  // La línea de tiempo es el último panel visible del dock.
  order: ['layers', 'history', 'advanced', 'comic', 'storyboard', 'timeline'],
};
export default AnimationWorkspace;
