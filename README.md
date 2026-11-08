# RcloneBrowser Next Gen 🚀

**RcloneBrowser Next Gen** 是对传统 [kevinzfjiang/dockerfile/rclonebrowser](https://github.com/kevinzfjiang/dockerfile/blob/master/rclonebrowser/Dockerfile) 容器的彻底现代化重构。

彻底告别笨重的 **X11 + Openbox + noVNC + Qt5 桌面画面转发** 方案，采用 **现代原生 Web 前后端 (React + TypeScript + Tailwind CSS + Node.js) + 官方 Rclone 引擎** 构建，并打包为超轻量级 Alpine Docker 容器，同时 **100% 兼容旧版容器的端口 (`5800`) 与挂载目录 (`/config`、`/media`)**。

---

## ✨ 为什么升级到 RcloneBrowser Next Gen？

| 维度 | 旧版 RcloneBrowser 容器 (`jlesage/baseimage-gui`) | RcloneBrowser Next Gen (`v2.0`) |
| :--- | :--- | :--- |
| **交互体验** | 基于 X11/noVNC 远程桌面视频流，高延迟、字体发虚、移动端无法操作 | **原生响应式 Web 界面**，60fps 丝滑交互，支持拖拽上传、在线预览、双栏对比 |
| **底层依赖** | 需在 Alpine 中强装 `glibc`、编译已停更的 C++/Qt5 `Alkl58/RcloneBrowser` | **纯静态编译 Rclone + 轻量 Node.js 服务**，零 X11/Qt5 依赖，构建快速稳定 |
| **资源占用** | 闲置内存 ~350MB - 500MB | **闲置内存 ~40MB** |
| **功能扩展** | 仅限桌面版基础窗口 | 内置 **双栏多标签 Commander、实时任务队列、可视化配置向导、Cron 定时同步** |
| **旧版兼容性** | `/config`、`/media`、端口 `5800` | **完全兼容**，启动时自动检测并迁移旧版 `/config/xdg/config/rclone/rclone.conf` |

---

## 🛠️ 核心功能

1. **多标签 & 双栏 Commander 文件资源管理器 (`Explorer`)**
   - 支持 **双栏对比模式 (Split Commander)** 与 **单栏模式** 一键切换，每栏均支持独立多标签页。
   - 内置本地数据卷 `@media` (`/media`) 与任意云端 Remote 同屏浏览。
   - 支持 **拖拽上传文件**、**在线直接预览**（文本、代码、Markdown、JSON、图片、音视频）、文件流式下载、新建文件夹、重命名、批量删除、文件夹大小统计 (`rclone size`)。
   - 双栏一键 **复制到对侧 (`Copy →`)**、**移动到对侧 (`Move →`)**、**镜像同步目录 (`Sync ⇄`)**。
2. **传输与同步任务中心 (`Transfers & Sync Center`)**
   - 支持 `Copy`、`Sync`、`Move`、`Check` 异步任务队列。
   - 解析 `rclone --use-json-log --stats 500ms` 实时流，展示 **总体进度条、实时传输速率 (MB/s)、剩余时间 (ETA)、正在传输的子文件列表**。
   - 支持随时调整 **全局带宽限速 (`--bwlimit`)**、取消运行中任务、失败重试，以及展开查看 **Rclone 实时终端日志**。
3. **可视化 Remote 存储源管理 (`Remotes & Config`)**
   - 内置主流存储协议可视化创建/编辑向导：
     - **S3 兼容对象存储**（AWS S3、Cloudflare R2、MinIO、阿里云 OSS、腾讯云 COS、Backblaze B2）
     - **WebDAV**（Alist、OpenList、Nextcloud、OwnCloud、群晖 NAS）
     - **SFTP / SSH**、**SMB / CIFS 局域网共享**、**FTP**
     - **Google Drive**、**Microsoft OneDrive**（含世纪互联版）
     - **Alias 本地/远端路径映射**、**Crypt 端到端加密层**
   - 保存时自动调用 `rclone obscure` 对明文密码进行安全加密。
   - 内置 **`rclone.conf` 源文件在线编辑器**，支持一键导入/导出备份配置文件，以及 `rclone about` 容量测速。
4. **Cron 定时同步调度器 (`Cron Scheduler`)**
   - 在 Web 界面中配置周期性自动备份/同步任务（提供常用周期预设与自定义 5 段式 Cron 表达式）。
   - 支持随时启停、查看下次执行时间与历史状态，以及点击 **“立即运行一次”** 手动触发。

---

## 🐳 Docker 快速部署

### 方式一：使用 `docker-compose.yml` (推荐)

```yaml
services:
  rclonebrowser:
    build: .
    image: rclonebrowser-next-gen:latest
    container_name: rclonebrowser-next
    restart: unless-stopped
    ports:
      - "5800:5800"
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Asia/Shanghai
      - PORT=5800
      # 可选：设置 Web 登录密码，留空则免密直接进入
      - APP_USERNAME=admin
      - APP_PASSWORD=
    volumes:
      - ./config:/config
      - ./media:/media
```

启动容器：

```bash
docker compose up -d --build
```

浏览器访问：`http://localhost:5800`

### 方式二：使用 `docker run` 命令

```bash
docker build -t rclonebrowser-next-gen .

docker run -d \
  --name=rclonebrowser-next \
  -p 5800:5800 \
  -e PUID=1000 \
  -e PGID=1000 \
  -e TZ=Asia/Shanghai \
  -e APP_USERNAME=admin \
  -e APP_PASSWORD=your_secret_password \
  -v /path/to/config:/config \
  -v /path/to/media:/media \
  --restart unless-stopped \
  rclonebrowser-next-gen
```

---

## ⚙️ 环境变量说明

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `5800` | Web GUI 监听端口（默认兼容旧版 `5800`） |
| `PUID` | `1000` | 运行进程的用户 UID，解决挂载卷文件权限问题 |
| `PGID` | `1000` | 运行进程的用户组 GID |
| `TZ` | `Asia/Shanghai` | 容器时区（影响日志时间与 Cron 定时任务触发时间） |
| `APP_USERNAME` | `admin` | Web 控制台登录用户名 |
| `APP_PASSWORD` | *(空)* | Web 控制台登录密码。若留空则免密直接访问；若设置则强制要求登录 |
| `CONFIG_DIR` | `/config` | 配置文件与任务数据持久化目录 |
| `MEDIA_DIR` | `/media` | 本地数据卷挂载目录 |

---

## 💻 本地开发与调试

本地需安装 `Node.js >= 20` 与 `rclone` CLI：

```bash
# 1. 安装依赖
npm install

# 2. 启动开发模式 (同时启动后端 5800 与前端 Vite 热重载 5173)
npm run dev

# 3. 生产环境打包与启动
npm run build
npm start
```
