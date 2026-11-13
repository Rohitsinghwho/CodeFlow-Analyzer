# CodeFlow backend image (used by Render, or any Docker host).
#
# It needs git, because the API downloads GitHub repositories with `git clone`.

FROM node:22-slim

# git to download repositories, ca-certificates so https works.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install the packages first, so Docker can reuse this step when only the code changes.
# --omit=dev leaves out nodemon, which is only for local development.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Run as the unprivileged "node" user that comes with the image.
RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
# Public servers must not read their own folders. Downloads from GitHub stay on.
ENV ALLOW_LOCAL_PATHS=false

# The host tells the app which port to use through PORT (it defaults to 3000).
EXPOSE 3000

CMD ["node", "server.js"]
