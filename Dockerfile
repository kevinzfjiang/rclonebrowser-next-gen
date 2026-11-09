# =============================================================================
# RcloneBrowser Next Gen - Multi-Stage Dockerfile
# Drop-in modern native Web GUI replacement for legacy RcloneBrowser container
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build Frontend (React + Tailwind + Vite) & Backend (TypeScript)
# -----------------------------------------------------------------------------
FROM node:26-alpine AS builder

WORKDIR /build

COPY package.json package-lock.json* version.json ./
RUN npm install

COPY tsconfig.json tsconfig.server.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY public ./public
COPY src ./src

RUN npm run build && npm prune --omit=dev

# -----------------------------------------------------------------------------
# Stage 2: Lightweight Alpine 3.24 Runtime + Node.js 26 LTS + Official Rclone
# -----------------------------------------------------------------------------
FROM alpine:3.24

ARG RCLONE_VERSION=current
ARG TARGETARCH=amd64

ENV APP_NAME="RcloneBrowser Next Gen" \
    NODE_ENV="production" \
    PORT="5800" \
    PUID="1000" \
    PGID="1000" \
    TZ="Asia/Shanghai" \
    CONFIG_DIR="/config" \
    MEDIA_DIR="/media" \
    RCLONE_CONFIG="/config/rclone/rclone.conf"

# Install minimal Node.js 26 LTS runtime (nodejs-current) & latest official Rclone binary
RUN apk update && \
    apk add --no-cache \
      nodejs-current \
      ca-certificates \
      curl \
      wget \
      unzip \
      fuse3 \
      tzdata \
      su-exec \
      shadow \
      openssh-client \
      bash && \
    ln -sf /usr/bin/fusermount3 /usr/bin/fusermount && \
    ARCH="${TARGETARCH}" && \
    if [ "$ARCH" = "arm64" ]; then RCLONE_ARCH="arm64"; \
    elif [ "$ARCH" = "arm" ]; then RCLONE_ARCH="arm-v7"; \
    else RCLONE_ARCH="amd64"; fi && \
    cd /tmp && \
    wget -q "https://downloads.rclone.org/rclone-${RCLONE_VERSION}-linux-${RCLONE_ARCH}.zip" && \
    unzip -q "/tmp/rclone-${RCLONE_VERSION}-linux-${RCLONE_ARCH}.zip" && \
    mv /tmp/rclone-*-linux-${RCLONE_ARCH}/rclone /usr/bin/rclone && \
    chmod 755 /usr/bin/rclone && \
    rm -rf /tmp/*

WORKDIR /app

# Copy compiled artifacts, version.json, and production node_modules from builder
COPY --from=builder /build/package.json ./package.json
COPY --from=builder /build/version.json ./version.json
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist

# Copy entrypoint script
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Compatible mount volumes with legacy rclonebrowser container
VOLUME ["/config"]
VOLUME ["/media"]

# Default port 5800 matches legacy jlesage/baseimage-gui Web port
EXPOSE 5800

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/auth/status" > /dev/null || exit 1

LABEL org.opencontainers.image.title="RcloneBrowser Next Gen" \
      org.opencontainers.image.description="Modern Native Web GUI for Rclone in Docker" \
      org.opencontainers.image.version="2.5" \
      org.opencontainers.image.source="https://github.com/kevinzfjiang/rclonebrowser-next-gen"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
