import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getExtraLocalMounts, MEDIA_DIR, RCLONE_CONFIG_PATH } from './config.js';
import {
  FileEntry,
  RemoteConfigParams,
  RemoteInfo,
  StorageQuota,
} from '../shared/types.js';

const execFileAsync = promisify(execFile);

const OBSCURE_KEYS_BY_TYPE: Record<string, string[]> = {
  webdav: ['pass'],
  sftp: ['pass', 'key_pem'],
  smb: ['pass'],
  ftp: ['pass'],
  crypt: ['password', 'password2'],
};

export interface RcloneVersionDetails {
  available: boolean;
  version: string;
  osInfo: string;
  arch: string;
  goVersion: string;
}

let cachedVersionInfo: RcloneVersionDetails | null = null;

export async function getRcloneVersionInfo(): Promise<RcloneVersionDetails> {
  if (cachedVersionInfo) return cachedVersionInfo;
  try {
    const { stdout } = await execFileAsync('rclone', ['version'], { timeout: 8000 });
    const lines = stdout.trim().split(/\r?\n/);
    const versionLine = lines[0] || 'rclone unknown';
    const osVersion = lines.find((l) => l.includes('os/version:'))?.split(':')[1]?.trim() || process.platform;
    const arch = lines.find((l) => l.includes('os/arch:'))?.split(':')[1]?.trim() || process.arch;
    const goVersion = lines.find((l) => l.includes('go/version:'))?.split(':')[1]?.trim() || 'unknown';

    cachedVersionInfo = {
      available: true,
      version: versionLine.replace(/^rclone\s+/i, ''),
      osInfo: osVersion,
      arch,
      goVersion,
    };
    return cachedVersionInfo;
  } catch {
    return {
      available: false,
      version: 'Not Found (Local Fallback Mode)',
      osInfo: process.platform,
      arch: process.arch,
      goVersion: 'N/A',
    };
  }
}

export function sanitizeRelPath(relPath: string): string {
  if (!relPath) return '';
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  const parts = normalized.split('/').filter((segment) => segment && segment !== '.' && segment !== '..');
  return parts.join('/');
}

export function resolveRcloneTarget(remoteName: string, relPath: string): {
  isDirectLocal: boolean;
  localFullPath?: string;
  rcloneSpec: string;
} {
  const cleanRel = sanitizeRelPath(relPath);
  const cleanRemote = remoteName.replace(/:$/, '').trim();

  if (cleanRemote === '@media' || cleanRemote === 'local_media') {
    const fullLocal = cleanRel ? path.join(MEDIA_DIR, ...cleanRel.split('/')) : MEDIA_DIR;
    return {
      isDirectLocal: true,
      localFullPath: fullLocal,
      rcloneSpec: fullLocal.replace(/\\/g, '/'),
    };
  }

  // Check extra local mounts from LOCAL_MOUNTS env var (e.g. @NAS, @NAS2, @Photos)
  const extraMount = getExtraLocalMounts().find((m) => m.name === cleanRemote);
  if (extraMount) {
    const fullLocal = cleanRel
      ? path.join(extraMount.mountPath, ...cleanRel.split('/'))
      : extraMount.mountPath;
    return {
      isDirectLocal: true,
      localFullPath: fullLocal,
      rcloneSpec: fullLocal.replace(/\\/g, '/'),
    };
  }

  return {
    isDirectLocal: false,
    rcloneSpec: cleanRel ? `${cleanRemote}:${cleanRel}` : `${cleanRemote}:`,
  };
}

/**
 * Parse INI-format rclone.conf into RemoteInfo[]
 */
export function parseRcloneConf(rawText: string): RemoteInfo[] {
  const remotes: RemoteInfo[] = [];
  let currentName: string | null = null;
  let currentParams: RemoteConfigParams = {};

  const lines = rawText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      if (currentName) {
        remotes.push({
          name: currentName,
          type: currentParams.type || 'unknown',
          params: { ...currentParams },
          isLocalMedia: currentName === 'local_media',
        });
      }
      currentName = sectionMatch[1].trim();
      currentParams = {};
      continue;
    }

    if (currentName) {
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim();
        currentParams[key] = val;
      }
    }
  }

  if (currentName) {
    remotes.push({
      name: currentName,
      type: currentParams.type || 'unknown',
      params: { ...currentParams },
      isLocalMedia: currentName === 'local_media',
    });
  }

  return remotes;
}

