# client (Next.js). NEXT_PUBLIC_* are baked in at build time.
#   docker build -f apps/client/Dockerfile -t yutopia-client .
# NEXT_PUBLIC_API empty (the default here) = the API on the client's own origin, under /api.
FROM node:24-alpine AS build
WORKDIR /app
# the same pnpm as the dev stack (an unpinned corepack fetches the newest)
RUN corepack enable && corepack prepare pnpm@12.6.0 --activate
ARG NEXT_PUBLIC_API=""
ARG NEXT_PUBLIC_VORTEXOS_URL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --filter @yutopia/client...
COPY packages/shared packages/shared
COPY apps/client apps/client
# the game room's emulator cores and built-in cartridges: pinned by sha256,
# fetched from their releases (bsdtar opens the 2600 core's 7z)
COPY tools/emu-assets.mjs tools/emu-cores.json tools/emu-games.json tools/
RUN apk add --no-cache libarchive-tools && node tools/emu-assets.mjs && node tools/emu-assets.mjs --check
RUN pnpm --filter @yutopia/client build

FROM node:24-alpine
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 3100
USER node
# next itself, not `pnpm start`: pnpm would re-check the install on every start
# (as `node`, who can't write node_modules)
WORKDIR /app/apps/client
CMD ["./node_modules/.bin/next", "start", "-p", "3100"]
