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
   cp .env.example .env    # set API_DOMAIN, ALLOWED_ORIGINS and the account settings (section 3)
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
5. Optional: set `VITE_DONATE_URL` to your donation page (an `https://` link). The "Keep the campfire burning"
   sign on the home page only appears when it is set.
6. Optional: turn on **Analytics** for the project in the Vercel dashboard. The app already includes
   `@vercel/analytics`; until it is enabled there, its script just returns 404 and nothing is recorded.

## 3. Accounts

Players must sign in to play. Accounts, sessions and ratings live in one SQLite file on the VPS, in the
`bugshop_data` Docker volume (`/data/bugshop.sqlite` inside the container).

**The API must be a subdomain of the web app's domain** (e.g. `bugshop.example.com` and
`api.bugshop.example.com`). The session is a cookie on the API domain, and browsers only send it from the
web app when both share the same registrable domain. A `*.vercel.app` preview URL talking to your API
will not stay signed in.

Required in `deploy/.env`:

| Variable | What it is |
| --- | --- |
| `AUTH_SECRET` | Signs session cookies. `openssl rand -base64 32`. Changing it signs everyone out. |
| `RESEND_API_KEY`, `MAIL_FROM` | Sends the "confirm your email" and "reset your password" mails through [Resend](https://resend.com). Verify your sending domain there first. |

The server refuses to start in production without them, so that nobody can register with someone else's
address.

Optional sign-in buttons (each appears only when both of its variables are set):

- **Google**: in Google Cloud Console create an OAuth client of type *Web application*. Authorized redirect
  URI: `https://<API_DOMAIN>/api/auth/callback/google`. Copy the client ID and secret into
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Apple** (needs a paid Apple Developer account): create an App ID with *Sign in with Apple*, then a
  *Services ID* (this is `APPLE_CLIENT_ID`) with domain `<API_DOMAIN>` and return URL
  `https://<API_DOMAIN>/api/auth/callback/apple`, then a *Key* for Sign in with Apple. `APPLE_CLIENT_SECRET`
  is a JWT you sign with that key (ES256; `iss` = Team ID, `sub` = Services ID, `aud` =
  `https://appleid.apple.com`). Apple limits it to six months, so put a renewal in your calendar.

**Back up the database.** Losing the volume loses every account and rating:
```sh
docker compose exec server node -e "require('node:sqlite').backup(new (require('node:sqlite').DatabaseSync)(process.env.DATABASE_PATH), '/data/backup.sqlite').then(() => console.log('ok'))"
docker compose cp server:/data/backup.sqlite ./bugshop-$(date +%F).sqlite
```
Run that nightly from cron and copy the file off the server.

## Checklist
- [ ] `ALLOWED_ORIGINS` = exact web origin(s), e.g. `https://bugshop.example.com` (no trailing slash, no `*`)
- [ ] CSP `connect-src` in `vercel.json` names your API domain
- [ ] `VITE_SERVER_URL` set in Vercel
- [ ] `AUTH_SECRET`, `RESEND_API_KEY`, `MAIL_FROM` set; API domain is a subdomain of the web app's domain
- [ ] Google / Apple redirect URIs point at `https://<API_DOMAIN>/api/auth/callback/...`
- [ ] Nightly database backup copied off the server
- [ ] `VITE_DONATE_URL` set in Vercel (optional)
- [ ] Web Analytics enabled in the Vercel dashboard (optional)
- [ ] VPS firewall allows only 22/80/443
