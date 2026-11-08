#!/usr/bin/env bash
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}
CONFIG_DIR=${CONFIG_DIR:-/config}
MEDIA_DIR=${MEDIA_DIR:-/media}
RCLONE_CONFIG=${RCLONE_CONFIG:-${CONFIG_DIR}/rclone/rclone.conf}

echo "============================================================"
echo " Starting RcloneBrowser Next Gen (v2.0)"
echo " PUID: ${PUID} | PGID: ${PGID} | TZ: ${TZ:-UTC}"
echo "============================================================"

# Configure timezone if TZ is provided
if [ -n "${TZ}" ] && [ -f "/usr/share/zoneinfo/${TZ}" ]; then
  ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime
  echo "${TZ}" > /etc/timezone
fi

# Ensure directories exist
mkdir -p "${CONFIG_DIR}/rclone" "${CONFIG_DIR}/tmp_uploads" "${MEDIA_DIR}"

# Migrate legacy rclone.conf from old jlesage/baseimage-gui container if present
if [ ! -f "${RCLONE_CONFIG}" ]; then
  if [ -f "${CONFIG_DIR}/xdg/config/rclone/rclone.conf" ]; then
    echo "[Init] Found legacy config at ${CONFIG_DIR}/xdg/config/rclone/rclone.conf, migrating..."
    cp "${CONFIG_DIR}/xdg/config/rclone/rclone.conf" "${RCLONE_CONFIG}"
  elif [ -f "${CONFIG_DIR}/rclone.conf" ]; then
    echo "[Init] Found legacy config at ${CONFIG_DIR}/rclone.conf, migrating..."
    cp "${CONFIG_DIR}/rclone.conf" "${RCLONE_CONFIG}"
  fi
fi

# Adjust permissions for /config
chown -R "${PUID}:${PGID}" "${CONFIG_DIR}" || true

# Run server as PUID:PGID
exec su-exec "${PUID}:${PGID}" node /app/dist/server/index.js
