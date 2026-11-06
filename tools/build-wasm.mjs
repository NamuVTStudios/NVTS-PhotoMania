// Cross-platform WebAssembly build for NVTS-PhotoMania.
// Automatically activates the default emsdk installation on Windows.
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE_ROOT = join(REPO_ROOT, 'packages', 'engine');
const OUTPUT_DIR = join(REPO_ROOT, 'packages', 'wasm-bindings', 'build');
const OUTPUT_JS = join(OUTPUT_DIR, 'engine.js');
const COPY_SCRIPT = join(REPO_ROOT, 'tools', 'copy-wasm.mjs');
const SOURCES = [
  join(ENGINE_ROOT, 'src', 'engine.cpp'),
  join(ENGINE_ROOT, 'src', 'tiled_layer.cpp'),
  join(ENGINE_ROOT, 'src', 'compositor.cpp'),
  join(ENGINE_ROOT, 'src', 'history.cpp'),
];
const EMCC_ARGUMENTS = [
  ...SOURCES,
  '-O3',
  '-std=c++17',
  '--bind',
  '-fexceptions',
  '-s', 'WASM=1',
  '-s', 'DEFAULT_TO_CXX=1',
  '-s', 'ALLOW_MEMORY_GROWTH=1',
  '-s', 'EXPORTED_RUNTIME_METHODS=HEAPU8',
  '-s', 'EXIT_RUNTIME=0',
  '-s', 'ENVIRONMENT=web,worker,node',
  '-s', 'MODULARIZE=1',
  '-s', 'EXPORT_ES6=1',
  '-s', 'EXPORT_NAME=createNvtsEngine',
  '-o', OUTPUT_JS,
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  if (result.error) console.error(result.error.message);
  return result.status ?? 1;
}

function windowsEmsdkRoot() {
  const roots = [
    process.env.NVTS_EMSDK_ROOT,
    join(homedir(), 'emsdk'),
    process.env.EMSDK,
  ].filter(Boolean);
  return roots.find((root) => existsSync(join(root, 'emsdk_env.bat')));
}

function quoteCmd(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function findWindowsCompiler(emsdkRoot) {
  const compilerDirectory = join(emsdkRoot, 'upstream', 'emscripten');
  const candidates = ['emcc.exe', 'emcc.bat', 'emcc.cmd'];
  return candidates
    .map((candidate) => join(compilerDirectory, candidate))
    .find((candidate) => existsSync(candidate));
}

function windowsCompilerCommand(compilerPath) {
  const quotedPath = quoteCmd(compilerPath);
  const isBatchFile = /\.(bat|cmd)$/i.test(compilerPath);
  return isBatchFile ? `call ${quotedPath}` : quotedPath;
}

function createWindowsBuildScript(emsdkRoot, compilerPath, scriptPath) {
  const compileCommand = `${windowsCompilerCommand(compilerPath)} ${EMCC_ARGUMENTS.map(quoteCmd).join(' ')}`;
  const copyCommand = `call ${quoteCmd(process.execPath)} ${quoteCmd(COPY_SCRIPT)}`;
  const lines = [
    '@echo off',
    'setlocal',
    'rem Clear Git Bash variables so emsdk_env.bat configures native Windows paths.',
    'set "MSYSTEM="',
    'set "MINGW_PREFIX="',
    'set "MINGW_CHOST="',
    'set "MSYS="',
    'set "MSYS2_PATH_TYPE="',
    'set "MSYS_NO_PATHCONV="',
    'set "CYGWIN="',
    'set "SHELL="',
    'set "BASH_ENV="',
    'echo [NVTS] Activating the native Windows Emscripten environment.',
    `call ${quoteCmd(join(emsdkRoot, 'emsdk_env.bat'))}`, 
    'if errorlevel 1 goto :emsdk_error',
    `cd /d ${quoteCmd(REPO_ROOT)}`,
    compileCommand,
    'if errorlevel 1 goto :compile_error',
    copyCommand,
    'if errorlevel 1 goto :copy_error',
    'echo [NVTS] WebAssembly build completed successfully.',
    'exit /b 0',
    ':emsdk_error',
    'echo [NVTS] Could not activate Emscripten. Check the emsdk installation.',
    'exit /b 1',
    ':compile_error',
    'echo [NVTS] Emscripten compilation failed.',
    'exit /b 1',
    ':copy_error',
    'echo [NVTS] Could not copy engine.wasm to the web app.',
    'exit /b 1',
    '',
  ];
  writeFileSync(scriptPath, lines.join('\r\n'), 'utf8');
}

function buildWindows() {
  const emsdkRoot = windowsEmsdkRoot();
  if (!emsdkRoot) {
    console.error('[NVTS] Emscripten was not found. Set NVTS_EMSDK_ROOT or install it at %USERPROFILE%\\emsdk.');
    return 1;
  }
  const compilerPath = findWindowsCompiler(emsdkRoot);
  if (!compilerPath) {
    const compilerDirectory = join(emsdkRoot, 'upstream', 'emscripten');
    console.error(`[NVTS] Could not find emcc.exe, emcc.bat, or emcc.cmd in: ${compilerDirectory}`);
    console.error('[NVTS] Verify that the Emscripten SDK is fully installed and activated.');
    return 1;
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const scriptPath = join(REPO_ROOT, 'tools', `.build-wasm-${process.pid}.cmd`);
  createWindowsBuildScript(emsdkRoot, compilerPath, scriptPath);
  try {
    return run('cmd.exe', ['/d', '/c', join('tools', `.build-wasm-${process.pid}.cmd`)]);
  } finally {
    removeTemporaryBuildScript(scriptPath);
  }
}

function removeTemporaryBuildScript(scriptPath) {
  try { unlinkSync(scriptPath); } catch { /* the temporary file may already be removed */ }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function buildPosixWithEmcc() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const compileStatus = run('emcc', EMCC_ARGUMENTS);
  if (compileStatus !== 0) return compileStatus;
  return run(process.execPath, [COPY_SCRIPT]);
}

function buildPosixWithEmsdkShell() {
  const emsdkRoot = process.env.EMSDK || join(homedir(), 'emsdk');
  const envScript = join(emsdkRoot, 'emsdk_env.sh');
  if (!existsSync(envScript)) {
    console.error('[NVTS] Emscripten was not found. Activate emsdk or set the EMSDK environment variable.');
    return 1;
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const compile = `emcc ${EMCC_ARGUMENTS.map(shellQuote).join(' ')}`;
  const copy = `${shellQuote(process.execPath)} ${shellQuote(COPY_SCRIPT)}`;
  const command = `source ${shellQuote(envScript)} >/dev/null && ${compile} && ${copy}`;
  return run('bash', ['-lc', command]);
}

function isEmccAvailable() {
  const result = spawnSync('emcc', ['--version'], { stdio: 'ignore', windowsHide: true });
  return !result.error && result.status === 0;
}

function buildPosix() {
  if (isEmccAvailable()) return buildPosixWithEmcc();
  return buildPosixWithEmsdkShell();
}

function isWindowsShellEnvironment() {
  return process.platform === 'win32' || Boolean(process.env.MSYSTEM) || Boolean(process.env.MINGW_PREFIX);
}

function main() {
  if (isWindowsShellEnvironment()) return buildWindows();
  return buildPosix();
}

process.exitCode = main();
