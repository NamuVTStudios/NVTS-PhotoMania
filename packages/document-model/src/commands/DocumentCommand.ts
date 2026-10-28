/** Command pattern contract for reversible document operations. */
export interface DocumentCommand {
  readonly label: string;
  readonly memoryBytes: number;
  undo(): void;
  redo(): void;
}

/** Adapts existing mutation callbacks to the common command contract. */
export class CallbackDocumentCommand implements DocumentCommand {
  constructor(
    readonly label: string,
    private readonly undoAction: () => void,
    private readonly redoAction: () => void,
    readonly memoryBytes = 0,
  ) {}

  undo(): void { this.undoAction(); }
  redo(): void { this.redoAction(); }
}
