import type { WorkspaceDefinition } from './types';

const GeneralWorkspace: WorkspaceDefinition = {
  id: 'general',
  label: 'General',
  visible: { advanced: true, history: true, layers: true, comic: false, storyboard: false, timeline: false },
  order: ['advanced', 'history', 'layers', 'comic', 'storyboard', 'timeline'],
};
export default GeneralWorkspace;
