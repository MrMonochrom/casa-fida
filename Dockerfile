# syntax=docker/dockerfile:1
# Casa Fida in one image: the built web app and the API server that serves it. docker-compose.yml
# runs it with MySQL, Caddy (for HTTPS) and nightly backups; see "Running in production" in README.md.
#   docker build --build-arg APP_VERSION=$(git rev-parse --short HEAD) -t casa-fida .

# Builds the web app (and type-checks everything) with all the dev dependencies.
FROM node:24-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# Runs it, with only what the server needs.
FROM node:24-trixie-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3002 STORAGE_DIR=/data/files
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server server
COPY shared shared
COPY db db
COPY --from=build /app/dist dist
RUN find server -name '*.test.ts' -delete && rm -rf server/test \
  && mkdir -p /data/files && chown node:node /data/files

# Which version this is, for error reports (Sentry's "release").
ARG APP_VERSION=""
ENV APP_VERSION=$APP_VERSION

USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3002/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Brings the database up to date (an empty one gets its tables), then starts the server.
CMD ["sh", "-c", "node server/scripts/migrate.ts && exec node server/index.ts"]
