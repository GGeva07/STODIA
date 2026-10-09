# Contexto de build: raíz del monorepo (docker compose lo configura)
FROM node:20-bookworm-slim AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm install --filter @stodia/web...
RUN pnpm --filter @stodia/web build

FROM nginx:1.27-alpine
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
COPY apps/web/docker/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
RUN tr -d '\r' < /docker-entrypoint.d/40-runtime-config.sh > /tmp/e.sh \
    && mv /tmp/e.sh /docker-entrypoint.d/40-runtime-config.sh \
    && chmod +x /docker-entrypoint.d/40-runtime-config.sh
ENV API_URL="" LICENSE_KEY="" INSTITUTION_NAME="" API_PROXY_TARGET=""
EXPOSE 80
