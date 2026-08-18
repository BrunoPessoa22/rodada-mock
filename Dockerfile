FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Cap the V8 heap during `next build`: the deploy box has ~8GB shared with the
# rest of the fleet and swap runs near-full, so an unbounded webpack heap gets
# OOM-killed under transient pressure (exit 255 mid-compile, no error line).
# 2.5GB forces harder GC instead of ballooning; the build just runs slower.
RUN NODE_OPTIONS=--max-old-space-size=2560 npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data
# Next standalone binds to $HOSTNAME; Docker sets it to the container id,
# which breaks proxy connectivity — force wildcard bind.
ENV HOSTNAME=0.0.0.0
# The production image IS the league counter — the indexer loop must never be
# silently off because an env var was forgotten at the platform layer.
ENV RUN_INDEXER=1
RUN mkdir -p /app/data && chown node:node /app/data
# The league DB lives here. Declare it a volume so a plain redeploy that recreates
# the container does not wipe every claim, score and setting. In Coolify, bind
# this to a persistent volume/host path — an anonymous volume still survives
# redeploys but is not a substitute for a mapped, backed-up mount.
VOLUME /app/data
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
