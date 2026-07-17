FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

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
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
