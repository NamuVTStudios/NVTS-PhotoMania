import { CommandObject } from '@nvts/app-object';

/** Command pattern contract for reversible document operations. */
export interface DocumentCommand {
  readonly label: string;
  readonly memoryBytes: number;
  undo(): void;
  redo(): void;
}

/** Adapts existing mutation callbacks to the common command contract. */
export class CallbackDocumentCommand extends CommandObject implements DocumentCommand {
  constructor(
    readonly label: string,
    private readonly undoAction: () => void,
    private readonly redoAction: () => void,
    readonly memoryBytes = 0,
  ) {
    super(crypto.randomUUID(), label);
  }

  execute(): void { this.redo(); }
  undo(): void { this.undoAction(); }
  redo(): void { this.redoAction(); }
}
