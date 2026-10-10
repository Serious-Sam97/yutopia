# client (Next.js). NEXT_PUBLIC_* are baked in at build time.
#   docker build -f apps/client/Dockerfile --build-arg NEXT_PUBLIC_API=https://api.example -t yutopia-client .
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_API
ARG NEXT_PUBLIC_YONDRA_APP
ARG NEXT_PUBLIC_REVERB_APP_KEY
ARG NEXT_PUBLIC_REVERB_HOST
ARG NEXT_PUBLIC_REVERB_PORT=443
ARG NEXT_PUBLIC_REVERB_SCHEME=https
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile --filter @yutopia/client...
COPY packages/shared packages/shared
COPY apps/client apps/client
RUN pnpm --filter @yutopia/client build

FROM node:24-alpine
WORKDIR /app
RUN corepack enable
COPY --from=build /app /app
ENV NODE_ENV=production
EXPOSE 3100
USER node
CMD ["pnpm", "--filter", "@yutopia/client", "start"]
