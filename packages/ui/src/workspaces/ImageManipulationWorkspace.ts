import type { WorkspaceDefinition } from './types';

const ImageManipulationWorkspace: WorkspaceDefinition = {
  id: 'image-manipulation',
  label: 'Manipulación de imágenes',
  visible: { advanced: true, history: true, layers: true, comic: false, storyboard: false, timeline: false },
  order: ['layers', 'history', 'advanced', 'comic', 'storyboard', 'timeline'],
};
export default ImageManipulationWorkspace;
