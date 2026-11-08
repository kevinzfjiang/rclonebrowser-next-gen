import cron, { ScheduledTask } from 'node-cron';
import parser from 'cron-parser';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { SCHEDULES_DB_PATH } from './config.js';
import { taskManager } from './taskManager.js';
import { ScheduleJob, TransferOperation, TransferOptions } from '../shared/types.js';

function computeNextRunIso(cronExpression: string): string | undefined {
  try {
    const interval = parser.parseExpression(cronExpression);
    return interval.next().toISOString();
  } catch {
    return undefined;
  }
}

class SchedulerService {
  private schedules: ScheduleJob[] = [];
  private activeCronHandles = new Map<string, ScheduledTask>();

  constructor() {
    this.loadSchedules();
    this.syncAllCronJobs();

    taskManager.onTaskComplete((task) => {
      if (task.scheduleId) {
        const job = this.schedules.find((s) => s.id === task.scheduleId);
        if (job) {
          job.lastRunStatus =
            task.status === 'completed'
              ? 'completed'
              : task.status === 'cancelled'
                ? 'cancelled'
                : 'failed';
          job.nextRunAt = job.enabled ? computeNextRunIso(job.cronExpression) : undefined;
          this.saveSchedules();
        }
      }
    });
  }

  private loadSchedules(): void {
    try {
      if (fs.existsSync(SCHEDULES_DB_PATH)) {
        this.schedules = JSON.parse(fs.readFileSync(SCHEDULES_DB_PATH, 'utf-8'));
      }
    } catch {
      this.schedules = [];
    }
  }

  private saveSchedules(): void {
    try {
      fs.writeFileSync(SCHEDULES_DB_PATH, JSON.stringify(this.schedules, null, 2), 'utf-8');
    } catch {
      // Ignore write error
    }
  }

  private syncAllCronJobs(): void {
    for (const handle of this.activeCronHandles.values()) {
      handle.stop();
    }
    this.activeCronHandles.clear();

    for (const job of this.schedules) {
      if (job.enabled && cron.validate(job.cronExpression)) {
        job.nextRunAt = computeNextRunIso(job.cronExpression);
        const taskHandle = cron.schedule(job.cronExpression, () => {
          this.triggerScheduleNow(job.id);
        });
        this.activeCronHandles.set(job.id, taskHandle);
      } else {
        job.nextRunAt = undefined;
      }
    }
    this.saveSchedules();
  }

  public listSchedules(): ScheduleJob[] {
    return this.schedules.map((s) => ({
      ...s,
      nextRunAt: s.enabled ? computeNextRunIso(s.cronExpression) : undefined,
    }));
  }

  public createSchedule(input: {
    name: string;
    cronExpression: string;
    operation: TransferOperation;
    srcRemote: string;
    srcPath: string;
    dstRemote: string;
    dstPath: string;
    enabled?: boolean;
    options?: TransferOptions;
  }): ScheduleJob {
    if (!cron.validate(input.cronExpression.trim())) {
      throw new Error(`无效的 Cron 表达式: "${input.cronExpression}"`);
    }

    const enabled = input.enabled !== undefined ? input.enabled : true;
    const job: ScheduleJob = {
      id: crypto.randomUUID(),
      name: input.name.trim() || '定时同步任务',
      enabled,
      cronExpression: input.cronExpression.trim(),
      operation: input.operation,
      srcRemote: input.srcRemote,
      srcPath: input.srcPath,
      dstRemote: input.dstRemote,
      dstPath: input.dstPath,
      options: input.options || {},
      nextRunAt: enabled ? computeNextRunIso(input.cronExpression.trim()) : undefined,
      createdAt: new Date().toISOString(),
    };

    this.schedules.unshift(job);
    this.syncAllCronJobs();
    return job;
  }

  public updateSchedule(
    id: string,
    patch: Partial<{
      name: string;
      enabled: boolean;
      cronExpression: string;
      operation: TransferOperation;
      srcRemote: string;
      srcPath: string;
      dstRemote: string;
      dstPath: string;
      options: TransferOptions;
    }>
  ): ScheduleJob {
    const job = this.schedules.find((s) => s.id === id);
    if (!job) {
      throw new Error('找不到该定时任务');
    }

    if (patch.cronExpression !== undefined) {
      if (!cron.validate(patch.cronExpression.trim())) {
        throw new Error(`无效的 Cron 表达式: "${patch.cronExpression}"`);
      }
      job.cronExpression = patch.cronExpression.trim();
    }

    if (patch.name !== undefined) job.name = patch.name.trim();
    if (patch.enabled !== undefined) job.enabled = patch.enabled;
    if (patch.operation !== undefined) job.operation = patch.operation;
    if (patch.srcRemote !== undefined) job.srcRemote = patch.srcRemote;
    if (patch.srcPath !== undefined) job.srcPath = patch.srcPath;
    if (patch.dstRemote !== undefined) job.dstRemote = patch.dstRemote;
    if (patch.dstPath !== undefined) job.dstPath = patch.dstPath;
    if (patch.options !== undefined) job.options = patch.options;

    this.syncAllCronJobs();
    return job;
  }

  public deleteSchedule(id: string): void {
    const handle = this.activeCronHandles.get(id);
    if (handle) {
      handle.stop();
      this.activeCronHandles.delete(id);
    }
    this.schedules = this.schedules.filter((s) => s.id !== id);
    this.saveSchedules();
  }

  public triggerScheduleNow(id: string) {
    const job = this.schedules.find((s) => s.id === id);
    if (!job) {
      throw new Error('找不到该定时任务');
    }

    const task = taskManager.createTask({
      name: `[定时] ${job.name}`,
      operation: job.operation,
      srcRemote: job.srcRemote,
      srcPath: job.srcPath,
      dstRemote: job.dstRemote,
      dstPath: job.dstPath,
      options: { ...job.options },
      triggeredBy: 'schedule',
      scheduleId: job.id,
    });

    job.lastRunAt = new Date().toISOString();
    job.lastRunStatus = 'running';
    job.lastTaskId = task.id;
    job.nextRunAt = job.enabled ? computeNextRunIso(job.cronExpression) : undefined;
    this.saveSchedules();

    return { job, task };
  }
}

export const schedulerService = new SchedulerService();
