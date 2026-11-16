import { createReadStream, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { type Plugin, defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Serve the production security headers (CSP etc.) from vercel.json in `vite preview`
// too, so CSP violations show up locally before deploying. vercel.json is the single
// source of truth.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const securityHeaders = Object.fromEntries(
  vercel.headers.flatMap(h => h.headers).filter(h => h.key !== 'Strict-Transport-Security').map(h => [h.key, h.value]),
);
// HSTS and upgrade-insecure-requests would break plain-http localhost.
securityHeaders['Content-Security-Policy'] = securityHeaders['Content-Security-Policy']!.replace(
  /;\s*upgrade-insecure-requests/,
  '',
);

// SharedArrayBuffer (which the Stockfish engine's threads need) is only available to
// cross-origin-isolated pages. Production gets these two headers from vercel.json.
const isolation = {
  'Cross-Origin-Opener-Policy': securityHeaders['Cross-Origin-Opener-Policy']!,
  'Cross-Origin-Embedder-Policy': securityHeaders['Cross-Origin-Embedder-Policy']!,
};

/**
 * The Fairy-Stockfish engine is an Emscripten build: a loader script that fetches
 * its .wasm and its thread worker from the folder it was loaded from. It can't go
 * through the bundler, so its files are served as they are under /fsf/, straight
 * from the npm package (with its license and authors files, as the GPL asks).
 */
const ENGINE_FILES: Record<string, string> = {
  'stockfish.js': 'text/javascript',
  'stockfish.worker.js': 'text/javascript',
  'stockfish.wasm': 'application/wasm',
  'Copying.txt': 'text/plain; charset=utf-8',
  AUTHORS: 'text/plain; charset=utf-8',
};
const engineFiles = (): Plugin => {
  const dir = dirname(createRequire(import.meta.url).resolve('fairy-stockfish-nnue.wasm/stockfish.js'));
  return {
    name: 'bugshop-engine-files',
    configureServer(server) {
      server.middlewares.use('/fsf', (req, res, next) => {
        const name = (req.url ?? '').split('?')[0]!.slice(1);
        const type = Object.hasOwn(ENGINE_FILES, name) ? ENGINE_FILES[name] : undefined;
        if (!type) return next();
        res.setHeader('Content-Type', type);
        for (const [k, v] of Object.entries(isolation)) res.setHeader(k, v);
        createReadStream(join(dir, name)).pipe(res);
      });
    },
    generateBundle() {
      for (const name of Object.keys(ENGINE_FILES)) {
        this.emitFile({ type: 'asset', fileName: `fsf/${name}`, source: readFileSync(join(dir, name)) });
      }
    },
  };
};

export default defineConfig(({ mode }) => {
  // Allow the configured game server (http(s) for matchmaking, ws(s) for play) in preview.
  const server = new URL(loadEnv(mode, process.cwd(), 'VITE_').VITE_SERVER_URL ?? 'http://localhost:2567');
  const wsOrigin = `${server.protocol === 'https:' ? 'wss:' : 'ws:'}//${server.host}`;
  const headers = {
    ...securityHeaders,
    'Content-Security-Policy': securityHeaders['Content-Security-Policy']!.replace(
      "connect-src 'self'",
      `connect-src 'self' ${server.origin} ${wsOrigin}`,
    ),
  };

  return {
    plugins: [react(), engineFiles()],
    server: { headers: isolation },
    preview: { headers },
    build: {
      // Never inline assets as data: URIs, so they load as plain files from 'self'.
      assetsInlineLimit: 0,
    },
  };
});
