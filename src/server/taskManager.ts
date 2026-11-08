import { ChildProcess, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { LOGS_DIR, RCLONE_CONFIG_PATH, SETTINGS_DB_PATH, TASKS_DB_PATH } from './config.js';
import {
  buildRcloneProxyEnvAndArgs,
  getRemoteProxyUrl,
  resolveRcloneTarget,
} from './rcloneService.js';
import {
  TransferOperation,
  TransferOptions,
  TransferTask,
} from '../shared/types.js';

const MAX_LOG_LINES = 250;
const MAX_STORED_TASKS = 100;
const MAX_LOG_FILES = 100;
const MAX_SINGLE_LOG_BYTES = 50 * 1024 * 1024; // 50 MB safety cap per log file

function buildLogFileName(operation: string, id: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const cleanOp = operation.toLowerCase().replace(/[^a-z0-9]/g, '') || 'task';
  const shortId = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'log';
  return `${datePart}_${cleanOp}_${shortId}.log`;
}

interface ServerSettings {
  globalBwLimit: string;
  maxConcurrentTasks: number;
}

function getFreeLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close((err) => {
        if (err || !port) reject(err || new Error('Failed to allocate port'));
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

function waitForLocalPort(port: number, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const sock = net.createConnection({ host: '127.0.0.1', port });
      sock.once('connect', () => {
        sock.destroy();
        resolve();
      });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`本地代理桥接端口 127.0.0.1:${port} 启动超时`));
        } else {
          setTimeout(tryConnect, 120);
        }
      });
    };
    tryConnect();
  });
}

class TaskManager {
  private tasks: TransferTask[] = [];
  private activeProcesses = new Map<string, ChildProcess[]>();
  private settings: ServerSettings = {
    globalBwLimit: 'off',
    maxConcurrentTasks: 3,
  };
  private onTaskCompleteCallbacks: Array<(task: TransferTask) => void> = [];

  constructor() {
    this.loadState();
  }

  private loadState(): void {
    try {
      if (fs.existsSync(SETTINGS_DB_PATH)) {
        const rawSettings = JSON.parse(fs.readFileSync(SETTINGS_DB_PATH, 'utf-8'));
        this.settings = { ...this.settings, ...rawSettings };
      }
    } catch {
      // Ignore corrupt settings
    }

    try {
      if (fs.existsSync(TASKS_DB_PATH)) {
        const loaded: TransferTask[] = JSON.parse(fs.readFileSync(TASKS_DB_PATH, 'utf-8'));
        // Reset any interrupted running/queued tasks on server restart
        this.tasks = loaded.map((t) =>
          t.status === 'running' || t.status === 'queued'
            ? {
                ...t,
                status: 'cancelled',
                completedAt: new Date().toISOString(),
                error: '服务重启导致任务中断',
              }
            : t
        );
      }
    } catch {
      this.tasks = [];
    }
  }

