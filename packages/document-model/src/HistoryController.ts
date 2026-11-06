import { AppObject } from '../../../../NVTS-Shared-Core/packages/app-object/src/AppObject';

export interface ActionCommand {
  execute(): void;
  undo(): void;
}

export class HistoryController extends AppObject {
  private undoStack: ActionCommand[] = [];
  private redoStack: ActionCommand[] = [];

  protected onInitialize(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  // Subtarea 1: Remueve el último comando. Subtarea 2: Ejecuta su deshacer. Subtarea 3: Lo pasa a redo.
  public executeUndo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    
    command.undo();
    this.redoStack.push(command);
  }

  // Subtarea 1: Remueve de redo. Subtarea 2: Re-ejecuta. Subtarea 3: Lo pasa a undo.
  public executeRedo(): void {
    const command = this.redoStack.pop();
    if (!command) return;

    command.execute();
    this.undoStack.push(command);
  }

  public registerNewCommand(command: ActionCommand): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = []; // Invalida el árbol de rehacer futuro
  }

  protected onDispose(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}
