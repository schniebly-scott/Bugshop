# Bugshop

Chess variant with a shop: the time your opponent uses becomes coins for you. You buy pieces with coins and drop them bughouse-style, and clocks count up. The full design is in `docs/ARCHITECTURE.md`, which is the source of truth for rules and architecture. Keep it updated when either changes.

## Layout
pnpm monorepo (`pnpm-workspace.yaml`):
- `packages/rules`: shared, pure TypeScript rules engine (built on chessops). There is no I/O; every function takes `now` explicitly. Client and server must both use it, so never re-implement rules elsewhere.
- `apps/web`: React + Vite SPA (chessground board). Hotseat and bot modes run fully client-side; the bot (`src/bot/`) is a TypeScript search in a same-origin Web Worker, plus Fairy-Stockfish WASM (served from `/fsf/`) for the two top levels.
- `packages/protocol`: client/server message names and payload types (types and constants only).
- `apps/server`: Node + Colyseus 0.18, the authoritative game server. Also hosts accounts (Better Auth at `/api/auth/*`), Elo ratings and the SQLite database (`node:sqlite`). Node 24 runs the `.ts` sources directly (type stripping), so code must stay "erasable" (no enums, namespaces or constructor parameter properties; `erasableSyntaxOnly` enforces this) and relative imports use `.ts` extensions.
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
- `script-src` allows `'wasm-unsafe-eval'` for one reason: the Fairy-Stockfish engine. It permits WebAssembly compilation only; JavaScript `eval` stays blocked. Don't widen it.
- The site is cross-origin isolated (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`) because the engine's threads need `SharedArrayBuffer`. Under `require-corp`, a resource from another origin (image, script, font, iframe) is blocked unless it is served with CORS or CORP. Keep assets same-origin; if you must add a cross-origin one, check it still loads in `vite preview`.
- The engine files under `/fsf/` come unmodified from the pinned npm package (`vite.config.ts`), with its license files. Its moves are untrusted text: `stockfish.ts` checks their shape, and `applyAction` decides legality.
- The only inline-style allowance is one `'unsafe-hashes'` hash in `style-src`, for chessground's `style="color-scheme:light only"` on its SVG layers (`wrap.js`). If a chessground upgrade changes that string, update the hash; never fall back to `'unsafe-inline'`. `vite preview` serves the same headers (read from `vercel.json`), so check the browser console there for CSP violations.
- chessground writes `drawable` custom SVG shapes and shape labels via `innerHTML`. Never pass user-controlled content into them.
- Page analytics (`@vercel/analytics`, production builds only) are same-origin (`/_vercel/insights/*`), so the CSP needs no extra origin. Every event goes through `redactUrl()` (`apps/web/src/support.ts`) so private room IDs and the password-reset token never reach analytics. Keep that `beforeSend`, and don't add custom events that carry room IDs, names or game state.
- The donation link comes from `VITE_DONATE_URL` and is only used if `parseDonateUrl()` accepts it (https only).
- The session is an httpOnly cookie. Never put a session token, password or reset token in localStorage, sessionStorage, the URL (beyond the one-time reset link, which is stripped on load) or logs. `AccountGate` is only a convenience: real enforcement is on the server.
- Replies from the account API are parsed field by field (`account/api.ts`). Player names are text only and must match `HANDLE_PATTERN`.
- No secrets in the frontend. Anything in `VITE_*` env vars is public.

**Backend**
- **Accounts:** playing requires a signed-in account with a player name. `BugshopRoom.onAuth` enforces it for every matchmaking request from the session cookie, so never add a way into a game room that skips it. Opponents may learn a player's name and rating only: never send or log emails, user IDs or provider profile data to other players.
- Better Auth's origin and CSRF checks are forced on in every environment (`auth.ts`); keep `trustedOrigins` equal to `ALLOWED_ORIGINS`. Our own cookie-authenticated POST routes (`http.ts`) and matchmaking check the `Origin` too. Any new state-changing route must do the same.
- Production refuses to start without `AUTH_SECRET`, `PUBLIC_URL` and a mail provider (`env.ts`). Don't weaken that: without mail, anyone could register someone else's address.
- Ratings change only in `PlayerStore.recordGame`, once per game, from the server's own game state.
- Never log mail bodies, verification or reset links, session cookies, or passwords.
- Every client message gets a strict zod schema (`apps/server/src/schemas.ts`, `z.strictObject`, bounded strings) registered with Colyseus `validate()`. An invalid message disconnects the client. Never add a handler without a schema.
- Game time comes only from `serverNow()` (`src/serverClock.ts`). Its test offset must stay test-only.
- Existing limits (keep or tighten them): 4 KB message cap, `maxMessagesPerSecond`, per-IP matchmaking limit in static `onAuth` (shared by the lobby list room), `MAX_ROOMS`, and room lifetime timers.
- The bot plays by the same hidden-information rule: `chooseMove` empties the opponent's pocket before searching. Don't feed it the human's pocket, purchases or spending.
- **Hidden information:** a player's pocket, purchases and spending are secret from their opponent. Every snapshot goes through `redactFor()` (`apps/server/src/redact.ts`) per recipient; never `broadcast()` raw game state. Anything new that reveals pocket contents (logs, lobby metadata, error messages) is a leak.
- **Account deletion must be complete.** `/account` → Better Auth `delete-user` (password, or a sign-in under a day old) → `beforeDelete` → `PlayerStore.deleteAccountData()` (`apps/server/src/db.ts`). Any new table or file that stores data about a user must be cleaned up there too, and covered in `apps/server/test/account-deletion.test.ts`. The Privacy Policy promises this.
- The lobby list sends only `LobbyListing` fields (`roomId`, `settings`, `host` name and rating, `createdAt`), never raw Colyseus room records.
- The public leaderboard (`GET /api/leaderboard`, no session) sends only `LeaderboardEntry` fields (rank, name, rating, games played). It is cached in `PlayerStore` and the cache is cleared on every rated game and account deletion, so a deleted player disappears at once. The online count (`Msg.online`) is two numbers only, never who is connected. The lobby list room reads the session cookie only so a signed-in person counts once; the user ID stays in memory on the server and is never sent or logged.
- **Site banner / admin:** the maintainer dashboard is a separate private repo, reachable only through an SSH tunnel; never add an admin API or admin routes to this server. The banner reaches the server only as a file on the `bugshop_announce` volume, mounted read-only; `announcement.ts` validates it strictly, and the web app renders it as plain text only.
- Private room IDs are the invite secret: 16 random characters (`generateId(16)`, crypto RNG). Don't shorten them, and never log them alongside anything that identifies a user.
- CORS and the WebSocket origin check allow only `ALLOWED_ORIGINS`. Colyseus' defaults allow any origin, and `app.ts` overrides them, so keep that override.
- Colyseus takes the client IP from `X-Real-IP`/`X-Forwarded-For` without checking. That's only safe because Caddy overwrites those headers and the server port is never published (`deploy/docker-compose.yml`). Keep it that way.
- Secrets only from env vars, never commit `.env` files (gitignored). The container runs as non-root on a read-only filesystem with all capabilities dropped.
- SQL: prepared statements with bound parameters only (`db.ts`). Never build SQL from strings that contain user input. The database file lives on the `/data` volume, the container's only writable path.

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