export function serializeRcloneConf(remotes: RemoteInfo[]): string {
  const lines: string[] = [
    '# RcloneBrowser Next Gen Configuration File',
    `# Updated at ${new Date().toISOString()}`,
    '',
  ];

  for (const r of remotes) {
    lines.push(`[${r.name}]`);
    lines.push(`type = ${r.type}`);
    for (const [k, v] of Object.entries(r.params)) {
      if (k === 'type' || v === undefined || v === '') continue;
      lines.push(`${k} = ${v}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function getRawConfig(): string {
  if (!fs.existsSync(RCLONE_CONFIG_PATH)) {
    return '';
  }
  return fs.readFileSync(RCLONE_CONFIG_PATH, 'utf-8');
}

export function saveRawConfig(content: string): RemoteInfo[] {
  fs.mkdirSync(path.dirname(RCLONE_CONFIG_PATH), { recursive: true });
  fs.writeFileSync(RCLONE_CONFIG_PATH, content, 'utf-8');
  return listRemotes();
}

export function listRemotes(): RemoteInfo[] {
  const raw = getRawConfig();
  const parsed = parseRcloneConf(raw);

  // Always ensure built-in @media remote is first in the list
  const builtinMedia: RemoteInfo = {
    name: '@media',
    type: 'local',
    params: {
      type: 'local',
      remote: MEDIA_DIR.replace(/\\/g, '/'),
    },
    isLocalMedia: true,
    rootPath: MEDIA_DIR.replace(/\\/g, '/'),
  };

  // Extra local mounts configured via LOCAL_MOUNTS env var
  const extraMounts: RemoteInfo[] = getExtraLocalMounts().map((m) => ({
    name: m.name,
    type: 'local',
    params: {
      type: 'local',
      remote: m.mountPath.replace(/\\/g, '/'),
    },
    isLocalMedia: true,
    rootPath: m.mountPath.replace(/\\/g, '/'),
  }));

  const reservedNames = new Set(['@media', ...extraMounts.map((m) => m.name)]);
  const filtered = parsed.filter((r) => !reservedNames.has(r.name));
  return [builtinMedia, ...extraMounts, ...filtered];
}

export async function obscureValue(plainText: string): Promise<string> {
  if (!plainText) return '';
  try {
    const { stdout } = await execFileAsync('rclone', ['obscure', plainText], { timeout: 5000 });
    return stdout.trim();
  } catch {
    return plainText;
  }
}

export async function upsertRemote(
  name: string,
  type: string,
  params: RemoteConfigParams,
  obscurePasswords = true
): Promise<RemoteInfo[]> {
  const cleanName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
  if (!cleanName || cleanName === '@media') {
    throw new Error('Remote 名称无效或为系统保留名称 (@media)');
  }

  const raw = getRawConfig();
  const existingRemotes = parseRcloneConf(raw);
  const existing = existingRemotes.find((r) => r.name === cleanName);

  const finalParams: RemoteConfigParams = { ...params, type };
  const obscureKeys = OBSCURE_KEYS_BY_TYPE[type] || [];

  if (obscurePasswords) {
    for (const key of obscureKeys) {
      const val = finalParams[key];
      if (val && (!existing || existing.params[key] !== val)) {
        finalParams[key] = await obscureValue(val);
      }
    }
  }

  const nextRemote: RemoteInfo = {
    name: cleanName,
    type,
    params: finalParams,
  };

  const idx = existingRemotes.findIndex((r) => r.name === cleanName);
  if (idx >= 0) {
    existingRemotes[idx] = nextRemote;
  } else {
    existingRemotes.push(nextRemote);
  }

  fs.writeFileSync(RCLONE_CONFIG_PATH, serializeRcloneConf(existingRemotes), 'utf-8');
  return listRemotes();
}

export function deleteRemote(name: string): RemoteInfo[] {
  if (name === '@media') {
    throw new Error('内置本地媒体卷 (@media) 不可删除');
  }
  const raw = getRawConfig();
  const existingRemotes = parseRcloneConf(raw).filter((r) => r.name !== name);
  fs.writeFileSync(RCLONE_CONFIG_PATH, serializeRcloneConf(existingRemotes), 'utf-8');
  return listRemotes();
}

function guessMimeType(fileName: string, isDir: boolean): string {
  if (isDir) return 'inode/directory';
  const ext = path.extname(fileName).toLowerCase();
  const map: Record<string, string> = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.yml': 'text/yaml',
    '.yaml': 'text/yaml',
    '.xml': 'application/xml',
    '.csv': 'text/csv',
    '.log': 'text/plain',
    '.conf': 'text/plain',
    '.ini': 'text/plain',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.py': 'text/x-python',
    '.sh': 'text/x-shellscript',
    '.html': 'text/html',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
  };
  return map[ext] || 'application/octet-stream';
}

export async function listDirectory(remoteName: string, relPath: string): Promise<FileEntry[]> {
  const target = resolveRcloneTarget(remoteName, relPath);

  if (target.isDirectLocal && target.localFullPath) {
    if (!fs.existsSync(target.localFullPath)) {
      fs.mkdirSync(target.localFullPath, { recursive: true });
    }
    const dirEntries = await fs.promises.readdir(target.localFullPath, { withFileTypes: true });
    const results: FileEntry[] = [];
    for (const d of dirEntries) {
      try {
        const fullItemPath = path.join(target.localFullPath, d.name);
        const stat = await fs.promises.stat(fullItemPath);
        const isDir = d.isDirectory();
        const itemRel = sanitizeRelPath(relPath ? `${relPath}/${d.name}` : d.name);
        results.push({
          Path: itemRel,
          Name: d.name,
          Size: isDir ? 0 : stat.size,
          MimeType: guessMimeType(d.name, isDir),
          ModTime: stat.mtime.toISOString(),
          IsDir: isDir,
        });
      } catch {
        // Ignore broken symlinks or inaccessible files
      }
    }
    return results.sort((a, b) => {
      if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
      return a.Name.localeCompare(b.Name, undefined, { numeric: true });
    });
  }

  // Use rclone lsjson for remote paths
  const { stdout } = await execFileAsync(
    'rclone',
    ['lsjson', '--config', RCLONE_CONFIG_PATH, target.rcloneSpec],
    { timeout: 30000, maxBuffer: 25 * 1024 * 1024 }
  );

  const parsed: FileEntry[] = JSON.parse(stdout || '[]');
  const cleanPrefix = sanitizeRelPath(relPath);

  return parsed
    .map((item) => ({
      ...item,
      Path: cleanPrefix ? `${cleanPrefix}/${item.Name}` : item.Name,
    }))
    .sort((a, b) => {
      if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
      return a.Name.localeCompare(b.Name, undefined, { numeric: true });
    });
}

export async function makeDirectory(remoteName: string, relPath: string): Promise<void> {
  const target = resolveRcloneTarget(remoteName, relPath);
  if (target.isDirectLocal && target.localFullPath) {
    await fs.promises.mkdir(target.localFullPath, { recursive: true });
    return;
  }
  await execFileAsync('rclone', ['mkdir', '--config', RCLONE_CONFIG_PATH, target.rcloneSpec], {
    timeout: 20000,
  });
}

export async function deleteEntry(remoteName: string, relPath: string, isDir: boolean): Promise<void> {
  const cleanRel = sanitizeRelPath(relPath);
  if (!cleanRel) {
    throw new Error('不允许直接删除根目录');
  }
  const target = resolveRcloneTarget(remoteName, cleanRel);
  if (target.isDirectLocal && target.localFullPath) {
    await fs.promises.rm(target.localFullPath, { recursive: true, force: true });
    return;
  }
  const subcommand = isDir ? 'purge' : 'deletefile';
  await execFileAsync('rclone', [subcommand, '--config', RCLONE_CONFIG_PATH, target.rcloneSpec], {
    timeout: 60000,
  });
}

export async function renameEntry(
  remoteName: string,
  oldRelPath: string,
  newRelPath: string
): Promise<void> {
  const srcTarget = resolveRcloneTarget(remoteName, oldRelPath);
  const dstTarget = resolveRcloneTarget(remoteName, newRelPath);

  if (srcTarget.isDirectLocal && dstTarget.isDirectLocal && srcTarget.localFullPath && dstTarget.localFullPath) {
    await fs.promises.mkdir(path.dirname(dstTarget.localFullPath), { recursive: true });
    await fs.promises.rename(srcTarget.localFullPath, dstTarget.localFullPath);
    return;
  }

  await execFileAsync(
    'rclone',
    ['moveto', '--config', RCLONE_CONFIG_PATH, srcTarget.rcloneSpec, dstTarget.rcloneSpec],
    { timeout: 60000 }
  );
}

export async function getStorageQuota(remoteName: string): Promise<StorageQuota> {
  const target = resolveRcloneTarget(remoteName, '');
  try {
    const { stdout } = await execFileAsync(
      'rclone',
      ['about', '--json', '--config', RCLONE_CONFIG_PATH, target.rcloneSpec],
      { timeout: 15000 }
    );
    const data = JSON.parse(stdout || '{}');
    return {
      total: data.total,
      used: data.used,
      free: data.free,
      trashed: data.trashed,
      other: data.other,
      supported: true,
    };
  } catch {
    return { supported: false };
  }
}

export async function calculateDirSize(
  remoteName: string,
  relPath: string
): Promise<{ count: number; bytes: number }> {
  const target = resolveRcloneTarget(remoteName, relPath);
  const { stdout } = await execFileAsync(
    'rclone',
    ['size', '--json', '--config', RCLONE_CONFIG_PATH, target.rcloneSpec],
    { timeout: 45000 }
  );
  const data = JSON.parse(stdout || '{"count":0,"bytes":0}');
  return {
    count: data.count || 0,
    bytes: data.bytes || 0,
  };
}

export async function uploadLocalFilesToRemote(
  remoteName: string,
  destDirRelPath: string,
  files: { tempPath: string; originalName: string }[]
): Promise<void> {
  for (const file of files) {
    const destItemRel = sanitizeRelPath(
      destDirRelPath ? `${destDirRelPath}/${file.originalName}` : file.originalName
    );
    const target = resolveRcloneTarget(remoteName, destItemRel);

    try {
      if (target.isDirectLocal && target.localFullPath) {
        await fs.promises.mkdir(path.dirname(target.localFullPath), { recursive: true });
        await fs.promises.copyFile(file.tempPath, target.localFullPath);
      } else {
        await execFileAsync(
          'rclone',
          ['copyto', '--config', RCLONE_CONFIG_PATH, file.tempPath, target.rcloneSpec],
          { timeout: 300000 }
        );
      }
    } finally {
      try {
        await fs.promises.unlink(file.tempPath);
      } catch {
        // Ignore cleanup error
      }
    }
  }
}

export function createFileReadStream(remoteName: string, relPath: string): {
  mimeType: string;
  fileName: string;
  stream: NodeJS.ReadableStream;
  cleanup?: () => void;
} {
  const cleanRel = sanitizeRelPath(relPath);
  const fileName = path.posix.basename(cleanRel) || 'download';
  const mimeType = guessMimeType(fileName, false);
  const target = resolveRcloneTarget(remoteName, cleanRel);

  if (target.isDirectLocal && target.localFullPath) {
    if (!fs.existsSync(target.localFullPath)) {
      throw new Error(`文件不存在: ${cleanRel}`);
    }
    const stream = fs.createReadStream(target.localFullPath);
    return { mimeType, fileName, stream };
  }

  const child = spawn('rclone', ['cat', '--config', RCLONE_CONFIG_PATH, target.rcloneSpec], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    mimeType,
    fileName,
    stream: child.stdout,
    cleanup: () => {
      if (!child.killed) {
        child.kill('SIGTERM');
      }
    },
  };
}
