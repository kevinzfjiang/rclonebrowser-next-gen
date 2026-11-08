import {
  FileEntry,
  RemoteConfigParams,
  RemoteInfo,
  RemoteProviderTemplate,
  ScheduleJob,
  StorageQuota,
  SystemStatus,
  TransferOperation,
  TransferOptions,
  TransferTask,
} from '../shared/types';

const TOKEN_STORAGE_KEY = 'rclonebrowser_next_token';

export function getAuthToken(): string {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
}

export function setAuthToken(token: string): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/')) {
    throw new Error('UNAUTHORIZED');
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (HTTP ${res.status})`);
  }
  return data as T;
}

export const api = {
  // Auth
  getAuthStatus: () =>
    requestJson<{
      authRequired: boolean;
      authenticated: boolean;
      username: string;
      mustChangePassword: boolean;
    }>('/api/auth/status'),

  login: (username: string, password: string) =>
    requestJson<{
      token: string;
      username: string;
      mustChangePassword: boolean;
      authRequired: boolean;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  updateSecurity: (payload: {
    currentPassword?: string;
    newUsername?: string;
    newPassword?: string;
    authEnabled?: boolean;
  }) =>
    requestJson<{
      token: string;
      username: string;
      authRequired: boolean;
      mustChangePassword: boolean;
    }>('/api/auth/update', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // System
  getSystemStatus: () => requestJson<SystemStatus>('/api/system/status'),

  setGlobalBwLimit: (bwlimit: string) =>
    requestJson<{ globalBwLimit: string }>('/api/system/bwlimit', {
      method: 'POST',
      body: JSON.stringify({ bwlimit }),
    }),

  // Remotes & Config
  getRemotes: () =>
    requestJson<{ remotes: RemoteInfo[]; templates: RemoteProviderTemplate[] }>('/api/remotes'),

  upsertRemote: (payload: {
    name: string;
    type: string;
    params: RemoteConfigParams;
    obscurePasswords?: boolean;
  }) =>
    requestJson<{ remotes: RemoteInfo[] }>('/api/remotes', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteRemote: (name: string) =>
    requestJson<{ remotes: RemoteInfo[] }>(`/api/remotes/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  getRemoteQuota: (name: string) =>
    requestJson<StorageQuota>(`/api/remotes/${encodeURIComponent(name)}/quota`),

  getRawConfig: () => requestJson<{ path: string; content: string }>('/api/config/raw'),

  saveRawConfig: (content: string) =>
    requestJson<{ remotes: RemoteInfo[]; path: string }>('/api/config/raw', {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  // File System
  listDirectory: (remote: string, path: string) =>
    requestJson<{ remote: string; path: string; entries: FileEntry[] }>(
      `/api/fs/list?remote=${encodeURIComponent(remote)}&path=${encodeURIComponent(path)}`
    ),

  makeDirectory: (remote: string, path: string) =>
    requestJson<{ success: boolean }>('/api/fs/mkdir', {
      method: 'POST',
      body: JSON.stringify({ remote, path }),
    }),

  deleteEntries: (remote: string, items: { path: string; isDir: boolean }[]) =>
    requestJson<{ success: boolean }>('/api/fs/delete', {
      method: 'POST',
      body: JSON.stringify({ remote, items }),
    }),

  renameEntry: (remote: string, oldPath: string, newPath: string) =>
    requestJson<{ success: boolean }>('/api/fs/rename', {
      method: 'POST',
      body: JSON.stringify({ remote, oldPath, newPath }),
    }),

  calculateDirSize: (remote: string, path: string) =>
    requestJson<{ count: number; bytes: number }>('/api/fs/size', {
      method: 'POST',
      body: JSON.stringify({ remote, path }),
    }),

  uploadFiles: (remote: string, path: string, files: FileList | File[]) => {
    const formData = new FormData();
    formData.append('remote', remote);
    formData.append('path', path);
    Array.from(files).forEach((f) => formData.append('files', f));
    return requestJson<{ success: boolean; count: number }>('/api/fs/upload', {
      method: 'POST',
      body: formData,
    });
  },

  getDownloadUrl: (remote: string, path: string, inline = false) => {
    const token = getAuthToken();
    const params = new URLSearchParams({
      remote,
      path,
      inline: inline ? '1' : '0',
    });
    if (token) {
      params.set('token', token);
    }
    return `/api/fs/download?${params.toString()}`;
  },

  // Tasks
  getTasks: () =>
    requestJson<{
      tasks: TransferTask[];
      activeStats: { activeTasksCount: number; totalSpeed: number };
      globalBwLimit: string;
    }>('/api/tasks'),

  createTask: (payload: {
    name?: string;
    operation: TransferOperation;
    srcRemote: string;
    srcPath?: string;
    dstRemote: string;
    dstPath?: string;
    items?: { path: string; name: string; isDir: boolean }[];
    options?: TransferOptions;
  }) =>
    requestJson<{ tasks: TransferTask[] }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  pauseTask: (id: string) =>
    requestJson<{ task: TransferTask }>(`/api/tasks/${encodeURIComponent(id)}/pause`, {
      method: 'POST',
    }),

  resumeTask: (id: string) =>
    requestJson<{ task: TransferTask }>(`/api/tasks/${encodeURIComponent(id)}/resume`, {
      method: 'POST',
    }),

  cancelTask: (id: string) =>
    requestJson<{ task: TransferTask }>(`/api/tasks/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
    }),

  retryTask: (id: string) =>
    requestJson<{ task: TransferTask }>(`/api/tasks/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
    }),

  deleteTask: (id: string) =>
    requestJson<{ success: boolean }>(`/api/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  clearCompletedTasks: () =>
    requestJson<{ tasks: TransferTask[] }>('/api/tasks/clear-completed', {
      method: 'POST',
    }),

  // Schedules
  getSchedules: () => requestJson<{ schedules: ScheduleJob[] }>('/api/schedules'),

  createSchedule: (payload: {
    name: string;
    cronExpression: string;
    operation: TransferOperation;
    srcRemote: string;
    srcPath: string;
    dstRemote: string;
    dstPath: string;
    enabled?: boolean;
    options?: TransferOptions;
  }) =>
    requestJson<{ schedule: ScheduleJob; schedules: ScheduleJob[] }>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateSchedule: (id: string, patch: Partial<ScheduleJob>) =>
    requestJson<{ schedule: ScheduleJob; schedules: ScheduleJob[] }>(
      `/api/schedules/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        body: JSON.stringify(patch),
      }
    ),

  deleteSchedule: (id: string) =>
    requestJson<{ schedules: ScheduleJob[] }>(`/api/schedules/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  triggerSchedule: (id: string) =>
    requestJson<{ job: ScheduleJob; task: TransferTask; schedules: ScheduleJob[] }>(
      `/api/schedules/${encodeURIComponent(id)}/trigger`,
      {
        method: 'POST',
      }
    ),
};
