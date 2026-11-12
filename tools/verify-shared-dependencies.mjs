import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const photoManiaRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ecosystemRoot = resolve(photoManiaRoot, '..');

const requiredPackages = [
    {
        directory: resolve(ecosystemRoot, 'NVTS-Shared-Core'),
        packageName: '@nvts/shared-core',
    },
    {
        directory: resolve(ecosystemRoot, 'NVTS-Shared-Core/packages/app-object'),
        packageName: '@nvts/app-object',
    },
    {
        directory: resolve(ecosystemRoot, 'NVTS-Shared-UI'),
        packageName: '@nvts/shared-ui',
    },
];

function readJson(filePath) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
}

function assertPackageManifest(directory, expectedName) {
    const manifestPath = resolve(directory, 'package.json');
    if (!existsSync(manifestPath)) {
        throw new Error(`Missing package manifest: ${manifestPath}`);
    }

    const manifest = readJson(manifestPath);
    if (manifest.name !== expectedName) {
        throw new Error(`Expected ${expectedName} at ${directory}, found ${manifest.name ?? '(unnamed)'}`);
    }

    return manifest;
}

function assertExportTarget(target, packageDirectory, exportName) {
    const normalizedTarget = target.replaceAll('*', '');
    const targetPath = resolve(packageDirectory, normalizedTarget);
    if (!existsSync(targetPath)) {
        throw new Error(`Missing export target for ${exportName}: ${targetPath}`);
    }
}

function assertExports(exportsMap, packageDirectory, packageName) {
    function visit(value, exportName) {
        if (typeof value === 'string') {
            if (value.startsWith('./')) assertExportTarget(value, packageDirectory, `${packageName}${exportName}`);
            return;
        }
        if (!value || typeof value !== 'object') return;
        for (const [condition, entry] of Object.entries(value)) {
            visit(entry, exportName);
        }
    }

    for (const [exportName, entry] of Object.entries(exportsMap ?? {})) {
        visit(entry, exportName);
    }
}

function assertLinkedDependencies() {
    const manifestPaths = [
        resolve(photoManiaRoot, 'package.json'),
        resolve(photoManiaRoot, 'apps/web/package.json'),
        resolve(photoManiaRoot, 'packages/ui/package.json'),
        resolve(photoManiaRoot, 'packages/templates/package.json'),
    ];

    for (const manifestPath of manifestPaths) {
        const manifest = readJson(manifestPath);
        const groups = ['dependencies', 'devDependencies', 'optionalDependencies'];
        for (const group of groups) {
            for (const [dependencyName, specifier] of Object.entries(manifest[group] ?? {})) {
                if (!specifier.startsWith('link:')) continue;
                const targetDirectory = resolve(dirname(manifestPath), specifier.slice('link:'.length));
                const targetManifest = resolve(targetDirectory, 'package.json');
                if (!existsSync(targetManifest)) {
                    throw new Error(`${manifest.name}: ${dependencyName} points to missing package ${targetDirectory}`);
                }
                const targetPackage = readJson(targetManifest);
                if (targetPackage.name !== dependencyName) {
                    throw new Error(`${manifest.name}: ${dependencyName} links to ${targetPackage.name ?? '(unnamed)'} at ${targetDirectory}`);
                }
            }
        }
    }
}

function verifySharedPackageExports() {
    for (const { directory, packageName } of requiredPackages) {
        const manifest = assertPackageManifest(directory, packageName);
        assertExports(manifest.exports, directory, packageName);
    }
}

function verifyViteBasePath() {
    const viteConfig = readFileSync(resolve(photoManiaRoot, 'apps/web/vite.config.ts'), 'utf8');
    if (!viteConfig.includes("base: '/NVTS-PhotoMania/'")) {
        throw new Error('PhotoMania Vite base path must remain /NVTS-PhotoMania/ for its GitHub Pages project site.');
    }
}

function main() {
    assertLinkedDependencies();
    verifySharedPackageExports();
    verifyViteBasePath();
    console.log('[NVTS] Shared Core, Shared UI, AppObject links and export entrypoints are ready for the PhotoMania Pages build.');
}

main();
