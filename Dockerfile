# Rayomand CMS — multi-stage production image.
#
# The image runs `scripts/serve.ts`, which starts the Next.js server and the
# mail engine under one parent so a container restart brings both back. The
# mail engine needs to bind 25/143/110, which requires either root or the
# NET_BIND_SERVICE capability; docker-compose grants only that capability.
#
# Build:  docker build -t rayomand .
# Run:    see docker-compose.yml (a PostgreSQL service is expected alongside).

FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM node:20-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3131

# tini reaps zombie processes from the mail daemon; ca-certificates lets the
# TLS/ACME client verify the certificate chain.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user; docker-compose adds CAP_NET_BIND_SERVICE so the
# mail daemon can still bind port 25.
RUN groupadd -r rayomand && useradd -r -g rayomand -d /app -s /sbin/nologin rayomand

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.mjs ./next.config.mjs
COPY --from=build /app/lib ./lib
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/vendor ./vendor
COPY --from=build /app/tsconfig.json ./tsconfig.json

# Writable dirs the app needs at runtime.
RUN mkdir -p public/frontends /app/.data && chown -R rayomand:rayomand /app/public/frontends /app/.data

USER rayomand
EXPOSE 3131 25 587 465 143 993 110 995

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["npx", "tsx", "scripts/serve.ts"]
