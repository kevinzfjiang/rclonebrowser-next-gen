export type TransferOperation = 'copy' | 'move' | 'sync' | 'check';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface RemoteConfigParams {
  [key: string]: string;
}

export interface RemoteInfo {
  name: string;
  type: string;
  params: RemoteConfigParams;
  isLocalMedia?: boolean;
  rootPath?: string;
  proxyUrl?: string;
}

export interface RemoteFieldSchema {
  key: string;
  label: string;
  placeholder?: string;
  type: 'text' | 'password' | 'select' | 'boolean' | 'number';
  required?: boolean;
  options?: { label: string; value: string }[];
  helpText?: string;
  defaultValue?: string;
}

export interface RemoteProviderTemplate {
  type: string;
  name: string;
  subtitle: string;
  category: 'cloud' | 'protocol' | 'local' | 'virtual';
  badge: string;
  fields: RemoteFieldSchema[];
}

export interface FileEntry {
  Path: string;
  Name: string;
  Size: number;
  MimeType: string;
  ModTime: string;
  IsDir: boolean;
  ID?: string;
}

export interface StorageQuota {
  total?: number;
  used?: number;
  free?: number;
  trashed?: number;
  other?: number;
  supported: boolean;
}

export interface TransferOptions {
  dryRun?: boolean;
  bwlimit?: string;
  transfers?: number;
  checkers?: number;
  exclude?: string;
  ignoreGlobalExclude?: boolean;
  createEmptySrcDirs?: boolean;
  deleteExtraneous?: boolean;
}

export interface ActiveTransferringFile {
  name: string;
  size: number;
  bytes: number;
  percentage: number;
  speed: number;
}

export interface FailedTransferFile {
  file: string;
  error: string;
  timestamp: string;
}

export interface TransferTask {
  id: string;
  name: string;
  operation: TransferOperation;
  srcRemote: string; // e.g. 'local:/media' or 's3:'
  srcPath: string;   // e.g. 'photos/2026'
  dstRemote: string;
  dstPath: string;
  status: TaskStatus;
  progress: number;          // 0 - 100
  transferredBytes: number;
  totalBytes: number;
  speed: number;             // bytes/sec
  eta: number | null;        // seconds
  filesTransferred: number;
  totalFiles: number;
  checksDone: number;
  totalChecks: number;
  errorsCount: number;
  activeFiles: ActiveTransferringFile[];
  failedFiles?: FailedTransferFile[];
  options: TransferOptions;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  logs: string[];
  logFileName?: string;
  triggeredBy: 'manual' | 'schedule';
  scheduleId?: string;
}

export interface ScheduleJob {
  id: string;
  name: string;
  enabled: boolean;
  cronExpression: string;
  operation: TransferOperation;
  srcRemote: string;
  srcPath: string;
  dstRemote: string;
  dstPath: string;
  options: TransferOptions;
  lastRunAt?: string;
  lastRunStatus?: 'completed' | 'failed' | 'running' | 'cancelled';
  lastTaskId?: string;
  nextRunAt?: string;
  createdAt: string;
}

export interface SystemStatus {
  appName: string;
  appVersion: string;
  rcloneVersion: string;
  rcloneLatestVersion?: string;
  rcloneUpdateAvailable?: boolean;
  rcloneAvailable: boolean;
  osInfo: string;
  arch: string;
  goVersion: string;
  configPath: string;
  configDir: string;
  mediaDir: string;
  puid: string;
  pgid: string;
  authEnabled: boolean;
  globalBwLimit: string;
  globalExclude: string;
  activeTasksCount: number;
  totalSpeed: number;
  uptimeSeconds: number;
}
