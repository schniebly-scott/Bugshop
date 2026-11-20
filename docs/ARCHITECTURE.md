# Bugshop Architecture

_Planning doc, 2026-11-09_


## Context
Bugshop is a chess variant: normal pieces, captures and checkmate, plus a **shop**. The **time your opponent spends converts into coins for you** (default 1 coin per minute, configurable). You spend coins on pieces that go into your **pocket**, and you **drop** them onto the board the way you do in bughouse/crazyhouse. Clocks **count up**.

The repo is empty (only `README.md`). Launch scope: public matchmaking, private invite links, local hotseat and vs-bot. Players sign in to play (see "Accounts and ratings"). Goals: reuse existing libraries as much as possible and keep hosting cheap.

## Key insight
In engine terms, Bugshop is **Crazyhouse in which captured pieces do not go to the pocket, and the pocket is filled by buying instead**. Mature open-source tools already handle drops, so the only custom logic is the shop, the coins and the count-up clock.

## Recommended architecture

```
                 ┌────────────── Vercel (free) ───────────────┐
 Browser ───────▶│ React + Vite SPA (static)                  │
   │             │  • chessground board + pocket/shop UI      │
   │             │  • hotseat + vs-bot run 100% client-side   │
   │             │  • bot = TS search, or Fairy-Stockfish WASM│
   │             └────────────────────────────────────────────┘
   │ wss://api.bugshop.xxx
   ▼
 ┌──────── VPS (Hetzner CX22, ~€4–5/mo) ────────┐
 │ Caddy (auto-TLS, reverse proxy)              │
 │ Node + TypeScript + Colyseus                 │
 │  • lobby list + private rooms (by ID)        │
 │  • server-authoritative moves, clock, coins  │
 │  • reconnection handling                     │
 │ SQLite (node:sqlite): accounts, ratings      │
 └──────────────────────────────────────────────┘
```

### UI theme: forest / bugs
- Palette: moss and leaf greens, bark browns, amber highlights. The board squares look like light and dark moss, or lichen on bark.
- Pieces: start with a standard chessground piece set recolored to fit the theme. A custom bug-themed SVG set can come later (e.g. king = queen ant, knight = grasshopper, rook = beetle, bishop = mantis, pawn = ant larva). Chessground takes custom piece SVGs through CSS.
- Coins are drawn as seeds. The shop is the "Stump Market", a paper scroll (`ShopScroll.tsx`); the pocket is a canvas backpack whose front pocket holds the five piece slots (`Backpack.tsx`); player bars and the header are wooden planks.
- Behind every page, `Backdrop.tsx` draws a forest clearing in inline SVG: sky, leafy branches in the top corners, two rows of pines and a tent with a campfire (stars and fireflies at night).
- `EdgeBugs.tsx` animates a few small bugs (caterpillars, beetles, ladybugs, ants) crawling around the edge of the window on a single canvas. They are procedural (no assets), ignore pointer events, and stand still under `prefers-reduced-motion`. The track math lives in `src/bugs/path.ts`.
- `theme.css` holds all colors as CSS variables, with a light (day forest) and dark (night forest) variant. Each surface has its own ink (`--text` on the sky, `--ink` on paper, `--wood-ink` on wood); paper and wood look the same in both themes, so text on them never changes color.
- On phones, small tablets and short windows (`max-width: 899px` or `max-height: 560px`) the play loop fits on one screen without scrolling: clocks, board, then the backpack and market flattened into two strips. Draw, resign and page controls sit below. The same markup is restyled in CSS, so there is no separate mobile component tree. Portrait stacks everything; landscape puts the strips beside the board.
- Keep visible text short and concrete. Say what a number means ("1 seed per 60s"), and put secondary detail in `title`/`aria-label` rather than on screen.

### Accounts and ratings
Nobody plays without an account: not online, and not pass-and-play either.

