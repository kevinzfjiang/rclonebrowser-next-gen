import { FileEntry, StorageQuota } from '../../shared/types';

export interface CachedDirectoryEntry {
  entries: FileEntry[];
  updatedAt: number;
  isStale: boolean;
}

export interface CachedQuotaEntry {
  quota: StorageQuota;
  updatedAt: number;
  isStale: boolean;
}

const DIR_FRESH_TTL_MS = 60 * 1000; // 60s fresh window (zero re-fetch)
const DIR_MAX_AGE_MS = 10 * 60 * 1000; // 10m SWR window (instant render + silent revalidate)
const DIR_CACHE_MAX_ENTRIES = 120;

const QUOTA_FRESH_TTL_MS = 3 * 60 * 1000; // 3m fresh window
const QUOTA_MAX_AGE_MS = 15 * 60 * 1000; // 15m SWR window

interface DirRecord {
  remote: string;
  path: string;
  entries: FileEntry[];
  updatedAt: number;
}

interface QuotaRecord {
  quota: StorageQuota;
  updatedAt: number;
}

const dirCache = new Map<string, DirRecord>();
const quotaCache = new Map<string, QuotaRecord>();

export function normalizeCachePath(path: string): string {
  return (path || '').replace(/^\/+/, '').replace(/\/+$/, '');
}

export function makeDirCacheKey(remote: string, path: string): string {
  return `${remote}\0${normalizeCachePath(path)}`;
}

export function getCachedDirectory(remote: string, path: string): CachedDirectoryEntry | null {
  const key = makeDirCacheKey(remote, path);
  const record = dirCache.get(key);
  if (!record) return null;

  const age = Date.now() - record.updatedAt;
  if (age > DIR_MAX_AGE_MS) {
    dirCache.delete(key);
    return null;
  }

  // Refresh LRU recency
  dirCache.delete(key);
  dirCache.set(key, record);

  return {
    entries: record.entries,
    updatedAt: record.updatedAt,
    isStale: age > DIR_FRESH_TTL_MS,
  };
}

export function setCachedDirectory(remote: string, path: string, entries: FileEntry[]): void {
  const cleanPath = normalizeCachePath(path);
  const key = makeDirCacheKey(remote, cleanPath);

  if (dirCache.has(key)) {
    dirCache.delete(key);
  } else if (dirCache.size >= DIR_CACHE_MAX_ENTRIES) {
    const oldestKey = dirCache.keys().next().value;
    if (oldestKey !== undefined) {
      dirCache.delete(oldestKey);
    }
  }

  dirCache.set(key, {
    remote,
    path: cleanPath,
    entries,
    updatedAt: Date.now(),
  });
}

export function invalidateDirectoryCache(
  remote: string,
  path?: string,
  includeDescendants = false
): void {
  if (path === undefined) {
    for (const [key, record] of dirCache.entries()) {
      if (record.remote === remote) {
        dirCache.delete(key);
      }
    }
    return;
  }

  const cleanPath = normalizeCachePath(path);
  dirCache.delete(makeDirCacheKey(remote, cleanPath));

  if (includeDescendants) {
    const prefix = cleanPath ? `${cleanPath}/` : '';
    for (const [key, record] of dirCache.entries()) {
      if (record.remote !== remote) continue;
      if (!prefix || record.path === cleanPath || record.path.startsWith(prefix)) {
        dirCache.delete(key);
      }
    }
  }
}

export function getCachedQuota(remote: string): CachedQuotaEntry | null {
  const record = quotaCache.get(remote);
  if (!record) return null;

  const age = Date.now() - record.updatedAt;
  if (age > QUOTA_MAX_AGE_MS) {
    quotaCache.delete(remote);
    return null;
  }

  return {
    quota: record.quota,
    updatedAt: record.updatedAt,
    isStale: age > QUOTA_FRESH_TTL_MS,
  };
}

export function setCachedQuota(remote: string, quota: StorageQuota): void {
  quotaCache.set(remote, {
    quota,
    updatedAt: Date.now(),
  });
}

export function invalidateQuotaCache(remote?: string): void {
  if (remote === undefined) {
    quotaCache.clear();
  } else {
    quotaCache.delete(remote);
  }
}

export function invalidateRemoteCache(remote: string): void {
  invalidateDirectoryCache(remote);
  invalidateQuotaCache(remote);
}

export function clearAllFsCache(): void {
  dirCache.clear();
  quotaCache.clear();
}
