# Build from the repo root:  docker build -f apps/server/Dockerfile .
# Base images are pinned by digest (tag in front for humans; Dependabot updates both).

FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS deps
WORKDIR /app
RUN corepack enable
# Manifests first so the dependency layer is cached between code changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/rules/package.json packages/rules/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
# Production deps of the server and its workspace packages only; lockfile must match.
RUN pnpm install --frozen-lockfile --prod --filter @bugshop/server...

FROM node:24.22.2-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=2567
WORKDIR /app
# Everything stays owned by root and read-only to the app user.
COPY --from=deps /app ./
COPY packages/rules/src packages/rules/src
COPY packages/protocol/src packages/protocol/src
COPY apps/server/src apps/server/src
USER node
WORKDIR /app/apps/server
EXPOSE 2567
# Node 24 runs the TypeScript sources directly (type stripping); no build step.
CMD ["node", "src/index.ts"]
