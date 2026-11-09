# Bugshop Architecture

_Planning doc, 2026-11-09_


## Context
Bugshop is a chess variant: normal pieces, captures and checkmate, plus a **shop**. The **time your opponent spends converts into coins for you** (default 1 coin per minute, configurable). You spend coins on pieces that go into your **pocket**, and you **drop** them onto the board the way you do in bughouse/crazyhouse. Clocks **count up**.

The repo is empty (only `README.md`). Launch scope: public matchmaking, private invite links, local hotseat and vs-bot, with anonymous play (no accounts yet). Goals: reuse existing libraries as much as possible and keep hosting cheap.

## Key insight
In engine terms, Bugshop is **Crazyhouse in which captured pieces do not go to the pocket, and the pocket is filled by buying instead**. Mature open-source tools already handle drops, so the only custom logic is the shop, the coins and the count-up clock.

## Recommended architecture

```
                 ┌────────────── Vercel (free) ───────────────┐
 Browser ───────▶│ React + Vite SPA (static)                  │
   │             │  • chessground board + pocket/shop UI      │
   │             │  • hotseat + vs-bot run 100% client-side   │
   │             │  • bot = Fairy-Stockfish WASM in a Worker  │
   │             └────────────────────────────────────────────┘
   │ wss://api.bugshop.xxx
   ▼
 ┌──────── VPS (Hetzner CX22, ~€4–5/mo) ────────┐
 │ Caddy (auto-TLS, reverse proxy)              │
 │ Node + TypeScript + Colyseus                 │
 │  • matchmaking queue + private rooms (by ID) │
 │  • server-authoritative moves, clock, coins  │
 │  • reconnection handling                     │
 │ SQLite (better-sqlite3 + Drizzle): game log  │
 └──────────────────────────────────────────────┘
```

### UI theme: forest / bugs
- Palette: moss and leaf greens, bark browns, amber highlights. The board squares look like light and dark moss, or lichen on bark.
- Pieces: start with a standard chessground piece set recolored to fit the theme. A custom bug-themed SVG set can come later (e.g. king = queen ant, knight = grasshopper, rook = beetle, bishop = mantis, pawn = ant larva). Chessground takes custom piece SVGs through CSS.
- The shop looks like a tree-stump "market" panel, and coins are drawn as seeds or leaves.
- Use CSS variables in a `theme.css` so a light (day forest) and dark (night forest) variant are easy.

### One repo, not two
Use a **single monorepo**. The client and server must run the *exact same* rules code (`packages/rules`). In two repos you would have to publish and version that package and keep both sides in sync, which is a common source of desync bugs. Deploying from one repo is still easy: set the Vercel project's Root Directory to `apps/web`, and have GitHub Actions deploy `apps/server` to the VPS only when `apps/server/**` or `packages/**` change.

### Monorepo layout (pnpm workspaces)
- `packages/rules`: **shared TS rules engine**, used by both client and server
  - Wraps **chessops** (`Crazyhouse` position: drops and pockets already implemented). After each capture, remove the captured piece from the capturer's pocket.
  - Adds `BugshopState = { position, coins, clocks, prices, config }` and the actions `move | drop | buy | claimVictory | resign | offerDraw`.
  - Clock and coin math are pure functions: `coins[me] = floor(opponentElapsedMs / msPerCoin) - spent[me]`.
  - Variant settings live in a config object (coin rate, prices, drop restrictions) so rule changes need no refactor.
- `apps/web`: React + Vite + TypeScript
  - Board: **chessground** (lichess board, already supports drag-to-drop from a pocket). Use **@lichess-org/chessground** styles for pieces.
  - State: Zustand. Networking: `colyseus.js` client.
  - Routes (React Router): `/`, `/play/hotseat`, `/play/bot`, `/game/:roomId` (private link), `/queue`.
  - Bot: **Fairy-Stockfish WASM** (`fairy-stockfish-nnue.wasm` / `ffish`) in a Web Worker. Define a custom variant in `variants.ini` (`pieceDrops = true`, `capturesToHand = false`) and pass the pocket in the FEN. The bot's shopping uses a simple heuristic in TS (e.g. buy the best piece it can afford when its eval drops). This costs **$0 in server CPU**.
- `apps/server`: Node + **Colyseus** (MIT). It provides rooms, matchmaking (`joinOrCreate`), private rooms (`create` → share ID), state sync and reconnection, so none of that is hand-written.
  - `BugshopRoom` validates every action through `packages/rules`. Clients never send clock values.
  - The clock stores `turnStartedAt` timestamps. Clients interpolate locally for display, and the server is the authority.
  - SQLite stores finished games (PGN-like move list plus buy events) for future replays and ratings.

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
1. `packages/rules` with Vitest tests (drops incl. no pawns on 1st/8th rank, no captures-to-pocket, coin accrual, buying off-turn, Claim Victory, mate/stalemate).
2. `apps/web` hotseat mode: board, pocket, shop panel and count-up clocks, fully offline.
3. `apps/server` Colyseus room plus private invite links, then the matchmaking queue.
4. Deploy: Vercel for web, Docker Compose + Caddy on the VPS, GitHub Actions to deploy both.
5. Vs-bot via Fairy-Stockfish WASM, plus the shop heuristic.
6. Later: accounts (Better Auth), Glicko-2 ratings (`glicko2` npm), game replays.

## Game rules (decided)
| Rule | Decision |
|---|---|
| Coins | You earn coins from the time your **opponent** uses: 1 coin per minute by default (configurable). |
| Prices | Standard piece values: pawn 1, knight 3, bishop 3, rook 5, queen 9. |
| Buying | Can be done **at any time, even on your opponent's turn**, and does **not** use your turn. The piece goes into your pocket. |
| Dropping | Placing a piece from your pocket **uses your turn**. Drops follow bughouse rules: pawns can't be dropped on the 1st or 8th rank. Drops can give check and checkmate. |
| Game end | Checkmate, resignation, **stalemate (draw)**, or the **"Claim Victory"** shop item. |
| Claim Victory | A shop item for an absent or stalling opponent. A player with enough coins buys it and wins immediately. Because coins come from the opponent's elapsed time, an absent opponent eventually makes this affordable. Price is configurable (suggested starting point: 30 coins, i.e. 30 minutes of opponent time). |

How this affects the implementation:
- `buy` is a separate action from `move`/`drop`. The server accepts it from either player at any time and never flips the turn.
- Coin balance = `floor(opponentElapsedMs / msPerCoin) - spent`. Buying is validated against the balance the server has computed at the moment the request arrives.
- `claimVictory` is a shop action that ends the game. The server checks the balance and records the result as "won by Claim Victory".
- The Fairy-Stockfish variant config uses crazyhouse drop rules (no pawn drops on the 1st/8th rank) with `capturesToHand = false`.

## Still open
- Threefold repetition and the 50-move rule: keep them as in chess, or drop them?
- Final Claim Victory price, and whether it should scale with game length.
- Should the bot know about Claim Victory, e.g. buy it if a human goes AFK?

## Verification
- `pnpm -r test`: rules unit tests (including a scripted full game with purchases).
- Run server + web locally, open two browser windows and play via a private link. Confirm the coins match the opponent's elapsed time and the server rejects illegal drops or purchases.
- Kill one tab mid-game and confirm reconnection restores the state.
- Bot: play a game in `/play/bot` and confirm it makes legal drops.
