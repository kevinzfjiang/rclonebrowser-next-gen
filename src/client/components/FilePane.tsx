import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Calculator,
  CheckSquare,
  ChevronRight,
  ClipboardCopy,
  Cloud,
  Columns,
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
  Filter,
  Folder,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Home,
  Loader2,
  Maximize2,
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
import {
  parseExcludePatterns,
  shouldFilterExplorerEntry,
} from '../../shared/filterPresets';
import { api, UploadProgressInfo } from '../api';
import { useI18n } from '../i18n';
import {
  formatBytes,
  formatDateTime,
  formatRemoteFullPath,
  formatRemoteShortLabel,
  formatSpeed,
  getFileCategory,
} from '../utils/format';
import {
  getCachedDirectory,
  getCachedQuota,
  invalidateDirectoryCache,
  invalidateQuotaCache,
  makeDirCacheKey,
  setCachedDirectory,
  setCachedQuota,
} from '../utils/fsCache';
import { ALERT_TONES, BADGE_TONES, TEXT_TONES, TINT_BUTTON_TONES } from '../utils/themeStyles';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Modal } from './ui/Modal';
import { QuotaBar } from './ui/QuotaBar';
import { RemoteSelect } from './ui/RemoteSelect';

export interface ExplorerTab {
  id: string;
  remote: string;
  path: string;
}

export interface SelectedTransferItem {
  path: string;
  name: string;
  isDir: boolean;
}

interface FilePaneProps {
  paneSide: 'left' | 'right' | 'single';
  isVisible?: boolean;
  isActivePane?: boolean;
  onFocusPane?: () => void;
  remotes: RemoteInfo[];
  tabs: ExplorerTab[];
  activeTabId: string;
  oppositeTarget?: { remote: string; path: string };
  onTabsChange: (tabs: ExplorerTab[], activeId: string) => void;
  onSelectionChange?: (items: SelectedTransferItem[]) => void;
  clearSelectionSignal?: number;
  onPreviewFile: (remote: string, entry: FileEntry) => void;
  onTriggerTransfer: (params: {
    operation: TransferOperation;
    srcRemote: string;
    srcPath: string;
    dstRemote: string;
    dstPath: string;
    items?: SelectedTransferItem[];
    dryRun?: boolean;
  }) => Promise<void>;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  refreshSignal?: number;
  globalExclude?: string;
  hideFilteredInExplorer?: boolean;
  onOpenFilterModal?: () => void;
  dualPane?: boolean;
  onToggleDualPane?: () => void;
}

const VIRTUALIZE_THRESHOLD = 150;
const ROW_HEIGHT = 38;
const OVERSCAN = 12;

