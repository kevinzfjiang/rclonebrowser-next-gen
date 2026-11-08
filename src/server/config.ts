import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const isWindows = os.platform() === 'win32';

function resolveDefaultDir(envVal: string | undefined, dockerDefault: string, devFallback: string): string {
  if (envVal && envVal.trim()) {
    return path.resolve(envVal.trim());
  }
  if (!isWindows) {
    try {
      fs.mkdirSync(dockerDefault, { recursive: true });
      fs.accessSync(dockerDefault, fs.constants.W_OK);
      return dockerDefault;
    } catch {
      return path.resolve(process.cwd(), devFallback);
    }
  }
  return path.resolve(process.cwd(), devFallback);
}

export const CONFIG_DIR = resolveDefaultDir(process.env.CONFIG_DIR, '/config', './data/config');
export const MEDIA_DIR = resolveDefaultDir(process.env.MEDIA_DIR, '/media', './data/media');
export const RCLONE_CONFIG_PATH = process.env.RCLONE_CONFIG
  ? path.resolve(process.env.RCLONE_CONFIG)
  : path.join(CONFIG_DIR, 'rclone', 'rclone.conf');
export const UPLOAD_TEMP_DIR = path.join(CONFIG_DIR, 'tmp_uploads');
export const TASKS_DB_PATH = path.join(CONFIG_DIR, 'tasks.json');
export const SCHEDULES_DB_PATH = path.join(CONFIG_DIR, 'schedules.json');
export const SETTINGS_DB_PATH = path.join(CONFIG_DIR, 'settings.json');

export const SERVER_PORT = parseInt(process.env.PORT || '5800', 10);
export const APP_USERNAME = process.env.APP_USERNAME || 'admin';
export const APP_PASSWORD = process.env.APP_PASSWORD || '';
export const PUID = process.env.PUID || '1000';
export const PGID = process.env.PGID || '1000';

export interface CustomLocalMount {
  name: string;
  mountPath: string;
}

/**
 * Parse LOCAL_MOUNTS env var, e.g.:
 * LOCAL_MOUNTS="NAS=/media/NAS,NAS2=/media/NAS2,Photos=/media/Photos"
 * or LOCAL_MOUNTS="/media/NAS,/media/NAS2,/media/Photos"
 */
export function getExtraLocalMounts(): CustomLocalMount[] {
  const raw = process.env.LOCAL_MOUNTS || '';
  if (!raw.trim()) return [];

  const result: CustomLocalMount[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const label = trimmed.slice(0, eqIdx).trim();
      const targetPath = trimmed.slice(eqIdx + 1).trim();
      if (label && targetPath) {
        result.push({ name: `@${label.replace(/^@/, '')}`, mountPath: path.resolve(targetPath) });
      }
    } else {
      const baseName = path.basename(trimmed) || 'mount';
      result.push({ name: `@${baseName}`, mountPath: path.resolve(trimmed) });
    }
  }
  return result;
}

export function ensureDirectoriesAndDefaults(): void {
  for (const dir of [CONFIG_DIR, path.dirname(RCLONE_CONFIG_PATH), MEDIA_DIR, UPLOAD_TEMP_DIR]) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err: any) {
      console.warn(`[Config] Warning creating directory ${dir}: ${err.message}`);
    }
  }

  try {
    if (!fs.existsSync(RCLONE_CONFIG_PATH)) {
      const initialConf = [
        '# RcloneBrowser Next Gen Configuration File',
        '# Managed automatically via Web UI or manual edits',
        '',
        '[local_media]',
        'type = alias',
        `remote = ${MEDIA_DIR.replace(/\\/g, '/')}`,
        '',
      ].join('\n');
      fs.writeFileSync(RCLONE_CONFIG_PATH, initialConf, 'utf-8');
    }
  } catch (err: any) {
    console.warn(`[Config] Warning initializing ${RCLONE_CONFIG_PATH}: ${err.message}`);
  }

  // Create sample folders in MEDIA_DIR if completely empty so first-time users can test right away
  try {
    const existing = fs.readdirSync(MEDIA_DIR);
    if (existing.length === 0) {
      const docsDir = path.join(MEDIA_DIR, 'Documents');
      const backupsDir = path.join(MEDIA_DIR, 'Backups');
      const mediaSubDir = path.join(MEDIA_DIR, 'Downloads');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.mkdirSync(backupsDir, { recursive: true });
      fs.mkdirSync(mediaSubDir, { recursive: true });

      fs.writeFileSync(
        path.join(MEDIA_DIR, 'README-RcloneBrowser-NextGen.md'),
        [
          '# Welcome to RcloneBrowser Next Gen 🚀',
          '',
          'This directory is mounted at `/media` inside the container.',
          '',
          '## Key Features',
          '- **Dual-Pane Commander & Multi-Tab Explorer**: Browse local `/media` and any Rclone cloud remote side-by-side.',
          '- **Transfer & Sync Center**: Real-time `copy`, `move`, and `sync` task queue with live speed, progress & logs.',
          '- **Remote Wizard & Config Editor**: Configure S3, Cloudflare R2, WebDAV, SFTP, SMB, Google Drive, OneDrive, Crypt & more.',
          '- **Cron Scheduler**: Automate periodic cloud backup and sync jobs.',
          '',
          `Configuration Path: \`${RCLONE_CONFIG_PATH}\``,
          `Local Media Path: \`${MEDIA_DIR}\``,
        ].join('\n'),
        'utf-8'
      );

      fs.writeFileSync(
        path.join(docsDir, 'sample-config-notes.json'),
        JSON.stringify(
          {
            project: 'RcloneBrowser Next Gen',
            architecture: 'Native Web UI + Rclone Engine + Alpine Docker',
            volumes: {
              config: '/config',
              media: '/media',
            },
            defaultPort: 5800,
          },
          null,
          2
        ),
        'utf-8'
      );
    }
  } catch {
    // Ignore sample creation errors if read-only mount
  }
}
