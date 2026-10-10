# world-server (Colyseus). Build from the repo root:
#   docker build -f apps/world-server/Dockerfile -t yutopia-world .
FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/world-server/package.json apps/world-server/
RUN pnpm install --frozen-lockfile --filter @yutopia/world-server...
COPY packages/shared packages/shared
COPY apps/world-server apps/world-server
ENV NODE_ENV=production PORT=2567
EXPOSE 2567
USER node
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://localhost:2567/health || exit 1
CMD ["pnpm", "--filter", "@yutopia/world-server", "start"]
