# Deploying Bugshop

Two pieces: the **web app** (static, on Vercel) and the **game server** (Docker on a VPS, behind Caddy for HTTPS).
Example domains below: `bugshop.example.com` for the web app and `api.bugshop.example.com` for the server.

## 1. Game server (VPS)

1. Create a small VPS (e.g. Hetzner CX22) with Docker installed. Point a DNS `A`/`AAAA` record for
   `api.bugshop.example.com` at it.
2. Firewall: allow only SSH (22), HTTP (80) and HTTPS (443, TCP+UDP). Use SSH keys, not passwords.
3. On the server:
   ```sh
   git clone <your repo> bugshop && cd bugshop/deploy
   cp .env.example .env    # set API_DOMAIN and ALLOWED_ORIGINS
   docker compose up -d --build
   ```
   Caddy fetches the TLS certificate automatically on first start.
4. Updating: `git pull && docker compose up -d --build`.

The server container is never exposed directly (no `ports:`). Only Caddy is. That matters because the
server trusts the client-IP header that Caddy sets, and uses it for rate limiting.

## 2. Web app (Vercel)

1. Import the repo in Vercel and set **Root Directory** to `apps/web`. Vercel detects Vite and pnpm.
2. Environment variable: `VITE_SERVER_URL=https://api.bugshop.example.com`.
3. In `apps/web/vercel.json`, replace `api.bugshop.example` in `connect-src` with your API domain (both the
   `https://` and `wss://` entries). Otherwise the CSP blocks the connection to your server.
4. Make sure the deployed site's origin is listed in the server's `ALLOWED_ORIGINS`.

## Checklist
- [ ] `ALLOWED_ORIGINS` = exact web origin(s), e.g. `https://bugshop.example.com` (no trailing slash, no `*`)
- [ ] CSP `connect-src` in `vercel.json` names your API domain
- [ ] `VITE_SERVER_URL` set in Vercel
- [ ] VPS firewall allows only 22/80/443
