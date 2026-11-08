# RcloneBrowser Next Gen 🚀

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-yadiman%2Frclonebrowser--next--gen-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/yadiman/rclonebrowser-next-gen)
[![Version](https://img.shields.io/badge/version-2.2-0284c7.svg)](./version.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)

> 📖 **Documentation**: **English** | **[简体中文文档 (README_CN.md)](./README_CN.md)**

**RcloneBrowser Next Gen** is a ground-up, modern native Web GUI replacement for the legacy [rclonebrowser Docker container](https://github.com/kevinzfjiang/dockerfile/blob/master/rclonebrowser/Dockerfile).

Instead of streaming a heavy X11 + Openbox + noVNC + Qt5 desktop session over the browser, **RcloneBrowser Next Gen** is built with **React + TypeScript + Tailwind CSS + Node.js** on top of the **official Rclone engine**, packaged into a lightweight Alpine Docker image while maintaining **100% drop-in compatibility** with legacy `/config` and `/media` volumes and port `5800`.

- 🐳 **Docker Hub**: [`yadiman/rclonebrowser-next-gen`](https://hub.docker.com/r/yadiman/rclonebrowser-next-gen)
- 📦 **GitHub Repository**: [kevinzfjiang/rclonebrowser-next-gen](https://github.com/kevinzfjiang/rclonebrowser-next-gen)

---

## ✨ Why Upgrade to RcloneBrowser Next Gen?

| Dimension | Legacy `rclonebrowser` (`jlesage/baseimage-gui`) | **RcloneBrowser Next Gen (`v2.2`)** |
| :--- | :--- | :--- |
| **UI Experience** | X11/noVNC remote desktop video stream; blurry fonts, high latency, unusable on mobile | **Native 60fps Web UI** with drag-and-drop upload, inline preview, 5 themes & 3 languages |
| **Architecture** | Requires `glibc` hacks on Alpine and compiling unmaintained C++/Qt5 `Alkl58/RcloneBrowser` | **Static official Rclone binary + lightweight Node.js API**; zero X11/Qt5 bloat |
| **Memory Footprint** | ~350MB - 500MB idle | **~40MB idle** |
| **Security** | VNC plaintext or insecure Docker `ENV` passwords | **Console Initial Random Password + Forced First-Login Password Change + Salted Scrypt Hash (`/config/auth.json`) + Brute-Force Protection** |
| **Core Capabilities** | Basic desktop window | **Dual-Pane Commander, Pause/Resume Task Queue, Per-Remote Proxy, Cron Scheduler** |
| **Drop-in Compatibility** | `/config`, `/media`, port `5800` | **100% compatible**; auto-migrates legacy `/config/xdg/config/rclone/rclone.conf` on startup |

---

## 🛠️ Key Features (v2.2)

1. **Multi-Tab & Dual-Pane Commander File Explorer (`Explorer`)**
   - Switch between **Dual-Pane Commander** and **Single-Pane** layouts with independent multi-tab bars per pane.
   - Browse built-in `/media`, custom NAS mounts (`LOCAL_MOUNTS`), and any cloud Remote side-by-side.
   - Drag-and-drop file upload, **inline browser preview** (Text, Code, Markdown, JSON, Images, Video, Audio), streaming download, mkdir, rename, batch delete, and folder size calculation (`rclone size`).
   - One-click **Copy →**, **Move →**, and **Sync Dir ⇄** between panes.

2. **Transfer & Sync Task Center with Pause / Resume & Full `.log` Files (`Transfers`)**
   - Asynchronous task queue supporting `Copy`, `Sync`, `Move`, and `Check`.
   - Real-time progress bars, transfer speed (MB/s), ETA, active file sub-progress, and expandable **Rclone live terminal log console**.
   - **Per-Task Full `.log` Files**: Every transfer task writes a complete, timestamped `.log` file to `/config/logs/<date>_<op>_<id>.log` (with automatic 100-file rotation and 50MB per-file cap) and provides one-click **View Raw `.log`** & **Download Full `.log`** buttons in the Web UI.
   - Full support for **Pause**, **Resume**, **Cancel**, **Retry**, and on-the-fly **Global Bandwidth Limit (`--bwlimit`)**.

3. **Visual Remote Wizard & Per-Remote Proxy Isolation (`Remotes`)**
   - **Per-Remote Network Proxy**: Bind an independent `HTTP`, `HTTPS`, or `SOCKS5` proxy (or force `Direct / No Proxy`) to each individual Remote!
     - Example: `Google Drive A` → `socks5://192.168.1.2:1080`, `Google Drive B` → `http://192.168.1.2:7890`, `OneDrive` → `Direct (No Proxy)`.
     - **Dual-Process Loopback Bridge**: Even when transferring directly between two remotes with *different* proxies (e.g., `Google Drive A` → `OneDrive`), the server automatically spawns an isolated local loopback bridge (`127.0.0.1`) so each remote strictly uses its own proxy!
   - Built-in visual templates for **Amazon S3 / Cloudflare R2 / MinIO / Alibaba OSS / Tencent COS**, **WebDAV (Alist / Nextcloud / Synology)**, **SFTP / SSH**, **SMB / CIFS**, **FTP**, **Google Drive**, **Microsoft OneDrive**, **Alias**, and **Crypt** (with automatic `rclone obscure` password encryption).
   - Built-in **Raw `rclone.conf` Editor** with one-click Import and Export.

4. **Cron Scheduled Sync & Backup (`Scheduler`)**
   - Automate periodic `Copy`, `Sync`, or `Move` jobs using visual presets or custom 5-field Cron expressions.
   - Enable/disable schedules anytime, inspect next/last run timestamps, or click **Run Now** to trigger immediately.

5. **Production-Grade Security & Authentication (`v2.2`)**
   - **No Plaintext Docker ENV Passwords**: Eliminates `APP_PASSWORD` leaks from `docker inspect` or `docker-compose.yml`.
   - **Console Initial Random Password**: On first startup, generates a strong random password (`RbN-xxxxxxxxxxxx`) and prints it in `docker logs rclonebrowser-next`.
   - **Forced First-Login Password Change**: Signing in with the initial password immediately prompts you to set your own administrator password.
   - **Salted `scrypt` Hash Persistence**: Only the salted `scrypt` hash (`0600` permissions) is stored in `/config/auth.json`.
   - **Security Center & Passwordless LAN Mode**: Change username/password or toggle **Passwordless Direct Mode** (for trusted home LANs) anytime from the top bar **Security** button.
   - **IP Brute-Force Protection & One-Command CLI Reset**: Automatically locks out an IP for 5 minutes after 5 consecutive failed login attempts, and includes a built-in CLI password reset tool.

6. **Multi-Theme & Multi-Language UI + Auto Rclone Version Check**
   - **5 Built-in Themes**: `Slate Dark`, `Light Mode`, `Cyberpunk Neon`, `OLED Pure Black`, and `Nordic Frost`.
   - **3 Languages**: `简体中文`, `繁體中文`, and `English`.
   - **Automatic Rclone Update Detection**: Automatically checks official Rclone releases and highlights new versions in the bottom status bar (e.g. `Rclone v1.76.0 / v1.77.0 (new)`).
   - **Configurable Version**: Managed centrally via [`version.json`](./version.json).

---

## 🔐 First-Time Login & Password Management (v2.2+)

### 1. View Initial Password in Container Logs
When you start the container for the first time (when `/config/auth.json` does not exist yet), check the container console output:

```bash
docker logs rclonebrowser-next
```

You will see a banner like this:
```text
============================================================
🔐 [SECURITY] INITIAL ADMINISTRATOR CREDENTIALS GENERATED
------------------------------------------------------------
 👤 Username         : admin
 🔑 Initial Password : RbN-9kX4mP7vQ2wL
------------------------------------------------------------
 ⚠️  Please sign in using the initial password above.
 ⚠️  You will be required to change your password on first login.
 💾 Salted scrypt hash saved to: /config/auth.json
============================================================
```

### 2. First Login & Security Center
- Sign in at `http://<your-nas-ip>:5800` using `admin` and the initial password above.
- You will be prompted to set a new password (or switch to **Passwordless LAN Mode** if running in a trusted home network).
- Anytime later, click **Security (`安全中心`)** in the top navigation bar to update your username, change your password, or toggle authentication mode.

### 3. Forgot Password? One-Command CLI Reset
If you ever forget your password, run the following command on your Docker host to generate and print a new temporary password:

```bash
docker exec -it rclonebrowser-next node dist/server/reset-password.js
```

---

## 🐳 Quick Start with Docker

Docker Hub image: `yadiman/rclonebrowser-next-gen:latest`

### Option 1: Synology NAS (Container Manager) / Multi-Mount `docker-compose.yml`

If you have multiple folders across different Synology volumes (e.g., `/volume3/NAS`, `/volume1/NAS2`, `/volume2/homes/kevin/Photos`), mount them under `/media/` and register them in `LOCAL_MOUNTS` for one-click dropdown access:

```yaml
services:
  rclonebrowser:
    image: yadiman/rclonebrowser-next-gen:latest
    container_name: rclonebrowser-next
    restart: unless-stopped
    ports:
      - "5800:5800"
    environment:
      # On Synology DSM 7+, /volume1/docker has ACL restrictions; 0:0 ensures full read/write access
      - PUID=0
      - PGID=0
      - TZ=Asia/Shanghai
      - PORT=5800
      # Register multiple local mounts as standalone dropdown items in the Explorer
      - LOCAL_MOUNTS=NAS=/media/NAS,NAS2=/media/NAS2,Photos=/media/Photos
    volumes:
      - /volume1/docker/rclonebrowser/config:/config
      - /volume3/NAS:/media/NAS
      - /volume1/NAS2:/media/NAS2
      - /volume2/homes/kevin/Photos:/media/Photos
```

Start the container:

```bash
docker compose up -d
docker logs rclonebrowser-next
```

Open in your browser: `http://<your-nas-ip>:5800`

---

### Option 2: Standard Linux `docker run`

```bash
docker run -d \
  --name=rclonebrowser-next \
  -p 5800:5800 \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Asia/Shanghai \
  -v /path/to/config:/config \
  -v /path/to/media:/media \
  --restart unless-stopped \
  yadiman/rclonebrowser-next-gen:latest
```

---

## ⚙️ Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `5800` | Web GUI listening port (matches legacy `5800`) |
| `PUID` | `1000` | Process UID (`0` recommended on Synology DSM 7+ if `/volume1/docker` ACLs are restricted) |
| `PGID` | `1000` | Process GID |
| `TZ` | `Asia/Shanghai` | Container timezone (used for logs and Cron schedules) |
| `LOCAL_MOUNTS` | *(empty)* | Comma-separated shortcut mounts, e.g. `NAS=/media/NAS,NAS2=/media/NAS2,Photos=/media/Photos` |
| `CONFIG_DIR` | `/config` | Persistent configuration, `auth.json`, and task database directory |
| `MEDIA_DIR` | `/media` | Primary local data mount directory |

---

## 💻 Building from Source & Local Development

### 1. Build & Push Docker Image

```bash
git clone https://github.com/kevinzfjiang/rclonebrowser-next-gen.git
cd rclonebrowser-next-gen

docker build -t yadiman/rclonebrowser-next-gen:latest -t yadiman/rclonebrowser-next-gen:2.2 .
docker push yadiman/rclonebrowser-next-gen:latest
docker push yadiman/rclonebrowser-next-gen:2.2
```

### 2. Local Node.js Development

Requires `Node.js >= 20` and `rclone` CLI installed locally:

```bash
npm install
npm run dev             # Starts Express backend (:5800) + Vite HMR frontend (:5173)
npm run build           # Builds production frontend and backend
npm test                # Runs integration smoke tests against Rclone & AuthService
npm run reset-password  # Resets admin password and prints new temporary password
npm start               # Starts production server on port 5800
```
