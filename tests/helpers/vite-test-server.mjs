import { resolve } from 'node:path';
import { createServer } from 'vite';

/** Creates an isolated Vite SSR server shared by source-module tests. */
export function createViteTestServer() {
  return createServer({
    configFile: resolve('apps/web/vite.config.ts'),
    root: process.cwd(),
    logLevel: 'error',
    resolve: { extensions: ['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.json'] },
    server: { middlewareMode: true, hmr: false, port: 0 },
  });
}
