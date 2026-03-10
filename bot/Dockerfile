FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-alpine

RUN apk add --no-cache tini
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/

RUN addgroup -S bot && adduser -S bot -G bot
USER bot

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${API_PORT:-3001}/health || exit 1

EXPOSE 3001

ENTRYPOINT ["tini", "--"]
CMD ["node", "src/index.js"]
