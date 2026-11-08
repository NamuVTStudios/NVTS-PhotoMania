export type MenuItemState = 'enabled' | 'comingSoon' | 'excluded';
export interface MenuSeparatorDefinition {
    type: 'separator';
    id: string;
}
export interface MenuItemDefinition {
    type: 'item';
    id: string;
    label: string;
    state: MenuItemState;
    enabled?: boolean;
    checked?: boolean;
    icon?: string;
    shortcut?: string;
    shortcutAlias?: string;
    menuAction?: string;
    filterKind?: string;
    requiresDocument?: boolean;
    urlKey?: string;
    submenu?: readonly MenuNodeDefinition[];
}
export type MenuNodeDefinition = MenuSeparatorDefinition | MenuItemDefinition;
export interface MenuDefinition {
    id: 'edit' | 'image' | 'select' | 'help';
    label: string;
    icon: string;
    searchable?: boolean;
    items: readonly MenuNodeDefinition[];
}
export const MENU_DEFINITIONS: Readonly<Record<'edit' | 'image' | 'select' | 'help', MenuDefinition>>;
export const EXCLUDED_MENU_ITEMS: ReadonlyArray<{ id: string; label: string; menu: string; reason: string }>;
