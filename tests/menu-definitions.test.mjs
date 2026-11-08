import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENU_DEFINITIONS, EXCLUDED_MENU_ITEMS } from '../packages/ui/src/menus/MenuDefinitions.mjs';

function flatten(items) {
  return items.flatMap((item) => item.type === 'separator'
    ? []
    : [item, ...(item.submenu ? flatten(item.submenu) : [])]);
}

const menus = Object.values(MENU_DEFINITIONS);
const items = menus.flatMap((menu) => flatten(menu.items));

 test('declared menu item identifiers are unique across Edit, Image, Select and Help', () => {
  const ids = items.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('all menu items have an explicit, supported state', () => {
  for (const item of items) {
    assert.ok(['enabled', 'comingSoon', 'excluded'].includes(item.state), `${item.id} needs a state`);
    assert.equal(typeof item.label, 'string');
    assert.ok(item.label.length > 0);
  }
});

test('coming-soon items do not carry executable actions or filter operations', () => {
  for (const item of items.filter((entry) => entry.state === 'comingSoon')) {
    assert.equal(item.menuAction, undefined, `${item.id} must stay disabled`);
    assert.equal(item.filterKind, undefined, `${item.id} must not execute a filter`);
  }
});

test('enabled edit actions are limited to the approved existing capabilities', () => {
  const edit = flatten(MENU_DEFINITIONS.edit.items);
  assert.equal(edit.find((item) => item.id === 'undo')?.menuAction, 'undo');
  assert.equal(edit.find((item) => item.id === 'redo')?.menuAction, 'redo');
  assert.equal(edit.find((item) => item.id === 'redo')?.shortcut, 'Ctrl+Shift+Z');
  assert.equal(edit.find((item) => item.id === 'redo')?.shortcutAlias, 'Ctrl+Y');
  const preferences = edit.find((item) => item.id === 'preferences');
  assert.ok(preferences, 'the existing Preferences command remains present');
  assert.equal(preferences.menuAction, undefined, 'Preferences keeps its original direct button binding to avoid recursive clicks');
  assert.equal(edit.find((item) => item.id === 'purge-undo-history')?.menuAction, 'clear-history');
  assert.equal(edit.find((item) => item.id === 'free-transform')?.menuAction, 'transform-layer');
});


test('menu item schema supports dynamic enabled and checked states', () => {
  const source = readFileSync(new URL('../packages/ui/src/menus/MenuDefinitions.d.mts', import.meta.url), 'utf8');
  assert.match(source, /enabled\?: boolean/);
  assert.match(source, /checked\?: boolean/);
});


test('existing layer transform shortcut remains routed to the existing transform action', () => {
  const source = readFileSync(new URL('../packages/ui/src/app/AppEventFeatures.ts', import.meta.url), 'utf8');
  assert.match(source, /key === 't' && event\.shiftKey && !event\.altKey && !this\.isTypingTarget/);
  assert.match(source, /runLayerMenuAction\('transform'\)/);
});

test('global menu search includes the existing Filter command', () => {
  const source = readFileSync(new URL('../packages/ui/src/menus/MenuInteractionController.ts', import.meta.url), 'utf8');
  assert.match(source, /\.menus > #menu-filter/);
});

test('image adjustments reuse only existing FilterPanel filter kinds', () => {
  const image = flatten(MENU_DEFINITIONS.image.items);
  const kinds = new Set(['brightness', 'saturation', 'grayscale', 'invert', 'posterize', 'threshold']);
  const filterActions = image.filter((item) => item.menuAction === 'open-filter-panel');
  assert.ok(filterActions.length > 0);
  for (const item of filterActions) assert.ok(kinds.has(item.filterKind), `${item.id} uses a supported filter kind`);
});

test('selection exposes only the existing deselection action', () => {
  const select = flatten(MENU_DEFINITIONS.select.items);
  const actions = select.filter((item) => item.state === 'enabled');
  assert.deepEqual(actions.map((item) => item.id), ['deselect']);
  assert.equal(actions[0].menuAction, 'deselect');
});

test('Help includes a global menu search and keeps external destinations disabled until configured', () => {
  assert.equal(MENU_DEFINITIONS.help.searchable, true);
  const help = flatten(MENU_DEFINITIONS.help.items);
  for (const id of ['help-discord', 'help-website', 'help-github']) {
    assert.equal(help.find((item) => item.id === id)?.state, 'comingSoon');
  }
});

test('specialized commands are registered as excluded and never enabled', () => {
  const byId = new Map(items.map((item) => [item.id, item]));
  assert.ok(EXCLUDED_MENU_ITEMS.some((item) => item.id === 'proofread'));
  assert.ok(EXCLUDED_MENU_ITEMS.some((item) => item.id === 'variables'));

  for (const excluded of EXCLUDED_MENU_ITEMS) {
    const item = byId.get(excluded.id);
    if (item) assert.equal(item.state, 'excluded', `${excluded.id} must not be exposed as an active command`);
  }
});
