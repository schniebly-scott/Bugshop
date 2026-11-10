# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub's
[private vulnerability reporting](../../security/advisories/new) for this repository
("Security" tab → "Report a vulnerability"). Include steps to reproduce and the
impact you think it has. You should get a response within a week.

## Scope

In scope: the web app (`apps/web`), the game server (`apps/server`, once it exists),
the shared rules engine (`packages/rules`), and this repository's CI configuration.
Cheating vectors count as security bugs too, for example getting the server to accept
an illegal move, purchase, clock value or game result.

## Supported versions

Only the latest `main` branch and the currently deployed site are supported.
