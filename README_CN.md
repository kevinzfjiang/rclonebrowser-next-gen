# RcloneBrowser Next Gen 🚀 (中文文档)

[![Docker Hub](https://img.shields.io/badge/Docker%20Hub-yadiman%2Frclonebrowser--next--gen-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/yadiman/rclonebrowser-next-gen)
[![Version](https://img.shields.io/badge/version-2.5-0284c7.svg)](./version.json)
[![Node.js](https://img.shields.io/badge/Node.js-26%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](https://opensource.org/licenses/MIT)

> 📖 **语言切换 / Documentation**: **[English Documentation (README.md)](./README.md)** | **简体中文**

**RcloneBrowser Next Gen** 是对传统 [kevinzfjiang/dockerfile/rclonebrowser](https://github.com/kevinzfjiang/dockerfile/blob/master/rclonebrowser/Dockerfile) 容器的彻底现代化重构。

彻底告别笨重的 **X11 + Openbox + noVNC + Qt5 桌面画面转发** 方案，采用 **现代原生 Web 前后端 (React + TypeScript + Tailwind CSS + Node.js) + 官方 Rclone 引擎** 构建，并打包为超轻量级 Alpine Docker 容器，同时 **100% 兼容旧版容器的端口 (`5800`) 与挂载目录 (`/config`、`/media`)**。

- 🐳 **Docker Hub 镜像**：[`yadiman/rclonebrowser-next-gen`](https://hub.docker.com/r/yadiman/rclonebrowser-next-gen) (`latest` / `2.5`)
- 📦 **GitHub 仓库**：[kevinzfjiang/rclonebrowser-next-gen](https://github.com/kevinzfjiang/rclonebrowser-next-gen)

---

## ✨ 为什么升级到 RcloneBrowser Next Gen？

| 维度 | 旧版 RcloneBrowser 容器 (`jlesage/baseimage-gui`) | **RcloneBrowser Next Gen (`v2.5`)** |
| :--- | :--- | :--- |
| **交互体验** | 基于 X11/noVNC 远程桌面视频流，高延迟、字体发虚、移动端无法操作 | **原生响应式 Web 界面**，60fps 丝滑交互，内置 5 套主题风格与中/繁/英三语切换 |
| **底层依赖** | 需在 Alpine 中强装 `glibc`、编译已停更的 C++/Qt5 `Alkl58/RcloneBrowser` | **纯静态编译官方 Rclone + Node.js 26 LTS Alpine 运行时**，零 X11/Qt5 依赖，构建快速稳定 |
| **资源占用** | 闲置内存 ~350MB - 500MB | **闲置内存 ~40MB** |
| **安全机制** | VNC 弱口令或 Docker 环境变量明文密码暴露 | **Console 随机初始密码 + 首次登录强制改密 + `/config/auth.json` Scrypt 加盐哈希存储 + 防暴力破解锁定** |
| **功能扩展** | 仅限桌面版基础窗口 | 内置 **双栏多标签 Commander、群晖 `@eaDir` 与自定义过滤引擎、任务暂停/恢复、每个网盘独立代理、Cron 定时同步** |
| **旧版兼容性** | `/config`、`/media`、端口 `5800` | **完全兼容**，启动时自动检测并迁移旧版 `/config/xdg/config/rclone/rclone.conf` |

---

## 🛠️ 核心功能 (v2.5)

1. **多标签 & 双栏 Commander 文件资源管理器 (`Explorer`)**
   - 支持 **双栏对比模式 (Split Commander)** 与 **单栏模式** 一键切换，每栏均支持独立多标签页。
   - 内置本地数据卷 `@media` (`/media`)、多挂载点 (`LOCAL_MOUNTS`) 与任意云端 Remote 同屏浏览。
   - 支持 **拖拽上传文件**、**在线直接预览**（文本、代码、Markdown、JSON、图片、音视频）、文件流式下载、新建文件夹、重命名、批量删除、文件夹大小统计 (`rclone size`)。
   - 双栏一键 **复制到对侧 (`Copy →`)**、**移动到对侧 (`Move →`)**、**镜像同步目录 (`Sync ⇄`)**。

2. **群晖 NAS (`@eaDir` / `#recycle`) 与自定义文件/文件夹过滤引擎 (`v2.4`)**
   - **开箱默认过滤群晖系统目录**：默认自动排除群晖 DSM 生成的 `@eaDir/**`（缩略图与索引）、`#recycle/**`（回收站）、`#snapshot/**`（快照）、`@tmp/**`、`@sharebin/**`、`.SynologyWorkingDirectory/**` 等隐藏目录，防止成千上万个群晖系统碎片文件被同步到目标网盘。
   - **一键预设包与自定义过滤规则**：点击顶部导航栏、文件管理器或任务中心的 **“过滤规则 (Filters)”** 按钮，可一键勾选 `群晖 DSM`、`macOS (.DS_Store)`、`Windows (Thumbs.db)`、`隐藏点文件 (.*)` 预设包，或自由添加自定义过滤文件夹（如 `node_modules/**`）与文件通配符（如 `*.bak`、`*.log`）。
   - **文件管理器同步隐藏**：支持在文件管理器浏览列表中同步隐藏匹配的 `@eaDir`、`#recycle` 等杂乱系统目录。

2. **支持暂停/恢复与独立 `.log` 日志文件的传输与同步中心 (`Transfers`)**
   - 支持 `Copy`、`Sync`、`Move`、`Check` 异步任务队列。
   - 解析 `rclone --use-json-log --stats 500ms` 实时流，展示 **总体进度条、实时传输速率 (MB/s)、剩余时间 (ETA)、正在传输的子文件列表**。
   - **独立完整 `.log` 日志文件持久化**：每个传输任务都会在 `/config/logs/` 目录下生成一份带时间戳的完整 `.log` 日志文件（如 `/config/logs/2026-11-08_225104_copy_a1b2c3d4.log`，内置单文件 50MB 上限与最多 100 份文件自动滚动清理），支持在界面一键 **新窗口查看** 或 **下载完整 `.log` 文件**。
   - 支持 **暂停 (Pause)**、**恢复 (Resume)**、**取消 (Cancel)**、**失败重试 (Retry)**、随时调整 **全局带宽限速 (`--bwlimit`)**，以及展开查看 **Rclone 实时终端日志**。

3. **可视化 Remote 存储源管理 & 独立代理绑定 (`Remotes & Per-Remote Proxy`)**
   - **支持每个 Remote 独立绑定代理或直连**：
     - 完美解决中国大陆环境下不同网盘需要不同网络出口的痛点（例如：`Google Drive A` 绑定 `socks5://192.168.1.2:1080`，`Google Drive B` 绑定 `http://192.168.1.2:7890`，`OneDrive` / 国内云盘 / 局域网 NAS 保持 `直连无代理`）。
     - 即使在两个配置了**不同代理**（或一个走代理、一个走直连）的网盘之间直接对传，系统也会自动启动**双进程本地回环桥接 (`127.0.0.1`)**，确保源端和目标端各自严格走自己的代理通道，互不干扰！
   - 内置主流存储协议可视化创建/编辑向导：
     - **S3 兼容对象存储**（AWS S3、Cloudflare R2、MinIO、阿里云 OSS、腾讯云 COS、Backblaze B2）
     - **WebDAV**（Alist、OpenList、Nextcloud、OwnCloud、群晖 NAS）
     - **SFTP / SSH**、**SMB / CIFS 局域网共享**、**FTP**
     - **Google Drive**、**Microsoft OneDrive**（含世纪互联版）
     - **Alias 本地/远端路径映射**、**Crypt 端到端加密层**（自动继承底层 Remote 的代理配置）
   - 保存时自动调用 `rclone obscure` 对明文密码进行安全加密。
   - 内置 **`rclone.conf` 源文件在线编辑器**，支持一键导入/导出备份配置文件，以及 `rclone about` 容量测速。

4. **Cron 定时同步调度器 (`Cron Scheduler`)**
   - 在 Web 界面中配置周期性自动备份/同步任务（提供常用周期预设与自定义 5 段式 Cron 表达式）。
   - 支持随时启停、查看下次执行时间与历史状态，以及点击 **“立即运行一次”** 手动触发。

5. **企业级密码与安全认证中心 (`v2.2`)**
   - **彻底告别明文环境变量密码**：不再通过 `APP_PASSWORD` 环境变量暴露明文密码（防止 `docker inspect`、群晖面板或 `docker-compose.yml` 泄密）。
   - **首次启动 Console 随机初始密码**：当 `/config/auth.json` 不存在时，容器自动生成高强度随机初始密码（如 `RbN-9kX4mP7vQ2wL`）并醒目打印在容器日志 (`docker logs`) 中。
   - **首次登录强制修改密码**：使用初始密码登录后，系统强制弹出改密窗口，设置新密码后初始密码立即作废。
   - **Scrypt 加盐哈希持久化**：密码仅以 `scrypt` + 随机盐值哈希形式保存在 `/config/auth.json`（权限 `0600`），磁盘上绝不保存任何明文密码。
   - **Web 安全中心与免密直连开关**：随时点击顶部导航栏 **“安全中心”** 修改管理员账号/密码，或在受信任家庭内网中一键切换 **“免密直连模式”**。
   - **防暴力破解与 CLI 一键重置**：同一 IP 连续输错 5 次密码自动锁定 5 分钟；内置命令行一键重置密码脚本。

6. **多主题风格、多语言与 Rclone 版本自动检查**
   - **5 套界面主题**：`经典深色 (Slate)`、`浅色明亮 (Light)`、`赛博朋克 (Cyberpunk)`、`纯粹深黑 (OLED Black)`、`极地冰蓝 (Nord)`。
   - **3 种界面语言**：`简体中文`、`繁體中文`、`English`。
   - **Rclone 新版本自动检测**：后台自动对比官方最新 Rclone 版本，若有新版则在左下方状态栏醒目提示 `Rclone v1.76.0 / v1.77.0 (new)`。
   - **应用版本号配置化**：统一由根目录 [`version.json`](./version.json) 管理。

---

## 🔐 首次登录与密码管理指南 (v2.2+)

### 1. 查看容器日志获取初始随机密码
首次启动容器时，请在群晖 Container Manager「日志」页签或终端中执行：

```bash
docker logs rclonebrowser-next
```

你会在日志中看到如下初始凭证输出：
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

### 2. 首次登录强制改密 & 安全中心
- 打开 `http://你的群晖IP:5800`，使用用户名 `admin` 和日志中的初始密码登录。
- 登录后会自动弹出 **“首次登录 — 请修改初始管理员密码”** 窗口，设置你的专属密码（或者如果仅在家里内网使用，也可直接切换为 **“免密直连模式”**）。
- 日后可随时点击右上角 **“安全中心”** 按钮修改用户名、更新密码或开关认证保护。

### 3. 忘记密码如何重置？(Docker CLI 一键重置)
如果不慎忘记管理员密码，只需在宿主机执行以下命令，即可生成并打印新的临时密码：

```bash
docker exec -it rclonebrowser-next node dist/server/reset-password.js
```

---

## 🐳 Docker 快速部署指南

镜像已发布至 Docker Hub：`yadiman/rclonebrowser-next-gen:latest`

### 场景一：群晖 NAS (Synology Container Manager) 多挂载点部署

如果你在群晖上有多个跨存储池目录（例如 `/volume3/NAS`、`/volume1/NAS2`、`/volume2/homes/kevin/Photos`），推荐统一挂载到 `/media/` 子目录下，并配置 `LOCAL_MOUNTS` 环境变量以便在界面下拉框一键直达：

```yaml
services:
  rclonebrowser:
    image: yadiman/rclonebrowser-next-gen:latest
    container_name: rclonebrowser-next
    restart: unless-stopped
    ports:
      - "5800:5800"
    environment:
      # 群晖 DSM 7 的 /volume1/docker 默认有 ACL 权限限制，设为 0:0 可直接读写所有挂载卷
      - PUID=0
      - PGID=0
      - TZ=Asia/Shanghai
      - PORT=5800
      # 将多个本地挂载点注册为独立下拉存储源（在文件管理器下拉菜单一键直达）
      - LOCAL_MOUNTS=NAS=/media/NAS,NAS2=/media/NAS2,Photos=/media/Photos
    volumes:
      - /volume1/docker/rclonebrowser/config:/config
      - /volume3/NAS:/media/NAS
      - /volume1/NAS2:/media/NAS2
      - /volume2/homes/kevin/Photos:/media/Photos
```

启动并查看初始密码：

```bash
docker compose up -d
docker logs rclonebrowser-next
```

浏览器访问：`http://你的群晖IP:5800`

---

### 场景二：通用 Linux 单目录快速启动 (`docker run`)

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

## ⚙️ 环境变量说明

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `5800` | Web GUI 监听端口（默认兼容旧版 `5800`） |
| `PUID` | `1000` | 运行进程的用户 UID（群晖推荐设为 `0` 以避免 `/volume1/docker` ACL 限制） |
| `PGID` | `1000` | 运行进程的用户组 GID |
| `TZ` | `Asia/Shanghai` | 容器时区（影响日志时间与 Cron 定时任务触发时间） |
| `LOCAL_MOUNTS` | *(空)* | 额外多挂载点快捷注册，格式如：`NAS=/media/NAS,NAS2=/media/NAS2,Photos=/media/Photos` |
| `CONFIG_DIR` | `/config` | 配置文件、`auth.json` 与任务数据持久化目录 |
| `MEDIA_DIR` | `/media` | 本地数据卷主挂载目录 |

---

## 💻 从源码编译与本地开发

### 1. 手动编译并推送 Docker 镜像

```bash
git clone https://github.com/kevinzfjiang/rclonebrowser-next-gen.git
cd rclonebrowser-next-gen

docker build -t yadiman/rclonebrowser-next-gen:latest -t yadiman/rclonebrowser-next-gen:2.3 .
docker push yadiman/rclonebrowser-next-gen:latest
docker push yadiman/rclonebrowser-next-gen:2.3
```

### 2. 本地 Node.js 开发调试

```bash
npm install
npm run dev             # 同时启动后端 5800 与前端 Vite 热重载 5173
npm run build           # 生产环境构建
npm test                # 运行集成测试（含 Rclone 与 AuthService 安全测试）
npm run reset-password  # 重置管理员密码并输出新的临时密码
npm start               # 启动生产环境服务 (:5800)
```