  private saveState(): void {
    try {
      const trimmed = this.tasks.slice(0, MAX_STORED_TASKS);
      fs.writeFileSync(TASKS_DB_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');
    } catch {
      // Ignore write errors
    }
  }

  private saveSettings(): void {
    try {
      fs.writeFileSync(SETTINGS_DB_PATH, JSON.stringify(this.settings, null, 2), 'utf-8');
    } catch {
      // Ignore
    }
  }

  public onTaskComplete(cb: (task: TransferTask) => void): void {
    this.onTaskCompleteCallbacks.push(cb);
  }

  public getGlobalBwLimit(): string {
    return this.settings.globalBwLimit || 'off';
  }

  public setGlobalBwLimit(limit: string): string {
    this.settings.globalBwLimit = limit.trim() || 'off';
    this.saveSettings();
    return this.settings.globalBwLimit;
  }

  public getTasks(): TransferTask[] {
    return this.tasks;
  }

  public getTaskById(id: string): TransferTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  public getActiveStats(): { activeTasksCount: number; totalSpeed: number } {
    const running = this.tasks.filter(
      (t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused'
    );
    const totalSpeed = running.reduce(
      (acc, t) => acc + (t.status === 'running' ? t.speed || 0 : 0),
      0
    );
    return {
      activeTasksCount: running.length,
      totalSpeed,
    };
  }

  public createTask(params: {
    name?: string;
    operation: TransferOperation;
    srcRemote: string;
    srcPath: string;
    dstRemote: string;
    dstPath: string;
    options?: TransferOptions;
    triggeredBy?: 'manual' | 'schedule';
    scheduleId?: string;
  }): TransferTask {
    const id = crypto.randomUUID();
    const now = new Date();
    const opUpper = params.operation.toUpperCase();
    const defaultName =
      params.name ||
      `${opUpper}: ${params.srcRemote}:${params.srcPath || '/'} → ${params.dstRemote}:${params.dstPath || '/'}`;
    const logFileName = buildLogFileName(params.operation, id, now);

    const task: TransferTask = {
      id,
      name: defaultName,
      operation: params.operation,
      srcRemote: params.srcRemote,
      srcPath: params.srcPath,
      dstRemote: params.dstRemote,
      dstPath: params.dstPath,
      status: 'queued',
      progress: 0,
      transferredBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: null,
      filesTransferred: 0,
      totalFiles: 0,
      checksDone: 0,
      totalChecks: 0,
      errorsCount: 0,
      activeFiles: [],
      options: params.options || {},
      createdAt: now.toISOString(),
      logs: [],
      logFileName,
      triggeredBy: params.triggeredBy || 'manual',
      scheduleId: params.scheduleId,
    };

    this.initTaskLogFile(task);
    this.appendLog(task, `[${now.toLocaleTimeString()}] Task created and queued (${defaultName})`);

    this.tasks.unshift(task);
    if (this.tasks.length > MAX_STORED_TASKS) {
      this.tasks = this.tasks.slice(0, MAX_STORED_TASKS);
    }
    this.saveState();
    this.cleanupOldLogFiles();
    this.processQueue();
    return task;
  }

  private killTaskProcesses(id: string): void {
    const procs = this.activeProcesses.get(id);
    if (procs) {
      for (const p of procs) {
        try {
          if (!p.killed) p.kill('SIGTERM');
        } catch {
          // Ignore
        }
      }
      this.activeProcesses.delete(id);
    }
  }

  public pauseTask(id: string): TransferTask {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) {
      throw new Error('Task not found');
    }
    if (task.status === 'queued') {
      task.status = 'paused';
      task.speed = 0;
      task.eta = null;
      this.appendLog(task, `[PAUSED] Task paused in queue (${new Date().toLocaleTimeString()})`);
      this.saveState();
      return task;
    }
    if (task.status !== 'running') {
      throw new Error('Only running or queued tasks can be paused');
    }

    task.status = 'paused';
    task.speed = 0;
    task.eta = null;
    this.appendLog(task, `[PAUSED] Task execution paused (${new Date().toLocaleTimeString()})`);

    const procs = this.activeProcesses.get(id);
    if (procs && procs.length > 0) {
      if (process.platform !== 'win32') {
        for (const p of procs) {
          try {
            p.kill('SIGSTOP');
          } catch {
            // Fallback if SIGSTOP fails
          }
        }
      } else {
        // On Windows where POSIX SIGSTOP is unavailable, stop the process and resume via idempotent rclone restart
        this.killTaskProcesses(id);
      }
    }
    this.saveState();
    return task;
  }

  public resumeTask(id: string): TransferTask {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) {
      throw new Error('Task not found');
    }
    if (task.status !== 'paused') {
      throw new Error('Only paused tasks can be resumed');
    }

    const procs = this.activeProcesses.get(id);
    if (procs && procs.length > 0 && process.platform !== 'win32') {
      for (const p of procs) {
        try {
          p.kill('SIGCONT');
        } catch {
          // Ignore
        }
      }
      task.status = 'running';
      this.appendLog(task, `[RESUMED] Task execution resumed (${new Date().toLocaleTimeString()})`);
      this.saveState();
      return task;
    }

    // Re-queue to resume transfer from where it left off
    task.status = 'queued';
    this.appendLog(task, `[RESUMED] Task resumed and queued (${new Date().toLocaleTimeString()})`);
    this.saveState();
    this.processQueue();
    return task;
  }

