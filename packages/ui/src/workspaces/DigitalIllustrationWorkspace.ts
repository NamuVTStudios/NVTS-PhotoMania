import type { WorkspaceDefinition } from './types';

const DigitalIllustrationWorkspace: WorkspaceDefinition = {
  id: 'digital-illustration',
  label: 'Ilustración digital',
  visible: { advanced: true, history: true, layers: true, comic: false, storyboard: false, timeline: false },
  order: ['advanced', 'layers', 'history', 'comic', 'storyboard', 'timeline'],
};
export default DigitalIllustrationWorkspace;
