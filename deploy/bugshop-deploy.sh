#!/bin/bash
# Deploy the Bugshop game server to this VPS.
#
# Installed root-owned at /usr/local/bin/bugshop-deploy. GitHub Actions runs it
# through an SSH key that is locked to this one command (forced command), and
# passes the commit SHA that passed CI as the SSH command. Run by hand with no
# argument to deploy the latest commit on main.
#
# Changes to this file in the repo only take effect after reinstalling it:
#   install -o root -g root -m 755 /opt/bugshop/deploy/bugshop-deploy.sh /usr/local/bin/bugshop-deploy
set -euo pipefail

REPO=/opt/bugshop

# One deploy at a time.
exec 9>/var/lock/bugshop-deploy.lock
flock -n 9 || { echo "Another deploy is already running." >&2; exit 1; }

cd "$REPO"
git fetch --quiet origin main

# The requested commit: from the SSH command (Actions) or the first argument (manual).
REQUESTED="${SSH_ORIGINAL_COMMAND:-${1:-}}"
if [[ -z "$REQUESTED" ]]; then
  REQUESTED=$(git rev-parse origin/main)
fi
# Only a full commit SHA, and only one that is on main.
if [[ ! "$REQUESTED" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character commit SHA." >&2
  exit 2
fi
if ! git merge-base --is-ancestor "$REQUESTED" origin/main; then
  echo "Commit $REQUESTED is not on main; refusing to deploy." >&2
  exit 3
fi

echo "Deploying $REQUESTED ($(git log -1 --format=%s "$REQUESTED"))"
git checkout --quiet --detach "$REQUESTED"

cd deploy
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null

# Health check: HTTPS through Caddy to the game server.
DOMAIN=$(grep -E '^API_DOMAIN=' .env | cut -d= -f2)
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/"; then
    echo "Deployed $REQUESTED: healthy."
    exit 0
  fi
  sleep 2
done
echo "Health check failed." >&2
docker compose logs --tail 40 server >&2
exit 4