  public cancelTask(id: string): TransferTask {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) {
      throw new Error('Task not found');
    }
    if (task.status === 'queued' || (task.status === 'paused' && !this.activeProcesses.has(id))) {
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      this.appendLog(task, `[${new Date().toLocaleTimeString()}] Task cancelled by user`);
      this.saveState();
      return task;
    }

    if (this.activeProcesses.has(id)) {
      const procs = this.activeProcesses.get(id);
      if (procs && process.platform !== 'win32') {
        for (const p of procs) {
          try {
            p.kill('SIGCONT');
          } catch {
            // Ensure stopped processes receive SIGTERM
          }
        }
      }
      task.status = 'cancelled';
      task.speed = 0;
      task.eta = null;
      task.activeFiles = [];
      task.completedAt = new Date().toISOString();
      this.appendLog(task, `[${new Date().toLocaleTimeString()}] Terminating Rclone process...`);
      this.killTaskProcesses(id);
      this.saveState();
      this.processQueue();
    }
    return task;
  }

  public retryTask(id: string): TransferTask {
    const orig = this.tasks.find((t) => t.id === id);
    if (!orig) {
      throw new Error('Task not found');
    }
    return this.createTask({
      name: orig.name,
      operation: orig.operation,
      srcRemote: orig.srcRemote,
      srcPath: orig.srcPath,
      dstRemote: orig.dstRemote,
      dstPath: orig.dstPath,
      options: { ...orig.options },
      triggeredBy: 'manual',
    });
  }

  public deleteTask(id: string): void {
    if (this.activeProcesses.has(id)) {
      this.cancelTask(id);
    }
    const target = this.tasks.find((t) => t.id === id);
    if (target?.logFileName) {
      try {
        const logPath = path.join(LOGS_DIR, path.basename(target.logFileName));
        if (fs.existsSync(logPath)) {
          fs.unlinkSync(logPath);
        }
      } catch {
        // Ignore file deletion error
      }
    }
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.saveState();
  }

  public clearCompletedTasks(): void {
    this.tasks = this.tasks.filter(
      (t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused'
    );
    this.saveState();
  }

  private ensureTaskLogFileName(task: TransferTask): string {
    if (!task.logFileName) {
      task.logFileName = buildLogFileName(
        task.operation,
        task.id,
        task.createdAt ? new Date(task.createdAt) : new Date()
      );
    }
    return path.basename(task.logFileName);
  }

  private initTaskLogFile(task: TransferTask): void {
    try {
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }
      const fileName = this.ensureTaskLogFileName(task);
      const filePath = path.join(LOGS_DIR, fileName);
      const header = [
        '================================================================================',
        'RcloneBrowser Next Gen - Transfer Task Log',
        `Task ID      : ${task.id}`,
        `Task Name    : ${task.name}`,
        `Operation    : ${task.operation.toUpperCase()}`,
        `Source       : ${task.srcRemote}:${task.srcPath || '/'}`,
        `Destination  : ${task.dstRemote}:${task.dstPath || '/'}`,
        `Created At   : ${task.createdAt}`,
        '================================================================================',
        '',
      ].join('\n');
      fs.writeFileSync(filePath, header, 'utf-8');
    } catch {
      // Ignore file init error
    }
  }

  private appendLog(task: TransferTask, line: string): void {
    task.logs.push(line);
    if (task.logs.length > MAX_LOG_LINES) {
      task.logs.splice(0, task.logs.length - MAX_LOG_LINES);
    }

    try {
      if (!fs.existsSync(LOGS_DIR)) {
        fs.mkdirSync(LOGS_DIR, { recursive: true });
      }
      const fileName = this.ensureTaskLogFileName(task);
      const filePath = path.join(LOGS_DIR, fileName);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.size >= MAX_SINGLE_LOG_BYTES) {
          return;
        }
      } else {
        this.initTaskLogFile(task);
      }
      const timestamp = new Date().toISOString();
      fs.appendFileSync(filePath, `[${timestamp}] ${line}\n`, 'utf-8');
    } catch {
      // Ignore disk write errors
    }
  }

  private cleanupOldLogFiles(): void {
    try {
      if (!fs.existsSync(LOGS_DIR)) return;
      const entries = fs
        .readdirSync(LOGS_DIR)
        .filter((f) => f.endsWith('.log'))
        .map((name) => {
          const fullPath = path.join(LOGS_DIR, name);
          const stat = fs.statSync(fullPath);
          return { name, fullPath, mtimeMs: stat.mtimeMs };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      if (entries.length > MAX_LOG_FILES) {
        for (const oldEntry of entries.slice(MAX_LOG_FILES)) {
          try {
            fs.unlinkSync(oldEntry.fullPath);
          } catch {
            // Ignore
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  public getTaskLogFilePath(id: string): { filePath: string; fileName: string } {
    const task = this.getTaskById(id);
    if (!task) {
      throw new Error('Task not found');
    }
    const fileName = this.ensureTaskLogFileName(task);
    const filePath = path.join(LOGS_DIR, fileName);
    if (!fs.existsSync(filePath)) {
      this.initTaskLogFile(task);
      if (task.logs.length > 0) {
        fs.appendFileSync(filePath, task.logs.join('\n') + '\n', 'utf-8');
      }
      this.saveState();
    }
    return { filePath, fileName };
  }

  private processQueue(): void {
    const runningCount = this.activeProcesses.size;
    if (runningCount >= this.settings.maxConcurrentTasks) {
      return;
    }

    const nextQueued = this.tasks
      .slice()
      .reverse()
      .find((t) => t.status === 'queued');

    if (!nextQueued) return;

    this.executeRcloneTask(nextQueued).catch((err) => {
      nextQueued.status = 'failed';
      nextQueued.error = err.message;
      nextQueued.completedAt = new Date().toISOString();
      this.appendLog(nextQueued, `[ERROR] ${err.message}`);
      this.saveState();
      this.processQueue();
    });

    if (this.activeProcesses.size < this.settings.maxConcurrentTasks) {
      this.processQueue();
    }
  }

  private async executeRcloneTask(task: TransferTask): Promise<void> {
    task.status = 'running';
    task.startedAt = new Date().toISOString();

    const srcTarget = resolveRcloneTarget(task.srcRemote, task.srcPath);
    const dstTarget = resolveRcloneTarget(task.dstRemote, task.dstPath);

    const srcProxy = getRemoteProxyUrl(task.srcRemote);
    const dstProxy = getRemoteProxyUrl(task.dstRemote);

    const managedProcs: ChildProcess[] = [];
    this.activeProcesses.set(task.id, managedProcs);

    let effectiveSrcSpec = srcTarget.rcloneSpec;
    let mainProxyUrl = '';
    const extraMainArgs: string[] = [];

    // Determine proxy strategy:
    // 1. If src is local, only dst needs network -> use dstProxy
    // 2. If dst is local, only src needs network -> use srcProxy
    // 3. If both are remote and share the same proxy (or both empty) -> use srcProxy
    // 4. If both are remote and have DIFFERENT proxy settings (e.g. GDrive A [Proxy A] -> GDrive B [Proxy B] or OneDrive [No Proxy]):
    //    Spawn an isolated local WebDAV loopback bridge for srcRemote with srcProxy, and run main transfer with dstProxy!
    if (srcTarget.isDirectLocal) {
      mainProxyUrl = dstProxy;
      this.appendLog(
        task,
        `[PROXY] 本地源 → 远端 (${task.dstRemote}) 代理: ${dstProxy || '直连 (无代理)'}`
      );
    } else if (dstTarget.isDirectLocal) {
      mainProxyUrl = srcProxy;
      this.appendLog(
        task,
        `[PROXY] 远端 (${task.srcRemote}) → 本地目标 代理: ${srcProxy || '直连 (无代理)'}`
      );
    } else if (srcProxy === dstProxy) {
      mainProxyUrl = srcProxy;
      this.appendLog(
        task,
        `[PROXY] 源端与目标端统一代理策略: ${srcProxy || '直连 (无代理)'}`
      );
    } else {
      // Isolated Dual-Proxy Bridge Mode!
      const bridgePort = await getFreeLocalPort();
      const srcProxyConfig = buildRcloneProxyEnvAndArgs(srcProxy);
      const bridgeArgs = [
        'serve',
        'webdav',
        srcTarget.rcloneSpec,
        '--addr',
        `127.0.0.1:${bridgePort}`,
        '--config',
        RCLONE_CONFIG_PATH,
        ...srcProxyConfig.extraArgs,
      ];

      this.appendLog(
        task,
        `[PROXY] 检测到跨存储独立代理策略！源 [${task.srcRemote}]: ${
          srcProxy || '直连'
        } | 目标 [${task.dstRemote}]: ${dstProxy || '直连'}`
      );
      this.appendLog(
        task,
        `[PROXY] 启动源端独立代理桥接服务 (127.0.0.1:${bridgePort})...`
      );

      const bridgeProc = spawn('rclone', bridgeArgs, {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: srcProxyConfig.env,
      });
      managedProcs.push(bridgeProc);

      await waitForLocalPort(bridgePort, 6000);

      effectiveSrcSpec = ':webdav:';
      extraMainArgs.push('--webdav-url', `http://127.0.0.1:${bridgePort}`);
      mainProxyUrl = dstProxy;
    }

    const mainProxyConfig = buildRcloneProxyEnvAndArgs(mainProxyUrl);

    const args: string[] = [
      task.operation,
      effectiveSrcSpec,
      dstTarget.rcloneSpec,
      '--config',
      RCLONE_CONFIG_PATH,
      '--use-json-log',
      '--stats',
      '500ms',
      '-v',
      ...mainProxyConfig.extraArgs,
      ...extraMainArgs,
    ];

    if (task.options.dryRun) {
      args.push('--dry-run');
    }

    const bwlimit =
      task.options.bwlimit && task.options.bwlimit !== 'off'
        ? task.options.bwlimit
        : this.settings.globalBwLimit !== 'off'
          ? this.settings.globalBwLimit
          : '';

    if (bwlimit) {
      args.push('--bwlimit', bwlimit);
    }

    if (task.options.transfers && task.options.transfers > 0) {
      args.push('--transfers', String(task.options.transfers));
    }

    if (task.options.checkers && task.options.checkers > 0) {
      args.push('--checkers', String(task.options.checkers));
    }

    if (task.options.createEmptySrcDirs) {
      args.push('--create-empty-src-dirs');
    }

    if (task.options.exclude) {
      const patterns = task.options.exclude
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      for (const pat of patterns) {
        args.push('--exclude', pat);
      }
    }

    this.appendLog(task, `[CMD] rclone ${args.join(' ')}`);

    const child = spawn('rclone', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: mainProxyConfig.env,
    });

    managedProcs.push(child);

    let stderrBuffer = '';

    const handleLine = (rawLine: string) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.stats) {
          const s = parsed.stats;
          task.transferredBytes = s.bytes || 0;
          task.totalBytes = s.totalBytes || 0;
          task.speed = s.speed || 0;
          task.eta = typeof s.eta === 'number' ? s.eta : null;
          task.filesTransferred = s.transfers || 0;
          task.totalFiles = s.totalTransfers || 0;
          task.checksDone = s.checks || 0;
          task.totalChecks = s.totalChecks || 0;
          task.errorsCount = s.errors || 0;

          if (task.totalBytes > 0) {
            task.progress = Math.min(99, Math.round((task.transferredBytes / task.totalBytes) * 100));
          } else if (task.totalFiles > 0) {
            task.progress = Math.min(99, Math.round((task.filesTransferred / task.totalFiles) * 100));
          }

          if (Array.isArray(s.transferring)) {
            task.activeFiles = s.transferring.map((tf: any) => ({
              name: tf.name || 'unknown',
              size: tf.size || 0,
              bytes: tf.bytes || 0,
              percentage: tf.percentage || 0,
              speed: tf.speed || 0,
            }));
          } else {
            task.activeFiles = [];
          }
        } else if (parsed.msg) {
          const level = (parsed.level || 'info').toUpperCase();
          const objPrefix = parsed.object ? `[${parsed.object}] ` : '';
          const msgClean = String(parsed.msg).trim();
          if (!msgClean.startsWith('Transferred:')) {
            this.appendLog(task, `[${level}] ${objPrefix}${msgClean}`);
          }
          if (parsed.level === 'error' || parsed.level === 'critical') {
            task.error = msgClean;
          }
        }
      } catch {
        this.appendLog(task, trimmed);
      }
    };

    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf-8');
      const lines = stderrBuffer.split(/\r?\n/);
      stderrBuffer = lines.pop() || '';
      for (const l of lines) {
        handleLine(l);
      }
    });

    child.stdout.on('data', (chunk: Buffer) => {
      const lines = chunk.toString('utf-8').split(/\r?\n/);
      for (const l of lines) {
        if (l.trim()) this.appendLog(task, l.trim());
      }
    });

    child.on('error', (err) => {
      this.killTaskProcesses(task.id);
      task.status = 'failed';
      task.speed = 0;
      task.eta = null;
      task.activeFiles = [];
      task.completedAt = new Date().toISOString();
      task.error = err.message;
      this.appendLog(task, `[ERROR] 进程启动失败: ${err.message}`);
      this.saveState();
      this.notifyTaskComplete(task);
      this.processQueue();
    });

    child.on('close', (code) => {
      if (stderrBuffer.trim()) {
        handleLine(stderrBuffer);
      }
      this.killTaskProcesses(task.id);

      if (task.status === 'paused') {
        // Process was stopped on Windows to pause; keep status as 'paused'
        this.saveState();
        this.processQueue();
        return;
      }

      if (task.status === 'cancelled') {
        this.appendLog(task, `[CANCELLED] 任务已取消`);
      } else if (code === 0) {
        task.status = 'completed';
        task.progress = 100;
        if (task.totalBytes > 0) {
          task.transferredBytes = task.totalBytes;
        }
        task.speed = 0;
        task.eta = 0;
        task.activeFiles = [];
        task.completedAt = new Date().toISOString();
        this.appendLog(task, `[SUCCESS] 任务执行完成 (Exit Code 0)`);
      } else {
        task.status = 'failed';
        task.speed = 0;
        task.eta = null;
        task.activeFiles = [];
        task.completedAt = new Date().toISOString();
        if (!task.error) {
          task.error = `Rclone 退出码异常 (Exit Code ${code})`;
        }
        this.appendLog(task, `[FAILED] 任务失败 (Exit Code ${code})`);
      }

      this.saveState();
      this.notifyTaskComplete(task);
      this.processQueue();
    });
  }

  private notifyTaskComplete(task: TransferTask): void {
    for (const cb of this.onTaskCompleteCallbacks) {
      try {
        cb(task);
      } catch {
        // Ignore callback error
      }
    }
  }
}

export const taskManager = new TaskManager();
