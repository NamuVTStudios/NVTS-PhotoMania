import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRECTORIES = new Set(['.git', 'node_modules', 'dist', 'coverage', 'wasm']);
const CONTROL_KINDS = new Set([
  'IfStatement', 'ForStatement', 'ForOfStatement', 'ForInStatement',
  'WhileStatement', 'DoStatement', 'SwitchStatement', 'TryStatement',
]);
const GENERATED_FILES = new Set([
  path.join('packages', 'shared', 'src', 'index.js'),
  path.join('packages', 'shared', 'src', 'nvtsphoto.js'),
  path.join('packages', 'wasm-bindings', 'build', 'engine.js'),
]);

function isSourceFile(filePath) {
  const relativePath = path.relative(ROOT, filePath);
  const isCode = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
  return isCode && !filePath.endsWith('.d.ts') && !GENERATED_FILES.has(relativePath);
}

function collectEntry(directoryPath, entry) {
  if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) return [];
  const fullPath = path.join(directoryPath, entry.name);
  if (entry.isDirectory()) return collectDirectory(fullPath);
  if (!isSourceFile(fullPath)) return [];
  return [fullPath];
}

function collectDirectory(directoryPath) {
  return readdirSync(directoryPath, { withFileTypes: true })
    .flatMap((entry) => collectEntry(directoryPath, entry));
}

function isFunctionBoundary(node) {
  return ts.isFunctionDeclaration(node)
    || ts.isMethodDeclaration(node)
    || ts.isConstructorDeclaration(node)
    || ts.isGetAccessor(node)
    || ts.isSetAccessor(node)
    || ts.isFunctionExpression(node)
    || ts.isArrowFunction(node);
}

function visitNode(node, inheritedControls, sourceFile, findings) {
  const ancestors = isFunctionBoundary(node) ? [] : inheritedControls;
  const kind = ts.SyntaxKind[node.kind];
  if (CONTROL_KINDS.has(kind) && ancestors.length > 0) {
    const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({
      file: path.relative(ROOT, sourceFile.fileName),
      line: location.line + 1,
      kind,
      parent: ancestors.map((entry) => entry.kind).join(' > '),
    });
  }
  const nextControls = CONTROL_KINDS.has(kind) ? [...ancestors, { kind }] : ancestors;
  node.forEachChild((child) => visitNode(child, nextControls, sourceFile, findings));
}

function inspectFile(filePath, findings) {
  const content = readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  visitNode(sourceFile, [], sourceFile, findings);
}

function printFinding(finding) {
  console.error(`${finding.file}:${finding.line} — ${finding.kind} anidado dentro de ${finding.parent}`);
}

const sourceFiles = collectDirectory(ROOT);
const findings = [];
sourceFiles.forEach((filePath) => inspectFile(filePath, findings));

if (findings.length > 0) {
  findings.forEach(printFinding);
  console.error(`Auditoría fallida: ${findings.length} estructura(s) anidada(s) en ${sourceFiles.length} archivo(s).`);
  process.exitCode = 1;
} else {
  console.log(`Auditoría correcta: 0 estructuras de control anidadas en ${sourceFiles.length} archivos de código fuente.`);
  console.log('Exclusiones explícitas: dependencias y salidas de build, más packages/shared/src/index.js, packages/shared/src/nvtsphoto.js y packages/wasm-bindings/build/engine.js (archivos generados).');
}
