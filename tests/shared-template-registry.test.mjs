import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createViteTestServer } from './helpers/vite-test-server.mjs';

let vite;
let templates;
let Template;

before(async () => {
    vite = await createViteTestServer();
    ({ TEMPLATES: templates, Template } = await vite.ssrLoadModule('/packages/templates/src/index.ts'));
});

after(async () => {
    await vite?.close();
});

test('PhotoMania composes all assigned Shared Core presets with its own comic and manga presets', () => {
    assert.equal(templates.length, 36);
    assert.ok(templates.every((template) => template instanceof Template));
    assert.ok(templates.some((template) => template.id === 'instagram-post'));
    assert.ok(templates.some((template) => template.id === 'tankobon'));
    assert.ok(templates.some((template) => template.id === 'texture-uv-4k'));
    assert.ok(templates.some((template) => template.id === 'storyboard-horizontal'));
    assert.equal(templates.filter((template) => ['comic-us', 'comic-eu', 'manga', 'manhwa'].includes(template.id)).length, 4);
});
