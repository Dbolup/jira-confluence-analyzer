# Builds the standalone dc-runner executable for Linux. A SEA binary embeds whatever `node`
# binary is present at injection time, so it must be built here — inside a pinned Linux image —
# not on a contributor's own OS, which would produce a binary that can't run on a customer's
# (near-certainly Linux) Data Center server.
#
# Usage:
#   docker build -f dc-runner-build.Dockerfile -t dc-runner-build .
#   docker create --name dc-runner-extract dc-runner-build
#   docker cp dc-runner-extract:/app/dist/dc-runner ./dist/dc-runner
#   docker rm dc-runner-extract
FROM node:24-bookworm-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:dc-runner
