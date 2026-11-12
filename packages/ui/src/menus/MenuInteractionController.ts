type MenuBinding = {
    trigger: HTMLButtonElement;
    dropdown: HTMLElement;
};

const MENU_TRIGGER_IDS = ['image', 'select', 'help'] as const;
const MENU_SEARCHABLE_SELECTORS = '.menus button[role^="menuitem"]:not(.menu-search-result), .menus > #menu-filter';

function normalizeSearch(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function isHiddenByAncestor(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current) {
        if (current.hidden) return true;
        current = current.parentElement;
    }
    return false;
}

export class MenuInteractionController {
    private readonly bindings: MenuBinding[];
    private mounted = false;

    constructor(private readonly root: HTMLElement) {
        this.bindings = MENU_TRIGGER_IDS.map((id) => ({
            trigger: this.requireElement<HTMLButtonElement>(`#menu-${id}`),
            dropdown: this.requireElement<HTMLElement>(`#${id}-menu-dropdown`),
        }));
    }

    mount(): void {
        if (this.mounted) return;
        this.mounted = true;
        this.bindTopLevelMenus();
        this.bindTopLevelNavigation();
        this.bindSubmenus();
        this.bindSearch();
        this.bindOutsidePointer();
        this.closeWhenLegacyMenuOpens();
    }

    setDocumentAvailable(available: boolean): void {
        this.root.querySelectorAll<HTMLButtonElement>('[data-requires-document="true"]').forEach((button) => {
            button.disabled = button.dataset.comingSoon === 'true'
                || button.dataset.declaredDisabled === 'true'
                || (!available && button.dataset.requiresDocument === 'true');
            button.setAttribute('aria-disabled', String(button.disabled));
            if (!available) button.title = 'Disponible después de crear o abrir un documento.';
            else button.removeAttribute('title');
        });
    }

