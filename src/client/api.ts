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

export interface UploadProgressInfo {
  loaded: number;
  total: number;
  percent: number;
  speed: number; // bytes/sec
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
  getSystemStatus: (signal?: AbortSignal) =>
    requestJson<SystemStatus>('/api/system/status', { signal }),

  setGlobalBwLimit: (bwlimit: string) =>
    requestJson<{ globalBwLimit: string }>('/api/system/bwlimit', {
      method: 'POST',
      body: JSON.stringify({ bwlimit }),
    }),

  setGlobalExclude: (exclude: string) =>
    requestJson<{ globalExclude: string }>('/api/system/exclude', {
      method: 'POST',
      body: JSON.stringify({ exclude }),
    }),

  // Remotes & Config
  getRemotes: (signal?: AbortSignal) =>
    requestJson<{ remotes: RemoteInfo[]; templates: RemoteProviderTemplate[] }>('/api/remotes', {
      signal,
    }),

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

  getRemoteQuota: (name: string, signal?: AbortSignal) =>
    requestJson<StorageQuota>(`/api/remotes/${encodeURIComponent(name)}/quota`, { signal }),

  getRawConfig: () => requestJson<{ path: string; content: string }>('/api/config/raw'),

  saveRawConfig: (content: string) =>
    requestJson<{ remotes: RemoteInfo[]; path: string }>('/api/config/raw', {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  // File System
  listDirectory: (remote: string, path: string, signal?: AbortSignal) =>
    requestJson<{ remote: string; path: string; entries: FileEntry[] }>(
      `/api/fs/list?remote=${encodeURIComponent(remote)}&path=${encodeURIComponent(path)}`,
      { signal }
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

  uploadFiles: (
    remote: string,
    path: string,
    files: FileList | File[],
    options?: {
      onProgress?: (info: UploadProgressInfo) => void;
      signal?: AbortSignal;
    }
  ): Promise<{ success: boolean; count: number }> => {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('remote', remote);
      formData.append('path', path);
      Array.from(files).forEach((f) => formData.append('files', f));

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/fs/upload', true);
      const token = getAuthToken();
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      const startedAt = Date.now();
      let lastLoaded = 0;
      let lastTime = startedAt;

      xhr.upload.onprogress = (evt) => {
        if (!options?.onProgress || !evt.lengthComputable) return;
        const now = Date.now();
        const dt = (now - lastTime) / 1000;
        const speed =
          dt >= 0.25
            ? Math.max(0, (evt.loaded - lastLoaded) / dt)
            : Math.max(0, evt.loaded / Math.max(0.1, (now - startedAt) / 1000));
        if (dt >= 0.25) {
          lastLoaded = evt.loaded;
          lastTime = now;
        }
        options.onProgress({
          loaded: evt.loaded,
          total: evt.total,
          percent: evt.total > 0 ? Math.min(100, Math.round((evt.loaded / evt.total) * 100)) : 0,
          speed,
        });
      };

      const onAbort = () => {
        xhr.abort();
      };

      if (options?.signal) {
        if (options.signal.aborted) {
          reject(new DOMException('Upload aborted', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }

      const cleanup = () => {
        if (options?.signal) {
          options.signal.removeEventListener('abort', onAbort);
        }
      };

      xhr.onload = () => {
        cleanup();
        let data: any = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          data = {};
        }
        if (xhr.status === 401) {
          reject(new Error('UNAUTHORIZED'));
          return;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data as { success: boolean; count: number });
        } else {
          reject(new Error(data.error || `Request failed (HTTP ${xhr.status})`));
        }
      };

      xhr.onerror = () => {
        cleanup();
        reject(new Error('Network error during upload'));
      };

      xhr.onabort = () => {
        cleanup();
        reject(new DOMException('Upload cancelled', 'AbortError'));
      };

      xhr.send(formData);
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
  getTasks: (signal?: AbortSignal) =>
    requestJson<{
      tasks: TransferTask[];
      activeStats: { activeTasksCount: number; totalSpeed: number };
      globalBwLimit: string;
      globalExclude: string;
    }>('/api/tasks', { signal }),

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

  getTaskLogDownloadUrl: (id: string, inline = false) => {
    const token = getAuthToken();
    const params = new URLSearchParams({
      inline: inline ? '1' : '0',
    });
    if (token) {
      params.set('token', token);
    }
    return `/api/tasks/${encodeURIComponent(id)}/log?${params.toString()}`;
  },

  // Schedules
  getSchedules: (signal?: AbortSignal) =>
    requestJson<{ schedules: ScheduleJob[] }>('/api/schedules', { signal }),

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
