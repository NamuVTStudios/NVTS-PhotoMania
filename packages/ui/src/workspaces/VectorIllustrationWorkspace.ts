import type { WorkspaceDefinition } from './types';

const VectorIllustrationWorkspace: WorkspaceDefinition = {
  id: 'vector-illustration',
  label: 'Ilustración vectorial',
  visible: { advanced: true, history: true, layers: true, comic: false, storyboard: false, timeline: false },
  order: ['layers', 'advanced', 'history', 'comic', 'storyboard', 'timeline'],
};
export default VectorIllustrationWorkspace;
