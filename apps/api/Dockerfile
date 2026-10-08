# Contexto de build: raíz del monorepo (docker compose lo configura)
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm install --filter @stodia/api...
WORKDIR /repo/apps/api
RUN pnpm build && tr -d '\r' < docker-entrypoint.sh > e.tmp && mv e.tmp docker-entrypoint.sh && chmod +x docker-entrypoint.sh
ENV NODE_ENV=production PORT=3000 DATABASE_URL=file:/data/stodia.db
VOLUME /data
EXPOSE 3000
CMD ["./docker-entrypoint.sh"]
