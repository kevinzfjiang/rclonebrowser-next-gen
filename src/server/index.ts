import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import {
  APP_PASSWORD,
  APP_USERNAME,
  CONFIG_DIR,
  ensureDirectoriesAndDefaults,
  MEDIA_DIR,
  PGID,
  PUID,
  RCLONE_CONFIG_PATH,
  SERVER_PORT,
  UPLOAD_TEMP_DIR,
} from './config.js';
import {
  calculateDirSize,
  createFileReadStream,
  deleteEntry,
  getRawConfig,
  getRcloneVersionInfo,
  getStorageQuota,
  listDirectory,
  listRemotes,
  makeDirectory,
  renameEntry,
   sanitizeRelPath,
  saveRawConfig,
  uploadLocalFilesToRemote,
  upsertRemote,
  deleteRemote,
} from './rcloneService.js';
import { taskManager } from './taskManager.js';
import { schedulerService } from './schedulerService.js';
import { REMOTE_PROVIDER_TEMPLATES } from '../shared/remoteTemplates.js';
import { SystemStatus, TransferOperation, TransferOptions } from '../shared/types.js';

ensureDirectoriesAndDefaults();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const SECRET_SALT = crypto.randomBytes(32).toString('hex');

function createAuthToken(username: string): string {
  return crypto
    .createHmac('sha256', SECRET_SALT)
    .update(`${username}:${APP_PASSWORD}`)
    .digest('hex');
}

function isTokenValid(token: string | undefined): boolean {
  if (!APP_PASSWORD) return true;
  if (!token) return false;
  const expected = createAuthToken(APP_USERNAME);
  return token === expected;
}

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!APP_PASSWORD) {
    next();
    return;
  }
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;

  if (isTokenValid(bearerToken || queryToken)) {
    next();
    return;
  }

  res.status(401).json({ error: '未授权访问，请先登录' });
}

// --- Auth Endpoints ---
app.get('/api/auth/status', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  res.json({
    authRequired: Boolean(APP_PASSWORD),
    authenticated: isTokenValid(bearerToken),
    username: APP_USERNAME,
  });
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  if (!APP_PASSWORD) {
    res.json({ token: 'no-auth-required', username: APP_USERNAME });
    return;
  }
  if (username === APP_USERNAME && password === APP_PASSWORD) {
    res.json({
      token: createAuthToken(APP_USERNAME),
      username: APP_USERNAME,
    });
    return;
  }
  res.status(401).json({ error: '用户名或密码错误' });
});

// Protect all other /api routes
app.use('/api', authMiddleware);

// --- System Status Endpoints ---
app.get('/api/system/status', async (_req: Request, res: Response) => {
  try {
    const rcloneInfo = await getRcloneVersionInfo();
    const activeStats = taskManager.getActiveStats();

    const status: SystemStatus = {
      appName: 'RcloneBrowser Next Gen',
      appVersion: '2.0.0',
      rcloneVersion: rcloneInfo.version,
      rcloneAvailable: rcloneInfo.available,
      osInfo: rcloneInfo.osInfo,
      arch: rcloneInfo.arch,
      goVersion: rcloneInfo.goVersion,
      configPath: RCLONE_CONFIG_PATH,
      configDir: CONFIG_DIR,
      mediaDir: MEDIA_DIR,
      puid: PUID,
      pgid: PGID,
      authEnabled: Boolean(APP_PASSWORD),
      globalBwLimit: taskManager.getGlobalBwLimit(),
      activeTasksCount: activeStats.activeTasksCount,
      totalSpeed: activeStats.totalSpeed,
      uptimeSeconds: Math.floor(process.uptime()),
    };
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '获取系统状态失败' });
  }
});

app.post('/api/system/bwlimit', (req: Request, res: Response) => {
  const { bwlimit } = req.body || {};
  const updated = taskManager.setGlobalBwLimit(String(bwlimit || 'off'));
  res.json({ globalBwLimit: updated });
});

// --- Remotes & Config Endpoints ---
app.get('/api/remotes', (_req: Request, res: Response) => {
  try {
    const remotes = listRemotes();
    res.json({
      remotes,
      templates: REMOTE_PROVIDER_TEMPLATES,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '读取 Remote 列表失败' });
  }
});

app.post('/api/remotes', async (req: Request, res: Response) => {
  try {
    const { name, type, params, obscurePasswords } = req.body || {};
    if (!name || !type) {
      res.status(400).json({ error: '请填写 Remote 名称与类型' });
      return;
    }
    const remotes = await upsertRemote(name, type, params || {}, obscurePasswords !== false);
    res.json({ remotes });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '保存 Remote 失败' });
  }
});

