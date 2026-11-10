# BugShop

A forest/bug-themed chess variant. The pieces and checkmate work as in normal chess, but clocks count **up**, and the time your opponent uses turns into coins for you. You spend coins in the shop and drop the pieces you buy onto the board, bughouse style.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the architecture and roadmap.

## Development

Requires Node 24+ and pnpm (`corepack enable`).

```sh
pnpm install
pnpm --filter @bugshop/web dev      # hotseat app at http://localhost:5173
pnpm test                           # all unit tests
pnpm typecheck
pnpm --filter @bugshop/web build && pnpm --filter @bugshop/web preview   # production build with production security headers
```

## Security

See [SECURITY.md](SECURITY.md) to report vulnerabilities privately.