export const FilePane: React.FC<FilePaneProps> = ({
  paneSide,
  isVisible = true,
  isActivePane = false,
  onFocusPane,
  remotes,
  tabs,
  activeTabId,
  oppositeTarget,
  onTabsChange,
  onSelectionChange,
  clearSelectionSignal,
  onPreviewFile,
  onTriggerTransfer,
  onNotify,
  refreshSignal,
  globalExclude = '',
  hideFilteredInExplorer = true,
  onOpenFilterModal,
  dualPane = true,
  onToggleDualPane,
}) => {
  const { locale, tr } = useI18n();
  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  );

  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<'Name' | 'Size' | 'ModTime'>('Name');
  const [sortAsc, setSortAsc] = useState(true);
  const [quota, setQuota] = useState<StorageQuota | null>(null);
  const [dirSizes, setDirSizes] = useState<Record<string, number>>({});
  const [calculatingKey, setCalculatingKey] = useState<string | null>(null);

  // Upload state with real progress & abort support
  const [uploadState, setUploadState] = useState<{
    fileCount: number;
    progress: UploadProgressInfo;
  } | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  // Flicker-free drag counter
  const [dragOver, setDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  // Modals & Confirm Dialogs
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editingPathInput, setEditingPathInput] = useState(false);
  const [pathInputVal, setPathInputVal] = useState('');
  const [deleteConfirmItems, setDeleteConfirmItems] = useState<FileEntry[] | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: FileEntry;
  } | null>(null);

  // Virtual scrolling state
  const listContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const listReqIdRef = useRef(0);
  const quotaReqIdRef = useRef(0);
  const lastClickedIdxRef = useRef<number | null>(null);
  const loadedTargetKeyRef = useRef<string>('');
  const prevRefreshSignalRef = useRef(refreshSignal);
  const prevQuotaRefreshSignalRef = useRef(refreshSignal);
  const errorRef = useRef<string | null>(error);
  errorRef.current = error;
  const trRef = useRef(tr);
  trRef.current = tr;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  const activeRemote = activeTab?.remote ?? '';
  const activePath = activeTab?.path ?? '';

  const getDirSizeKey = useCallback(
    (remote: string, entryPath: string) => `${remote}:${entryPath}`,
    []
  );

  const updateActiveTab = useCallback(
    (patch: Partial<ExplorerTab>) => {
      const next = tabs.map((t) => (t.id === activeTab.id ? { ...t, ...patch } : t));
      onTabsChange(next, activeTab.id);
    },
    [tabs, activeTab, onTabsChange]
  );

  // Auto-clear search & scroll to top when switching tab / remote / folder
  useEffect(() => {
    setSearchQuery('');
    lastClickedIdxRef.current = null;
    savedScrollTopRef.current = 0;
    if (listContainerRef.current) {
      listContainerRef.current.scrollTop = 0;
      setScrollTop(0);
    }
  }, [activeTab?.id, activeRemote, activePath]);

  // Preserve scroll position & close transient context menu across keep-alive hide/show
  useEffect(() => {
    if (!isVisible) {
      setContextMenu(null);
      return;
    }
    const el = listContainerRef.current;
    if (el) {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
      if (savedScrollTopRef.current > 0) {
        el.scrollTop = savedScrollTopRef.current;
      }
    }
  }, [isVisible]);

  // External clear selection trigger (e.g., from Center Shuttle Bar)
  useEffect(() => {
    if (clearSelectionSignal) {
      setSelectedPaths(new Set());
      lastClickedIdxRef.current = null;
    }
  }, [clearSelectionSignal]);

  // Measure list viewport height for virtual scrolling
  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };
    updateHeight();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateHeight);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Load directory with in-memory LRU/SWR cache, AbortController & sequence guard
  const loadDirectory = useCallback(
    async (options?: { signal?: AbortSignal; force?: boolean }) => {
      if (!activeRemote) return;
      const reqId = ++listReqIdRef.current;
      const force = Boolean(options?.force);
      const externalSignal = options?.signal;
      const targetKey = makeDirCacheKey(activeRemote, activePath);
      const sameTarget = loadedTargetKeyRef.current === targetKey;

      if (!sameTarget) {
        setSelectedPaths(new Set());
        lastClickedIdxRef.current = null;
      }

      const cached = getCachedDirectory(activeRemote, activePath);
      if (cached && !force) {
        setEntries(cached.entries);
        setError(null);
        loadedTargetKeyRef.current = targetKey;
        setLoading(false);

        if (!cached.isStale) {
          setRefreshing(false);
          return;
        }
      }

      const hasVisibleData = Boolean(cached) || (force && sameTarget && !errorRef.current);
      if (hasVisibleData) {
        setLoading(false);
        setRefreshing(true);
      } else {
        setLoading(true);
        setRefreshing(false);
      }
      setError(null);

      try {
        const res = await api.listDirectory(activeRemote, activePath, externalSignal);
        if (reqId !== listReqIdRef.current) return;
        const nextEntries = res.entries || [];
        setCachedDirectory(activeRemote, activePath, nextEntries);
        setEntries(nextEntries);
        loadedTargetKeyRef.current = targetKey;
      } catch (err: any) {
        if (err?.name === 'AbortError' || reqId !== listReqIdRef.current) return;
        const errMsg =
          err.message || trRef.current('无法加载目录', '無法載入目錄', 'Failed to load directory');
        if (hasVisibleData) {
          if (force) {
            onNotifyRef.current(errMsg, 'error');
          }
        } else {
          setError(errMsg);
          setEntries([]);
          loadedTargetKeyRef.current = '';
        }
      } finally {
        if (reqId === listReqIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [activeRemote, activePath]
  );

  useEffect(() => {
    const isRefreshTrigger = prevRefreshSignalRef.current !== refreshSignal;
    prevRefreshSignalRef.current = refreshSignal;
    const controller = new AbortController();
    loadDirectory({ signal: controller.signal, force: isRefreshTrigger });
    return () => controller.abort();
  }, [loadDirectory, refreshSignal]);

  // Load quota with in-memory cache, AbortController + sequence guard
  useEffect(() => {
    if (!activeRemote) return;
    const isRefreshTrigger = prevQuotaRefreshSignalRef.current !== refreshSignal;
    prevQuotaRefreshSignalRef.current = refreshSignal;

    const reqId = ++quotaReqIdRef.current;
    const cached = getCachedQuota(activeRemote);
    if (cached && !isRefreshTrigger) {
      setQuota(cached.quota.supported ? cached.quota : null);
      if (!cached.isStale) {
        return;
      }
    } else if (!cached && !isRefreshTrigger) {
      setQuota(null);
    }

    const controller = new AbortController();
    api
      .getRemoteQuota(activeRemote, controller.signal)
      .then((q) => {
        if (reqId !== quotaReqIdRef.current) return;
        setCachedQuota(activeRemote, q);
        setQuota(q.supported ? q : null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [activeRemote, refreshSignal]);

  // Select filename without extension when opening Rename modal
  useEffect(() => {
    if (!renameTarget) return;
    const timer = setTimeout(() => {
      const input = renameInputRef.current;
      if (!input) return;
      input.focus();
      if (!renameTarget.IsDir) {
        const dotIdx = renameTarget.Name.lastIndexOf('.');
        if (dotIdx > 0) {
          input.setSelectionRange(0, dotIdx);
          return;
        }
      }
      input.select();
    }, 30);
    return () => clearTimeout(timer);
  }, [renameTarget]);

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

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

  const handleNavigate = useCallback(
    (newPath: string) => {
      const clean = newPath.replace(/^\/+/, '').replace(/\/+$/, '');
      updateActiveTab({ path: clean });
    },
    [updateActiveTab]
  );

  const handleGoUp = useCallback(() => {
    if (!activeTab?.path) return;
    const parts = activeTab.path.split('/').filter(Boolean);
    parts.pop();
    handleNavigate(parts.join('/'));
  }, [activeTab?.path, handleNavigate]);

  const breadcrumbs = useMemo(() => {
    if (!activeTab?.path) return [];
    const parts = activeTab.path.split('/').filter(Boolean);
    return parts.map((name, i) => ({
      name,
      path: parts.slice(0, i + 1).join('/'),
    }));
  }, [activeTab?.path]);

  const activeExcludePatterns = useMemo(
    () => parseExcludePatterns(globalExclude),
    [globalExclude]
  );

  const { filteredAndSortedEntries, hiddenByFilterCount, visibleDirCount, visibleFileCount } =
    useMemo(() => {
      let hiddenCount = 0;
      const baseEntries = hideFilteredInExplorer
        ? entries.filter((e) => {
            const isHidden = shouldFilterExplorerEntry(e.Name, e.IsDir, activeExcludePatterns);
            if (isHidden) hiddenCount++;
            return !isHidden;
          })
        : entries;

      const q = searchQuery.trim().toLowerCase();
      const filtered = q
        ? baseEntries.filter((e) => e.Name.toLowerCase().includes(q))
        : baseEntries.slice();

      const sorted = filtered.sort((a, b) => {
        if (a.IsDir !== b.IsDir) return a.IsDir ? -1 : 1;
        let cmp = 0;
        if (sortBy === 'Name') {
          cmp = a.Name.localeCompare(b.Name, undefined, { numeric: true });
        } else if (sortBy === 'Size') {
          const sizeA = a.IsDir ? dirSizes[getDirSizeKey(activeTab.remote, a.Path)] || 0 : a.Size;
          const sizeB = b.IsDir ? dirSizes[getDirSizeKey(activeTab.remote, b.Path)] || 0 : b.Size;
          cmp = sizeA - sizeB;
        } else if (sortBy === 'ModTime') {
          cmp = new Date(a.ModTime).getTime() - new Date(b.ModTime).getTime();
        }
        return sortAsc ? cmp : -cmp;
      });

      let dirs = 0;
      let files = 0;
      for (const item of sorted) {
        if (item.IsDir) dirs++;
        else files++;
      }

      return {
        filteredAndSortedEntries: sorted,
        hiddenByFilterCount: hiddenCount,
        visibleDirCount: dirs,
        visibleFileCount: files,
      };
    }, [
      entries,
      hideFilteredInExplorer,
      activeExcludePatterns,
      searchQuery,
      sortBy,
      sortAsc,
      dirSizes,
      activeTab?.remote,
      getDirSizeKey,
    ]);

  // Only count currently visible entries as selected (prevents invisible hidden selections)
  const selectedEntries = useMemo(
    () => filteredAndSortedEntries.filter((e) => selectedPaths.has(e.Path)),
    [filteredAndSortedEntries, selectedPaths]
  );

  // Sync selection summary up to App (for Center Commander Shuttle Bar)
  useEffect(() => {
    onSelectionChange?.(
      selectedEntries.map((e) => ({ path: e.Path, name: e.Name, isDir: e.IsDir }))
    );
  }, [selectedEntries, onSelectionChange]);

  const toggleSelect = (pathStr: string, idx: number) => {
    lastClickedIdxRef.current = idx;
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathStr)) next.delete(pathStr);
      else next.add(pathStr);
      return next;
    });
  };

  const handleRowClick = (entry: FileEntry, idx: number, e: React.MouseEvent) => {
    onFocusPane?.();
    setContextMenu(null);

    if (e.shiftKey && lastClickedIdxRef.current !== null) {
      const start = Math.min(lastClickedIdxRef.current, idx);
      const end = Math.max(lastClickedIdxRef.current, idx);
      const rangePaths = filteredAndSortedEntries.slice(start, end + 1).map((item) => item.Path);
      setSelectedPaths((prev) => {
        const next = e.ctrlKey || e.metaKey ? new Set(prev) : new Set<string>();
        for (const p of rangePaths) next.add(p);
        return next;
      });
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      toggleSelect(entry.Path, idx);
      return;
    }

    lastClickedIdxRef.current = idx;
    setSelectedPaths(new Set([entry.Path]));
  };

  const toggleSelectAll = useCallback(() => {
    if (
      selectedEntries.length === filteredAndSortedEntries.length &&
      filteredAndSortedEntries.length > 0
    ) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(filteredAndSortedEntries.map((e) => e.Path)));
    }
  }, [selectedEntries.length, filteredAndSortedEntries]);

  // Keyboard shortcuts when this pane is focused
  useEffect(() => {
    if (!isActivePane) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (newFolderModal || renameTarget || deleteConfirmItems || syncConfirmOpen) {
        return;
      }

      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
        } else if (selectedPaths.size > 0) {
          setSelectedPaths(new Set());
        }
      } else if (e.key === 'Backspace') {
        if (activeTab?.path) {
          e.preventDefault();
          handleGoUp();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        toggleSelectAll();
      } else if (e.key === 'Enter' && selectedEntries.length === 1) {
        e.preventDefault();
        const item = selectedEntries[0];
        if (item.IsDir) handleNavigate(item.Path);
        else onPreviewFile(activeTab.remote, item);
      } else if (e.key === 'F2' && selectedEntries.length === 1) {
        e.preventDefault();
        setRenameTarget(selectedEntries[0]);
        setRenameValue(selectedEntries[0].Name);
      } else if (e.key === 'Delete' && selectedEntries.length > 0) {
        e.preventDefault();
        setDeleteConfirmItems(selectedEntries);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isActivePane,
    newFolderModal,
    renameTarget,
    deleteConfirmItems,
    syncConfirmOpen,
    contextMenu,
    selectedPaths.size,
    selectedEntries,
    activeTab,
    handleGoUp,
    handleNavigate,
    onPreviewFile,
    toggleSelectAll,
  ]);

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newFolderName.trim();
    if (!cleanName) return;
    const targetPath = activeTab.path ? `${activeTab.path}/${cleanName}` : cleanName;
    try {
      await api.makeDirectory(activeTab.remote, targetPath);
      setNewFolderModal(false);
      setNewFolderName('');
      onNotify(
        tr(`已创建目录: ${cleanName}`, `已建立目錄: ${cleanName}`, `Created folder: ${cleanName}`),
        'success'
      );
      invalidateDirectoryCache(activeTab.remote, activeTab.path);
      loadDirectory({ force: true });
    } catch (err: any) {
      onNotify(
        err.message || tr('创建目录失败', '建立目錄失敗', 'Failed to create folder'),
        'error'
      );
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
      onNotify(
        tr(
          `已重命名为: ${cleanNewName}`,
          `已重新命名為: ${cleanNewName}`,
          `Renamed to: ${cleanNewName}`
        ),
        'success'
      );
      invalidateDirectoryCache(activeTab.remote, activeTab.path);
      if (renameTarget.IsDir) {
        invalidateDirectoryCache(activeTab.remote, renameTarget.Path, true);
      }
      loadDirectory({ force: true });
    } catch (err: any) {
      onNotify(err.message || tr('重命名失败', '重新命名失敗', 'Rename failed'), 'error');
    }
  };

  const executeDeleteItems = async () => {
    if (!deleteConfirmItems || deleteConfirmItems.length === 0) return;
    setDeletingBusy(true);
    try {
      await api.deleteEntries(
        activeTab.remote,
        deleteConfirmItems.map((i) => ({ path: i.Path, isDir: i.IsDir }))
      );
      onNotify(
        tr(
          `已删除 ${deleteConfirmItems.length} 个项目`,
          `已刪除 ${deleteConfirmItems.length} 個項目`,
          `Deleted ${deleteConfirmItems.length} item(s)`
        ),
        'success'
      );
      invalidateDirectoryCache(activeTab.remote, activeTab.path);
      for (const item of deleteConfirmItems) {
        if (item.IsDir) {
          invalidateDirectoryCache(activeTab.remote, item.Path, true);
        }
      }
      invalidateQuotaCache(activeTab.remote);
      setDeleteConfirmItems(null);
      setSelectedPaths(new Set());
      lastClickedIdxRef.current = null;
      loadDirectory({ force: true });
    } catch (err: any) {
      onNotify(err.message || tr('删除失败', '刪除失敗', 'Delete failed'), 'error');
    } finally {
      setDeletingBusy(false);
    }
  };

  const handleCalculateSize = async (entry: FileEntry) => {
    const cacheKey = getDirSizeKey(activeTab.remote, entry.Path);
    setCalculatingKey(cacheKey);
    try {
      const res = await api.calculateDirSize(activeTab.remote, entry.Path);
      setDirSizes((prev) => ({ ...prev, [cacheKey]: res.bytes }));
      onNotify(
        tr(
          `目录 "${entry.Name}" 共包含 ${res.count} 个文件，大小 ${formatBytes(res.bytes)}`,
          `目錄 "${entry.Name}" 共包含 ${res.count} 個檔案，大小 ${formatBytes(res.bytes)}`,
          `Folder "${entry.Name}" contains ${res.count} files (${formatBytes(res.bytes)})`
        ),
        'info'
      );
    } catch (err: any) {
      onNotify(
        err.message || tr('计算目录大小失败', '計算目錄大小失敗', 'Failed to calculate folder size'),
        'error'
      );
    } finally {
      setCalculatingKey(null);
    }
  };

  // Chunked upload (batches of 50 to match backend multer limit) with real progress + cancel
  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files || []);
    if (fileArray.length === 0) return;

    const controller = new AbortController();
    uploadAbortRef.current = controller;
    const totalBytesAll = fileArray.reduce((sum, f) => sum + f.size, 0);
    let uploadedBytesPrior = 0;
    let uploadedCount = 0;

    setUploadState({
      fileCount: fileArray.length,
      progress: { loaded: 0, total: totalBytesAll, percent: 0, speed: 0 },
    });

    try {
      const BATCH_SIZE = 50;
      for (let i = 0; i < fileArray.length; i += BATCH_SIZE) {
        const batch = fileArray.slice(i, i + BATCH_SIZE);
        const batchBytes = batch.reduce((sum, f) => sum + f.size, 0);
        const res = await api.uploadFiles(activeTab.remote, activeTab.path, batch, {
          signal: controller.signal,
          onProgress: (info) => {
            const aggLoaded = uploadedBytesPrior + info.loaded;
            const aggPercent =
              totalBytesAll > 0
                ? Math.min(100, Math.round((aggLoaded / totalBytesAll) * 100))
                : info.percent;
            setUploadState({
              fileCount: fileArray.length,
              progress: {
                loaded: aggLoaded,
                total: totalBytesAll || info.total,
                percent: aggPercent,
                speed: info.speed,
              },
            });
          },
        });
        uploadedBytesPrior += batchBytes;
        uploadedCount += res.count;
      }

      onNotify(
        tr(
          `成功上传 ${uploadedCount} 个文件`,
          `成功上傳 ${uploadedCount} 個檔案`,
          `Uploaded ${uploadedCount} file(s) successfully`
        ),
        'success'
      );
      invalidateDirectoryCache(activeTab.remote, activeTab.path);
      invalidateQuotaCache(activeTab.remote);
      loadDirectory({ force: true });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        onNotify(tr('已取消文件上传', '已取消檔案上傳', 'Upload cancelled'), 'info');
      } else {
        onNotify(err.message || tr('上传失败', '上傳失敗', 'Upload failed'), 'error');
      }
    } finally {
      uploadAbortRef.current = null;
      setUploadState(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCopyPathToClipboard = async (entryPath: string) => {
    const full = formatRemoteFullPath(activeTab.remote, entryPath, remotes);
    try {
      await navigator.clipboard.writeText(full);
      onNotify(tr(`已复制路径: ${full}`, `已複製路徑: ${full}`, `Copied path: ${full}`), 'info');
    } catch {
      onNotify(tr('复制路径失败', '複製路徑失敗', 'Failed to copy path'), 'error');
    }
  };

  const handleTransferSpecificItems = async (
    operation: TransferOperation,
    items: FileEntry[],
    dryRun = false
  ) => {
    if (!oppositeTarget) return;
    await onTriggerTransfer({
      operation,
      srcRemote: activeTab.remote,
      srcPath: activeTab.path,
      dstRemote: oppositeTarget.remote,
      dstPath: oppositeTarget.path,
      items: items.map((e) => ({ path: e.Path, name: e.Name, isDir: e.IsDir })),
      dryRun,
    });
    setSelectedPaths(new Set());
  };

  const handleSyncDir = async (dryRun: boolean) => {
    if (!oppositeTarget) return;
    setSyncConfirmOpen(false);
    await onTriggerTransfer({
      operation: 'sync',
      srcRemote: activeTab.remote,
      srcPath: activeTab.path,
      dstRemote: oppositeTarget.remote,
      dstPath: oppositeTarget.path,
      dryRun,
    });
  };

  const renderEntryIcon = (entry: FileEntry) => {
    if (entry.IsDir) {
      return (
        <Folder className="w-4 h-4 text-amber-500 dark:text-amber-400 fill-amber-400/20 shrink-0" />
      );
    }
    const cat = getFileCategory(entry);
    switch (cat) {
      case 'image':
        return <FileImage className="w-4 h-4 text-pink-500 dark:text-pink-400 shrink-0" />;
      case 'video':
        return <Film className="w-4 h-4 text-purple-500 dark:text-purple-400 shrink-0" />;
      case 'audio':
        return <Music className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />;
      case 'archive':
        return <FileArchive className="w-4 h-4 text-orange-500 dark:text-orange-400 shrink-0" />;
      case 'spreadsheet':
        return <FileSpreadsheet className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />;
      case 'code':
        return <FileCode className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />;
      case 'pdf':
        return <FileText className="w-4 h-4 text-rose-500 dark:text-rose-400 shrink-0" />;
      case 'text':
        return <FileText className="w-4 h-4 text-slate-400 dark:text-slate-300 shrink-0" />;
      default:
        return <File className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  const toggleSort = (col: 'Name' | 'Size' | 'ModTime') => {
    if (sortBy === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(col);
      setSortAsc(true);
    }
  };

  // Virtual window computation
  const shouldVirtualize = filteredAndSortedEntries.length > VIRTUALIZE_THRESHOLD;
  const totalVirtualHeight = filteredAndSortedEntries.length * ROW_HEIGHT;
  const startIdx = shouldVirtualize
    ? Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    : 0;
  const endIdx = shouldVirtualize
    ? Math.min(
        filteredAndSortedEntries.length,
        Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN
      )
    : filteredAndSortedEntries.length;
  const visibleSlice = filteredAndSortedEntries.slice(startIdx, endIdx);
  const topSpacerHeight = shouldVirtualize ? startIdx * ROW_HEIGHT : 0;
  const bottomSpacerHeight = shouldVirtualize
    ? Math.max(0, totalVirtualHeight - endIdx * ROW_HEIGHT)
    : 0;

  return (
    <div
      data-pane={paneSide}
      onMouseDown={() => onFocusPane?.()}
      className={`relative flex flex-col h-full min-h-0 bg-slate-900/70 border rounded-xl overflow-hidden transition-colors ${
        dragOver
          ? 'border-sky-400 ring-2 ring-sky-500/30'
          : isActivePane && dualPane
            ? 'border-sky-500/60 shadow-sm shadow-sky-500/10'
            : 'border-slate-800/90'
      }`}
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepthRef.current += 1;
        if (e.dataTransfer.types.includes('Files')) {
          setDragOver(true);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setDragOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepthRef.current = 0;
        setDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleUploadFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Full-pane Dropzone Overlay */}
      {dragOver && (
        <div className="absolute inset-2 z-30 rounded-xl border-2 border-dashed border-sky-400 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none animate-modal-in">
          <div className="p-3 rounded-2xl bg-sky-500/20 text-sky-400">
            <Upload className="w-7 h-7" />
          </div>
          <p className="text-sm font-semibold text-slate-100">
            {tr('释放鼠标以上传文件至此目录', '釋放滑鼠以上傳檔案至此目錄', 'Drop files to upload here')}
          </p>
          <p className="text-xs font-mono text-sky-500 dark:text-sky-400">
            {formatRemoteFullPath(activeTab.remote, activeTab.path, remotes)}
          </p>
        </div>
      )}

      {/* Row 1: Multi-Tab Bar */}
      <div className="flex items-center justify-between bg-slate-950/90 border-b border-slate-800/80 px-2 pt-1.5 gap-2 shrink-0 select-none">
        <div className="flex items-center gap-1 overflow-x-auto min-w-0">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            const folderLabel = tab.path ? tab.path.split('/').pop() : '/';
            const isLocalMount = tab.remote.startsWith('@');
            const remoteLabel = formatRemoteShortLabel(tab.remote, tr);
            return (
              <div
                key={tab.id}
                onClick={() => onTabsChange(tabs, tab.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-lg text-xs font-medium cursor-pointer border-t border-x transition-all max-w-[190px] shrink-0 ${
                  isActive
                    ? 'bg-slate-900 text-sky-600 dark:text-sky-400 border-slate-700/80'
                    : 'bg-slate-950/40 text-slate-400 border-transparent hover:bg-slate-900/50 hover:text-slate-200'
                }`}
              >
                {isLocalMount ? (
                  <HardDrive className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Cloud className="w-3.5 h-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                )}
                <span className="truncate">
                  {remoteLabel} {folderLabel}
                </span>
                {tabs.length > 1 && (
                  <button
                    type="button"
                    aria-label={tr('关闭标签页', '關閉分頁', 'Close tab')}
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
            type="button"
            onClick={handleAddTab}
            aria-label={tr('新建标签页', '新增分頁', 'New Tab')}
            title={tr('新建标签页', '新增分頁', 'New Tab')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors shrink-0 mb-1"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dual-Pane Toggle (rendered once by App on the rightmost pane) */}
        {onToggleDualPane && (
          <button
            type="button"
            onClick={onToggleDualPane}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 mb-1 rounded-lg text-[11px] font-medium border transition-colors shrink-0 whitespace-nowrap ${
              dualPane
                ? TINT_BUTTON_TONES.indigo
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-sky-500 hover:border-slate-700'
            }`}
            title={tr(
              '切换双栏 Commander 对比视图 / 单栏视图',
              '切換雙欄 Commander 對比檢視 / 單欄檢視',
              'Toggle Dual-Pane Commander / Single-Pane View'
            )}
          >
            {dualPane ? <Columns className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>
              {dualPane
                ? tr('双栏视图', '雙欄檢視', 'Dual-Pane')
                : tr('单栏视图', '單欄檢視', 'Single-Pane')}
            </span>
          </button>
        )}
      </div>

      {/* Row 2: Remote Selector, Up, Breadcrumb, QuotaBar & Refresh */}
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 bg-slate-900 border-b border-slate-800/80 shrink-0">
        <RemoteSelect
          remotes={remotes}
          value={activeTab.remote}
          onChange={(nextRemote) => updateActiveTab({ remote: nextRemote, path: '' })}
          ariaLabel={tr('选择存储源', '選擇儲存源', 'Select Remote')}
          className="max-w-[170px] sm:max-w-[200px]"
        />

        <button
          type="button"
          onClick={handleGoUp}
          disabled={!activeTab.path}
          aria-label={tr('返回上级目录', '返回上層目錄', 'Go Up')}
          title={tr('返回上级目录 (Backspace)', '返回上層目錄 (Backspace)', 'Go Up (Backspace)')}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-sky-400 hover:border-slate-700 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>

        {/* Breadcrumb / Direct Path Input */}
        <div className="flex-1 min-w-[140px] flex items-center bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 overflow-x-auto">
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
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingPathInput(false);
                }}
                placeholder={tr(
                  '输入子目录路径回车跳转...',
                  '輸入子目錄路徑按 Enter 跳轉...',
                  'Enter path and press Enter...'
                )}
                className="w-full bg-transparent text-xs font-mono text-slate-100 focus:outline-none"
              />
            </form>
          ) : (
            <div
              className="flex items-center gap-0.5 text-xs w-full overflow-x-auto whitespace-nowrap cursor-text select-none"
              onDoubleClick={() => {
                setPathInputVal(activeTab.path);
                setEditingPathInput(true);
              }}
              title={tr('双击可直接输入路径', '雙擊可直接輸入路徑', 'Double-click to type path')}
            >
              <button
                type="button"
                onClick={() => handleNavigate('')}
                className="flex items-center gap-1 text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 font-medium px-1 py-0.5 rounded shrink-0"
              >
                <Home className="w-3.5 h-3.5" />
                <span>{tr('根目录', '根目錄', 'Root')}</span>
              </button>
              {breadcrumbs.map((bc) => (
                <React.Fragment key={bc.path}>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <button
                    type="button"
                    onClick={() => handleNavigate(bc.path)}
                    className="text-slate-200 hover:text-sky-500 dark:hover:text-sky-400 font-medium px-1 py-0.5 rounded truncate max-w-[130px]"
                  >
                    {bc.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Compact Visual Quota Bar */}
        {quota && quota.supported && <QuotaBar quota={quota} compact />}

        <button
          type="button"
          onClick={() => {
            invalidateDirectoryCache(activeTab.remote, activeTab.path);
            invalidateQuotaCache(activeTab.remote);
            loadDirectory({ force: true });
          }}
          aria-label={tr('刷新目录', '重新整理目錄', 'Refresh')}
          title={tr('刷新目录', '重新整理目錄', 'Refresh')}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 hover:text-sky-400 hover:border-slate-700 transition-colors shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || refreshing ? 'animate-spin text-sky-400' : ''}`} />
        </button>
      </div>

      {/* Row 3: Streamlined Action & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-2.5 py-1.5 bg-slate-900/50 border-b border-slate-800/60 shrink-0 select-none">
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={Boolean(uploadState)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
          >
            {uploadState ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            <span>{tr('上传', '上傳', 'Upload')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setNewFolderName('');
              setNewFolderModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>{tr('新建文件夹', '新增資料夾', 'New Folder')}</span>
          </button>

          {/* Compact mobile/narrow sync trigger (on lg+ the Center Shuttle Bar handles Copy/Move/Sync) */}
          {oppositeTarget && (
            <button
              type="button"
              onClick={() => setSyncConfirmOpen(true)}
              title={`${tr('将当前目录同步到对侧目录', '將目前目錄同步到對側目錄', 'Sync folder to opposite pane')} (${formatRemoteFullPath(oppositeTarget.remote, oppositeTarget.path, remotes)})`}
              className={`lg:hidden inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${TINT_BUTTON_TONES.emerald}`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>{tr('同步', '同步', 'Sync')}</span>
            </button>
          )}
        </div>

        {/* Filter & Search */}
        <div className="flex items-center gap-1.5">
          {onOpenFilterModal && (
            <button
              type="button"
              onClick={onOpenFilterModal}
              title={tr(
                `配置全局过滤规则 (已激活 ${activeExcludePatterns.length} 条，本目录隐藏 ${hiddenByFilterCount} 项)`,
                `設定全域過濾規則 (已啟用 ${activeExcludePatterns.length} 條，本目錄隱藏 ${hiddenByFilterCount} 項)`,
                `Configure exclude filter rules (${activeExcludePatterns.length} active, ${hiddenByFilterCount} hidden)`
              )}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                hiddenByFilterCount > 0
                  ? BADGE_TONES.amber
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-sky-500 dark:hover:text-sky-300 hover:border-slate-700'
              }`}
            >
              <Filter className="w-3 h-3" />
              <span>
                {tr('过滤', '過濾', 'Filter')}
                {hiddenByFilterCount > 0 ? ` (-${hiddenByFilterCount})` : ''}
              </span>
            </button>
          )}

          <div className="relative w-36 sm:w-44">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr('搜索当前目录...', '搜尋目前目錄...', 'Search folder...')}
              className="w-full bg-slate-950 border border-slate-800 focus:border-sky-500/70 rounded-lg pl-8 pr-6 py-1 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label={tr('清空搜索', '清空搜尋', 'Clear search')}
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Upload Progress Banner */}
      {uploadState && (
        <div className="px-3 py-2 bg-sky-500/10 border-b border-sky-500/30 space-y-1.5 shrink-0">
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-200 min-w-0">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-500 shrink-0" />
              <span className="truncate font-medium">
                {tr(
                  `正在上传 ${uploadState.fileCount} 个文件...`,
                  `正在上傳 ${uploadState.fileCount} 個檔案...`,
                  `Uploading ${uploadState.fileCount} file(s)...`
                )}
              </span>
            </div>
            <div className="flex items-center gap-2.5 font-mono text-[11px] shrink-0">
              <span className={TEXT_TONES.sky}>{uploadState.progress.percent}%</span>
              <span className="text-slate-400">
                {formatBytes(uploadState.progress.loaded, 1)} /{' '}
                {formatBytes(uploadState.progress.total, 1)}
              </span>
              {uploadState.progress.speed > 0 && (
                <span className={TEXT_TONES.emerald}>
                  {formatSpeed(uploadState.progress.speed)}
                </span>
              )}
              <button
                type="button"
                onClick={() => uploadAbortRef.current?.abort()}
                className="px-1.5 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 text-[10px] font-sans font-medium"
              >
                {tr('取消', '取消', 'Cancel')}
              </button>
            </div>
          </div>
          <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-200"
              style={{ width: `${uploadState.progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* File Table Header */}
      <div className="grid grid-cols-[minmax(0,1fr)_72px_92px] sm:grid-cols-[minmax(0,1fr)_82px_124px_104px] items-center px-3 py-1.5 bg-slate-950/60 border-b border-slate-800/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={toggleSelectAll}
            aria-label={tr('全选 / 取消全选', '全選 / 取消全選', 'Toggle select all')}
            className="text-slate-400 hover:text-sky-400 shrink-0"
          >
            {selectedEntries.length > 0 &&
            selectedEntries.length === filteredAndSortedEntries.length ? (
              <CheckSquare className="w-4 h-4 text-sky-500 dark:text-sky-400" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => toggleSort('Name')}
            className="flex items-center gap-1 hover:text-slate-200 truncate"
          >
            <span>
              {tr('名称', '名稱', 'Name')} ({filteredAndSortedEntries.length})
            </span>
            {sortBy === 'Name' &&
              (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        </div>

        <div className="text-right">
          <button
            type="button"
            onClick={() => toggleSort('Size')}
            className="inline-flex items-center gap-1 hover:text-slate-200"
          >
            <span>{tr('大小', '大小', 'Size')}</span>
            {sortBy === 'Size' &&
              (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        </div>

        <div className="hidden sm:block text-right">
          <button
            type="button"
            onClick={() => toggleSort('ModTime')}
            className="inline-flex items-center gap-1 hover:text-slate-200"
          >
            <span>{tr('修改时间', '修改時間', 'Modified')}</span>
            {sortBy === 'ModTime' &&
              (sortAsc ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        </div>

        <div className="text-right pr-1">{tr('操作', '操作', 'Actions')}</div>
      </div>

      {/* File List Body (with automatic virtual scrolling for large folders) */}
      <div
        ref={listContainerRef}
        onScroll={(e) => {
          savedScrollTopRef.current = e.currentTarget.scrollTop;
          if (shouldVirtualize) {
            setScrollTop(e.currentTarget.scrollTop);
          }
        }}
        className="flex-1 overflow-y-auto min-h-0"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-56 text-slate-400 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-sky-400" />
            <span className="text-xs">
              {tr(
                '正在通过 Rclone 读取目录列表...',
                '正在透過 Rclone 讀取目錄清單...',
                'Reading directory via Rclone...'
              )}
            </span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-56 p-6 text-center gap-3">
            <div className={`text-xs max-w-md border rounded-xl p-3 select-text ${ALERT_TONES.error}`}>
              {error}
            </div>
            <div className="flex items-center gap-2">
              {activeTab.path && (
                <button
                  type="button"
                  onClick={() => handleNavigate('')}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                >
                  {tr('返回根目录', '返回根目錄', 'Go to Root')}
                </button>
              )}
              <button
                type="button"
                onClick={() => loadDirectory({ force: true })}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs text-white"
              >
                {tr('重试', '重試', 'Retry')}
              </button>
            </div>
          </div>
        ) : filteredAndSortedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-56 text-slate-500 gap-2.5 p-6 text-center">
            {searchQuery.trim() ? (
              <>
                <Search className="w-7 h-7 stroke-1 text-slate-600" />
                <p className="text-xs text-slate-400">
                  {tr(
                    `未找到匹配 "${searchQuery}" 的文件或文件夹`,
                    `未找到符合 "${searchQuery}" 的檔案或資料夾`,
                    `No files or folders match "${searchQuery}"`
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
                >
                  {tr('清除搜索词', '清除搜尋詞', 'Clear Search')}
                </button>
              </>
            ) : hiddenByFilterCount > 0 ? (
              <>
                <Filter className="w-7 h-7 stroke-1 text-amber-500" />
                <p className="text-xs text-slate-400">
                  {tr(
                    `当前目录的 ${hiddenByFilterCount} 个项目均被全局过滤规则隐藏`,
                    `目前目錄的 ${hiddenByFilterCount} 個項目均被全域過濾規則隱藏`,
                    `All ${hiddenByFilterCount} item(s) in this folder are hidden by global exclude rules`
                  )}
                </p>
                {onOpenFilterModal && (
                  <button
                    type="button"
                    onClick={onOpenFilterModal}
                    className={`px-3 py-1 rounded-lg text-xs font-medium ${TINT_BUTTON_TONES.amber}`}
                  >
                    {tr('查看过滤规则', '檢視過濾規則', 'View Filter Rules')}
                  </button>
                )}
              </>
            ) : (
              <>
                <Folder className="w-8 h-8 stroke-1 text-slate-600" />
                <p className="text-xs">
                  {tr(
                    '当前目录为空（可将本地文件直接拖拽至此上传）',
                    '目前目錄為空（可將本機檔案直接拖曳至此上傳）',
                    'Directory is empty (Drag & drop files here to upload)'
                  )}
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {topSpacerHeight > 0 && <div style={{ height: topSpacerHeight }} />}
            {visibleSlice.map((entry, offset) => {
              const realIdx = startIdx + offset;
              const isSelected = selectedPaths.has(entry.Path);
              const sizeKey = getDirSizeKey(activeTab.remote, entry.Path);
              const calculatedSize = dirSizes[sizeKey];

              return (
                <div
                  key={entry.Path}
                  style={shouldVirtualize ? { height: ROW_HEIGHT } : undefined}
                  onClick={(e) => handleRowClick(entry, realIdx, e)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onFocusPane?.();
                    if (!selectedPaths.has(entry.Path)) {
                      setSelectedPaths(new Set([entry.Path]));
                      lastClickedIdxRef.current = realIdx;
                    }
                    const menuW = 200;
                    const menuH = 260;
                    const clampedX = Math.min(e.clientX, window.innerWidth - menuW - 8);
                    const clampedY = Math.min(e.clientY, window.innerHeight - menuH - 8);
                    setContextMenu({ x: Math.max(8, clampedX), y: Math.max(8, clampedY), entry });
                  }}
                  onDoubleClick={() => {
                    if (entry.IsDir) {
                      handleNavigate(entry.Path);
                    } else {
                      onPreviewFile(activeTab.remote, entry);
                    }
                  }}
                  className={`group grid grid-cols-[minmax(0,1fr)_72px_92px] sm:grid-cols-[minmax(0,1fr)_82px_124px_104px] items-center px-3 py-2 text-xs transition-colors cursor-pointer select-none ${
                    isSelected
                      ? 'bg-sky-500/15 hover:bg-sky-500/20'
                      : 'hover:bg-slate-800/50'
                  }`}
                >
                  {/* Name & Checkbox */}
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    <button
                      type="button"
                      aria-label={tr('选择项目', '選取項目', 'Select item')}
                      onClick={(e) => {
                        e.stopPropagation();
                        onFocusPane?.();
                        toggleSelect(entry.Path, realIdx);
                      }}
                      className="text-slate-500 hover:text-sky-400 shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    {renderEntryIcon(entry)}
                    <span
                      className={`truncate ${
                        entry.IsDir
                          ? 'font-medium text-slate-100 group-hover:text-sky-500 dark:group-hover:text-sky-400'
                          : 'text-slate-200'
                      }`}
                      title={entry.Name}
                    >
                      {entry.Name}
                    </span>
                  </div>

                  {/* Size */}
                  <div className="text-right font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    {entry.IsDir ? (
                      calculatedSize !== undefined ? (
                        <span className={TEXT_TONES.sky}>{formatBytes(calculatedSize)}</span>
                      ) : (
                        <span className="text-slate-500">DIR</span>
                      )
                    ) : (
                      formatBytes(entry.Size)
                    )}
                  </div>

                  {/* ModTime */}
                  <div className="hidden sm:block text-right text-[11px] text-slate-400 truncate pl-2 font-mono">
                    {formatDateTime(entry.ModTime, locale)}
                  </div>

                  {/* Row Quick Actions */}
                  <div
                    className="flex items-center justify-end gap-0.5 opacity-75 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {entry.IsDir ? (
                      <button
                        type="button"
                        onClick={() => handleCalculateSize(entry)}
                        disabled={calculatingKey === sizeKey}
                        aria-label={tr('统计文件夹大小', '統計資料夾大小', 'Calculate folder size')}
                        title={tr('统计文件夹大小 (rclone size)', '統計資料夾大小 (rclone size)', 'Calculate folder size')}
                        className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-sky-500 dark:hover:text-sky-400"
                      >
                        {calculatingKey === sizeKey ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                        ) : (
                          <Calculator className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onPreviewFile(activeTab.remote, entry)}
                          aria-label={tr('在线预览', '線上預覽', 'Preview')}
                          title={tr('在线预览', '線上預覽', 'Preview')}
                          className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-sky-500 dark:hover:text-sky-400"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={api.getDownloadUrl(activeTab.remote, entry.Path, false)}
                          download={entry.Name}
                          aria-label={tr('下载文件', '下載檔案', 'Download')}
                          title={tr('下载文件', '下載檔案', 'Download')}
                          className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setRenameTarget(entry);
                        setRenameValue(entry.Name);
                      }}
                      aria-label={tr('重命名', '重新命名', 'Rename')}
                      title={tr('重命名 (F2)', '重新命名 (F2)', 'Rename (F2)')}
                      className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-amber-500 dark:hover:text-amber-400"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteConfirmItems([entry])}
                      aria-label={tr('删除', '刪除', 'Delete')}
                      title={tr('删除 (Del)', '刪除 (Del)', 'Delete (Del)')}
                      className="p-1 rounded hover:bg-slate-700/80 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
            {bottomSpacerHeight > 0 && <div style={{ height: bottomSpacerHeight }} />}
          </div>
        )}
      </div>

      {/* Contextual Floating Selection Bar */}
      {selectedEntries.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-sky-500/10 border-t border-sky-500/30 text-xs shrink-0 select-none">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${TEXT_TONES.sky}`}>
              {tr('已选中', '已選取', 'Selected')} {selectedEntries.length}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              (
              {formatBytes(
                selectedEntries.reduce((acc, item) => acc + (item.IsDir ? 0 : Math.max(0, item.Size)), 0)
              )}
              )
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {oppositeTarget && (
              <>
                <button
                  type="button"
                  onClick={() => handleTransferSpecificItems('copy', selectedEntries)}
                  className={`lg:hidden inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${TINT_BUTTON_TONES.indigo}`}
                >
                  <Copy className="w-3 h-3" />
                  <span>
                    {paneSide === 'left'
                      ? tr('复制到对侧 ↓', '複製到對側 ↓', 'Copy ↓')
                      : tr('复制到对侧 ↑', '複製到對側 ↑', 'Copy ↑')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTransferSpecificItems('move', selectedEntries)}
                  className={`lg:hidden inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${TINT_BUTTON_TONES.amber}`}
                >
                  <MoveRight className="w-3 h-3" />
                  <span>{tr('移动', '移動', 'Move')}</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setDeleteConfirmItems(selectedEntries)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${TINT_BUTTON_TONES.rose}`}
            >
              <Trash2 className="w-3 h-3" />
              <span>{tr('删除', '刪除', 'Delete')}</span>
            </button>

            <button
              type="button"
              onClick={() => setSelectedPaths(new Set())}
              className="px-2 py-1 rounded-lg text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800/70"
            >
              {tr('取消选中', '取消選取', 'Clear')}
            </button>
          </div>
        </div>
      )}

      {/* Pane Footer Summary */}
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-950/80 border-t border-slate-800/80 text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center gap-2 truncate">
          <span>
            {tr(
              `${visibleDirCount} 个文件夹，${visibleFileCount} 个文件`,
              `${visibleDirCount} 個資料夾，${visibleFileCount} 個檔案`,
              `${visibleDirCount} folders, ${visibleFileCount} files`
            )}
          </span>
          {hiddenByFilterCount > 0 && (
            <button
              type="button"
              onClick={onOpenFilterModal}
              className={`hover:underline ${TEXT_TONES.amber}`}
            >
              ({tr(`已隐藏 ${hiddenByFilterCount} 项`, `已隱藏 ${hiddenByFilterCount} 項`, `${hiddenByFilterCount} filtered`)})
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => handleCopyPathToClipboard(activeTab.path)}
          title={tr('点击复制当前完整路径', '點擊複製目前完整路徑', 'Click to copy current full path')}
          className="font-mono text-slate-400 hover:text-sky-500 dark:hover:text-sky-400 truncate max-w-[240px] transition-colors"
        >
          {formatRemoteFullPath(activeTab.remote, activeTab.path, remotes)}
        </button>
      </div>

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-52 rounded-xl bg-slate-900 border border-slate-700/90 shadow-2xl py-1.5 text-xs text-slate-200 animate-modal-in select-none"
        >
          <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 truncate border-b border-slate-800 mb-1">
            {contextMenu.entry.Name}
          </div>

          {contextMenu.entry.IsDir ? (
            <button
              type="button"
              onClick={() => {
                handleNavigate(contextMenu.entry.Path);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>{tr('打开文件夹', '開啟資料夾', 'Open Folder')}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  onPreviewFile(activeTab.remote, contextMenu.entry);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left"
              >
                <Eye className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
                <span>{tr('在线预览', '線上預覽', 'Preview')}</span>
              </button>
              <a
                href={api.getDownloadUrl(activeTab.remote, contextMenu.entry.Path, false)}
                download={contextMenu.entry.Name}
                onClick={() => setContextMenu(null)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{tr('下载文件', '下載檔案', 'Download')}</span>
              </a>
            </>
          )}

          {oppositeTarget && (
            <>
              <div className="my-1 border-t border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  const targets =
                    selectedEntries.length > 1 && selectedPaths.has(contextMenu.entry.Path)
                      ? selectedEntries
                      : [contextMenu.entry];
                  handleTransferSpecificItems('copy', targets);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                <span>
                  {tr('复制到对侧面板', '複製到對側面板', 'Copy to Opposite Pane')}
                  {selectedEntries.length > 1 ? ` (${selectedEntries.length})` : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const targets =
                    selectedEntries.length > 1 && selectedPaths.has(contextMenu.entry.Path)
                      ? selectedEntries
                      : [contextMenu.entry];
                  handleTransferSpecificItems('move', targets);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left"
              >
                <MoveRight className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>
                  {tr('移动到对侧面板', '移動到對側面板', 'Move to Opposite Pane')}
                  {selectedEntries.length > 1 ? ` (${selectedEntries.length})` : ''}
                </span>
              </button>
            </>
          )}

          <div className="my-1 border-t border-slate-800" />

          {contextMenu.entry.IsDir && (
            <button
              type="button"
              onClick={() => {
                handleCalculateSize(contextMenu.entry);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left"
            >
              <Calculator className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
              <span>{tr('统计目录大小', '統計目錄大小', 'Calculate Size')}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              handleCopyPathToClipboard(contextMenu.entry.Path);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 text-left"
          >
            <ClipboardCopy className="w-3.5 h-3.5 text-slate-400" />
            <span>{tr('复制完整路径', '複製完整路徑', 'Copy Full Path')}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRenameTarget(contextMenu.entry);
              setRenameValue(contextMenu.entry.Name);
              setContextMenu(null);
            }}
            className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-slate-800 text-left"
          >
            <span className="flex items-center gap-2">
              <Edit3 className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span>{tr('重命名', '重新命名', 'Rename')}</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">F2</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const targets =
                selectedEntries.length > 1 && selectedPaths.has(contextMenu.entry.Path)
                  ? selectedEntries
                  : [contextMenu.entry];
              setDeleteConfirmItems(targets);
              setContextMenu(null);
            }}
            className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-rose-500/15 text-left ${TEXT_TONES.rose}`}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" />
              <span>
                {tr('删除', '刪除', 'Delete')}
                {selectedEntries.length > 1 && selectedPaths.has(contextMenu.entry.Path)
                  ? ` (${selectedEntries.length})`
                  : ''}
              </span>
            </span>
            <span className="text-[10px] font-mono opacity-75">Del</span>
          </button>
        </div>
      )}

      {/* Create Folder Modal */}
      <Modal
        isOpen={newFolderModal}
        onClose={() => setNewFolderModal(false)}
        maxWidthClass="max-w-sm"
        ariaLabel={tr('新建文件夹', '新增資料夾', 'New Folder')}
      >
        <form onSubmit={handleCreateFolder} className="p-5 space-y-4">
          <h4 className="text-sm font-semibold text-slate-100">
            {tr('新建文件夹', '新增資料夾', 'New Folder')}
          </h4>
          <input
            type="text"
            autoFocus
            required
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder={tr('输入文件夹名称...', '輸入資料夾名稱...', 'Enter folder name...')}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewFolderModal(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
            >
              {tr('取消', '取消', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
            >
              {tr('创建', '建立', 'Create')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Rename Modal */}
      <Modal
        isOpen={Boolean(renameTarget)}
        onClose={() => setRenameTarget(null)}
        maxWidthClass="max-w-sm"
        ariaLabel={tr('重命名项目', '重新命名項目', 'Rename Item')}
      >
        <form onSubmit={handleRenameSubmit} className="p-5 space-y-4">
          <h4 className="text-sm font-semibold text-slate-100">
            {tr('重命名项目', '重新命名項目', 'Rename Item')}
          </h4>
          <input
            ref={renameInputRef}
            type="text"
            required
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameTarget(null)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200"
            >
              {tr('取消', '取消', 'Cancel')}
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
            >
              {tr('保存', '儲存', 'Save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Custom Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmItems && deleteConfirmItems.length > 0)}
        tone="danger"
        loading={deletingBusy}
        title={
          deleteConfirmItems && deleteConfirmItems.length === 1
            ? tr('确认删除此项目？', '確認刪除此項目？', 'Delete This Item?')
            : tr(
                `确认批量删除 ${deleteConfirmItems?.length || 0} 个项目？`,
                `確認批次刪除 ${deleteConfirmItems?.length || 0} 個項目？`,
                `Delete ${deleteConfirmItems?.length || 0} Selected Items?`
              )
        }
        message={tr(
          '删除操作不可撤销，请确认以下待删除内容：',
          '刪除操作無法復原，請確認以下待刪除內容：',
          'This action cannot be undone. Please confirm the items to delete:'
        )}
        details={(deleteConfirmItems || []).map((item) =>
          item.IsDir ? `[DIR] ${item.Name}` : `${item.Name} (${formatBytes(item.Size)})`
        )}
        confirmLabel={tr('永久删除', '永久刪除', 'Delete Permanently')}
        onConfirm={executeDeleteItems}
        onClose={() => setDeleteConfirmItems(null)}
      />

      {/* Custom Sync Confirmation Dialog (with Dry-Run option!) */}
      <ConfirmDialog
        isOpen={syncConfirmOpen}
        tone="warning"
        title={tr('确认执行目录镜像同步 (SYNC)？', '確認執行目錄鏡像同步 (SYNC)？', 'Confirm Directory Mirror SYNC?')}
        message={tr(
          'SYNC 会使目标目录与源目录保持完全一致（目标目录中多余的文件将被清理）。建议不确定时先运行模拟测试。',
          'SYNC 會使目標目錄與來源目錄保持完全一致（目標目錄中多餘的檔案將被清理）。建議不確定時先執行模擬測試。',
          'SYNC makes the destination identical to the source (extraneous files in destination will be removed). Consider running Dry-Run first.'
        )}
        details={
          oppositeTarget
            ? [
                `${tr('源目录', '來源目錄', 'Source')}: ${formatRemoteFullPath(activeTab.remote, activeTab.path, remotes)}`,
                `${tr('目标目录', '目標目錄', 'Destination')}: ${formatRemoteFullPath(oppositeTarget.remote, oppositeTarget.path, remotes)}`,
              ]
            : undefined
        }
        secondaryLabel={tr('先模拟试运行 (Dry-Run)', '先模擬試執行 (Dry-Run)', 'Simulate First (Dry-Run)')}
        onSecondary={() => handleSyncDir(true)}
        confirmLabel={tr('立即同步 (SYNC)', '立即同步 (SYNC)', 'Run SYNC Now')}
        onConfirm={() => handleSyncDir(false)}
        onClose={() => setSyncConfirmOpen(false)}
      />
    </div>
  );
};
