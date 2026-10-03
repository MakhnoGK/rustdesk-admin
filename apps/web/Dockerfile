# syntax=docker/dockerfile:1
# Build from the repository root:  docker build -f apps/web/Dockerfile .
#
# The admin panel as static files behind an unprivileged nginx (port 8080), which also proxies
# /api/ to the API server (API_UPSTREAM, default http://api:21114).

ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30-alpine
ARG PNPM_VERSION=12.8.1
ARG TURBO_VERSION=2.11.7

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN npm install -g pnpm@${PNPM_VERSION} && npm cache clean --force

# ---- Prune the monorepo to what @rustdesk-admin/web needs (includes packages/api-contract) -----
FROM base AS pruner
ARG TURBO_VERSION
WORKDIR /repo
COPY . .
RUN npx -y turbo@${TURBO_VERSION} prune @rustdesk-admin/web --docker

# ---- Install and build -----------------------------------------------------------------------
FROM base AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
# The contract types are committed (packages/api-contract/src/schema.d.ts): no API build needed here.
RUN pnpm --filter @rustdesk-admin/web run build

# ---- Runtime ---------------------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS runner
ENV API_UPSTREAM=http://api:21114
USER root
COPY apps/web/docker/nginx.conf /etc/nginx/templates/default.conf.template
COPY apps/web/docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=0755 apps/web/docker/entrypoint.sh /entrypoint.sh
COPY --from=builder /repo/apps/web/dist/ /usr/share/nginx/html/
# Only config.js is writable by the nginx user (the entrypoint rewrites it); the rest stays root's.
RUN rm -f /etc/nginx/conf.d/default.conf \
 && chown nginx:root /usr/share/nginx/html/config.js
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
