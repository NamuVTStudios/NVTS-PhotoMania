// Run the web workspace's Vite CLI without invoking pnpm from a pnpm lifecycle script.
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_ROOT = join(REPO_ROOT, 'apps', 'web');
const VITE_ENTRY = join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const ALLOWED_COMMANDS = new Set(['dev', 'build', 'preview']);

function readArguments() {
  const [command, ...args] = process.argv.slice(2);
  if (!ALLOWED_COMMANDS.has(command)) {
    console.error('[NVTS] Usage: node tools/run-vite.mjs <dev|build|preview> [Vite arguments]');
    return null;
  }
  return [command, ...args];
}

function runVite(args) {
  if (!existsSync(VITE_ENTRY)) {
    console.error('[NVTS] Vite is not installed. Run pnpm install from the repository root.');
    return 1;
  }
  const result = spawnSync(process.execPath, [VITE_ENTRY, ...args], {
    cwd: WEB_ROOT,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) console.error(`[NVTS] Could not launch Vite: ${result.error.message}`);
  if (isUserInterrupt(result)) return 0;
  return result.status ?? 1;
}

function isUserInterrupt(result) {
  return result.signal === 'SIGINT'
    || result.status === 130
    || result.status === -1073741510;
}

const args = readArguments();
process.exitCode = args ? runVite(args) : 1;
