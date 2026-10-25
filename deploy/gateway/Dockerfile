FROM node:22-alpine
# LIVE read-only gateway image. Contains NO secrets and NO mock fixtures/.env.
# Secrets are injected at runtime via env_file from /srv/secrets (see compose.yaml).
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node src/ src/
COPY --chown=node:node scripts/start-gateway.mjs scripts/start-gateway.mjs
USER node
EXPOSE 8090
CMD ["node","scripts/start-gateway.mjs"]
