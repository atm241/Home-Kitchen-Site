# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build   # assumes "build": "tsc" outputting to ./dist

# ---- Runtime stage ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Non-root user for good hygiene
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 5001
CMD ["node", "dist/index.js"]
