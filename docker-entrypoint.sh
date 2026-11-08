#!/usr/bin/env bash
set -e

PUID=${PUID:-1000}
PGID=${PGID:-1000}
CONFIG_DIR=${CONFIG_DIR:-/config}
MEDIA_DIR=${MEDIA_DIR:-/media}
RCLONE_CONFIG=${RCLONE_CONFIG:-${CONFIG_DIR}/rclone/rclone.conf}

echo "============================================================"
echo " Starting RcloneBrowser Next Gen (v2.2)"
echo " PUID: ${PUID} | PGID: ${PGID} | TZ: ${TZ:-UTC}"
echo "============================================================"

# Configure timezone if TZ is provided
if [ -n "${TZ}" ] && [ -f "/usr/share/zoneinfo/${TZ}" ]; then
  ln -snf "/usr/share/zoneinfo/${TZ}" /etc/localtime
  echo "${TZ}" > /etc/timezone
fi

# Ensure directories exist
mkdir -p "${CONFIG_DIR}/rclone" "${CONFIG_DIR}/tmp_uploads" "${MEDIA_DIR}" || true

# Migrate legacy rclone.conf from old jlesage/baseimage-gui container if present
if [ ! -f "${RCLONE_CONFIG}" ]; then
  if [ -f "${CONFIG_DIR}/xdg/config/rclone/rclone.conf" ]; then
    echo "[Init] Found legacy config at ${CONFIG_DIR}/xdg/config/rclone/rclone.conf, migrating..."
    cp "${CONFIG_DIR}/xdg/config/rclone/rclone.conf" "${RCLONE_CONFIG}" || true
  elif [ -f "${CONFIG_DIR}/rclone.conf" ]; then
    echo "[Init] Found legacy config at ${CONFIG_DIR}/rclone.conf, migrating..."
    cp "${CONFIG_DIR}/rclone.conf" "${RCLONE_CONFIG}" || true
  fi
fi

# Adjust POSIX ownership and permissions for /config
chown -R "${PUID}:${PGID}" "${CONFIG_DIR}" 2>/dev/null || true
chmod -R a+rwX "${CONFIG_DIR}" 2>/dev/null || true

# Check if target PUID:PGID actually has write access to CONFIG_DIR/rclone
# (On Synology DSM 7+, /volume1/docker shared folder ACLs often block non-root UIDs unless granted in Control Panel)
if [ "${PUID}" = "0" ]; then
  exec node /app/dist/server/index.js
elif su-exec "${PUID}:${PGID}" sh -c "test -w '${CONFIG_DIR}/rclone' && test -w '${CONFIG_DIR}'" 2>/dev/null; then
  exec su-exec "${PUID}:${PGID}" node /app/dist/server/index.js
else
  echo "[Warn] UID ${PUID}:${PGID} is blocked from writing to ${CONFIG_DIR} (likely Synology Shared Folder ACL restriction)."
  echo "[Warn] Automatically falling back to root (0:0) so the service can run normally."
  exec node /app/dist/server/index.js
fi
