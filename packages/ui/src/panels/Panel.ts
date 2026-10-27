/**
 * Base class for interactive UI panels.
 *
 * Encapsulates the panel element and provides the visibility lifecycle shared by
 * concrete panels. Subclasses customize visibility through the lifecycle hooks
 * instead of duplicating DOM visibility logic.
 */
export abstract class Panel {
  private readonly element: HTMLElement;
  protected readonly root: HTMLElement;

  protected constructor(root: HTMLElement, selector: string) {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`No se encontró el panel requerido: ${selector}`);
    this.root = root;
    this.element = element;
  }

  get id(): string {
    return this.element.id;
  }

  get visible(): boolean {
    return !this.element.hidden;
  }

  abstract mount(): void;

  show(): void {
    this.setVisible(true);
  }

  hide(): void {
    this.setVisible(false);
  }

  protected get panelElement(): HTMLElement {
    return this.element;
  }

  protected setVisible(visible: boolean): void {
    const changed = this.visible !== visible;
    this.element.hidden = !visible;
    this.element.setAttribute('aria-hidden', String(!visible));
    if (changed) this.onVisibilityChanged(visible);
  }

  /** Hook for subclasses that need to react to a visibility change. */
  protected onVisibilityChanged(_visible: boolean): void {
    // Default panel visibility requires no additional work.
  }
}
