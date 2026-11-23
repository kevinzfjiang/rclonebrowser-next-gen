import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  Home,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { FileEntry, RemoteInfo } from '../../../shared/types';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { formatRemoteFullPath } from '../../utils/format';
import {
  getCachedDirectory,
  invalidateDirectoryCache,
  setCachedDirectory,
} from '../../utils/fsCache';
import { ALERT_TONES } from '../../utils/themeStyles';
import { Modal } from './Modal';
import { RemoteSelect } from './RemoteSelect';

interface PathPickerModalProps {
  isOpen: boolean;
  title: string;
  remotes: RemoteInfo[];
  initialRemote: string;
  initialPath: string;
  onSelect: (remote: string, path: string) => void;
  onClose: () => void;
}

export const PathPickerModal: React.FC<PathPickerModalProps> = ({
  isOpen,
  title,
  remotes,
  initialRemote,
  initialPath,
  onSelect,
  onClose,
}) => {
  const { tr } = useI18n();
  const [remote, setRemote] = useState(initialRemote || '@media');
  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [folders, setFolders] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const trRef = useRef(tr);
  trRef.current = tr;

  useEffect(() => {
    if (isOpen) {
      setRemote(initialRemote || remotes[0]?.name || '@media');
      setCurrentPath((initialPath || '').replace(/^\/+/, '').replace(/\/+$/, ''));
    }
  }, [isOpen, initialRemote, initialPath, remotes]);

  const loadFolders = useCallback(async (rName: string, pathStr: string, force = false) => {
    const reqId = ++reqIdRef.current;
    const toSortedDirs = (items: FileEntry[]) =>
      items
        .filter((e) => e.IsDir)
        .sort((a, b) => a.Name.localeCompare(b.Name, undefined, { numeric: true }));

    const cached = getCachedDirectory(rName, pathStr);
    if (cached && !force) {
      setFolders(toSortedDirs(cached.entries));
      setError(null);
      if (!cached.isStale) {
        setLoading(false);
        return;
      }
    }

    setLoading(!cached || force);
    setError(null);
    try {
      const res = await api.listDirectory(rName, pathStr);
      if (reqId !== reqIdRef.current) return;
      const entries = res.entries || [];
      setCachedDirectory(rName, pathStr, entries);
      setFolders(toSortedDirs(entries));
    } catch (err: any) {
      if (reqId !== reqIdRef.current) return;
      if (!cached || force) {
        setError(err.message || trRef.current('加载目录失败', '載入目錄失敗', 'Failed to load directory'));
        setFolders([]);
      }
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadFolders(remote, currentPath);
  }, [isOpen, remote, currentPath, loadFolders]);

  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [];
    const parts = currentPath.split('/').filter(Boolean);
    return parts.map((name, idx) => ({
      name,
      path: parts.slice(0, idx + 1).join('/'),
    }));
  }, [currentPath]);

  const handleGoUp = () => {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidthClass="max-w-lg"
      zIndexClass="z-[60]"
      ariaLabel={title}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 rounded-xl bg-sky-500/15 text-sky-500 dark:text-sky-400">
            <FolderOpen className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold text-slate-100 truncate">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Controls & Breadcrumbs */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-900 space-y-2.5">
        <div className="flex items-center gap-2">
          <RemoteSelect
            remotes={remotes}
            value={remote}
            onChange={(next) => {
              setRemote(next);
              setCurrentPath('');
            }}
            className="flex-1"
          />
          <button
            type="button"
            onClick={handleGoUp}
            disabled={!currentPath}
            title={tr('返回上级', '返回上層', 'Go Up')}
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-sky-400 disabled:opacity-40"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              invalidateDirectoryCache(remote, currentPath);
              loadFolders(remote, currentPath, true);
            }}
            title={tr('刷新', '重新整理', 'Refresh')}
            className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-sky-400"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-1 text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 overflow-x-auto whitespace-nowrap">
          <button
            type="button"
            onClick={() => setCurrentPath('')}
            className="inline-flex items-center gap-1 text-slate-400 hover:text-sky-400 font-medium"
          >
            <Home className="w-3.5 h-3.5" />
            <span>{tr('根目录', '根目錄', 'Root')}</span>
          </button>
          {breadcrumbs.map((bc) => (
            <React.Fragment key={bc.path}>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <button
                type="button"
                onClick={() => setCurrentPath(bc.path)}
                className="text-slate-200 hover:text-sky-400 font-medium truncate max-w-[140px]"
              >
                {bc.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Folder List */}
      <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[320px] divide-y divide-slate-800/50">
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
            <span>{tr('正在读取子目录...', '正在讀取子目錄...', 'Loading folders...')}</span>
          </div>
        ) : error ? (
          <div className="p-5 flex flex-col items-center justify-center gap-2.5 text-center">
            <div className={`px-3 py-2 rounded-lg border text-xs ${ALERT_TONES.error}`}>{error}</div>
            <button
              type="button"
              onClick={() => setCurrentPath('')}
              className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
            >
              {tr('返回根目录', '返回根目錄', 'Back to Root')}
            </button>
          </div>
        ) : folders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 text-xs gap-1.5">
            <Folder className="w-7 h-7 stroke-1 text-slate-600" />
            <span>{tr('此目录下没有子文件夹', '此目錄下沒有子資料夾', 'No subfolders here')}</span>
          </div>
        ) : (
          folders.map((dir) => (
            <button
              key={dir.Path}
              type="button"
              onClick={() => setCurrentPath(dir.Path)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left text-xs hover:bg-slate-800/60 transition-colors group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Folder className="w-4 h-4 text-amber-500 dark:text-amber-400 fill-amber-400/20 shrink-0" />
                <span className="text-slate-200 group-hover:text-sky-400 font-medium truncate">
                  {dir.Name}
                </span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-sky-400 shrink-0" />
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-slate-800 bg-slate-950/60">
        <div className="text-[11px] font-mono text-slate-400 truncate max-w-[260px]" title={formatRemoteFullPath(remote, currentPath, remotes)}>
          {formatRemoteFullPath(remote, currentPath, remotes)}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
          >
            {tr('取消', '取消', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              onSelect(remote, currentPath);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{tr('选择此目录', '選擇此目錄', 'Select Folder')}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
};
