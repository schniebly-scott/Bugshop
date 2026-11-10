# Bugshop

Chess variant with a shop: the time your opponent uses becomes coins for you. You buy pieces with coins and drop them bughouse-style, and clocks count up. The full design is in `docs/ARCHITECTURE.md`, which is the source of truth for rules and architecture. Keep it updated when either changes.

## Layout
pnpm monorepo (`pnpm-workspace.yaml`):
- `packages/rules`: shared, pure TypeScript rules engine (built on chessops). There is no I/O; every function takes `now` explicitly. Client and server must both use it, so never re-implement rules elsewhere.
- `apps/web`: React + Vite SPA (chessground board). Hotseat and bot modes run fully client-side.
- `apps/server` (planned): Node + Colyseus, the authoritative game server.

## Commands
- `pnpm test`: all tests (Vitest)
- `pnpm typecheck`: tsc across packages
- `pnpm --filter @bugshop/web dev` / `build`

## Security (this is a public open-source project, so treat security as a first-class requirement)
**Trust model**
- The server is authoritative. Every client action must be re-validated server-side through `@bugshop/rules`. Never trust client-sent clocks, coins, FEN, game results or player color.
- Timestamps come from the server clock only (`now` is passed by the server, not the client).
- Treat every network message, URL param, localStorage value and file as untrusted. Validate its shape (and size) before use.

**Frontend**
- Never use `dangerouslySetInnerHTML`, `eval`, `new Function`, or string-built HTML/URLs from user input. Player names and chat are rendered as text only.
- Keep the strict CSP and security headers in `apps/web/vercel.json`. If you add an external origin (API, websocket, fonts), add it to `connect-src`/etc. explicitly, never `*` or `unsafe-eval`.
- The only inline-style allowance is one `'unsafe-hashes'` hash in `style-src`, for chessground's `style="color-scheme:light only"` on its SVG layers (`wrap.js`). If a chessground upgrade changes that string, update the hash; never fall back to `'unsafe-inline'`. `vite preview` serves the same headers (read from `vercel.json`), so check the browser console there for CSP violations.
- chessground writes `drawable` custom SVG shapes and shape labels via `innerHTML`. Never pass user-controlled content into them.
- No secrets in the frontend. Anything in `VITE_*` env vars is public.

**Backend (when built)**
- Rate-limit connections and messages, cap message sizes, and time out idle rooms.
- Random, unguessable IDs for private rooms (crypto RNG, not `Math.random`).
- Secrets only from env vars; never commit `.env` files (they are gitignored).
- Use parameterized queries only (Drizzle). Run the process as a non-root user in the container.

**Dependencies / supply chain**
- Prefer few, well-maintained dependencies. Justify each new one.
- Pin exact versions (no `^`/`~`) and commit `pnpm-lock.yaml`. CI uses `--frozen-lockfile`.
- `minimumReleaseAge` in `pnpm-workspace.yaml` blocks versions younger than 14 days. Don't bypass it.
- pnpm blocks install scripts by default. Only allow-list a package's build script after reviewing it.
- GitHub Actions: least-privilege `permissions`, third-party actions pinned by commit SHA.

**Process**
- Never commit secrets, tokens or personal data. Check the diff before committing.
- Vulnerability reports go through `SECURITY.md` (private reporting), not public issues.

## Conventions
- TypeScript strict mode. The rules engine stays pure and immutable (functions return new state).
- Licensed GPL-3.0-or-later (required by chessops/chessground).
