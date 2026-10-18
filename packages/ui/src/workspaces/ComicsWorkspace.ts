import type { WorkspaceDefinition } from './types';

const ComicsWorkspace: WorkspaceDefinition = {
  id: 'comics',
  label: 'Cómics',
  visible: { advanced: true, history: true, layers: true, comic: true, storyboard: false, timeline: false },
  order: ['comic', 'layers', 'history', 'advanced', 'storyboard', 'timeline'],
};
export default ComicsWorkspace;
