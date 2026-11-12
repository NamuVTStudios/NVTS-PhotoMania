import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));

test('PMD file identity exposes its custom image in web entry points', async () => {
  const shell = await readFile(path.join(root, 'packages/ui/src/components/ShellTemplates.ts'), 'utf8');
  const recent = await readFile(path.join(root, 'packages/ui/src/panels/RecentProjectsPanel.ts'), 'utf8');
  const css = await readFile(path.join(root, 'apps/web/src/styles.css'), 'utf8');

  assert.match(shell, /NVTS_PHOTO_FILE_ICON_URL/);
  assert.match(shell, /branding\/file-types\/nvtsphoto-pmd\.png/);
  assert.match(shell, /PMD · \.nvtsphoto/);
  assert.match(recent, /NVTS_PHOTO_FILE_ICON_URL/);
  assert.match(recent, /recent-file-type-icon/);
  assert.match(css, /\.recent-file-type-icon/);
  assert.doesNotMatch(css, /\.recent-paper\s*\{/);
});

test('Windows registers the native extension with the PMD file icon', async () => {
  const config = await readJson('apps/windows/src-tauri/tauri.conf.json');
  const association = config.bundle.fileAssociations?.find((item) => item.ext?.includes('nvtsphoto'));
  const hook = await readFile(path.join(root, 'apps/windows/src-tauri/filetype-icon.nsh'), 'utf8');
  const wix = await readFile(path.join(root, 'apps/windows/src-tauri/filetype-icon.wxs'), 'utf8');

  assert.ok(association);
  assert.equal(association.name, 'NVTS-PhotoMania.nvtsphoto');
  assert.equal(association.mimeType, 'application/x-nvtsphoto');
  assert.equal(association.exportedType.identifier, 'com.namuvt.nvts.photomania.project');
  assert.equal(config.bundle.resources['../../web/public/branding/file-types/nvtsphoto-pmd.ico'], 'nvtsphoto-pmd.ico');
  assert.equal(config.bundle.windows.nsis.installerHooks, 'filetype-icon.nsh');
  assert.ok(config.bundle.windows.wix.componentRefs.includes('NVTSPhotoTypeIconRegistry'));
  assert.match(hook, /NVTS-PhotoMania\.nvtsphoto\\DefaultIcon/);
  assert.match(hook, /nvtsphoto-pmd\.ico/);
  assert.match(wix, /NVTS-PhotoMania\.nvtsphoto\\DefaultIcon/);
  assert.match(wix, /nvtsphoto-pmd\.ico/);
});

test('Linux packages install MIME metadata and the PMD icon theme sizes', async () => {
  const config = await readJson('apps/linux/src-tauri/tauri.conf.json');
  const association = config.bundle.fileAssociations?.find((item) => item.ext?.includes('nvtsphoto'));
  const packages = ['deb', 'rpm', 'appimage'];
  const expected = [
    '/usr/share/mime/packages/nvtsphoto.xml',
    '/usr/share/icons/hicolor/128x128/mimetypes/application-x-nvtsphoto.png',
    '/usr/share/icons/hicolor/256x256/mimetypes/application-x-nvtsphoto.png',
    '/usr/share/icons/hicolor/512x512/mimetypes/application-x-nvtsphoto.png',
  ];

  assert.equal(association?.mimeType, 'application/x-nvtsphoto');
  for (const packageName of packages) {
    const files = config.bundle.linux[packageName].files;
    for (const destination of expected) assert.ok(files[destination], `${packageName} missing ${destination}`);
  }
  const mime = await readFile(path.join(root, 'apps/web/public/branding/file-types/nvtsphoto-mime.xml'), 'utf8');
  assert.match(mime, /application\/x-nvtsphoto/);
  assert.match(mime, /\*\.nvtsphoto/);
});

 
test('opening an associated .nvtsphoto passes the selected project into PhotoMania startup', async () => {
  const main = await readFile(path.join(root, 'apps/web/src/main.ts'), 'utf8');
  const app = await readFile(path.join(root, 'packages/ui/src/App.ts'), 'utf8');
  const manager = await readFile(path.join(root, 'packages/ui/src/managers/AppManager.ts'), 'utf8');
  const home = await readFile(path.join(root, 'packages/ui/src/screens/HomeScreenController.ts'), 'utf8');

  assert.match(main, /take_startup_project/);
  assert.match(main, /new File\(\[buffer\], payload\.name/);
  assert.match(app, /initialFile/);
  assert.match(manager, /if \(initialFile\) await this\.homeScreen\.openStartupFile\(initialFile\)/);
  assert.match(home, /async openStartupFile\(file: File\)/);

  for (const platform of ['windows', 'linux']) {
    const rust = await readFile(path.join(root, `apps/${platform}/src-tauri/src/main.rs`), 'utf8');
    const config = await readJson(`apps/${platform}/src-tauri/tauri.conf.json`);
    assert.match(rust, /take_startup_project/);
    assert.match(rust, /eq_ignore_ascii_case\("nvtsphoto"\)/);
    assert.equal(config.app.withGlobalTauri, true);
  }
});

test('PMD raster and Windows icon assets have valid headers', async () => {
  const png = await readFile(path.join(root, 'apps/web/public/branding/file-types/nvtsphoto-pmd.png'));
  const ico = await readFile(path.join(root, 'apps/web/public/branding/file-types/nvtsphoto-pmd.ico'));
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  assert.deepEqual(png.subarray(0, 8), pngSignature);
  assert.equal(png.readUInt32BE(16), 1024);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.ok(ico.readUInt16LE(4) >= 6);
});
