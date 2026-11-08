import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  Calculator,
  CheckSquare,
  ChevronRight,
  Cloud,
  Copy,
  Download,
  Edit3,
  Eye,
  File,
  FileArchive,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Film,
  Folder,
  FolderPlus,
  HardDrive,
  Home,
  Loader2,
  MoveRight,
  Music,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { FileEntry, RemoteInfo, StorageQuota, TransferOperation } from '../../shared/types';
import { api } from '../api';
import { formatBytes, formatDateTime } from '../utils/format';

export interface ExplorerTab {
  id: string;
  remote: string;
  path: string;
}

interface FilePaneProps {
  paneSide: 'left' | 'right' | 'single';
  remotes: RemoteInfo[];
  tabs: ExplorerTab[];
  activeTabId: string;
  oppositeTarget?: { remote: string; path: string };
  onTabsChange: (tabs: ExplorerTab[], activeId: string) => void;
  onPreviewFile: (remote: string, entry: FileEntry) => void;
  onTriggerTransfer: (params: {
    operation: TransferOperation;
    srcRemote: string;
    srcPath: string;
    dstRemote: string;
    dstPath: string;
    items?: { path: string; name: string; isDir: boolean }[];
    dryRun?: boolean;
  }) => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  refreshSignal?: number;
}

