# Bugshop

Chess variant with a shop: the time your opponent uses becomes coins for you. You buy pieces with coins and drop them bughouse-style, and clocks count up. The full design is in `docs/ARCHITECTURE.md`, which is the source of truth for rules and architecture. Keep it updated when either changes.

## Layout
pnpm monorepo (`pnpm-workspace.yaml`):
- `packages/rules`: shared, pure TypeScript rules engine (built on chessops). There is no I/O; every function takes `now` explicitly. Client and server must both use it, so never re-implement rules elsewhere.
- `apps/web`: React + Vite SPA (chessground board). Hotseat and bot modes run fully client-side.
- `packages/protocol`: client/server message names and payload types (types and constants only).
- `apps/server`: Node + Colyseus 0.18, the authoritative game server. Node 24 runs the `.ts` sources directly (type stripping), so code must stay "erasable" (no enums, namespaces or constructor parameter properties; `erasableSyntaxOnly` enforces this) and relative imports use `.ts` extensions.
- `deploy/`: Docker Compose + Caddy for the VPS.

## Commands
- `pnpm test`: all tests (Vitest)
- `pnpm typecheck`: tsc across packages
- `pnpm --filter @bugshop/server dev`: game server on :2567
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

**Backend**
- Every client message gets a strict zod schema (`apps/server/src/schemas.ts`, `z.strictObject`, bounded strings) registered with Colyseus `validate()`. An invalid message disconnects the client. Never add a handler without a schema.
- Game time comes only from `serverNow()` (`src/serverClock.ts`). Its test offset must stay test-only.
- Existing limits (keep or tighten them): 4 KB message cap, `maxMessagesPerSecond`, per-IP matchmaking limit in static `onAuth`, `MAX_ROOMS`, and room lifetime timers.
- Private room IDs are the invite secret: 16 random characters (`generateId(16)`, crypto RNG). Don't shorten them, and never log them alongside anything that identifies a user.
- CORS and the WebSocket origin check allow only `ALLOWED_ORIGINS`. Colyseus' defaults allow any origin, and `app.ts` overrides them, so keep that override.
- Colyseus takes the client IP from `X-Real-IP`/`X-Forwarded-For` without checking. That's only safe because Caddy overwrites those headers and the server port is never published (`deploy/docker-compose.yml`). Keep it that way.
- Secrets only from env vars, never commit `.env` files (gitignored). The container runs as non-root on a read-only filesystem with all capabilities dropped.
- When a database is added: parameterized queries only (Drizzle).

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
