/** Observer pattern events. Consumers receive immutable notifications and do not couple the model to UI panels. */
export type DocumentChangeKind = 'structure' | 'properties' | 'pixels' | 'history' | 'document';

export interface DocumentChangeEvent {
  readonly kind: DocumentChangeKind;
  readonly label: string;
  readonly documentId: string;
  readonly revision: number;
}

export type DocumentChangeListener = (event: DocumentChangeEvent) => void;
