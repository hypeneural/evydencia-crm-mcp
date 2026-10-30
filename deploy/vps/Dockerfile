FROM node:22-alpine
# Offline-build-safe by design: the tunnel binary is supplied separately after verifying
# its version and SHA256 against the release checksum on the deployment host.
# DO NOT substitute a mutable latest release download during image build.
WORKDIR /app
RUN apk add --no-cache ca-certificates && mkdir -p /config && chown node:node /config
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node src/ src/
COPY --chown=node:node scripts/ scripts/
COPY --chown=node:node fixtures/ fixtures/
COPY --chown=node:node contracts/ contracts/
COPY --chown=node:node deploy/vps/.env.mock .env
COPY --chown=node:node --chmod=0755 deploy/vps/entrypoint.sh /usr/local/bin/entrypoint.sh
USER node
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