- **Sign-in** is handled by [Better Auth](https://better-auth.com) inside the game server, mounted at `/api/auth/*` on Colyseus' own HTTP router (no Express). Methods: email + password (address confirmed by a mailed link, passwords reset the same way), Google, and Apple. The Google and Apple buttons only exist when their credentials are configured.
- **Session**: an httpOnly, SameSite=Lax cookie on the API domain. The web app never sees a token; it sends the cookie with `credentials: 'include'`. This is why the API must be a subdomain of the web app's domain.
- **Player name**: after the first sign-in an account picks a public name (3-16 characters, unique ignoring case, fixed once chosen). Opponents, the lobby list and the public leaderboard see that name and the rating, never the email or the Google/Apple profile name.
- **Enforcement** is on the server: every matchmaking request (`create`, `joinById`, `reconnect`) goes through `BugshopRoom.onAuth`, which reads the session cookie and refuses guests (401) and accounts without a name (403). One account can hold only one seat in a game, and a held seat can only be resumed by the account that took it. The lobby list stays readable by guests. In the web app, `AccountGate` shows the sign-in card instead of the game; for pass-and-play that UI gate is the whole enforcement, since that mode never touches the server.
- **Elo**: everyone starts at 1200. When an online game ends, both ratings are updated once, in one transaction (`PlayerStore.recordGame`), with K = 40 for a player's first 20 rated games and 24 after that; ratings never go below 100. Public and private games are both rated. A game that ends before each side has made a move is not rated. The snapshot carries `players` (name, rating) and, after a rated game, `ratings` (before/after per color).
- **Leaderboard**: `GET /api/leaderboard` (public, no session) returns the top 50 players with at least one rated game, highest rating first: rank (equal ratings share a rank), name, rating and games played. `PlayerStore.leaderboard()` caches the result and drops the cache on every rated game and account deletion, so it's always current. The web app shows it at `/leaderboard`, highlighting the signed-in player's row.
- **Storage**: one SQLite file through Node's built-in `node:sqlite` (no native module to build). Better Auth owns `user`, `session`, `account`, `verification`; Bugshop adds `player` (name, rating, record) and `game_result` (who, result, rating changes). Room IDs are not stored. All SQL is prepared statements with bound parameters.
- **Mail** goes through Resend's HTTP API (`mail.ts`). Without a key, development prints the mail to the server log and skips address confirmation; production refuses to start.

### Pass and play (hotseat)
- Both players share one screen; the game runs entirely in the browser (`useHotseatGame`).
- **Pause:** a Pause button next to Resign. The game runs on its own clock (`game/pauseClock.ts`: real time minus time spent paused), which it passes to `applyAction` and the clock display. While paused that clock stands still, so neither clock runs and no seeds accrue. The board is covered, because thinking time is what earns the opponent seeds, and every action is refused until the game resumes.
- **Facing play:** with "Turn the board to face whoever is moving" off, the players are assumed to sit across the table. The backpack, the Stump Market and the promotion picker then turn 180° to face their owner whenever that player sits at the far side of the board.

### Playing a bot
`/bot` is a practice game against the computer. It runs entirely in the browser (no server CPU), is not rated, and needs a signed-in account like every other way to play.

- **Two engines.** The four lower levels use our own search; the two top levels use Fairy-Stockfish.
  - **Built-in** (`apps/web/src/bot/engine.ts`): iterative-deepening alpha-beta over `BugshopPosition`, the same class the rules engine uses, so the bot and the rules can't disagree about legality. Quiescence search on captures, a check extension (drops make checks dangerous), and a small material + piece-square evaluation. It runs in a Web Worker (`worker.ts`) with an inline fallback, needs no dependency, and works in every browser.
  - **Fairy-Stockfish** (`stockfish.ts`, npm `fairy-stockfish-nnue.wasm`, GPL-3.0): the WebAssembly build, served unmodified from our own origin under `/fsf/` by a small Vite plugin, together with its license and authors files. It is downloaded only when one of its levels is picked (about 0.5 MB gzipped). Bugshop is defined as a custom variant, `[bugshop:crazyhouse]` with `capturesToHand = false`, written to the engine's in-memory file system and selected with `VariantPath` / `UCI_Variant`. There is no neural network for the variant, so it uses the classical evaluation. Stockfish knows nothing about seeds: each turn the real position is searched, plus one what-if search per affordable piece (that piece added to the pocket, `searchmoves` limited to dropping it), and a purchase is made only if its drop beats the best ordinary move by more than the seeds are worth. Moves coming back from the engine are checked against a strict pattern and then go through `applyAction` like anyone's.
  - **What Stockfish needs from the page:** shared memory for its threads, which browsers only give to cross-origin-isolated pages. So the site sends `Cross-Origin-Embedder-Policy: require-corp` next to the existing `Cross-Origin-Opener-Policy: same-origin`, and the CSP allows `'wasm-unsafe-eval'` in `script-src` (WebAssembly compilation only; `eval` stays blocked). With `require-corp`, anything loaded from another origin must opt in with CORS or CORP; today the only cross-origin traffic is the API (`fetch` with CORS, and WebSockets, which are unaffected). Browsers without WebAssembly threads or SIMD see the two levels greyed out, and if the engine fails mid-game the built-in search takes over.
- **The shop**: each turn the bot may buy one piece and drop it at once. Unspent seeds count as a little under a pawn each in the evaluation, so a purchase has to be a good move, not just an affordable one. If the only way out of check is to buy a blocker, it finds it.
- **Fair play**: the bot never sees the human's pocket or purchases. The opponent's pocket is emptied before searching, exactly as `redactFor()` does for an online opponent. Its own pocket stays hidden from the human until the game ends.
- **Levels** (`levels.ts`), weakest first: Larva (1 ply, large random error, sometimes plays any legal move), Beetle (2 plies, no quiescence, so it misses replies), Mantis (3 plies plus quiescence), Hornet (deepens for 1.5 s, typically 4-5 plies), Scorpion (Stockfish limited to about 2000 Elo with `UCI_Elo`, 0.7 s a move), Tarantula (Stockfish at full strength, 1.5 s a move). Weaker levels also look at the shop less often.
- **Tempo** (`pace.ts`): the bot's thinking time is the human's income, so an instant bot would leave the human with no seeds. It plays at about the human's own average pace (1.2 s to 20 s per move), 1.4x slower on Larva down to 0.5x on Tarantula. A faster bot hands you fewer seeds, which is part of the difficulty.
- **Squish and draws**: Mantis and stronger buy Squish only against a player who has been away from the board for 90 s and much longer than their usual move, which is what Squish is for. A draw offer is accepted only when the bot is clearly worse.

### Analytics and donations
- The web app reports page views with Vercel Web Analytics (`@vercel/analytics`): cookieless, same-origin, and only in production builds. Game pages are reported as `/g/[room]`, because a private room ID is the invite secret.
- The home page shows a donation sign ("Keep the campfire burning") when `VITE_DONATE_URL` is set to an https link. There are no accounts or payments in the app itself; the link just opens the donation page in a new tab.

### Maintainer dashboard and site banner
- The maintainer's dashboard (sign-ups, games, ratings, server health, banner editor) lives in a **separate private repo**, because dashboards collect queries, exports and server details that must not land in this public repo's history. It runs on the VPS with **no public port** (bound to 127.0.0.1, reached through an SSH tunnel) and reads the database read-only. There is no admin API on the game server.
- **Site banner:** the dashboard writes `announcement.json` (`{ message, level: 'info' | 'warning', updatedAt, expiresAt? }`) into the `bugshop_announce` volume. The game server mounts that volume read-only (`ANNOUNCEMENT_PATH`), checks the file's modification time at most every 10 s, validates it strictly (`apps/server/src/announcement.ts`: at most 4 KB, message 1-280 characters with no control or bidi characters, unknown fields rejected), and serves it at the public `GET /api/announcement`. Anything invalid, expired or missing means no banner. The web app (`AnnouncementBanner`) shows it as plain text under the header, re-checks every 5 minutes, and remembers a dismissal per message (by `updatedAt`) in localStorage.

### One repo, not two
Use a **single monorepo**. The client and server must run the *exact same* rules code (`packages/rules`). In two repos you would have to publish and version that package and keep both sides in sync, which is a common source of desync bugs. Deploying from one repo is still easy: set the Vercel project's Root Directory to `apps/web`, and have GitHub Actions deploy `apps/server` to the VPS only when `apps/server/**` or `packages/**` change.

### Monorepo layout (pnpm workspaces)
- `packages/rules`: **shared TS rules engine**, used by both client and server
  - Wraps **chessops** (`Crazyhouse` position: drops and pockets already implemented). After each capture, remove the captured piece from the capturer's pocket.
  - Adds `BugshopState = { position, coins, clocks, prices, config }` and the actions `move | drop | buy | squish | resign | offerDraw`.
  - Clock and coin math are pure functions: `coins[me] = floor(opponentElapsedMs / msPerCoin) - spent[me]`.
  - Variant settings live in a config object (coin rate, prices, drop restrictions) so rule changes need no refactor.
- `apps/web`: React + Vite + TypeScript
  - Board: **chessground** (lichess board, already supports drag-to-drop from a pocket). Use **@lichess-org/chessground** styles for pieces.
  - State: React state plus `useSyncExternalStore` for the online session (no state library needed). Networking: `@colyseus/sdk`.
  - Routes (tiny History-API router in `src/router.ts`): `/` (home), `/hotseat`, `/bot` (practice against the computer), `/g/:roomId` (online game; also the invite link).
  - Bot: see "Playing a bot" below.
- `packages/protocol`: message names and payload types shared by client and server (types and constants only).
- `apps/server`: Node + **Colyseus** 0.18 (MIT). Node 24 runs the TypeScript directly, with no build step. It provides rooms, the live room listing behind the lobby list, private rooms (`create` → share ID), messaging and reconnection, so none of that is hand-written.
  - `BugshopRoom` validates every action through `packages/rules`. Clients never send clock values.
  - The clock stores `turnStartedAt` timestamps. Clients interpolate locally for display, and the server is the authority.
  - SQLite stores accounts, ratings and each finished rated game's result. Planned: the move list plus buy events, for replays.

### Hosting and cost
| Piece | Choice | Cost |
|---|---|---|
| Frontend | Vercel Hobby (or Cloudflare Pages, which allows commercial use) | $0 |
| Backend | Hetzner CX22 (2 vCPU/4 GB), Docker Compose: Caddy + Node | ~€4–5/mo |
| DB | SQLite file on the VPS, nightly backup to Cloudflare R2/Backblaze free tier | $0 |
| Domain | `.com`/`.xyz` | ~$2–12/yr |
| **Total** | | **~$5/mo** |

Vercel Hobby is non-commercial only. If you ever add donations or ads, switch to Cloudflare Pages.

### Licensing heads-up
chessops, chessground and Fairy-Stockfish are all **GPL-3.0**. That works if Bugshop is open source, which suits a personal project. If you want closed source, use `chess.js` + `react-chessboard` (MIT/BSD) instead and write the drop logic yourself, which takes more work.

## Build order
0. ~~Write this plan to `docs/ARCHITECTURE.md`~~ (done)
1. ~~`packages/rules` with Vitest tests~~ (done) (drops incl. no pawns on 1st/8th rank, no captures-to-pocket, coin accrual, buying off-turn, Squish, mate/stalemate).
2. ~~`apps/web` hotseat mode: board, pocket, shop panel and count-up clocks, fully offline.~~ (done)
3. ~~`apps/server` Colyseus room plus private invite links and public lobbies.~~ (done, see "Online play")
4. Deploy: Vercel for web, Docker Compose + Caddy on the VPS (files ready in `deploy/`, see `deploy/README.md`). Auto-deploy after CI via GitHub Actions with a forced-command SSH key (done).
5. Done: vs-bot (four levels on our own TypeScript search, two on Fairy-Stockfish WASM).
6. Done: accounts (Better Auth), Elo ratings and a leaderboard. Later: game replays, rating history.

## Online play (as built)
**Protocol** (`packages/protocol`): one Colyseus room per game (`bugshop`), with plain JSON messages instead of Colyseus Schema state.
- Client → server *requests*: `action` (a rules `Action`; the reply is `true` or a rejection reason) and `time` (server clock, used for offset estimation).
- Server → client: `welcome` (your color) and `snapshot` (`{ game, seats, mode, serverNow }`, sent after every change). The lobby list room also sends `lobbies` and `online`.
- **Online count:** the `lobbies` room sends `online` (`{ online, playing }`) on join and whenever it changes (checked at most once a second, plus every 10 s). `online` counts **people**, not connections: a signed-in person counts once however many tabs or games they have open (the lobby list reads the session cookie only to recognise them; the ID never leaves the server), and a visitor who isn't signed in counts once per tab. Game rooms count their connected players only while the game is waiting or under way; a finished game counts for nobody, even while its players look at the result. `playing` is the people seated in a game under way. Bot and pass-and-play games run offline in the browser, so they aren't counted. It's numbers only, never who. The count comes from the rooms in this process (`BugshopRoom.presence()`, `LobbyListRoom.countOnline()`), so it assumes one server process, as deployed.

**Flow**
- **Private:** `create({mode:'private', ...settings})` gives a 16-character random room ID, which is the invite link `/g/:roomId`. A friend joins with `joinById`. Private rooms are never listed.
- **Public lobbies:** `create({mode:'public', ...settings})` opens a lobby. Its settings are published as room metadata, and the `lobbies` room (`LobbyListRoom`) pushes the list of open, not-full public games to everyone on the home page. Players pick one and join with `joinById`. Only the creator may send options, so `joinOrCreate` can't land a player in a random lobby. A lobby disappears when it fills, or when its creator leaves or disconnects before anyone joins.
- **Hidden pockets:** each player gets their own snapshot (`apps/server/src/redact.ts`). The opponent's pocket, purchases, spending and repetition keys are removed until the game ends. A drop reveals the piece, as on the board. The client never declares a game result itself, because it can't see the opponent's pocket (they might be able to drop a blocker); the server decides.
- **Colors and start:** colors are assigned randomly. The game starts when both seats are taken, and the room locks so nobody else can join.
- **Moves on the client:** the client checks each action locally with the same rules and shows it immediately. The server's snapshot then confirms it, or a rejection rolls it back.
- **Pre-moves and pre-drops** (online and vs bot, not hotseat): during the opponent's turn a player can queue one move, or one drop from their backpack (drag it, or tap the piece and then a square). The queue lives in chessground on the client only. The server has no idea of it, so the protocol and trust model are unchanged. When the turn comes back, the move is played at once if it is still legal (chessground re-checks it against the new legal dests; a pre-drop also needs the piece still in the pocket and a legal square), and then goes through `applyAction` and the server like any move. Otherwise it is discarded. A queued promotion becomes a queen. The clock runs as usual: a pre-move costs the time between the opponent's move reaching the client and the move reaching the server.

**Disconnects**
- **A join that never connects:** opening, joining or resuming a room gives up after 15 s (the server's seat reservation time) with an error, instead of waiting forever. A browser can leave a WebSocket pending without any error, for example queued behind another socket to the same host that is stuck connecting. If the join completes after that, the client leaves the room at once so it doesn't hold the seat.
- **Dropped connection** (network loss, tab reload): the seat is held for 10 minutes and the player reconnects with a per-tab token in sessionStorage.
- **Choosing to leave mid-game** counts as resigning.
- **A player who never returns** keeps their seat as "away". Their clock keeps running, so the opponent earns coins and can buy Squish. No special forfeit rule is needed.
- **Room cleanup:** rooms close 1 h after creation if the game never started, 10 min after the game ends, and after 24 h at the latest.

**Server hardening**
- **Validation:** every message is validated with strict zod schemas. A malformed message or unknown message type disconnects the client.
- **Limits:** client messages are capped at 4 KB, more than 10 messages per second disconnects the client, matchmaking (create, join, lobby list) is rate-limited per IP, and the total number of rooms is capped.
- **Origins:** browsers from any origin outside `ALLOWED_ORIGINS` are refused, both for CORS and for the WebSocket upgrade.

## Game rules (decided)
| Rule | Decision |
|---|---|
| Coins | You earn coins from the time your **opponent** uses: 1 coin per 60 s by default. **Chosen per game** from presets: 10, 25, 30, 45 or 60 s. |
| Clock start | As on lichess, **no clock runs until the first move**: white's first move takes no time, and black's clock starts when it is played. Until then nobody earns coins, so nothing can be bought before the game begins. The same for every mode (online, bot, pass-and-play), because it lives in the rules engine (`newClock()` in `clock.ts`). The bot's pace-matching ignores that free first move. |
| Prices | Standard piece values: pawn 1, knight 3, bishop 3, rook 5, queen 9. |
| Buying | Can be done **at any time, even on your opponent's turn**, and does **not** use your turn. The piece goes into your pocket. |
| Dropping | Placing a piece from your pocket **uses your turn**. Drops follow bughouse rules: pawns can't be dropped on the 1st or 8th rank. Drops can give check and checkmate. |
| Game end | Checkmate, resignation, **stalemate (draw)**, **threefold repetition (draw)**, the **fifty-move rule (draw)**, agreed draw, or the **"Squish"** shop item. |
| Draw rules | Both are automatic, as on lichess. A repeated position must match the pockets too, so buying a piece breaks a repetition. For the 50-move rule, captures, pawn moves and **pawn drops** reset the count; other drops don't (crazyhouse convention). Checkmate takes priority. |
| Squish | A shop item for an absent or stalling opponent. A player with enough coins buys it and wins immediately. Because coins come from the opponent's elapsed time, an absent opponent eventually makes this affordable. Price is **chosen per game** from presets: 10, 20 or 30 coins (default 30). Shown with a shoe icon: you squish them. |

How this affects the implementation:
- `buy` is a separate action from `move`/`drop`. The server accepts it from either player at any time and never flips the turn.
- Coin balance = `floor(opponentElapsedMs / msPerCoin) - spent`. Buying is validated against the balance the server has computed at the moment the request arrives.
- `squish` is a shop action that ends the game. The server checks the balance and records the result as "won by Squish".
- **Mate and stalemate take the shop into account.** Buying doesn't use a turn, so a player is only checkmated or stalemated if they have no legal move or drop *and* can't afford a piece whose drop would get them out. For example, a player in check from a distant queen with 1 coin can buy a pawn and drop it to block.
- The total of pieces on the board plus pieces in pockets is capped at 64, a technical limit from chessops. Buying past it returns `pocket-full`.
- The Fairy-Stockfish variant config uses crazyhouse drop rules (no pawn drops on the 1st/8th rank) with `capturesToHand = false`.

### Per-game settings
`GameSettings = { secondsPerCoin, squishPrice }` in `packages/protocol`. Allowed values are the fixed lists in `SETTINGS_OPTIONS`, which the server enforces exactly. A small set keeps the lobby list easy to scan.
- **Who chooses:** the creator picks them on the home page. The browser remembers them, and hotseat uses them too.
- **Lobbies:** each open lobby is listed with its settings, so players choose the game they want.

## Still open
- Should Squish's price scale with game length?
- Lobby list extras: filter by settings or rating range.

## Verification
- `pnpm -r test`: rules unit tests (including a scripted full game with purchases).
- Run server + web locally, open two browser windows and play via a private link. Confirm the coins match the opponent's elapsed time and the server rejects illegal drops or purchases.
- Kill one tab mid-game and confirm reconnection restores the state.
- Bot: play a game at `/bot` and confirm it makes legal drops (`apps/web/test/bot.test.ts` plays whole bot-vs-bot games through the rules engine).
