# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/api/Dockerfile .
#
# Targets:
#   runner  (default) — the API: production dependencies only, non-root, healthcheck.
#   migrate — one-shot `prisma migrate deploy` + idempotent seed (needs the Prisma CLI).

ARG NODE_IMAGE=node:24-bookworm-slim
ARG PNPM_VERSION=12.8.1
ARG TURBO_VERSION=2.11.7

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
# OpenSSL for the Prisma schema engine used by `prisma migrate deploy` (migrate target).
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force

# ---- Prune the monorepo to what @rustdesk-admin/api needs ------------------------------------
FROM base AS pruner
ARG TURBO_VERSION
WORKDIR /repo
COPY . .
RUN npx -y turbo@${TURBO_VERSION} prune @rustdesk-admin/api --docker

# ---- Install and build -----------------------------------------------------------------------
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm --filter @rustdesk-admin/api run prisma:generate \
 && pnpm --filter @rustdesk-admin/api run build \
 && pnpm --filter @rustdesk-admin/api deploy --prod --legacy /out/api \
 && cp -r apps/api/dist /out/api/dist

# ---- One-shot migrations + seed (docker compose: api-migrate) --------------------------------
FROM builder AS migrate
WORKDIR /repo/apps/api
ENV NODE_ENV=production
USER node
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/prisma/seed.js"]

# ---- Runtime ---------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
ENV NODE_ENV=production PORT=21114
WORKDIR /app
COPY --from=builder --chown=node:node /out/api/ .
USER node
EXPOSE 21114
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||21114)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/src/main.js"]
