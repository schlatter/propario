# Build stage: compile the single-page app.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# Container builds have no .git: the deployment passes the commit so the version shows it.
ARG PROPARIO_COMMIT=""
RUN PROPARIO_COMMIT=$PROPARIO_COMMIT npm run build

# Production dependencies only (the server needs just @simplewebauthn/server), no install scripts.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev

# Runtime: Node runs the server's TypeScript directly; non-root, data in /data.
FROM node:24-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY src/shared ./src/shared
COPY src/db/factories.ts src/db/types.ts ./src/db/
RUN rm -f server/*.test.ts && mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/main.ts"]