export const FilePane: React.FC<FilePaneProps> = ({
  paneSide,
  remotes,
  tabs,
  activeTabId,
  oppositeTarget,
  onTabsChange,
  onPreviewFile,
  onTriggerTransfer,
  onNotify,
  refreshSignal,
}) => {
  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  );

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'Name' | 'Size' | 'ModTime'>('Name');
  const [sortAsc, setSortAsc] = useState(true);
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [dirSizes, setDirSizes] = useState<Record<string, number>>({});
  const [calculatingPath, setCalculatingPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Dialog states
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingPathInput, setEditingPathInput] = useState(false);
  const [pathInputVal, setPathInputVal] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const updateActiveTab = useCallback(
    (patch: Partial<ExplorerTab>) => {
      const next = tabs.map((t) => (t.id === activeTab.id ? { ...t, ...patch } : t));
      onTabsChange(next, activeTab.id);
    },
    [tabs, activeTab, onTabsChange]
  );

  const loadDirectory = useCallback(async () => {
    if (!activeTab) return;
    setLoading(true);
    setError(null);
    setSelectedPaths(new Set());
    try {
      const res = await api.listDirectory(activeTab.remote, activeTab.path);
      setEntries(res.entries || []);
    } catch (err: any) {
      setError(err.message || '无法加载目录');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory, refreshSignal]);

  useEffect(() => {
    if (!activeTab) return;
    setQuota(null);
    api
      .getRemoteQuota(activeTab.remote)
      .then((q) => {
        if (q.supported) setQuota(q);
      })
      .catch(() => {});
  }, [activeTab?.remote]);

  const handleAddTab = () => {
    const newId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nextTabs = [
      ...tabs,
      {
        id: newId,
        remote: activeTab?.remote || '@media',
        path: '',
      },
    ];
    onTabsChange(nextTabs, newId);
  };

  const handleCloseTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const nextTabs = tabs.filter((t) => t.id !== id);
    const nextActive =
      id === activeTab.id ? nextTabs[Math.max(0, idx - 1)].id : activeTab.id;
    onTabsChange(nextTabs, nextActive);
  };

  const handleNavigate = (newPath: string) => {
    const clean = newPath.replace(/^\/+/, '').replace(/\/+$/, '');
    updateActiveTab({ path: clean });
  };

  const handleGoUp = () => {
    if (!activeTab.path) return;
    const parts = activeTab.path.split('/').filter(Boolean);
    parts.pop();
    handleNavigate(parts.join('/'));
  };

  const breadcrumbs = useMemo(() => {
    if (!activeTab?.path) return [];
    const parts = activeTab.path.split('/').filter(Boolean);
    return parts.map((name, i) => ({
      name,
      path: parts.slice(0, i + 1).join('/'),
    }));
  }, [activeTab?.path]);

  const filteredAndSortedEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? entries.filter((e) => e.Name.toLowerCase().includes(q))
      : entries.slice();

    return filtered.sort((a, b) => {
      if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
      let cmp = 0;
      if (sortBy === 'Name') {
        cmp = a.Name.localeCompare(b.Name, undefined, { numeric: true });
      } else if (sortBy === 'Size') {
        const sizeA = a.IsDir ? dirSizes[a.Path] || 0 : a.Size;
        const sizeB = b.IsDir ? dirSizes[b.Path] || 0 : b.Size;
        cmp = sizeA - sizeB;
      } else if (sortBy === 'ModTime') {
        cmp = new Date(a.ModTime).getTime() - new Date(b.ModTime).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [entries, searchQuery, sortBy, sortAsc, dirSizes]);

  const toggleSelect = (pathStr: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathStr)) {
        next.delete(pathStr);
      } else {
        next.add(pathStr);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPaths.size === filteredAndSortedEntries.length && filteredAndSortedEntries.length > 0) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredAndSortedEntries.map((e) => e.Path)));
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newFolderName.trim();
    if (!cleanName) return;
    const targetPath = activeTab.path ? `${activeTab.path}/${cleanName}` : cleanName;
    try {
      await api.makeDirectory(activeTab.remote, targetPath);
      setNewFolderModal(false);
      setNewFolderName('');
      onNotify(`已创建目录: ${cleanName}`, 'success');
      loadDirectory();
    } catch (err: any) {
      onNotify(err.message || '创建目录失败', 'error');
    }
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    const cleanNewName = renameValue.trim();
    if (!cleanNewName || cleanNewName === renameTarget.Name) {
      setRenameTarget(null);
      return;
    }
    const parentDir = renameTarget.Path.includes('/')
      ? renameTarget.Path.slice(0, renameTarget.Path.lastIndexOf('/'))
      : '';
    const newPath = parentDir ? `${parentDir}/${cleanNewName}` : cleanNewName;
    try {
      await api.renameEntry(activeTab.remote, renameTarget.Path, newPath);
      setRenameTarget(null);
      onNotify(`已重命名为: ${cleanNewName}`, 'success');
      loadDirectory();
    } catch (err: any) {
      onNotify(err.message || '重命名失败', 'error');
    }
  };

  const handleDeleteItems = async (itemsToDelete: FileEntry[]) => {
    if (itemsToDelete.length === 0) return;
    const confirmMsg =
      itemsToDelete.length === 1
        ? `确定要删除 "${itemsToDelete[0].Name}" 吗？此操作不可撤销。`
        : `确定要批量删除选中的 ${itemsToDelete.length} 个项目吗？此操作不可撤销。`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await api.deleteEntries(
        activeTab.remote,
        itemsToDelete.map((i) => ({ path: i.Path, isDir: i.IsDir }))
      );
      onNotify(`已删除 ${itemsToDelete.length} 个项目`, 'success');
      loadDirectory();
    } catch (err: any) {
      onNotify(err.message || '删除失败', 'error');
    }
  };

  const handleCalculateSize = async (entry: FileEntry) => {
    setCalculatingPath(entry.Path);
    try {
      const res = await api.calculateDirSize(activeTab.remote, entry.Path);
      setDirSizes((prev) => ({ ...prev, [entry.Path]: res.bytes }));
      onNotify(`目录 "${entry.Name}" 共包含 ${res.count} 个文件，大小 ${formatBytes(res.bytes)}`, 'info');
    } catch (err: any) {
      onNotify(err.message || '计算目录大小失败', 'error');
    } finally {
      setCalculatingPath(null);
    }
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const res = await api.uploadFiles(activeTab.remote, activeTab.path, files);
      onNotify(`成功上传 ${res.count} 个文件`, 'success');
      loadDirectory();
    } catch (err: any) {
      onNotify(err.message || '上传失败', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const selectedEntries = useMemo(
    () => entries.filter((e) => selectedPaths.has(e.Path)),
    [entries, selectedPaths]
  );

  const handleCommanderTransfer = async (operation: TransferOperation, dryRun = false) => {
    if (!oppositeTarget) return;
    if (operation === 'sync') {
      const srcLabel = `${activeTab.remote}:${activeTab.path || '/'}`;
      const dstLabel = `${oppositeTarget.remote}:${oppositeTarget.path || '/'}`;
      if (
        !dryRun &&
        !window.confirm(
          `确定要执行目录同步 (SYNC) 吗？\n源目录: ${srcLabel}\n目标目录: ${dstLabel}\n注意: Sync 会使目标目录与源目录保持一致（目标多余文件将被清理）。`
        )
      ) {
        return;
      }
      await onTriggerTransfer({
        operation: 'sync',
        srcRemote: activeTab.remote,
        srcPath: activeTab.path,
        dstRemote: oppositeTarget.remote,
        dstPath: oppositeTarget.path,
        dryRun,
      });
      return;
    }

    if (selectedEntries.length === 0) {
      onNotify('请先勾选要传输的文件或文件夹', 'info');
      return;
    }

    await onTriggerTransfer({
      operation,
      srcRemote: activeTab.remote,
      srcPath: activeTab.path,
      dstRemote: oppositeTarget.remote,
      dstPath: oppositeTarget.path,
      items: selectedEntries.map((e) => ({
        path: e.Path,
        name: e.Name,
        isDir: e.IsDir,
      })),
      dryRun,
    });
    setSelectedPaths(new Set());
  };

  const renderEntryIcon = (entry: FileEntry) => {
    if (entry.IsDir) {
      return <Folder className="w-4 h-4 text-amber-400 fill-amber-400/20 shrink-0" />;
    }
    const mime = entry.MimeType || '';
    const ext = entry.Name.split('.').pop()?.toLowerCase() || '';
    if (mime.startsWith('image/')) return <FileImage className="w-4 h-4 text-pink-400 shrink-0" />;
    if (mime.startsWith('video/')) return <Film className="w-4 h-4 text-purple-400 shrink-0" />;
    if (mime.startsWith('audio/')) return <Music className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (['zip', 'tar', 'gz', '7z', 'rar'].includes(ext))
      return <FileArchive className="w-4 h-4 text-orange-400 shrink-0" />;
    if (['csv', 'xls', 'xlsx'].includes(ext))
      return <FileSpreadsheet className="w-4 h-4 text-green-400 shrink-0" />;
    if (['js', 'ts', 'tsx', 'py', 'sh', 'json', 'yml', 'yaml', 'xml', 'html', 'css'].includes(ext))
      return <FileCode className="w-4 h-4 text-sky-400 shrink-0" />;
    if (mime.startsWith('text/') || ['md', 'txt', 'log', 'conf'].includes(ext))
      return <FileText className="w-4 h-4 text-slate-300 shrink-0" />;
    return <File className="w-4 h-4 text-slate-400 shrink-0" />;
  };

  const toggleSort = (col: 'Name' | 'Size' | 'ModTime') => {
    if (sortBy === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(col);
      setSortAsc(true);
    }
  };

  return (
    <div
      className={`flex flex-col h-full bg-slate-900/70 border rounded-xl overflow-hidden transition-colors ${
        dragOver ? 'border-sky-400 bg-sky-950/20' : 'border-slate-800/90'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleUploadFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Multi-Tab Bar */}
      <div className="flex items-center bg-slate-950/90 border-b border-slate-800/80 px-2 pt-1.5 gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id;
          const folderLabel = tab.path ? tab.path.split('/').pop() : '/';
          const isLocalMount = tab.remote.startsWith('@');
          const remoteLabel =
            tab.remote === '@media'
              ? '本地 /media'
              : isLocalMount
                ? `本地 ${tab.remote.slice(1)}`
                : `${tab.remote}:`;
          return (
            <div
              key={tab.id}
              onClick={() => onTabsChange(tabs, tab.id)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer border-t border-x transition-all max-w-[200px] shrink-0 ${
                isActive
                  ? 'bg-slate-900 text-sky-400 border-slate-700/80'
                  : 'bg-slate-950/40 text-slate-400 border-transparent hover:bg-slate-900/50 hover:text-slate-200'
              }`}
            >
              {isLocalMount ? (
                <HardDrive className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
              ) : (
                <Cloud className="w-3.5 h-3.5 shrink-0 text-sky-400" />
              )}
              <span className="truncate">
                {remoteLabel} {folderLabel}
              </span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleCloseTab(tab.id, e)}
                  className="opacity-60 hover:opacity-100 hover:bg-slate-800 rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={handleAddTab}
          title="新建标签页"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors shrink-0 mb-1"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Remote Selector & Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800/80">
        {/* Remote Dropdown */}
        <div className="relative flex items-center">
          <select
            value={activeTab.remote}
            onChange={(e) => updateActiveTab({ remote: e.target.value, path: '' })}
            className="bg-slate-950 border border-slate-700/80 hover:border-sky-500/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {remotes.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name === '@media'
                  ? '💾 本地存储 (/media)'
                  : r.name.startsWith('@')
                    ? `💾 挂载点: ${r.name.slice(1)} (${r.rootPath || ''})`
                    : `☁️ ${r.name}: (${r.type.toUpperCase()})`}
              </option>
            ))}
          </select>
        </div>

        {/* Up button */}
        <button
          onClick={handleGoUp}
          disabled={!activeTab.path}
          title="返回上级目录"
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 disabled:opacity-40 disabled:pointer-events-none"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>

        {/* Breadcrumb / Path Bar */}
        <div className="flex-1 min-w-[180px] flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 overflow-x-auto">
          {editingPathInput ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEditingPathInput(false);
                handleNavigate(pathInputVal);
              }}
              className="w-full flex items-center"
            >
              <input
                type="text"
                autoFocus
                value={pathInputVal}
                onChange={(e) => setPathInputVal(e.target.value)}
                onBlur={() => setEditingPathInput(false)}
                placeholder="输入子目录路径回车跳转..."
                className="w-full bg-transparent text-xs font-mono text-slate-100 focus:outline-none"
              />
            </form>
          ) : (
            <div
              className="flex items-center gap-1 text-xs w-full overflow-x-auto whitespace-nowrap cursor-text"
              onDoubleClick={() => {
                setPathInputVal(activeTab.path);
                setEditingPathInput(true);
              }}
              title="双击可直接输入路径"
            >
              <button
                onClick={() => handleNavigate('')}
                className="flex items-center gap-1 text-slate-400 hover:text-sky-400 font-medium px-1 py-0.5 rounded"
              >
                <Home className="w-3.5 h-3.5" />
                <span>根目录</span>
              </button>
              {breadcrumbs.map((bc) => (
                <React.Fragment key={bc.path}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <button
                    onClick={() => handleNavigate(bc.path)}
                    className="text-slate-200 hover:text-sky-400 font-medium px-1 py-0.5 rounded truncate max-w-[140px]"
                  >
                    {bc.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Quota Badge */}
        {quota && quota.supported && (quota.used !== undefined || quota.free !== undefined) && (
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            <span>已用 {formatBytes(quota.used, 1)}</span>
            {quota.total ? <span>/ {formatBytes(quota.total, 1)}</span> : null}
          </div>
        )}

        {/* Refresh */}
        <button
          onClick={loadDirectory}
          title="刷新目录"
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-sky-400 hover:border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-sky-400' : ''}`} />
        </button>
      </div>

      {/* Action & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-slate-900/50 border-b border-slate-800/60">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Upload */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>上传</span>
          </button>

          {/* New Folder */}
          <button
            onClick={() => {
              setNewFolderName('');
              setNewFolderModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>新建文件夹</span>
          </button>

          {/* Batch Delete */}
          {selectedEntries.length > 0 && (
            <button
              onClick={() => handleDeleteItems(selectedEntries)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除 ({selectedEntries.length})</span>
            </button>
          )}

          {/* Dual-Pane Commander Actions */}
          {oppositeTarget && (
            <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
              <button
                onClick={() => handleCommanderTransfer('copy')}
                disabled={selectedEntries.length === 0}
                title={`将选中项复制到对侧面板 (${oppositeTarget.remote}:${oppositeTarget.path || '/'})`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>复制到{paneSide === 'left' ? '右侧 →' : '← 左侧'}</span>
              </button>

              <button
                onClick={() => handleCommanderTransfer('move')}
                disabled={selectedEntries.length === 0}
                title={`将选中项移动到对侧面板 (${oppositeTarget.remote}:${oppositeTarget.path || '/'})`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 text-white text-xs font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <MoveRight className="w-3.5 h-3.5" />
                <span>移动</span>
              </button>

              <button
                onClick={() => handleCommanderTransfer('sync', false)}
                title={`将当前目录完整同步到对侧目录 (${oppositeTarget.remote}:${oppositeTarget.path || '/'})`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>同步目录</span>
              </button>
            </div>
          )}
        </div>

        {/* Search Input */}
        <div className="relative w-44 sm:w-52">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="过滤当前目录..."
            className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500/70 rounded-lg pl-8 pr-6 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* File Table Header */}
      <div className="grid grid-cols-12 items-center px-3 py-2 bg-slate-950/60 border-b border-slate-800/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        <div className="col-span-6 sm:col-span-6 flex items-center gap-2.5">
          <button onClick={toggleSelectAll} className="text-slate-400 hover:text-sky-400">
            {selectedPaths.size > 0 && selectedPaths.size === filteredAndSortedEntries.length ? (
              <CheckSquare className="w-4 h-4 text-sky-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => toggleSort('Name')}
            className="flex items-center gap-1 hover:text-slate-200"
          >
            <span>名称 ({filteredAndSortedEntries.length})</span>
            {sortBy === 'Name' &&
              (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        </div>

        <div className="col-span-2 text-right">
          <button
            onClick={() => toggleSort('Size')}
            className="inline-flex items-center gap-1 hover:text-slate-200"
          >
            <span>大小</span>
            {sortBy === 'Size' &&
              (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        </div>

        <div className="hidden sm:block sm:col-span-2 text-right">
          <button
            onClick={() => toggleSort('ModTime')}
            className="inline-flex items-center gap-1 hover:text-slate-200"
          >
            <span>修改时间</span>
            {sortBy === 'ModTime' &&
              (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        </div>

        <div className="col-span-4 sm:col-span-2 text-right pr-1">操作</div>
      </div>

      {/* File List Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
            <span className="text-xs">正在通过 Rclone 读取目录列表...</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 p-6 text-center gap-3">
            <div className="text-rose-400 text-xs max-w-md bg-rose-950/30 border border-rose-800/50 rounded-lg p-3">
              {error}
            </div>
            <button
              onClick={loadDirectory}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
            >
              重试
            </button>
          </div>
        ) : filteredAndSortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
            <Folder className="w-8 h-8 stroke-1 text-slate-600" />
            <p className="text-xs">当前目录为空（可将本地文件直接拖拽至此上传）</p>
          </div>
        ) : (
          filteredAndSortedEntries.map((entry) => {
            const isSelected = selectedPaths.has(entry.Path);
            const calculatedSize = dirSizes[entry.Path];

            return (
              <div
                key={entry.Path}
                onDoubleClick={() => {
                  if (entry.IsDir) {
                    handleNavigate(entry.Path);
                  } else {
                    onPreviewFile(activeTab.remote, entry);
                  }
                }}
                className={`group grid grid-cols-12 items-center px-3 py-2 text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-sky-500/15 hover:bg-sky-500/20'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                {/* Name & Checkbox */}
                <div className="col-span-6 sm:col-span-6 flex items-center gap-2.5 min-w-0 pr-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(entry.Path);
                    }}
                    className="text-slate-500 hover:text-sky-400 shrink-0"
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-sky-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                  {renderEntryIcon(entry)}
                  <span
                    onClick={(e) => {
                      if (entry.IsDir) {
                        e.stopPropagation();
                        handleNavigate(entry.Path);
                      }
                    }}
                    className={`truncate ${
                      entry.IsDir
                        ? 'font-medium text-slate-100 hover:text-sky-400'
                        : 'text-slate-200'
                    }`}
                    title={entry.Name}
                  >
                    {entry.Name}
                  </span>
                </div>

                {/* Size */}
                <div className="col-span-2 text-right font-mono text-[11px] text-slate-400">
                  {entry.IsDir ? (
                    calculatedSize !== undefined ? (
                      <span className="text-sky-400">{formatBytes(calculatedSize)}</span>
                    ) : (
                      <span className="text-slate-600">DIR</span>
                    )
                  ) : (
                    formatBytes(entry.Size)
                  )}
                </div>

                {/* ModTime */}
                <div className="hidden sm:block sm:col-span-2 text-right text-[11px] text-slate-400 truncate pl-2">
                  {formatDateTime(entry.ModTime)}
                </div>

                {/* Row Quick Actions */}
                <div
                  className="col-span-4 sm:col-span-2 flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  {entry.IsDir ? (
                    <button
                      onClick={() => handleCalculateSize(entry)}
                      disabled={calculatingPath === entry.Path}
                      title="统计文件夹大小 (rclone size)"
                      className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-sky-400"
                    >
                      {calculatingPath === entry.Path ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                      ) : (
                        <Calculator className="w-3.5 h-3.5" />
                      )}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => onPreviewFile(activeTab.remote, entry)}
                        title="在线预览"
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-sky-400"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={api.getDownloadUrl(activeTab.remote, entry.Path, false)}
                        download={entry.Name}
                        title="下载文件"
                        className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-emerald-400"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    </>
                  )}

                  <button
                    onClick={() => {
                      setRenameTarget(entry);
                      setRenameValue(entry.Name);
                    }}
                    title="重命名"
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-amber-400"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteItems([entry])}
                    title="删除"
                    className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pane Footer Summary */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-t border-slate-800/80 text-[11px] text-slate-400">
        <div>
          共 {entries.filter((e) => e.IsDir).length} 个文件夹，
          {entries.filter((e) => !e.IsDir).length} 个文件
          {selectedEntries.length > 0 && (
            <span className="ml-2 text-sky-400 font-medium">
              • 已选中 {selectedEntries.length} 项 (
              {formatBytes(
                selectedEntries.reduce((acc, item) => acc + (item.IsDir ? 0 : item.Size), 0)
              )}
              )
            </span>
          )}
        </div>
        <div className="font-mono text-slate-500 truncate max-w-[240px]">
          {activeTab.remote === '@media' ? '/media' : `${activeTab.remote}:`}/{activeTab.path}
        </div>
      </div>

      {/* Create Folder Modal */}
      {newFolderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateFolder}
            className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4"
          >
            <h4 className="text-sm font-semibold text-slate-100">新建文件夹</h4>
            <input
              type="text"
              autoFocus
              required
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="输入文件夹名称..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNewFolderModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
              >
                创建
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4">
          <form
            onSubmit={handleRenameSubmit}
            className="bg-slate-900 border border-slate-700 rounded-xl p-5 w-full max-w-sm shadow-2xl space-y-4"
          >
            <h4 className="text-sm font-semibold text-slate-100">重命名项目</h4>
            <input
              type="text"
              autoFocus
              required
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
              >
                保存
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
