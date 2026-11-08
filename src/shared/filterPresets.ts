export interface FilterPreset {
  id: string;
  zhCN: string;
  zhTW: string;
  en: string;
  descriptionZhCN: string;
  descriptionZhTW: string;
  descriptionEn: string;
  patterns: string[];
}

export const FILTER_PRESETS: FilterPreset[] = [
  {
    id: 'synology',
    zhCN: '群晖 DSM 系统目录 (@eaDir / #recycle)',
    zhTW: '群暉 DSM 系統目錄 (@eaDir / #recycle)',
    en: 'Synology DSM System Folders (@eaDir / #recycle)',
    descriptionZhCN: '过滤群晖缩略图索引 @eaDir、回收站 #recycle、快照 #snapshot 等系统隐藏目录',
    descriptionZhTW: '過濾群暉縮圖索引 @eaDir、資源回收筒 #recycle、快照 #snapshot 等系統隱藏目錄',
    descriptionEn: 'Excludes Synology thumbnail index @eaDir, #recycle bin, #snapshot, and DSM metadata',
    patterns: [
      '@eaDir/**',
      '#recycle/**',
      '#snapshot/**',
      '@tmp/**',
      '@sharebin/**',
      '@SynoResource',
      '@SynoEAStream',
      '.SynologyWorkingDirectory/**',
    ],
  },
  {
    id: 'macos',
    zhCN: 'macOS 系统元数据 (.DS_Store / ._*)',
    zhTW: 'macOS 系統中繼資料 (.DS_Store / ._*)',
    en: 'macOS Metadata (.DS_Store / ._*)',
    descriptionZhCN: '过滤 macOS Finder 生成的 .DS_Store、._* 资源派生文件及 .Spotlight-V100',
    descriptionZhTW: '過濾 macOS Finder 產生的 .DS_Store、._* 資源派生檔案及 .Spotlight-V100',
    descriptionEn: 'Excludes macOS Finder .DS_Store, AppleDouble ._* files, and .Trashes',
    patterns: ['.DS_Store', '._*', '.AppleDouble/**', '.Spotlight-V100/**', '.Trashes/**'],
  },
  {
    id: 'windows',
    zhCN: 'Windows 缩略图与临时文件 (Thumbs.db / ~$*)',
    zhTW: 'Windows 縮圖與臨時檔案 (Thumbs.db / ~$*)',
    en: 'Windows Thumbnails & Temp Files (Thumbs.db / ~$*)',
    descriptionZhCN: '过滤 Windows 资源管理器 Thumbs.db、desktop.ini、Office 锁文件 ~$* 及 *.tmp',
    descriptionZhTW: '過濾 Windows 檔案總管 Thumbs.db、desktop.ini、Office 鎖定檔 ~$* 及 *.tmp',
    descriptionEn: 'Excludes Windows Thumbs.db, desktop.ini, Office lock files ~$*, and *.tmp',
    patterns: ['Thumbs.db', 'desktop.ini', '~$*', '*.tmp'],
  },
  {
    id: 'dotfiles',
    zhCN: '所有以点开头的隐藏文件/目录 (.*)',
    zhTW: '所有以點開頭的隱藏檔案/目錄 (.*)',
    en: 'All Dotfiles & Hidden Folders (.*)',
    descriptionZhCN: '过滤所有以 . 开头的 Linux/macOS 隐藏文件与隐藏文件夹 (.git、.cache 等)',
    descriptionZhTW: '過濾所有以 . 開頭的 Linux/macOS 隱藏檔案與隱藏資料夾 (.git、.cache 等)',
    descriptionEn: 'Excludes all hidden files and directories starting with a dot (e.g. .git, .cache)',
    patterns: ['.*', '.*/**'],
  },
];

export const DEFAULT_GLOBAL_EXCLUDE = [
  ...FILTER_PRESETS[0].patterns,
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
].join(', ');

/**
 * Parse a comma or newline separated exclude string into a deduplicated array of patterns.
 */
export function parseExcludePatterns(raw?: string | null): string[] {
  if (!raw || !raw.trim()) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,\r\n]+/)) {
    const trimmed = part.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

/**
 * Merge multiple comma-separated exclude pattern strings into a single deduplicated string.
 */
export function mergeExcludePatterns(...rawList: (string | undefined | null)[]): string {
  const combined = rawList.filter(Boolean).join(', ');
  return parseExcludePatterns(combined).join(', ');
}

/**
 * Convert an Rclone exclude pattern (such as "@eaDir/**", "*.tmp", "._*") into a RegExp
 * for matching a single file or directory entry name in the File Explorer.
 */
export function matchesExcludeEntryName(entryName: string, isDir: boolean, pattern: string): boolean {
  let clean = pattern.trim();
  if (!clean) return false;

  // Strip leading slash if user wrote "/@eaDir/**"
  if (clean.startsWith('/')) {
    clean = clean.slice(1);
  }

  // If pattern ends with "/**", it targets a directory name (e.g. "@eaDir/**" -> "@eaDir")
  if (clean.endsWith('/**')) {
    const dirPattern = clean.slice(0, -3);
    if (!dirPattern.includes('/')) {
      return globToRegExp(dirPattern).test(entryName);
    }
    return false;
  }

  // If pattern ends with "/", it only matches directories
  if (clean.endsWith('/')) {
    if (!isDir) return false;
    clean = clean.slice(0, -1);
  }

  if (clean.includes('/')) {
    return false;
  }

  return globToRegExp(clean).test(entryName);
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const regexStr = '^' + escaped.replace(/\*/g, '.*').replace(/\?/g, '.') + '$';
  return new RegExp(regexStr, 'i');
}

/**
 * Check if a file/directory entry in the Explorer matches any pattern in the list.
 */
export function shouldFilterExplorerEntry(
  entryName: string,
  isDir: boolean,
  patterns: string[]
): boolean {
  for (const pat of patterns) {
    if (matchesExcludeEntryName(entryName, isDir, pat)) {
      return true;
    }
  }
  return false;
}
