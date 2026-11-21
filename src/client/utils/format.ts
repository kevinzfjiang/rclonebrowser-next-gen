import { FileEntry, RemoteInfo } from '../../shared/types';
import { LocaleCode, TranslateFn } from '../i18n';

export function formatBytes(bytes?: number | null, decimals = 2): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes) || bytes < 0) return '-';
  if (bytes === 0) return '0 B';
  if (bytes < 1) return `${bytes.toFixed(decimals)} B`;
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.max(0, Math.floor(Math.log(bytes) / Math.log(k)));
  const idx = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, idx)).toFixed(dm))} ${sizes[idx]}`;
}

export function formatSpeed(bytesPerSec?: number | null): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
  return `${formatBytes(bytesPerSec, 1)}/s`;
}

export function formatEta(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || seconds < 0) return '--:--';
  if (seconds === 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export function formatDateTime(iso?: string, locale?: LocaleCode): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const targetLocale =
      locale === 'en'
        ? 'en-US'
        : locale === 'zh-TW'
          ? 'zh-TW'
          : locale === 'zh-CN'
            ? 'zh-CN'
            : typeof document !== 'undefined' && document.documentElement.lang
              ? document.documentElement.lang === 'en'
                ? 'en-US'
                : document.documentElement.lang
              : 'zh-CN';
    return d.toLocaleString(targetLocale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

export function formatRemoteShortLabel(remoteName: string, tr: TranslateFn): string {
  if (remoteName === '@media') return tr('本地 /media', '本機 /media', 'Local /media');
  if (remoteName.startsWith('@')) {
    return `${tr('本地', '本機', 'Local')} ${remoteName.slice(1)}`;
  }
  return `${remoteName}:`;
}

export function formatRemoteOptionLabel(r: RemoteInfo, tr: TranslateFn): string {
  if (r.name === '@media') {
    return `[${tr('本地', '本機', 'Local')}] /media`;
  }
  if (r.name.startsWith('@')) {
    return `[${tr('挂载', '掛載', 'Mount')}] ${r.name.slice(1)}${r.rootPath ? ` (${r.rootPath})` : ''}`;
  }
  const proxyTag =
    r.proxyUrl || r.params._proxy_url ? ` [${tr('代理', '代理', 'Proxy')}]` : '';
  return `${r.name}: (${r.type.toUpperCase()})${proxyTag}`;
}

export function formatRemoteFullPath(remoteName: string, relPath?: string, remotes?: RemoteInfo[]): string {
  const cleanPath = (relPath || '').replace(/^\/+/, '');
  if (remoteName === '@media') {
    return `/media/${cleanPath}`;
  }
  if (remoteName.startsWith('@')) {
    const matched = remotes?.find((r) => r.name === remoteName);
    const base = matched?.rootPath ? matched.rootPath.replace(/\/+$/, '') : `/${remoteName.slice(1)}`;
    return `${base}/${cleanPath}`;
  }
  return `${remoteName}:/${cleanPath}`;
}

export type PreviewCategory = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'archive' | 'spreadsheet' | 'code' | 'other';

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico']);
const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v', 'ogv', 'mkv']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus']);
const ARCHIVE_EXTS = new Set(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'iso']);
const SHEET_EXTS = new Set(['csv', 'xls', 'xlsx', 'ods']);
const CODE_EXTS = new Set([
  'js', 'jsx', 'ts', 'tsx', 'py', 'sh', 'bash', 'zsh', 'json', 'yml', 'yaml',
  'xml', 'html', 'htm', 'css', 'scss', 'sql', 'go', 'rs', 'java', 'c', 'cpp', 'h',
  'dockerfile', 'toml', 'ini', 'conf', 'env',
]);
const TEXT_EXTS = new Set(['txt', 'md', 'markdown', 'log', 'csv', 'rtf', 'license', 'gitignore']);

export function getFileCategory(entry: Pick<FileEntry, 'Name' | 'MimeType'>): PreviewCategory {
  const mime = (entry.MimeType || '').toLowerCase();
  const ext = entry.Name.includes('.') ? entry.Name.split('.').pop()?.toLowerCase() || '' : '';

  if (mime.startsWith('image/') || IMAGE_EXTS.has(ext)) return 'image';
  if (mime.startsWith('video/') || VIDEO_EXTS.has(ext)) return 'video';
  if (mime.startsWith('audio/') || AUDIO_EXTS.has(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (ARCHIVE_EXTS.has(ext)) return 'archive';
  if (SHEET_EXTS.has(ext)) return 'spreadsheet';
  if (CODE_EXTS.has(ext) || mime === 'application/json' || mime === 'application/xml') return 'code';
  if (mime.startsWith('text/') || TEXT_EXTS.has(ext)) return 'text';
  return 'other';
}

export function isTextPreviewableCategory(cat: PreviewCategory): boolean {
  return cat === 'text' || cat === 'code' || cat === 'spreadsheet';
}

/**
 * Lightweight client-side validator and human-readable preview for standard 5-field Cron expressions.
 */
export function inspectCronExpression(
  raw: string,
  tr: TranslateFn
): { valid: boolean; summary: string } {
  const expr = raw.trim();
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) {
    return {
      valid: false,
      summary: tr(
        '需要标准的 5 段 Cron 表达式：分 时 日 月 周 (例如 0 2 * * *)',
        '需要標準的 5 段 Cron 表達式：分 時 日 月 週 (例如 0 2 * * *)',
        'Must be a standard 5-field Cron expression: min hour day month weekday (e.g. 0 2 * * *)'
      ),
    };
  }

  const ranges: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];

  const fieldTokenRegex = /^(\*|(\d+(-\d+)?)(\/\d+)?|\*\/\d+)$/;
  for (let i = 0; i < 5; i++) {
    const segs = parts[i].split(',');
    for (const seg of segs) {
      if (!fieldTokenRegex.test(seg)) {
        return {
          valid: false,
          summary: tr(
            `第 ${i + 1} 段 "${parts[i]}" 格式无效`,
            `第 ${i + 1} 段 "${parts[i]}" 格式無效`,
            `Field #${i + 1} "${parts[i]}" has invalid syntax`
          ),
        };
      }
      const [base, stepStr] = seg.split('/');
      if (stepStr !== undefined && Number(stepStr) <= 0) {
        return {
          valid: false,
          summary: tr('步进值必须大于 0', '步進值必須大於 0', 'Step value must be > 0'),
        };
      }
      if (base !== '*') {
        const bounds = base.split('-').map(Number);
        const [min, max] = ranges[i];
        if (bounds.some((n) => Number.isNaN(n) || n < min || n > max)) {
          return {
            valid: false,
            summary: tr(
              `第 ${i + 1} 段数值超出允许范围 (${min}-${max})`,
              `第 ${i + 1} 段數值超出允許範圍 (${min}-${max})`,
              `Field #${i + 1} out of range (${min}-${max})`
            ),
          };
        }
        if (bounds.length === 2 && bounds[0] > bounds[1]) {
          return {
            valid: false,
            summary: tr('范围起始值不能大于结束值', '範圍起始值不能大於結束值', 'Range start cannot exceed end'),
          };
        }
      }
    }
  }

  const [min, hour, dom, mon, dow] = parts;
  const pad = (v: string) => v.padStart(2, '0');
  const weekdayNames = [
    tr('周日', '週日', 'Sunday'),
    tr('周一', '週一', 'Monday'),
    tr('周二', '週二', 'Tuesday'),
    tr('周三', '週三', 'Wednesday'),
    tr('周四', '週四', 'Thursday'),
    tr('周五', '週五', 'Friday'),
    tr('周六', '週六', 'Saturday'),
    tr('周日', '週日', 'Sunday'),
  ];

  if (expr === '* * * * *') {
    return { valid: true, summary: tr('每分钟执行一次', '每分鐘執行一次', 'Runs every minute') };
  }
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    const n = min.slice(2);
    return {
      valid: true,
      summary: tr(`每隔 ${n} 分钟执行一次`, `每隔 ${n} 分鐘執行一次`, `Runs every ${n} minutes`),
    };
  }
  if (/^\d+$/.test(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return {
      valid: true,
      summary: tr(`每小时第 ${pad(min)} 分执行`, `每小時第 ${pad(min)} 分執行`, `Runs hourly at minute :${pad(min)}`),
    };
  }
  if (/^\d+$/.test(min) && hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*') {
    const h = hour.slice(2);
    return {
      valid: true,
      summary: tr(
        `每隔 ${h} 小时的 :${pad(min)} 执行`,
        `每隔 ${h} 小時的 :${pad(min)} 執行`,
        `Runs every ${h} hours at :${pad(min)}`
      ),
    };
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return {
      valid: true,
      summary: tr(
        `每天 ${pad(hour)}:${pad(min)} 执行`,
        `每天 ${pad(hour)}:${pad(min)} 執行`,
        `Runs daily at ${pad(hour)}:${pad(min)}`
      ),
    };
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && /^\d+$/.test(dow)) {
    const w = weekdayNames[Number(dow)] || dow;
    return {
      valid: true,
      summary: tr(
        `每${w} ${pad(hour)}:${pad(min)} 执行`,
        `每${w} ${pad(hour)}:${pad(min)} 執行`,
        `Runs every ${w} at ${pad(hour)}:${pad(min)}`
      ),
    };
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && /^\d+$/.test(dom) && mon === '*' && dow === '*') {
    return {
      valid: true,
      summary: tr(
        `每月 ${dom} 日 ${pad(hour)}:${pad(min)} 执行`,
        `每月 ${dom} 日 ${pad(hour)}:${pad(min)} 執行`,
        `Runs monthly on day ${dom} at ${pad(hour)}:${pad(min)}`
      ),
    };
  }

  return {
    valid: true,
    summary: tr(
      `有效 Cron 表达式 (分:${min} 时:${hour} 日:${dom} 月:${mon} 周:${dow})`,
      `有效 Cron 表達式 (分:${min} 時:${hour} 日:${dom} 月:${mon} 週:${dow})`,
      `Valid Cron (min:${min} hr:${hour} day:${dom} mon:${mon} wk:${dow})`
    ),
  };
}
