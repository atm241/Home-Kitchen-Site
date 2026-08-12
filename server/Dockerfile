# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Migration runner + SQL files, applied on container start (see docker-compose)
COPY migrate.js ./
COPY migrations ./migrations

# Non-root user for good hygiene. uploads/ is created and handed to that user
# so recipe photos can be written once we drop privileges; docker-compose
# mounts a named volume here so they survive rebuilds.
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/uploads \
    && chown -R app:app /app/uploads
USER app

EXPOSE 5001
CMD ["node", "dist/index.js"]
