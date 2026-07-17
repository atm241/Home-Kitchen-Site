# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# CRA reads REACT_APP_* at BUILD time. With the nginx proxy below,
# the client should call relative paths (/api/...), so no URL needed here.
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
