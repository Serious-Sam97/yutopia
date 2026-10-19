# world-server (Colyseus). Build from the repo root:
#   docker build -f apps/world-server/Dockerfile -t yutopia-world .
FROM node:24-alpine
WORKDIR /app
# the same pnpm as the dev stack (an unpinned corepack fetches the newest)
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate
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
# tsx itself, not `pnpm start`: pnpm would re-check the install on every start
# (as `node`, who can't write node_modules); the env comes from the container
WORKDIR /app/apps/world-server
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
