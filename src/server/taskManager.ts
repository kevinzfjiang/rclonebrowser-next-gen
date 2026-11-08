import { ChildProcess, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { RCLONE_CONFIG_PATH, SETTINGS_DB_PATH, TASKS_DB_PATH } from './config.js';
import { resolveRcloneTarget } from './rcloneService.js';
import {
  TransferOperation,
  TransferOptions,
  TransferTask,
} from '../shared/types.js';

const MAX_LOG_LINES = 250;
const MAX_STORED_TASKS = 100;

interface ServerSettings {
  globalBwLimit: string;
  maxConcurrentTasks: number;
}

class TaskManager {
  private tasks: TransferTask[] = [];
  private activeProcesses = new Map<string, ChildProcess>();
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
    const running = this.tasks.filter((t) => t.status === 'running' || t.status === 'queued');
    const totalSpeed = running.reduce((acc, t) => acc + (t.speed || 0), 0);
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
    const opUpper = params.operation.toUpperCase();
    const defaultName =
      params.name ||
      `${opUpper}: ${params.srcRemote}:${params.srcPath || '/'} → ${params.dstRemote}:${params.dstPath || '/'}`;

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
      createdAt: new Date().toISOString(),
      logs: [`[${new Date().toLocaleTimeString()}] 任务已创建并加入执行队列 (${defaultName})`],
      triggeredBy: params.triggeredBy || 'manual',
      scheduleId: params.scheduleId,
    };

    this.tasks.unshift(task);
    if (this.tasks.length > MAX_STORED_TASKS) {
      this.tasks = this.tasks.slice(0, MAX_STORED_TASKS);
    }
    this.saveState();
    this.processQueue();
    return task;
  }

  public cancelTask(id: string): TransferTask {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) {
      throw new Error('找不到对应的任务');
    }
    if (task.status === 'queued') {
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      task.logs.push(`[${new Date().toLocaleTimeString()}] 用户在队列阶段取消了任务`);
      this.saveState();
      return task;
    }

    const proc = this.activeProcesses.get(id);
    if (proc) {
      task.status = 'cancelled';
      task.speed = 0;
      task.eta = null;
      task.activeFiles = [];
      task.completedAt = new Date().toISOString();
      task.logs.push(`[${new Date().toLocaleTimeString()}] 正在终止 Rclone 进程...`);
      proc.kill('SIGTERM');
      this.activeProcesses.delete(id);
      this.saveState();
      this.processQueue();
    }
    return task;
  }

  public retryTask(id: string): TransferTask {
    const orig = this.tasks.find((t) => t.id === id);
    if (!orig) {
      throw new Error('找不到对应的任务');
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
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.saveState();
  }

  public clearCompletedTasks(): void {
    this.tasks = this.tasks.filter((t) => t.status === 'running' || t.status === 'queued');
    this.saveState();
  }

  private appendLog(task: TransferTask, line: string): void {
    task.logs.push(line);
    if (task.logs.length > MAX_LOG_LINES) {
      task.logs.splice(0, task.logs.length - MAX_LOG_LINES);
    }
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

    this.executeRcloneTask(nextQueued);
    // Check if more slots available
    if (this.activeProcesses.size < this.settings.maxConcurrentTasks) {
      this.processQueue();
    }
  }

  private executeRcloneTask(task: TransferTask): void {
    task.status = 'running';
    task.startedAt = new Date().toISOString();

    const srcTarget = resolveRcloneTarget(task.srcRemote, task.srcPath);
    const dstTarget = resolveRcloneTarget(task.dstRemote, task.dstPath);

    const args: string[] = [
      task.operation,
      srcTarget.rcloneSpec,
      dstTarget.rcloneSpec,
      '--config',
      RCLONE_CONFIG_PATH,
      '--use-json-log',
      '--stats',
      '500ms',
      '-v',
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
    });

    this.activeProcesses.set(task.id, child);

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
          // Skip noisy empty stat lines
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
      this.activeProcesses.delete(task.id);
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
      this.activeProcesses.delete(task.id);

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