app.delete('/api/remotes/:name', (req: Request, res: Response) => {
  try {
    const remotes = deleteRemote(String(req.params.name));
    res.json({ remotes });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '删除 Remote 失败' });
  }
});

app.get('/api/remotes/:name/quota', async (req: Request, res: Response) => {
  try {
    const quota = await getStorageQuota(String(req.params.name));
    res.json(quota);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '获取存储空间配额失败' });
  }
});

app.get('/api/config/raw', (_req: Request, res: Response) => {
  try {
    res.json({
      path: RCLONE_CONFIG_PATH,
      content: getRawConfig(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '读取配置文件失败' });
  }
});

app.put('/api/config/raw', (req: Request, res: Response) => {
  try {
    const { content } = req.body || {};
    if (typeof content !== 'string') {
      res.status(400).json({ error: '配置内容格式无效' });
      return;
    }
    const remotes = saveRawConfig(content);
    res.json({ remotes, path: RCLONE_CONFIG_PATH });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '保存配置文件失败' });
  }
});

// --- File System & Remote Browser Endpoints ---
app.get('/api/fs/list', async (req: Request, res: Response) => {
  try {
    const remote = String(req.query.remote || '@media');
    const relPath = String(req.query.path || '');
    const entries = await listDirectory(remote, relPath);
    res.json({ remote, path: sanitizeRelPath(relPath), entries });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '列出目录内容失败' });
  }
});

app.post('/api/fs/mkdir', async (req: Request, res: Response) => {
  try {
    const { remote, path: relPath } = req.body || {};
    if (!remote || !relPath) {
      res.status(400).json({ error: '缺少 remote 或 path 参数' });
      return;
    }
    await makeDirectory(String(remote), String(relPath));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '创建文件夹失败' });
  }
});

app.post('/api/fs/delete', async (req: Request, res: Response) => {
  try {
    const { remote, items } = req.body || {};
    if (!remote || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: '请选择要删除的文件或目录' });
      return;
    }
    for (const item of items) {
      await deleteEntry(String(remote), String(item.path), Boolean(item.isDir));
    }
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '删除失败' });
  }
});

app.post('/api/fs/rename', async (req: Request, res: Response) => {
  try {
    const { remote, oldPath, newPath } = req.body || {};
    if (!remote || !oldPath || !newPath) {
      res.status(400).json({ error: '缺少重命名参数' });
      return;
    }
    await renameEntry(String(remote), String(oldPath), String(newPath));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '重命名或移动失败' });
  }
});

app.post('/api/fs/size', async (req: Request, res: Response) => {
  try {
    const { remote, path: relPath } = req.body || {};
    const sizeInfo = await calculateDirSize(String(remote || '@media'), String(relPath || ''));
    res.json(sizeInfo);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '计算目录大小失败' });
  }
});

const uploadMiddleware = multer({ dest: UPLOAD_TEMP_DIR });

app.post(
  '/api/fs/upload',
  uploadMiddleware.array('files', 50),
  async (req: Request, res: Response) => {
    try {
      const remote = String(req.body.remote || '@media');
      const destPath = String(req.body.path || '');
      const uploadedFiles = (req.files as Express.Multer.File[]) || [];

      if (uploadedFiles.length === 0) {
        res.status(400).json({ error: '没有收到上传的文件' });
        return;
      }

      await uploadLocalFilesToRemote(
        remote,
        destPath,
        uploadedFiles.map((f) => ({
          tempPath: f.path,
          originalName: Buffer.from(f.originalname, 'latin1').toString('utf8'),
        }))
      );

      res.json({ success: true, count: uploadedFiles.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '上传文件失败' });
    }
  }
);

app.get('/api/fs/download', (req: Request, res: Response) => {
  try {
    const remote = String(req.query.remote || '@media');
    const relPath = String(req.query.path || '');
    const inline = req.query.inline === '1' || req.query.inline === 'true';

    const { mimeType, fileName, stream, cleanup } = createFileReadStream(remote, relPath);
    res.setHeader('Content-Type', mimeType);
    const disposition = inline ? 'inline' : 'attachment';
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );

    stream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || '读取文件流失败' });
      }
      if (cleanup) cleanup();
    });

    res.on('close', () => {
      if (cleanup) cleanup();
    });

    stream.pipe(res);
  } catch (err: any) {
    res.status(404).json({ error: err.message || '下载文件失败' });
  }
});

// --- Transfer & Sync Task Center Endpoints ---
app.get('/api/tasks', (_req: Request, res: Response) => {
  res.json({
    tasks: taskManager.getTasks(),
    activeStats: taskManager.getActiveStats(),
    globalBwLimit: taskManager.getGlobalBwLimit(),
  });
});

