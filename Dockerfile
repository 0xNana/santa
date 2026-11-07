# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 SANTA_DISABLE_WEBPACK_CACHE=1
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY packages/web/package.json ./packages/web/
COPY packages/agent/package.json ./packages/agent/
RUN npm ci
COPY packages/core/src ./packages/core/src
COPY packages/web ./packages/web

# These values are public and compiled into Next's browser bundle. Runtime keys never enter here.
ARG NEXT_PUBLIC_PRIVY_APP_ID
ARG NEXT_PUBLIC_SANTA_VAULT_ADDRESS
ARG SANTA_PUBLIC_ORIGIN
ENV NEXT_PUBLIC_PRIVY_APP_ID=${NEXT_PUBLIC_PRIVY_APP_ID} \
    NEXT_PUBLIC_SANTA_VAULT_ADDRESS=${NEXT_PUBLIC_SANTA_VAULT_ADDRESS} \
    SANTA_PUBLIC_ORIGIN=${SANTA_PUBLIC_ORIGIN}
RUN test -n "$NEXT_PUBLIC_PRIVY_APP_ID" && test -n "$NEXT_PUBLIC_SANTA_VAULT_ADDRESS" && \
    test -n "$SANTA_PUBLIC_ORIGIN" && npm run build --workspace=@santa/web

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates gosu && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/packages/web/.next/standalone ./
COPY --from=build --chown=node:node /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=build --chown=node:node /app/packages/web/public ./packages/web/public
# The GeoIP child-process updater must retain its dependencies in the standalone image.
RUN node --input-type=module -e 'for (const name of ["ip-location-api", "@fast-csv/parse", "ip-address", "dayjs", "yauzl", "pend"]) import.meta.resolve(name)'
COPY --chmod=755 scripts/fly-entrypoint.sh /usr/local/bin/santa-entrypoint
EXPOSE 3000
ENTRYPOINT ["santa-entrypoint"]
CMD ["node", "packages/web/server.js"]
