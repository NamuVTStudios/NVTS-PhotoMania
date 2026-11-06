import { PanelObject } from '@nvts/app-object';

/** DOM-backed panel adapter over the framework-independent Shared Core base. */
export abstract class Panel extends PanelObject {
  protected readonly root: HTMLElement;
  private readonly element: HTMLElement;

  protected constructor(root: HTMLElement, selector: string) {
    const element = root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`No se encontró el panel requerido: ${selector}`);

    super(element.id || selector.replace(/^#/, ''), element.dataset.panelName || element.id || selector);
    this.root = root;
    this.element = element;
    if (element.hidden) this.hide();
    else this.syncVisibility(true);
  }

  abstract mount(): void;

  protected get panelElement(): HTMLElement {
    return this.element;
  }

  protected override onVisibilityChanged(visible: boolean): void {
    this.syncVisibility(visible);
  }

  private syncVisibility(visible: boolean): void {
    this.element.hidden = !visible;
    this.element.setAttribute('aria-hidden', String(!visible));
  }
}