app.post('/api/tasks', (req: Request, res: Response) => {
  try {
    const {
      name,
      operation,
      srcRemote,
      srcPath,
      dstRemote,
      dstPath,
      items,
      options,
    }: {
      name?: string;
      operation: TransferOperation;
      srcRemote: string;
      srcPath?: string;
      dstRemote: string;
      dstPath?: string;
      items?: { path: string; name: string; isDir: boolean }[];
      options?: TransferOptions;
    } = req.body || {};

    if (!operation || !srcRemote || !dstRemote) {
      res.status(400).json({ error: '缺少必要的任务参数 (operation, srcRemote, dstRemote)' });
      return;
    }

    const createdTasks = [];

    if (Array.isArray(items) && items.length > 0) {
      const cleanDstBase = sanitizeRelPath(dstPath || '');
      for (const item of items) {
        const targetDstPath = item.isDir
          ? sanitizeRelPath(cleanDstBase ? `${cleanDstBase}/${item.name}` : item.name)
          : cleanDstBase;
        const t = taskManager.createTask({
          name: `${operation.toUpperCase()}: ${item.name} → ${dstRemote}:${targetDstPath || '/'}`,
          operation,
          srcRemote,
          srcPath: sanitizeRelPath(item.path),
          dstRemote,
          dstPath: targetDstPath,
          options,
        });
        createdTasks.push(t);
      }
    } else {
      const t = taskManager.createTask({
        name,
        operation,
        srcRemote,
        srcPath: sanitizeRelPath(srcPath || ''),
        dstRemote,
        dstPath: sanitizeRelPath(dstPath || ''),
        options,
      });
      createdTasks.push(t);
    }

    res.json({ tasks: createdTasks });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建任务失败' });
  }
});

app.post('/api/tasks/clear-completed', (_req: Request, res: Response) => {
  taskManager.clearCompletedTasks();
  res.json({ tasks: taskManager.getTasks() });
});

app.post('/api/tasks/:id/cancel', (req: Request, res: Response) => {
  try {
    const task = taskManager.cancelTask(String(req.params.id));
    res.json({ task });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.post('/api/tasks/:id/retry', (req: Request, res: Response) => {
  try {
    const task = taskManager.retryTask(String(req.params.id));
    res.json({ task });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

app.delete('/api/tasks/:id', (req: Request, res: Response) => {
  taskManager.deleteTask(String(req.params.id));
  res.json({ success: true });
});

// --- Cron Scheduler Endpoints ---
app.get('/api/schedules', (_req: Request, res: Response) => {
  res.json({ schedules: schedulerService.listSchedules() });
});

app.post('/api/schedules', (req: Request, res: Response) => {
  try {
    const job = schedulerService.createSchedule(req.body || {});
    res.json({ schedule: job, schedules: schedulerService.listSchedules() });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建定时任务失败' });
  }
});

app.put('/api/schedules/:id', (req: Request, res: Response) => {
  try {
    const job = schedulerService.updateSchedule(String(req.params.id), req.body || {});
    res.json({ schedule: job, schedules: schedulerService.listSchedules() });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新定时任务失败' });
  }
});

app.delete('/api/schedules/:id', (req: Request, res: Response) => {
  schedulerService.deleteSchedule(String(req.params.id));
  res.json({ schedules: schedulerService.listSchedules() });
});

app.post('/api/schedules/:id/trigger', (req: Request, res: Response) => {
  try {
    const result = schedulerService.triggerScheduleNow(String(req.params.id));
    res.json({
      ...result,
      schedules: schedulerService.listSchedules(),
    });
  } catch (err: any) {
    res.status(404).json({ error: err.message || '触发定时任务失败' });
  }
});

// --- Serve Static Frontend in Production ---
const clientDistDir = path.resolve(process.cwd(), 'dist', 'client');
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get('*', (req: Request, res: Response) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDistDir, 'index.html'));
    }
  });
}

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(SERVER_PORT, '0.0.0.0', () => {
    console.log(`============================================================`);
    console.log(`🚀 RcloneBrowser Next Gen Server is running!`);
    console.log(`🌐 Web GUI URL    : http://0.0.0.0:${SERVER_PORT}`);
    console.log(`📂 Config Path    : ${RCLONE_CONFIG_PATH}`);
    console.log(`💾 Local Media    : ${MEDIA_DIR}`);
    console.log(`🔒 Auth Enabled   : ${APP_PASSWORD ? 'YES (Protected)' : 'NO (Open Mode)'}`);
    console.log(`============================================================`);
  });
}
