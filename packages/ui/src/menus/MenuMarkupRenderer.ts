import type { MenuDefinition, MenuItemDefinition, MenuNodeDefinition } from './MenuDefinitions.mjs';

export type MenuIconRenderer = (name: string) => string;

function escapeAttribute(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderShortcut(shortcut?: string, alias?: string): string {
    if (!shortcut) return '';
    const aliasMarkup = alias ? `<span class="menu-shortcut-alias"> / ${escapeAttribute(alias)}</span>` : '';
    return `<kbd>${escapeAttribute(shortcut)}</kbd>${aliasMarkup}`;
}

function renderItem(item: MenuItemDefinition, iconRenderer: MenuIconRenderer): string {
    if (item.state === 'excluded') return '';
    if (item.type !== 'item') return '';
    const comingSoon = item.state === 'comingSoon';
    const disabled = item.state !== 'enabled' || item.enabled === false;
    const role = item.checked === undefined ? 'menuitem' : 'menuitemcheckbox';
    const checkedAttribute = item.checked === undefined ? '' : ` aria-checked="${String(item.checked)}"`;
    const checkedMarkup = item.checked ? '<span class="menu-check">✓</span>' : '';
    const declaredDisabledAttribute = item.enabled === false ? ' data-declared-disabled="true"' : '';
    const elementId = item.id === 'preferences' ? 'b-preferences' : item.id === 'undo' ? 'edit-undo' : item.id === 'redo' ? 'edit-redo' : `menu-item-${item.id}`;
    const disabledAttribute = disabled
        ? ` disabled aria-disabled="true"${comingSoon ? ' data-coming-soon="true"' : ''}${declaredDisabledAttribute}`
        : '';
    const documentAttribute = item.requiresDocument ? ' data-requires-document="true"' : '';
    const actionAttribute = item.menuAction ? ` data-menu-action="${escapeAttribute(item.menuAction)}"` : '';
    const filterAttribute = item.filterKind ? ` data-filter-kind="${escapeAttribute(item.filterKind)}"` : '';
    const urlAttribute = item.url ? ` data-menu-url="${escapeAttribute(item.url)}"` : '';
    const icon = item.icon ? iconRenderer(item.icon) : '';
    const content = `<span class="menu-item-label">${icon}<span>${escapeAttribute(item.label)}</span></span>`;
    const state = comingSoon ? '<span class="menu-coming-soon">Próximamente</span>' : '';
    const shortcut = renderShortcut(item.shortcut, item.shortcutAlias);

    if (item.submenu) {
        const submenuId = `${item.id}-submenu`;
        return `<div class="menu-subwrap">
            <button id="menu-item-${escapeAttribute(item.id)}" class="menu-item submenu-trigger" role="${role}" type="button"${checkedAttribute} aria-haspopup="menu" aria-expanded="false" aria-controls="${submenuId}" data-menu-item-id="${escapeAttribute(item.id)}"${disabledAttribute}${documentAttribute}>${content}<span class="submenu-arrow">›</span>${checkedMarkup}</button>
            <div id="${submenuId}" class="file-menu-dropdown submenu-dropdown" role="menu" aria-label="${escapeAttribute(item.label)}" hidden>${renderNodes(item.submenu, iconRenderer)}</div>
        </div>`;
    }

    return `<button id="${escapeAttribute(elementId)}" class="menu-item${disabled ? ' is-coming-soon' : ''}" role="${role}" type="button" data-menu-item-id="${escapeAttribute(item.id)}"${checkedAttribute}${disabledAttribute}${documentAttribute}${actionAttribute}${filterAttribute}${urlAttribute}>${content}${shortcut}${checkedMarkup}${state}</button>`;
}

function renderNodes(nodes: readonly MenuNodeDefinition[], iconRenderer: MenuIconRenderer): string {
    return nodes.map((node) => {
        if (node.type === 'separator') return '<div class="menu-divider" role="separator"></div>';
        return renderItem(node, iconRenderer);
    }).join('');
}

function renderSearchBox(): string {
    return `<div class="menu-search-shell" role="none">
        <label class="menu-search-label" for="help-menu-search">Buscar en los menús</label>
        <input id="help-menu-search" type="search" role="searchbox" autocomplete="off" placeholder="Buscar en los menús…" aria-controls="help-menu-search-results" aria-label="Buscar en todos los menús" />
        <div id="help-menu-search-results" class="menu-search-results" role="listbox" aria-label="Resultados de búsqueda" hidden></div>
        <p class="menu-search-hint">Escribí para encontrar y ejecutar un comando.</p>
    </div>
    <div class="menu-divider" role="separator"></div>`;
}

export function renderDeclaredMenu(definition: MenuDefinition, iconRenderer: MenuIconRenderer): string {
    const triggerId = `menu-${definition.id}`;
    const dropdownId = `${definition.id}-menu-dropdown`;
    const search = definition.searchable ? renderSearchBox() : '';
    return `<div class="menu-wrap declared-menu-wrap">
        <button id="${triggerId}" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="${dropdownId}">${iconRenderer(definition.icon)}<span>${escapeAttribute(definition.label)}</span></button>
        <div id="${dropdownId}" class="file-menu-dropdown declared-menu-dropdown" role="menu" aria-label="${escapeAttribute(definition.label)}" hidden>${search}${renderNodes(definition.items, iconRenderer)}</div>
    </div>`;
}
