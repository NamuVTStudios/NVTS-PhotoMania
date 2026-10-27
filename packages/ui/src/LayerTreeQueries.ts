import { isPixelLayerType, type LayerMask } from '@nvts/shared';
import type { LayerNode } from '@nvts/document-model';

type MaskType = LayerMask['type'];

export function findTopRasterLayer(nodes: LayerNode[]): LayerNode | undefined {
  const topDown = [...nodes].reverse();
  const paintLayer = topDown.map(findTopPaintCandidate).find(Boolean);
  if (paintLayer) return paintLayer;
  return topDown.map(findTopPixelCandidate).find(Boolean);
}

export function containsLayerType(nodes: LayerNode[], type: LayerNode['type']): boolean {
  return nodes.some((node) => node.type === type || containsLayerType(node.children, type));
}

export function containsEnabledMask(nodes: LayerNode[], type: MaskType): boolean {
  return nodes.some((node) => hasEnabledMask(node, type) || containsEnabledMask(node.children, type));
}

function findTopPaintCandidate(layer: LayerNode): LayerNode | undefined {
  const nestedCandidate = layer.type === 'group' ? findTopRasterLayer(layer.children) : undefined;
  if (nestedCandidate) return nestedCandidate;
  return isPaintLayer(layer) ? layer : undefined;
}

function findTopPixelCandidate(layer: LayerNode): LayerNode | undefined {
  const nestedCandidate = findTopPixelCandidateFromGroup(layer);
  if (nestedCandidate) return nestedCandidate;
  return isPixelLayerType(layer.type) ? layer : undefined;
}

function findTopPixelCandidateFromGroup(layer: LayerNode): LayerNode | undefined {
  if (layer.type !== 'group') return undefined;
  const nestedCandidate = findTopRasterLayer(layer.children);
  if (!nestedCandidate || !isPixelLayerType(nestedCandidate.type)) return undefined;
  return nestedCandidate;
}

function hasEnabledMask(node: LayerNode, type: MaskType): boolean {
  return Boolean(node.masks?.some((mask) => mask.enabled && mask.type === type));
}

function isPaintLayer(layer: LayerNode): boolean {
  return layer.type === 'paint' || layer.type === 'raster';
}
