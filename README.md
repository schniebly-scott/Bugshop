# BugShop

A forest/bug-themed chess variant. The pieces and checkmate work as in normal chess, but clocks count **up**, and the time your opponent uses turns into coins for you. You spend coins in the shop and drop the pieces you buy onto the board, bughouse style.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture and roadmap.

## Development

Requires Node 24+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm --filter @bugshop/server dev   # game server on http://localhost:2567
pnpm --filter @bugshop/web dev      # web app at http://localhost:5173 (hotseat works without the server)
pnpm test                           # all unit tests
pnpm typecheck
pnpm --filter @bugshop/web build && pnpm --filter @bugshop/web preview   # production build with production security headers
```

## Deployment

The web app deploys to Vercel and the game server to a small VPS with Docker Compose + Caddy. See [deploy/README.md](deploy/README.md).

## Security

See [SECURITY.md](SECURITY.md) to report vulnerabilities privately.