    private bindTopLevelMenus(): void {
        this.bindings.forEach((binding) => {
            binding.trigger.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleMenu(binding);
            });
            binding.dropdown.addEventListener('click', (event) => {
                const item = (event.target as HTMLElement).closest<HTMLButtonElement>('button[role^="menuitem"]');
                if (!item || item.classList.contains('submenu-trigger')) return;
                this.closeAllMenus();
            });
            binding.dropdown.addEventListener('keydown', (event) => this.handleMenuKeydown(binding, event));
        });
    }

    private bindTopLevelNavigation(): void {
        this.root.querySelector<HTMLElement>('.menus')?.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            const target = event.target as HTMLElement;
            const trigger = target.closest<HTMLButtonElement>('.menus > .menu-wrap > button[aria-haspopup="menu"], .menus > button');
            if (!trigger) return;
            const triggers = Array.from(this.root.querySelectorAll<HTMLButtonElement>('.menus > .menu-wrap > button[aria-haspopup="menu"], .menus > button'))
                .filter((button) => !button.disabled);
            const index = triggers.indexOf(trigger);
            if (index < 0 || !triggers.length) return;
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            triggers[(index + direction + triggers.length) % triggers.length].focus();
        });
    }

    private bindSubmenus(): void {
        const selectors = ['#edit-menu-dropdown', '#image-menu-dropdown', '#select-menu-dropdown'];
        selectors.forEach((selector) => {
            this.root.querySelector<HTMLElement>(selector)?.querySelectorAll<HTMLButtonElement>('.submenu-trigger[aria-controls]').forEach((trigger) => {
                const parentMenu = trigger.closest<HTMLElement>('.file-menu-dropdown');
                const menusLayer = this.root.querySelector<HTMLElement>('.menus');
                const dropdown = this.getControlledDropdown(trigger);
                if (!parentMenu || !menusLayer || !dropdown) return;

                dropdown.dataset.rootMenuId = parentMenu.id;
                menusLayer.append(dropdown);
                const rootTrigger = this.root.querySelector<HTMLButtonElement>(`[aria-controls="${CSS.escape(parentMenu.id)}"]`);
                const owner: MenuBinding = rootTrigger
                    ? { trigger: rootTrigger, dropdown: parentMenu }
                    : { trigger, dropdown: parentMenu };

                dropdown.addEventListener('keydown', (event) => this.handleMenuKeydown(owner, event));
                dropdown.addEventListener('click', (event) => {
                    const item = (event.target as HTMLElement).closest<HTMLButtonElement>('button[role^="menuitem"]');
                    if (item && !item.classList.contains('submenu-trigger')) this.closeAllMenus();
                });

                trigger.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const opening = dropdown.hidden;
                    dropdown.hidden = !opening;
                    trigger.setAttribute('aria-expanded', String(opening));
                    if (opening) { this.positionSubmenu(trigger, dropdown); this.focusFirstMenuItem(dropdown); }
                });
            });
        });
    }

    private bindSearch(): void {
        const input = this.root.querySelector<HTMLInputElement>('#help-menu-search');
        const results = this.root.querySelector<HTMLElement>('#help-menu-search-results');
        if (!input || !results) return;

        input.addEventListener('input', () => this.renderSearchResults(input.value, results));
        input.addEventListener('keydown', (event) => {
            if (event.key === 'ArrowDown') {
                const first = results.querySelector<HTMLButtonElement>('button[role="option"]:not(:disabled)');
                if (!first) return;
                event.preventDefault();
                first.focus();
                return;
            }
            if (event.key === 'Enter') {
                const first = results.querySelector<HTMLButtonElement>('button[role="option"]:not(:disabled)');
                if (!first) return;
                event.preventDefault();
                first.click();
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                if (input.value) {
                    input.value = '';
                    this.renderSearchResults('', results);
                    return;
                }
                const help = this.bindings.find((binding) => binding.trigger.id === 'menu-help');
                if (help) this.closeMenu(help, true);
            }
        });

        results.addEventListener('keydown', (event) => this.handleSearchResultKeydown(event, input, results));
        results.addEventListener('click', (event) => {
            const result = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-search-target-id]');
            if (!result || result.disabled) return;
            const target = this.root.querySelector<HTMLButtonElement>(`#${CSS.escape(result.dataset.searchTargetId ?? '')}`);
            if (!target || target.disabled) return;
            this.openTargetAncestors(target);
            target.click();
            this.closeAllMenus();
            input.value = '';
            this.renderSearchResults('', results);
            this.bindings.find((entry) => entry.trigger.id === 'menu-help')?.trigger.focus();
        });
    }

    private renderSearchResults(query: string, results: HTMLElement): void {
        results.replaceChildren();
        const normalized = normalizeSearch(query.trim());
        if (!normalized) {
            results.hidden = true;
            return;
        }

        const candidates = Array.from(this.root.querySelectorAll<HTMLButtonElement>(MENU_SEARCHABLE_SELECTORS))
            .filter((button) => !button.classList.contains('submenu-trigger'));
        const matches = candidates.filter((button) => {
            const label = button.querySelector<HTMLElement>('.menu-item-label')?.textContent ?? button.textContent ?? '';
            const shortcut = button.querySelector('kbd')?.textContent ?? '';
            return normalizeSearch(`${label} ${shortcut}`).includes(normalized);
        });

        matches.slice(0, 30).forEach((target, index) => {
            if (!target.id) target.id = `menu-search-target-${index}`;
            const result = document.createElement('button');
            result.type = 'button';
            result.className = 'menu-search-result';
            result.setAttribute('role', 'option');
            result.dataset.searchTargetId = target.id;
            result.disabled = target.disabled;
            result.setAttribute('aria-disabled', String(target.disabled));

            const label = document.createElement('span');
            label.textContent = target.querySelector<HTMLElement>('.menu-item-label')?.textContent?.trim() ?? target.textContent?.trim() ?? '';
            result.append(label);

            const shortcut = target.querySelector('kbd')?.textContent?.trim();
            if (shortcut) {
                const key = document.createElement('kbd');
                key.textContent = shortcut;
                result.append(key);
            }
            if (target.disabled) {
                const status = document.createElement('small');
                status.textContent = target.querySelector('.menu-coming-soon') ? 'Próximamente' : 'No disponible';
                result.append(status);
            }
            results.append(result);
        });

        if (!matches.length) {
            const empty = document.createElement('p');
            empty.className = 'menu-search-empty';
            empty.textContent = 'No se encontraron comandos.';
            results.append(empty);
        }
        results.hidden = false;
    }

    private handleSearchResultKeydown(event: KeyboardEvent, input: HTMLInputElement, results: HTMLElement): void {
        if (!['ArrowDown', 'ArrowUp', 'Escape', 'Enter'].includes(event.key)) return;
        const options = Array.from(results.querySelectorAll<HTMLButtonElement>('button[role="option"]:not(:disabled)'));
        const active = document.activeElement;
        const current = options.indexOf(active as HTMLButtonElement);
        if (event.key === 'Escape') {
            event.preventDefault();
            input.focus();
            return;
        }
        if (event.key === 'Enter' && current >= 0) {
            event.preventDefault();
            options[current].click();
            return;
        }
        if (!options.length) return;
        event.preventDefault();
        const next = event.key === 'ArrowDown'
            ? Math.min(options.length - 1, current + 1)
            : Math.max(0, current < 0 ? options.length - 1 : current - 1);
        options[next].focus();
    }

    private toggleMenu(binding: MenuBinding): void {
        const opening = binding.dropdown.hidden;
        this.closeAllMenus();
        binding.dropdown.hidden = !opening;
        binding.trigger.setAttribute('aria-expanded', String(opening));
        if (!opening) return;
        if (binding.trigger.id === 'menu-help') {
            this.root.querySelector<HTMLInputElement>('#help-menu-search')?.focus();
            return;
        }
        this.focusFirstMenuItem(binding.dropdown);
    }

    private handleMenuKeydown(binding: MenuBinding, event: KeyboardEvent): void {
        const target = event.target as HTMLElement;
        const activeDropdown = target.closest<HTMLElement>('.file-menu-dropdown');
        if (!activeDropdown || !this.root.contains(activeDropdown)) return;
        const belongsToBinding = activeDropdown === binding.dropdown
            || binding.dropdown.contains(activeDropdown)
            || activeDropdown.dataset.rootMenuId === binding.dropdown.id;
        if (!belongsToBinding) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            if (activeDropdown.classList.contains('submenu-dropdown')) {
                this.closeSubmenu(activeDropdown);
                return;
            }
            this.closeMenu(binding, true);
            return;
        }

        const currentItem = target.closest<HTMLButtonElement>('button[role^="menuitem"]');
        if (event.key === 'ArrowRight' && currentItem?.classList.contains('submenu-trigger')) {
            event.preventDefault();
            const submenu = this.getControlledDropdown(currentItem);
            if (submenu) {
                submenu.hidden = false;
                currentItem.setAttribute('aria-expanded', 'true');
                this.positionSubmenu(currentItem, submenu);
                this.focusFirstMenuItem(submenu);
            }
            return;
        }

        if (event.key === 'ArrowLeft' && activeDropdown.classList.contains('submenu-dropdown')) {
            event.preventDefault();
            this.closeSubmenu(activeDropdown);
            return;
        }

        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const items = this.getDirectEnabledItems(activeDropdown);
        if (!items.length) return;
        event.preventDefault();
        const currentIndex = items.indexOf(currentItem as HTMLButtonElement);
        if (event.key === 'Home') items[0].focus();
        else if (event.key === 'End') items.at(-1)?.focus();
        else {
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            const start = currentIndex < 0 ? (direction > 0 ? -1 : 0) : currentIndex;
            const next = (start + direction + items.length) % items.length;
            items[next].focus();
        }
    }

    private getDirectEnabledItems(dropdown: HTMLElement): HTMLButtonElement[] {
        return Array.from(dropdown.querySelectorAll<HTMLButtonElement>('button[role^="menuitem"]'))
            .filter((button) => button.closest('.file-menu-dropdown') === dropdown && !button.disabled && !isHiddenByAncestor(button));
    }

    private positionSubmenu(trigger: HTMLButtonElement, dropdown: HTMLElement): void {
        dropdown.style.position = 'fixed';
        dropdown.style.left = '0px';
        dropdown.style.top = '0px';
        const triggerRect = trigger.getBoundingClientRect();
        const submenuRect = dropdown.getBoundingClientRect();
        const gap = 6;
        const preferredLeft = triggerRect.right + gap;
        const fitsRight = preferredLeft + Math.max(submenuRect.width, 250) <= window.innerWidth - 8;
        const left = fitsRight
            ? preferredLeft
            : Math.max(8, triggerRect.left - Math.max(submenuRect.width, 250) - gap);
        const estimatedHeight = Math.min(submenuRect.height || 360, window.innerHeight - 16);
        const top = Math.max(8, Math.min(triggerRect.top - 4, window.innerHeight - estimatedHeight - 8));
        dropdown.style.left = `${left}px`;
        dropdown.style.top = `${top}px`;
        dropdown.style.maxHeight = `${Math.max(120, window.innerHeight - top - 8)}px`;
    }

    private focusFirstMenuItem(dropdown: HTMLElement): void {
        this.getDirectEnabledItems(dropdown)[0]?.focus();
    }

    private closeSubmenu(dropdown: HTMLElement): void {
        dropdown.hidden = true;
        const trigger = this.root.querySelector<HTMLButtonElement>(`[aria-controls="${CSS.escape(dropdown.id)}"]`);
        trigger?.setAttribute('aria-expanded', 'false');
        trigger?.focus();
    }

    private openTargetAncestors(target: HTMLElement): void {
        const ancestors: HTMLElement[] = [];
        let dropdown = target.closest<HTMLElement>('.file-menu-dropdown');
        while (dropdown) {
            ancestors.push(dropdown);
            const rootMenuId = dropdown.dataset.rootMenuId;
            dropdown = rootMenuId
                ? this.root.querySelector<HTMLElement>(`#${CSS.escape(rootMenuId)}`)
                : dropdown.parentElement?.closest<HTMLElement>('.file-menu-dropdown') ?? null;
            if (dropdown && ancestors.includes(dropdown)) break;
        }
        ancestors.reverse().forEach((entry) => {
            entry.hidden = false;
            const trigger = this.root.querySelector<HTMLButtonElement>(`[aria-controls="${CSS.escape(entry.id)}"]`);
            trigger?.setAttribute('aria-expanded', 'true');
            if (!trigger) return;
            if (entry.classList.contains('submenu-dropdown')) this.positionSubmenu(trigger, entry);
        });
    }

    private closeAllMenus(): void {
        this.root.querySelectorAll<HTMLElement>('.menus .file-menu-dropdown').forEach((dropdown) => {
            dropdown.hidden = true;
        });
        this.root.querySelectorAll<HTMLButtonElement>('.menus > .menu-wrap > button[aria-haspopup="menu"], .menus .submenu-trigger').forEach((button) => {
            button.setAttribute('aria-expanded', 'false');
        });
    }

    private closeMenu(binding: MenuBinding, restoreFocus = false): void {
        binding.dropdown.hidden = true;
        binding.trigger.setAttribute('aria-expanded', 'false');
        if (restoreFocus) binding.trigger.focus();
    }

    private bindOutsidePointer(): void {
        document.addEventListener('pointerdown', (event) => {
            if (!(event.target instanceof Node)) return;
            const menus = this.root.querySelector('.menus');
            if (!menus?.contains(event.target)) this.closeAllMenus();
        });
    }

    private closeWhenLegacyMenuOpens(): void {
        const managedIds = new Set(this.bindings.map(({ trigger }) => trigger.id));
        this.root.querySelectorAll<HTMLButtonElement>('.menus > .menu-wrap > button[aria-haspopup="menu"]').forEach((trigger) => {
            if (managedIds.has(trigger.id)) return;
            trigger.addEventListener('click', () => this.closeAllManagedMenus());
        });
    }

    private closeAllManagedMenus(): void {
        this.bindings.forEach((binding) => this.closeMenu(binding));
        this.root.querySelectorAll<HTMLElement>('.menus > .submenu-dropdown').forEach((dropdown) => {
            dropdown.hidden = true;
            const trigger = this.root.querySelector<HTMLButtonElement>(`[aria-controls="${CSS.escape(dropdown.id)}"]`);
            trigger?.setAttribute('aria-expanded', 'false');
        });
    }

    private getControlledDropdown(trigger: HTMLButtonElement): HTMLElement | null {
        const id = trigger.getAttribute('aria-controls');
        return id ? this.root.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
    }

    private requireElement<T extends HTMLElement>(selector: string): T {
        const element = this.root.querySelector<T>(selector);
        if (!element) throw new Error(`Falta el elemento de menú ${selector}.`);
        return element;
    }
}
