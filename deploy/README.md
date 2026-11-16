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
4. Install the deploy script (root-owned, so the repo can't change it on its own):
   `install -o root -g root -m 755 /opt/bugshop/deploy/bugshop-deploy.sh /usr/local/bin/bugshop-deploy`.
   Manual update any time: `bugshop-deploy` (deploys the latest commit on `main`).

## Automatic deploys (GitHub Actions)

`.github/workflows/deploy.yml` deploys after **CI passes on a push to `main`**. It sends the exact commit that passed CI,
and can also be run by hand from the Actions tab.

How it's locked down:
- **A key that can only deploy.** The VPS has a dedicated deploy key in `root`'s `authorized_keys`:
  `restrict,command="/usr/local/bin/bugshop-deploy" ssh-ed25519 … github-actions-deploy@bugshop`.
  `restrict` blocks shells, port forwarding and agent forwarding, and `command=` forces the deploy script, whatever the client asks for.
- **Only commits on main.** The script deploys a full commit SHA only if it is on `origin/main`.
- **Only main can read the key.** It is stored as the `DEPLOY_SSH_KEY` secret of the GitHub environment `production`,
  which only `main` may deploy to.
- **Pinned server identity.** `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS` are environment variables, and the workflow refuses to
  connect if the server's host key changes.
- **Least privilege.** The workflow has no GitHub token permissions, and deploys never overlap.

To revoke automatic deploys: delete that line from `/root/.ssh/authorized_keys` on the VPS.
To rotate the key: generate a new one, replace the `authorized_keys` line, then run
`gh secret set DEPLOY_SSH_KEY --env production < newkey` and delete the local private key.

The server container is never exposed directly (no `ports:`). Only Caddy is. That matters because the
server trusts the client-IP header that Caddy sets, and uses it for rate limiting.

## 2. Web app (Vercel)

1. Import the repo in Vercel and set **Root Directory** to `apps/web`. Vercel detects Vite and pnpm.
2. Environment variable: `VITE_SERVER_URL=https://api.bugshop.example.com`.
3. In `apps/web/vercel.json`, replace `api.bugshop.example` in `connect-src` with your API domain (both the
   `https://` and `wss://` entries). Otherwise the CSP blocks the connection to your server.
4. Make sure the deployed site's origin is listed in the server's `ALLOWED_ORIGINS`.
5. Optional: set `VITE_DONATE_URL` to your donation page (an `https://` link). The "Keep the campfire burning"
   sign on the home page only appears when it is set.
6. Optional: turn on **Analytics** for the project in the Vercel dashboard. The app already includes
   `@vercel/analytics`; until it is enabled there, its script just returns 404 and nothing is recorded.

## Checklist
- [ ] `ALLOWED_ORIGINS` = exact web origin(s), e.g. `https://bugshop.example.com` (no trailing slash, no `*`)
- [ ] CSP `connect-src` in `vercel.json` names your API domain
- [ ] `VITE_SERVER_URL` set in Vercel
- [ ] `VITE_DONATE_URL` set in Vercel (optional)
- [ ] Web Analytics enabled in the Vercel dashboard (optional)
- [ ] VPS firewall allows only 22/80/443
