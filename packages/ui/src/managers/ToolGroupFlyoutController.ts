/**
 * Displays each tools-rail group in a compact flyout outside the scrolling rail.
 * The original button nodes are moved, not cloned, so existing IDs and handlers remain valid.
 */
export class ToolGroupFlyoutController {
  private readonly workspace: HTMLElement;
  private readonly rail: HTMLElement;
  private readonly flyout: HTMLDivElement;
  private readonly groups: HTMLDetailsElement[];
  private activeGroup: HTMLDetailsElement | null = null;
  private readonly itemsByGroup = new Map<HTMLDetailsElement, HTMLElement>();

  constructor(root: HTMLElement) {
    const workspace = root.querySelector<HTMLElement>('.workspace');
    const rail = root.querySelector<HTMLElement>('.tools-rail');
    if (!workspace || !rail) throw new Error('No se encontró el espacio de trabajo o la barra de herramientas.');
    this.workspace = workspace;
    this.rail = rail;
    this.groups = Array.from(rail.querySelectorAll<HTMLDetailsElement>('.tools-rail-group'));
    const flyout = root.querySelector<HTMLDivElement>('#tool-group-flyout-host');
    if (!flyout) throw new Error('No se encontró el contenedor flotante de herramientas.');
    this.flyout = flyout;
    this.flyout.id = 'tool-group-flyout';
    this.flyout.className = 'tool-group-flyout';
    this.flyout.hidden = true;
    this.flyout.setAttribute('role', 'group');
  }

  mount(): void {
    this.groups.forEach((group) => this.bindGroup(group));
    this.flyout.addEventListener('click', (event) => this.closeAfterToolSelection(event));
    document.addEventListener('pointerdown', (event) => this.closeOnOutsidePointer(event));
    document.addEventListener('focusin', (event) => this.closeOnOutsideFocus(event));
    document.addEventListener('keydown', (event) => this.closeOnEscape(event));
    window.addEventListener('resize', () => this.positionFlyout());
    window.addEventListener('scroll', () => this.positionFlyout(), true);
    this.rail.addEventListener('scroll', () => this.positionFlyout());
  }

  private bindGroup(group: HTMLDetailsElement): void {
    const summary = group.querySelector<HTMLElement>(':scope > summary');
    const items = group.querySelector<HTMLElement>(':scope > .tools-rail-group-items');
    if (!summary || !items) return;
    this.itemsByGroup.set(group, items);
    group.removeAttribute('open');
    summary.setAttribute('aria-haspopup', 'true');
    summary.setAttribute('aria-expanded', 'false');
    summary.setAttribute('aria-controls', this.flyout.id);
    summary.addEventListener('click', (event) => {
      event.preventDefault();
      const wasActive = this.activeGroup === group;
      this.close(false);
      if (!wasActive) this.open(group, event.detail === 0);
    });
    summary.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight') return;
      event.preventDefault();
      if (this.activeGroup !== group) this.open(group, true);
    });
  }

  private open(group: HTMLDetailsElement, focusFirst: boolean): void {
    const items = this.itemsByGroup.get(group);
    const summary = group.querySelector<HTMLElement>(':scope > summary');
    if (!items || !summary) return;
    this.flyout.replaceChildren(items);
    this.activeGroup = group;
    group.dataset.active = 'true';
    summary.setAttribute('aria-expanded', 'true');
    this.flyout.setAttribute('aria-label', summary.getAttribute('aria-label') ?? 'Herramientas');
    this.flyout.hidden = false;
    this.positionFlyout();
    if (focusFirst) items.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  private close(restoreFocus: boolean): void {
    if (!this.activeGroup) return;
    const group = this.activeGroup;
    const items = this.itemsByGroup.get(group);
    const summary = group.querySelector<HTMLElement>(':scope > summary');
    if (items) group.appendChild(items);
    group.dataset.active = 'false';
    summary?.setAttribute('aria-expanded', 'false');
    this.activeGroup = null;
    this.flyout.hidden = true;
    this.flyout.removeAttribute('aria-label');
    if (restoreFocus) summary?.focus();
  }

  private positionFlyout(): void {
    if (this.flyout.hidden || !this.activeGroup) return;
    const summary = this.activeGroup.querySelector<HTMLElement>(':scope > summary');
    if (!summary) return;
    const workspaceRect = this.workspace.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    const flyoutRect = this.flyout.getBoundingClientRect();
    const gap = 8;
    const preferredLeft = summaryRect.right - workspaceRect.left + gap;
    const fallbackLeft = summaryRect.left - workspaceRect.left - flyoutRect.width - gap;
    const maxLeft = Math.max(gap, workspaceRect.width - flyoutRect.width - gap);
    const left = preferredLeft <= maxLeft ? preferredLeft : Math.max(gap, fallbackLeft);
    const maxTop = Math.max(gap, workspaceRect.height - flyoutRect.height - gap);
    const top = Math.max(gap, Math.min(summaryRect.top - workspaceRect.top, maxTop));
    this.flyout.style.left = `${left}px`;
    this.flyout.style.top = `${top}px`;
  }

  private closeAfterToolSelection(event: MouseEvent): void {
    const target = event.target;
    if (target instanceof Element && target.closest('button')) this.close(false);
  }

  private closeOnOutsidePointer(event: PointerEvent): void {
    if (!this.activeGroup || !(event.target instanceof Node)) return;
    if (this.flyout.contains(event.target) || this.activeGroup.contains(event.target)) return;
    this.close(false);
  }

  private closeOnOutsideFocus(event: FocusEvent): void {
    if (!this.activeGroup || !(event.target instanceof Node)) return;
    if (this.flyout.contains(event.target) || this.activeGroup.contains(event.target)) return;
    this.close(false);
  }

  private closeOnEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.activeGroup) return;
    event.preventDefault();
    event.stopPropagation();
    this.close(true);
  }
}
