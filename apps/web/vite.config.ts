import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
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

export default defineConfig({
  plugins: [react()],
  preview: { headers: securityHeaders },
  build: {
    // Never inline assets as data: URIs, so they load as plain files from 'self'.
    assetsInlineLimit: 0,
  },
});
