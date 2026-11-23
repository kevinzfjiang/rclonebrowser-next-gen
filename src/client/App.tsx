import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Cloud,
  Copy,
  Equal,
  Eye,
  EyeOff,
  Filter,
  FolderTree,
  Loader2,
  Lock,
  LogOut,
  MoveLeft,
  MoveRight,
  RefreshCw,
  Shield,
  Terminal,
  WifiOff,
  X,
  XCircle,
} from 'lucide-react';
import {
  FileEntry,
  RemoteInfo,
  RemoteProviderTemplate,
  ScheduleJob,
  SystemStatus,
  TransferOperation,
  TransferTask,
} from '../shared/types';
import {
  DEFAULT_GLOBAL_EXCLUDE,
  parseExcludePatterns,
} from '../shared/filterPresets';
import { api, setAuthToken } from './api';
import { ExplorerTab, FilePane, SelectedTransferItem } from './components/FilePane';
import { FilterRulesModal } from './components/FilterRulesModal';
import { PreviewModal } from './components/PreviewModal';
import { RemotesView } from './components/RemotesView';
import { SchedulePrefillDraft, SchedulesView } from './components/SchedulesView';
import { SecurityCenterModal } from './components/SecurityCenterModal';
import { TasksView } from './components/TasksView';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { PreferencesMenu } from './components/ui/PreferencesMenu';
import { useI18n } from './i18n';
import { formatRemoteFullPath, formatSpeed } from './utils/format';
import { clearAllFsCache } from './utils/fsCache';
import { ALERT_TONES, BADGE_TONES, TEXT_TONES, TINT_BUTTON_TONES } from './utils/themeStyles';

type NavSection = 'explorer' | 'tasks' | 'remotes' | 'schedules';

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

const EXPLORER_STATE_KEY = 'rclonebrowser_next_explorer_v2';

function loadSavedExplorerState(): {
  dualPane: boolean;
  leftTabs: ExplorerTab[];
  leftActiveId: string;
  rightTabs: ExplorerTab[];
  rightActiveId: string;
} {
  const fallback = {
    dualPane: true,
    leftTabs: [{ id: 'left-1', remote: '@media', path: '' }],
    leftActiveId: 'left-1',
    rightTabs: [{ id: 'right-1', remote: '@media', path: '' }],
    rightActiveId: 'right-1',
  };
  try {
    const raw = localStorage.getItem(EXPLORER_STATE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const leftTabs =
      Array.isArray(parsed.leftTabs) && parsed.leftTabs.length > 0
        ? parsed.leftTabs
        : fallback.leftTabs;
    const rightTabs =
      Array.isArray(parsed.rightTabs) && parsed.rightTabs.length > 0
        ? parsed.rightTabs
        : fallback.rightTabs;
    return {
      dualPane: typeof parsed.dualPane === 'boolean' ? parsed.dualPane : true,
      leftTabs,
      leftActiveId:
        leftTabs.some((t: ExplorerTab) => t.id === parsed.leftActiveId)
          ? parsed.leftActiveId
          : leftTabs[0].id,
      rightTabs,
      rightActiveId:
        rightTabs.some((t: ExplorerTab) => t.id === parsed.rightActiveId)
          ? parsed.rightActiveId
          : rightTabs[0].id,
    };
  } catch {
    return fallback;
  }
}

export const App: React.FC = () => {
  const { tr } = useI18n();

  // Auth state
  const [authChecking, setAuthChecking] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [recentLoginPassword, setRecentLoginPassword] = useState<string>('');
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('');
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [serverOffline, setServerOffline] = useState(false);

  // Navigation & layout
  const [activeNav, setActiveNav] = useState<NavSection>('explorer');
  const initialExplorer = useMemo(() => loadSavedExplorerState(), []);
  const [dualPane, setDualPane] = useState<boolean>(initialExplorer.dualPane);

  // Core data state
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [remotes, setRemotes] = useState<RemoteInfo[]>([]);
  const [templates, setTemplates] = useState<RemoteProviderTemplate[]>([]);
  const [tasks, setTasks] = useState<TransferTask[]>([]);
  const [globalBwLimit, setGlobalBwLimit] = useState<string>('off');
  const [globalExclude, setGlobalExclude] = useState<string>(DEFAULT_GLOBAL_EXCLUDE);
  const [hideFilteredInExplorer, setHideFilteredInExplorer] = useState<boolean>(() => {
    const saved = localStorage.getItem('rclonebrowser_next_hide_filtered');
    return saved === null ? true : saved === 'true';
  });
  const [filterModalOpen, setFilterModalOpen] = useState<boolean>(false);
  const [totalSpeed, setTotalSpeed] = useState<number>(0);
  const [speedHistory, setSpeedHistory] = useState<number[]>([]);
  const [schedules, setSchedules] = useState<ScheduleJob[]>([]);

  // Cross-view links
  const [highlightTaskId, setHighlightTaskId] = useState<string | null>(null);
  const [schedulePrefill, setSchedulePrefill] = useState<SchedulePrefillDraft | null>(null);

  // Explorer Dual-Pane Multi-Tab & Selection State
  const [leftTabs, setLeftTabs] = useState<ExplorerTab[]>(initialExplorer.leftTabs);
  const [leftActiveId, setLeftActiveId] = useState<string>(initialExplorer.leftActiveId);
  const [rightTabs, setRightTabs] = useState<ExplorerTab[]>(initialExplorer.rightTabs);
  const [rightActiveId, setRightActiveId] = useState<string>(initialExplorer.rightActiveId);
  const [activePaneSide, setActivePaneSide] = useState<'left' | 'right'>('left');
  const [leftSelection, setLeftSelection] = useState<SelectedTransferItem[]>([]);
  const [rightSelection, setRightSelection] = useState<SelectedTransferItem[]>([]);
  const [clearLeftSelSignal, setClearLeftSelSignal] = useState(0);
  const [clearRightSelSignal, setClearRightSelSignal] = useState(0);
  const [shuttleSyncConfirm, setShuttleSyncConfirm] = useState(false);

  const [refreshSignal, setRefreshSignal] = useState<number>(0);
  const prevRunningCountRef = useRef<number>(0);
  const pollInFlightRef = useRef<boolean>(false);
  const hasActiveTasksRef = useRef<boolean>(false);

  // Preview Modal
  const [previewTarget, setPreviewTarget] = useState<{
    remote: string;
    entry: FileEntry;
  } | null>(null);

  // Toast notifications with manual dismiss & hover pause
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const t = toastTimersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      toastTimersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const scheduleToastRemoval = useCallback(
    (id: string, delay = 4000) => {
      const existing = toastTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        toastTimersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, delay);
      toastTimersRef.current.set(id, timer);
    },
    []
  );

  const notify = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = `${Date.now()}-${Math.random()}`;
      setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
      scheduleToastRemoval(id, type === 'error' ? 5500 : 4000);
    },
    [scheduleToastRemoval]
  );

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  // Persist Explorer layout & tabs
  useEffect(() => {
    try {
      localStorage.setItem(
        EXPLORER_STATE_KEY,
        JSON.stringify({ dualPane, leftTabs, leftActiveId, rightTabs, rightActiveId })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [dualPane, leftTabs, leftActiveId, rightTabs, rightActiveId]);

  const loadRemotes = useCallback(async () => {
    try {
      const res = await api.getRemotes();
      setRemotes(res.remotes);
      setTemplates(res.templates);
      setServerOffline(false);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') setAuthenticated(false);
      else setServerOffline(true);
    }
  }, []);

  const loadSystemStatus = useCallback(async () => {
    try {
      const sysRes = await api.getSystemStatus();
      setSystemStatus(sysRes);
      setServerOffline(false);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') setAuthenticated(false);
      else setServerOffline(true);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const res = await api.getSchedules();
      setSchedules(res.schedules);
      setServerOffline(false);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') setAuthenticated(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    if (pollInFlightRef.current) return;
    pollInFlightRef.current = true;
    try {
      const tasksRes = await api.getTasks();
      setTasks(tasksRes.tasks);
      setGlobalBwLimit(tasksRes.globalBwLimit);
      if (typeof tasksRes.globalExclude === 'string') {
        setGlobalExclude(tasksRes.globalExclude);
      }
      const speedNow = tasksRes.activeStats.totalSpeed || 0;
      setTotalSpeed(speedNow);
      setSpeedHistory((prev) => [...prev.slice(-39), speedNow]);
      setServerOffline(false);

      const runningNow = tasksRes.tasks.filter(
        (t) => t.status === 'running' || t.status === 'queued'
      ).length;
      hasActiveTasksRef.current = runningNow > 0;

      if (prevRunningCountRef.current > 0 && runningNow < prevRunningCountRef.current) {
        clearAllFsCache();
        setRefreshSignal((s) => s + 1);
        loadSchedules();
      }
      prevRunningCountRef.current = runningNow;
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') setAuthenticated(false);
      else setServerOffline(true);
    } finally {
      pollInFlightRef.current = false;
    }
  }, [loadSchedules]);

  const checkAuthStatus = useCallback(() => {
    setAuthChecking(true);
    api
      .getAuthStatus()
      .then((res) => {
        setAuthRequired(res.authRequired);
        setAuthenticated(res.authenticated);
        setMustChangePassword(Boolean(res.mustChangePassword));
        setLoginUser(res.username || 'admin');
        setServerOffline(false);
      })
      .catch(() => {
        setServerOffline(true);
      })
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Adaptive, visibility-aware polling (1.2s when active, 5s when idle, paused in background tab)
  useEffect(() => {
    if (!authenticated) return;
    loadRemotes();
    loadSystemStatus();
    loadTasks();
    loadSchedules();

    let taskTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const scheduleNextPoll = () => {
      if (disposed) return;
      const delay = hasActiveTasksRef.current ? 1200 : 5000;
      taskTimer = setTimeout(async () => {
        if (!document.hidden) {
          await loadTasks();
        }
        scheduleNextPoll();
      }, delay);
    };

    scheduleNextPoll();

    // Low-frequency system status check (every 30s while visible)
    const sysTimer = setInterval(() => {
      if (!document.hidden) {
        loadSystemStatus();
      }
    }, 30000);

    const handleVisibility = () => {
      if (!document.hidden) {
        loadTasks();
        loadSystemStatus();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      if (taskTimer) clearTimeout(taskTimer);
      clearInterval(sysTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [authenticated, loadRemotes, loadSystemStatus, loadTasks, loadSchedules]);

  // Refresh schedules when switching to Scheduler tab
  useEffect(() => {
    if (authenticated && activeNav === 'schedules') {
      loadSchedules();
    }
  }, [authenticated, activeNav, loadSchedules]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSubmitting(true);
    try {
      const usedPass = loginPass;
      const res = await api.login(loginUser, usedPass);
      setAuthToken(res.token);
      setLoginUser(res.username || loginUser);
      setAuthRequired(res.authRequired);
      setMustChangePassword(Boolean(res.mustChangePassword));
      setRecentLoginPassword(usedPass);
      setAuthenticated(true);
      setServerOffline(false);
      setLoginPass('');
    } catch (err: any) {
      setLoginError(err.message || tr('登录失败', '登入失敗', 'Login failed'));
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearAllFsCache();
    setAuthToken('');
    setRecentLoginPassword('');
    setSecurityModalOpen(false);
    setAuthenticated(false);
  };

  const leftActiveTab = useMemo(
    () => leftTabs.find((t) => t.id === leftActiveId) || leftTabs[0],
    [leftTabs, leftActiveId]
  );

  const rightActiveTab = useMemo(
    () => rightTabs.find((t) => t.id === rightActiveId) || rightTabs[0],
    [rightTabs, rightActiveId]
  );

  const handleTriggerExplorerTransfer = async (params: {
    operation: TransferOperation;
    srcRemote: string;
    srcPath: string;
    dstRemote: string;
    dstPath: string;
    items?: SelectedTransferItem[];
    dryRun?: boolean;
  }) => {
    try {
      const res = await api.createTask({
        operation: params.operation,
        srcRemote: params.srcRemote,
        srcPath: params.srcPath,
        dstRemote: params.dstRemote,
        dstPath: params.dstPath,
        items: params.items,
        options: {
          dryRun: params.dryRun,
          createEmptySrcDirs: true,
        },
      });
      notify(
        tr(
          `已启动 ${res.tasks.length} 个 ${params.operation.toUpperCase()}${params.dryRun ? ' (模拟)' : ''} 传输任务`,
          `已啟動 ${res.tasks.length} 個 ${params.operation.toUpperCase()}${params.dryRun ? ' (模擬)' : ''} 傳輸任務`,
          `Started ${res.tasks.length} ${params.operation.toUpperCase()}${params.dryRun ? ' (Dry-Run)' : ''} task(s)`
        ),
        'success'
      );
      loadTasks();
    } catch (err: any) {
      notify(
        err.message || tr('启动传输任务失败', '啟動傳輸任務失敗', 'Failed to start transfer task'),
        'error'
      );
    }
  };

  // Center Commander Shuttle Bar actions
  const shuttleSourceSide = activePaneSide;
  const shuttleSourceTab = shuttleSourceSide === 'left' ? leftActiveTab : rightActiveTab;
  const shuttleDestTab = shuttleSourceSide === 'left' ? rightActiveTab : leftActiveTab;
  const shuttleSelection = shuttleSourceSide === 'left' ? leftSelection : rightSelection;

  const handleShuttleTransfer = async (operation: 'copy' | 'move') => {
    if (!shuttleSourceTab || !shuttleDestTab) return;
    if (shuttleSelection.length === 0) {
      notify(
        tr(
          '请先在当前高亮面板中选中文件或文件夹',
          '請先在目前高亮面板中選取檔案或資料夾',
          'Please select files or folders in the active pane first'
        ),
        'info'
      );
      return;
    }
    await handleTriggerExplorerTransfer({
      operation,
      srcRemote: shuttleSourceTab.remote,
      srcPath: shuttleSourceTab.path,
      dstRemote: shuttleDestTab.remote,
      dstPath: shuttleDestTab.path,
      items: shuttleSelection,
    });
    if (shuttleSourceSide === 'left') setClearLeftSelSignal((s) => s + 1);
    else setClearRightSelSignal((s) => s + 1);
  };

  const handleShuttleSync = async (dryRun: boolean) => {
    if (!shuttleSourceTab || !shuttleDestTab) return;
    setShuttleSyncConfirm(false);
    await handleTriggerExplorerTransfer({
      operation: 'sync',
      srcRemote: shuttleSourceTab.remote,
      srcPath: shuttleSourceTab.path,
      dstRemote: shuttleDestTab.remote,
      dstPath: shuttleDestTab.path,
      dryRun,
    });
  };

  const handleSwapPanes = () => {
    if (!leftActiveTab || !rightActiveTab) return;
    const leftSnapshot = { remote: leftActiveTab.remote, path: leftActiveTab.path };
    const rightSnapshot = { remote: rightActiveTab.remote, path: rightActiveTab.path };
    setLeftTabs((prev) =>
      prev.map((t) => (t.id === leftActiveTab.id ? { ...t, ...rightSnapshot } : t))
    );
    setRightTabs((prev) =>
      prev.map((t) => (t.id === rightActiveTab.id ? { ...t, ...leftSnapshot } : t))
    );
    notify(tr('已交换左右面板路径', '已交換左右面板路徑', 'Swapped left and right panes'), 'info');
  };

  const handleMatchOppositePane = () => {
    if (!shuttleSourceTab || !shuttleDestTab) return;
    const targetPatch = { remote: shuttleSourceTab.remote, path: shuttleSourceTab.path };
    if (shuttleSourceSide === 'left') {
      setRightTabs((prev) =>
        prev.map((t) => (t.id === rightActiveTab.id ? { ...t, ...targetPatch } : t))
      );
    } else {
      setLeftTabs((prev) =>
        prev.map((t) => (t.id === leftActiveTab.id ? { ...t, ...targetPatch } : t))
      );
    }
    notify(tr('已将对侧面板对齐到当前目录', '已將對側面板對齊到目前目錄', 'Matched opposite pane to current folder'), 'info');
  };

  const handleCreateScheduleFromExplorer = () => {
    if (!shuttleSourceTab || !shuttleDestTab) return;
    setSchedulePrefill({
      name: `${shuttleSourceTab.remote}:${shuttleSourceTab.path || '/'} → ${shuttleDestTab.remote}:${shuttleDestTab.path || '/'}`,
      operation: 'copy',
      srcRemote: shuttleSourceTab.remote,
      srcPath: shuttleSourceTab.path,
      dstRemote: shuttleDestTab.remote,
      dstPath: shuttleDestTab.path,
    });
    setActiveNav('schedules');
  };

  const handleOpenRemoteInExplorer = (remoteName: string) => {
    const newId = `tab-${Date.now()}`;
    setLeftTabs((prev) => [...prev, { id: newId, remote: remoteName, path: '' }]);
    setLeftActiveId(newId);
    setActivePaneSide('left');
    setActiveNav('explorer');
  };

  const activeTasksCount = tasks.filter(
    (t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused'
  ).length;

  const enabledSchedulesCount = schedules.filter((s) => s.enabled).length;
  const displayAppVersion = systemStatus?.appVersion || '2.7';
  const activeFilterCount = useMemo(
    () => parseExcludePatterns(globalExclude).length,
    [globalExclude]
  );

  const handleToggleHideInExplorer = (val: boolean) => {
    setHideFilteredInExplorer(val);
    localStorage.setItem('rclonebrowser_next_hide_filtered', String(val));
  };

  if (authChecking) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-400 text-sm">
        <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
        <span>
          {tr(
            '正在初始化 RcloneBrowser Next Gen...',
            '正在初始化 RcloneBrowser Next Gen...',
            'Initializing RcloneBrowser Next Gen...'
          )}
        </span>
      </div>
    );
  }

  // Offline before authentication
  if (serverOffline && !authenticated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-7 w-full max-w-md shadow-2xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 text-rose-500 flex items-center justify-center mx-auto">
            <WifiOff className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-bold text-slate-100">
              {tr('无法连接到后端服务', '無法連線至後端服務', 'Unable to Connect to Server')}
            </h2>
            <p className="text-xs text-slate-400">
              {tr(
                '请检查 RcloneBrowser Next Gen 容器是否正在运行，或稍后点击重试。',
                '請檢查 RcloneBrowser Next Gen 容器是否正在執行，或稍後點擊重試。',
                'Please verify that the RcloneBrowser Next Gen container is running and try again.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={checkAuthStatus}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{tr('重新连接', '重新連線', 'Retry Connection')}</span>
          </button>
        </div>
      </div>
    );
  }

  if (authRequired && !authenticated) {
    return (
      <div className="relative h-screen w-screen flex items-center justify-center bg-slate-950 p-4">
        {/* Top-Right Theme & Language Switcher on Login Screen */}
        <div className="fixed top-4 right-4 z-40">
          <PreferencesMenu align="right" />
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-7 w-full max-w-md shadow-2xl space-y-5 animate-modal-in"
        >
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100">RcloneBrowser Next Gen</h1>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-mono ${BADGE_TONES.sky}`}>
                  v{displayAppVersion}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {tr(
                  'Scrypt 加密访问保护已启用',
                  'Scrypt 加密存取保護已啟用',
                  'Scrypt authentication protection enabled'
                )}
              </p>
            </div>
          </div>

          {loginError && (
            <div className={`p-3 rounded-xl border text-xs ${ALERT_TONES.error}`}>
              {loginError}
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                {tr('管理员用户名', '管理員使用者名稱', 'Administrator Username')}
              </label>
              <input
                type="text"
                required
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                {tr('访问密码', '存取密碼', 'Password')}
              </label>
              <div className="relative">
                <input
                  type={showLoginPass ? 'text' : 'password'}
                  required
                  autoFocus
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  placeholder={tr(
                    '首次登录请输入容器日志输出的初始随机密码',
                    '首次登入請輸入容器日誌輸出的初始隨機密碼',
                    'First login? Enter initial password from container logs'
                  )}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPass((v) => !v)}
                  aria-label={tr('切换密码可见性', '切換密碼可見性', 'Toggle password visibility')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  {showLoginPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loginSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors shadow"
          >
            {loginSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{tr('登录控制台', '登入控制台', 'Sign In')}</span>
          </button>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Terminal className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0" />
              <span>
                {tr(
                  '首次启动：查看容器 Console 初始密码',
                  '首次啟動：查看容器 Console 初始密碼',
                  'First-time setup: View initial password in container logs'
                )}
              </span>
            </div>
            <code className="block font-mono text-[10px] text-sky-600 dark:text-sky-300 bg-slate-900 px-2 py-1 rounded border border-slate-800 select-all">
              docker logs rclonebrowser-next
            </code>
          </div>
        </form>
      </div>
    );
  }

  const navItems: {
    id: NavSection;
    label: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
  }[] = [
    {
      id: 'explorer',
      label: tr('文件管理', '檔案管理', 'Explorer'),
      icon: <FolderTree className="w-3.5 h-3.5 shrink-0" />,
    },
    {
      id: 'tasks',
      label: tr('传输中心', '傳輸中心', 'Transfers'),
      icon: <Activity className="w-3.5 h-3.5 shrink-0" />,
      badge:
        activeTasksCount > 0 ? (
          <span className="px-1.5 py-0.5 leading-none rounded-full bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-950 text-[10px] font-bold animate-pulse">
            {activeTasksCount}
          </span>
        ) : tasks.length > 0 ? (
          <span
            className={`px-1.5 py-0.5 leading-none rounded-full text-[10px] ${
              activeNav === 'tasks' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {tasks.length}
          </span>
        ) : null,
    },
    {
      id: 'remotes',
      label: tr('存储源', '儲存源', 'Remotes'),
      icon: <Cloud className="w-3.5 h-3.5 shrink-0" />,
      badge: (
        <span
          className={`px-1.5 py-0.5 leading-none rounded-full text-[10px] ${
            activeNav === 'remotes' ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
          }`}
        >
          {remotes.length}
        </span>
      ),
    },
    {
      id: 'schedules',
      label: tr('定时任务', '排程任務', 'Scheduler'),
      icon: <CalendarClock className="w-3.5 h-3.5 shrink-0" />,
      badge:
        enabledSchedulesCount > 0 ? (
          <span
            className={`px-1.5 py-0.5 leading-none rounded-full text-[10px] font-medium ${
              activeNav === 'schedules'
                ? 'bg-white/20 text-white'
                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {enabledSchedulesCount}
          </span>
        ) : null,
    },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Navigation Header: Flexible on medium screens, centered 3-col grid on xl+ */}
      <header className="flex items-center justify-between xl:grid xl:grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 px-3 sm:px-4 py-2 bg-slate-900/90 border-b border-slate-800/90 shrink-0 select-none">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-2.5 justify-self-start min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-sky-600/20 shrink-0">
            <Cloud className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-slate-100 truncate">
              RcloneBrowser <span className="text-sky-500 dark:text-sky-400">Next Gen</span>
            </h1>
            <span
              className={`hidden sm:inline-block px-1.5 py-0.5 rounded border text-[10px] font-mono shrink-0 ${BADGE_TONES.sky}`}
            >
              v{displayAppVersion}
            </span>
          </div>
        </div>

        {/* Center: Main Navigation (hidden on mobile where Bottom Nav is shown) */}
        <nav
          aria-label={tr('主导航', '主導覽', 'Main Navigation')}
          className="hidden md:flex justify-self-center items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 whitespace-nowrap"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeNav === item.id
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.badge}
            </button>
          ))}
        </nav>

        {/* Right: Compact Global Controls */}
        <div className="flex items-center gap-1.5 justify-self-end shrink-0">
          {/* Unified Theme + Language Preferences Popover */}
          <PreferencesMenu align="right" />

          {/* Filter Rules Button */}
          <button
            type="button"
            onClick={() => setFilterModalOpen(true)}
            title={tr(
              `全局文件/文件夹过滤规则 (已启用 ${activeFilterCount} 项，如群晖 @eaDir、#recycle)`,
              `全域檔案/資料夾過濾規則 (已啟用 ${activeFilterCount} 項，如群暉 @eaDir、#recycle)`,
              `Global Exclude Filter Rules (${activeFilterCount} active, e.g. Synology @eaDir)`
            )}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-950 border border-slate-800 text-sky-600 dark:text-sky-400 hover:border-sky-500/50 transition-colors"
          >
            <Filter className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">{tr('过滤规则', '過濾規則', 'Filters')}</span>
            {activeFilterCount > 0 && (
              <span className={`px-1.5 py-0.5 leading-none rounded-full text-[10px] font-mono ${BADGE_TONES.sky}`}>
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Security Center Button */}
          <button
            type="button"
            onClick={() => setSecurityModalOpen(true)}
            title={tr(
              '安全与密码中心 (/config/auth.json)',
              '安全與密碼中心 (/config/auth.json)',
              'Security & Password Center (/config/auth.json)'
            )}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              authRequired
                ? 'bg-slate-950 border-slate-800 text-emerald-600 dark:text-emerald-400 hover:border-emerald-500/50'
                : TINT_BUTTON_TONES.amber
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">{tr('安全中心', '安全中心', 'Security')}</span>
          </button>

          {authRequired && (
            <button
              type="button"
              onClick={handleLogout}
              aria-label={tr('退出登录', '登出', 'Sign Out')}
              title={tr('退出登录', '登出', 'Sign Out')}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Server Disconnected Banner */}
      {serverOffline && (
        <div className={`flex items-center justify-between gap-2 px-4 py-1.5 border-b text-xs shrink-0 ${ALERT_TONES.error}`}>
          <div className="flex items-center gap-2">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>
              {tr(
                '与后端服务的连接暂时中断，正在尝试自动重连...',
                '與後端服務的連線暫時中斷，正在嘗試自動重連...',
                'Connection to backend server lost. Attempting to reconnect...'
              )}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              loadTasks();
              loadSystemStatus();
              loadRemotes();
            }}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-medium"
          >
            <RefreshCw className="w-3 h-3" />
            <span>{tr('立即重试', '立即重試', 'Retry')}</span>
          </button>
        </div>
      )}

      {/* Main Content Workspace */}
      <main className="flex-1 min-h-0 p-2.5 sm:p-3 overflow-hidden">
        {/* Keep Explorer mounted across nav switches to avoid reloading cloud remotes */}
        <div
          aria-hidden={activeNav !== 'explorer'}
          className={
            activeNav !== 'explorer'
              ? 'hidden'
              : `h-full min-h-0 grid gap-2.5 ${
                  dualPane
                    ? 'grid-cols-1 grid-rows-2 lg:grid-cols-[minmax(0,1fr)_48px_minmax(0,1fr)] lg:grid-rows-1'
                    : 'grid-cols-1 grid-rows-1'
                }`
          }
        >
            <FilePane
              paneSide={dualPane ? 'left' : 'single'}
              isVisible={activeNav === 'explorer'}
              isActivePane={activeNav === 'explorer' && (!dualPane || activePaneSide === 'left')}
              onFocusPane={() => setActivePaneSide('left')}
              remotes={remotes}
              tabs={leftTabs}
              activeTabId={leftActiveId}
              oppositeTarget={
                dualPane && rightActiveTab
                  ? { remote: rightActiveTab.remote, path: rightActiveTab.path }
                  : undefined
              }
              onTabsChange={(nextTabs, nextActive) => {
                setLeftTabs(nextTabs);
                setLeftActiveId(nextActive);
              }}
              onSelectionChange={setLeftSelection}
              clearSelectionSignal={clearLeftSelSignal}
              onPreviewFile={(remote, entry) => setPreviewTarget({ remote, entry })}
              onTriggerTransfer={handleTriggerExplorerTransfer}
              onNotify={notify}
              refreshSignal={refreshSignal}
              globalExclude={globalExclude}
              hideFilteredInExplorer={hideFilteredInExplorer}
              onOpenFilterModal={() => setFilterModalOpen(true)}
              dualPane={dualPane}
              onToggleDualPane={!dualPane ? () => setDualPane(true) : undefined}
            />

            {/* Center Vertical Commander Shuttle Bar (Dual-Pane on lg+) */}
            {dualPane && (
              <div className="hidden lg:flex flex-col items-center justify-center gap-2 py-2 px-1 bg-slate-900/60 border border-slate-800/90 rounded-xl select-none">
                {/* Active Direction Indicator */}
                <div
                  title={
                    shuttleSourceSide === 'left'
                      ? tr('当前传输方向: 左侧 → 右侧', '目前傳輸方向: 左側 → 右側', 'Direction: Left → Right')
                      : tr('当前传输方向: 右侧 → 左侧', '目前傳輸方向: 右側 → 左側', 'Direction: Right → Left')
                  }
                  className={`flex flex-col items-center justify-center w-9 py-1 rounded-lg border text-[10px] font-mono ${BADGE_TONES.sky}`}
                >
                  {shuttleSourceSide === 'left' ? (
                    <ArrowRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowLeft className="w-3.5 h-3.5" />
                  )}
                  {shuttleSelection.length > 0 && (
                    <span className="font-bold leading-tight">{shuttleSelection.length}</span>
                  )}
                </div>

                {/* Copy Selected to Opposite */}
                <button
                  type="button"
                  onClick={() => handleShuttleTransfer('copy')}
                  disabled={shuttleSelection.length === 0}
                  aria-label={tr('复制选中项到对侧', '複製選取項到對側', 'Copy selected to opposite pane')}
                  title={
                    shuttleSourceSide === 'left'
                      ? tr(`复制选中项到右侧 (${shuttleSelection.length})`, `複製選取項到右側 (${shuttleSelection.length})`, `Copy selected to Right (${shuttleSelection.length})`)
                      : tr(`复制选中项到左侧 (${shuttleSelection.length})`, `複製選取項到左側 (${shuttleSelection.length})`, `Copy selected to Left (${shuttleSelection.length})`)
                  }
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm disabled:opacity-35 disabled:pointer-events-none transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>

                {/* Move Selected to Opposite */}
                <button
                  type="button"
                  onClick={() => handleShuttleTransfer('move')}
                  disabled={shuttleSelection.length === 0}
                  aria-label={tr('移动选中项到对侧', '移動選取項到對側', 'Move selected to opposite pane')}
                  title={
                    shuttleSourceSide === 'left'
                      ? tr(`移动选中项到右侧 (${shuttleSelection.length})`, `移動選取項到右側 (${shuttleSelection.length})`, `Move selected to Right (${shuttleSelection.length})`)
                      : tr(`移动选中项到左侧 (${shuttleSelection.length})`, `移動選取項到左側 (${shuttleSelection.length})`, `Move selected to Left (${shuttleSelection.length})`)
                  }
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-600 hover:bg-amber-500 text-white shadow-sm disabled:opacity-35 disabled:pointer-events-none transition-colors"
                >
                  {shuttleSourceSide === 'left' ? (
                    <MoveRight className="w-4 h-4" />
                  ) : (
                    <MoveLeft className="w-4 h-4" />
                  )}
                </button>

                {/* Sync Current Dir to Opposite */}
                <button
                  type="button"
                  onClick={() => setShuttleSyncConfirm(true)}
                  aria-label={tr('同步当前目录到对侧', '同步目前目錄到對側', 'Sync current directory to opposite pane')}
                  title={tr(
                    '镜像同步 (SYNC)：将高亮面板目录同步到对侧（支持 Dry-Run 试运行）',
                    '鏡像同步 (SYNC)：將高亮面板目錄同步到對側（支援 Dry-Run 試執行）',
                    'Mirror SYNC active folder to opposite pane (with Dry-Run option)'
                  )}
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-colors"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>

                <div className="w-6 border-t border-slate-800 my-1" />

                {/* Swap Left & Right Paths */}
                <button
                  type="button"
                  onClick={handleSwapPanes}
                  aria-label={tr('交换左右面板路径', '交換左右面板路徑', 'Swap left and right panes')}
                  title={tr('交换左右面板目录', '交換左右面板目錄', 'Swap Left & Right Panes')}
                  className="w-9 h-8 rounded-lg flex items-center justify-center bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-sky-400 transition-colors"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>

                {/* Match Opposite Path */}
                <button
                  type="button"
                  onClick={handleMatchOppositePane}
                  aria-label={tr('对齐对侧面板路径', '對齊對側面板路徑', 'Match opposite pane path')}
                  title={tr('将对侧面板切换到相同目录', '將對側面板切換到相同目錄', 'Open same folder in opposite pane')}
                  className="w-9 h-8 rounded-lg flex items-center justify-center bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-sky-400 transition-colors"
                >
                  <Equal className="w-3.5 h-3.5" />
                </button>

                {/* Save Pair as Cron Schedule */}
                <button
                  type="button"
                  onClick={handleCreateScheduleFromExplorer}
                  aria-label={tr('存为定时同步任务', '存為排程同步任務', 'Save as Cron Schedule')}
                  title={tr(
                    '以当前双栏路径新建定时同步任务',
                    '以目前雙欄路徑新增排程同步任務',
                    'Create a Cron Schedule from current dual-pane paths'
                  )}
                  className="w-9 h-8 rounded-lg flex items-center justify-center bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors"
                >
                  <CalendarPlus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {dualPane && (
              <FilePane
                paneSide="right"
                isVisible={activeNav === 'explorer'}
                isActivePane={activeNav === 'explorer' && activePaneSide === 'right'}
                onFocusPane={() => setActivePaneSide('right')}
                remotes={remotes}
                tabs={rightTabs}
                activeTabId={rightActiveId}
                oppositeTarget={
                  leftActiveTab
                    ? { remote: leftActiveTab.remote, path: leftActiveTab.path }
                    : undefined
                }
                onTabsChange={(nextTabs, nextActive) => {
                  setRightTabs(nextTabs);
                  setRightActiveId(nextActive);
                }}
                onSelectionChange={setRightSelection}
                clearSelectionSignal={clearRightSelSignal}
                onPreviewFile={(remote, entry) => setPreviewTarget({ remote, entry })}
                onTriggerTransfer={handleTriggerExplorerTransfer}
                onNotify={notify}
                refreshSignal={refreshSignal}
                globalExclude={globalExclude}
                hideFilteredInExplorer={hideFilteredInExplorer}
                onOpenFilterModal={() => setFilterModalOpen(true)}
                dualPane={dualPane}
                onToggleDualPane={() => setDualPane(false)}
              />
            )}
        </div>

        {activeNav === 'tasks' && (
          <TasksView
            tasks={tasks}
            remotes={remotes}
            globalBwLimit={globalBwLimit}
            globalExclude={globalExclude}
            totalSpeed={totalSpeed}
            speedHistory={speedHistory}
            highlightTaskId={highlightTaskId}
            onClearHighlightTask={() => setHighlightTaskId(null)}
            onRefreshTasks={loadTasks}
            onOpenFilterModal={() => setFilterModalOpen(true)}
            onNotify={notify}
          />
        )}

        {activeNav === 'remotes' && (
          <RemotesView
            remotes={remotes}
            templates={templates}
            onRefreshRemotes={loadRemotes}
            onOpenRemoteInExplorer={handleOpenRemoteInExplorer}
            onNotify={notify}
          />
        )}

        {activeNav === 'schedules' && (
          <SchedulesView
            schedules={schedules}
            remotes={remotes}
            globalExclude={globalExclude}
            prefillDraft={schedulePrefill}
            onClearPrefill={() => setSchedulePrefill(null)}
            onRefreshSchedules={loadSchedules}
            onRefreshTasks={loadTasks}
            onViewTaskLog={(taskId) => {
              if (taskId) setHighlightTaskId(taskId);
              setActiveNav('tasks');
            }}
            onOpenFilterModal={() => setFilterModalOpen(true)}
            onNotify={notify}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (< md) */}
      <nav
        aria-label={tr('移动端导航', '行動端導覽', 'Mobile Navigation')}
        className="md:hidden grid grid-cols-4 border-t border-slate-800 bg-slate-900 px-1 py-1 shrink-0 select-none"
      >
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setActiveNav(item.id)}
            className={`relative flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
              activeNav === item.id
                ? 'bg-sky-600/15 text-sky-600 dark:text-sky-400'
                : 'text-slate-400'
            }`}
          >
            {item.icon}
            <span className="truncate max-w-full px-1">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom Live Status Bar */}
      <footer className="hidden sm:flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-slate-900 border-t border-slate-800/90 text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                serverOffline
                  ? 'bg-rose-500'
                  : systemStatus?.rcloneAvailable
                    ? 'bg-emerald-500 dark:bg-emerald-400'
                    : 'bg-amber-500 dark:bg-amber-400'
              }`}
            />
            <strong className="text-slate-200 font-mono">
              Rclone {systemStatus?.rcloneVersion || '...'}
              {systemStatus?.rcloneUpdateAvailable && systemStatus?.rcloneLatestVersion ? (
                <>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className={TEXT_TONES.amber}>{systemStatus.rcloneLatestVersion}</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-rose-500 via-pink-500 to-amber-500 text-white text-[10px] font-extrabold tracking-wide shadow-sm">
                    (new)
                  </span>
                </>
              ) : null}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-4">
          {activeTasksCount > 0 && (
            <button
              type="button"
              onClick={() => setActiveNav('tasks')}
              className={`flex items-center gap-1.5 hover:underline font-mono ${TEXT_TONES.sky}`}
            >
              <Activity className="w-3.5 h-3.5 animate-pulse" />
              <span>
                {tr(
                  `正在执行 ${activeTasksCount} 项任务 (${formatSpeed(totalSpeed)})`,
                  `正在執行 ${activeTasksCount} 項任務 (${formatSpeed(totalSpeed)})`,
                  `${activeTasksCount} active task(s) (${formatSpeed(totalSpeed)})`
                )}
              </span>
            </button>
          )}

          <span className="font-mono text-slate-400">
            {tr('限速', '限速', 'BW Limit')}:{' '}
            {globalBwLimit === 'off' ? tr('无限制', '無限制', 'Unlimited') : globalBwLimit}
          </span>
        </div>
      </footer>

      {/* Center Shuttle Bar Sync Confirmation (with Dry-Run option!) */}
      <ConfirmDialog
        isOpen={shuttleSyncConfirm}
        tone="warning"
        title={tr('确认执行目录镜像同步 (SYNC)？', '確認執行目錄鏡像同步 (SYNC)？', 'Confirm Directory Mirror SYNC?')}
        message={tr(
          'SYNC 会使目标目录与源目录保持完全一致（目标多余文件将被清理）。建议先试运行确认变更清单。',
          'SYNC 會使目標目錄與來源目錄保持完全一致（目標多餘檔案將被清理）。建議先試執行確認變更清單。',
          'SYNC makes the destination identical to the source (extra files in destination will be removed). Consider Dry-Run first.'
        )}
        details={
          shuttleSourceTab && shuttleDestTab
            ? [
                `${tr('源目录', '來源目錄', 'Source')}: ${formatRemoteFullPath(shuttleSourceTab.remote, shuttleSourceTab.path, remotes)}`,
                `${tr('目标目录', '目標目錄', 'Destination')}: ${formatRemoteFullPath(shuttleDestTab.remote, shuttleDestTab.path, remotes)}`,
              ]
            : undefined
        }
        secondaryLabel={tr('先模拟试运行 (Dry-Run)', '先模擬試執行 (Dry-Run)', 'Simulate First (Dry-Run)')}
        onSecondary={() => handleShuttleSync(true)}
        confirmLabel={tr('立即同步 (SYNC)', '立即同步 (SYNC)', 'Run SYNC Now')}
        onConfirm={() => handleShuttleSync(false)}
        onClose={() => setShuttleSyncConfirm(false)}
      />

      {/* File Preview Modal */}
      {previewTarget && (
        <PreviewModal
          remote={previewTarget.remote}
          remotes={remotes}
          entry={previewTarget.entry}
          onClose={() => setPreviewTarget(null)}
        />
      )}

      {/* Global Exclude Filter Rules Modal */}
      <FilterRulesModal
        isOpen={filterModalOpen}
        globalExclude={globalExclude}
        hideFilteredInExplorer={hideFilteredInExplorer}
        onToggleHideInExplorer={handleToggleHideInExplorer}
        onClose={() => setFilterModalOpen(false)}
        onSaved={(nextExclude) => {
          setGlobalExclude(nextExclude);
        }}
        onNotify={notify}
      />

      {/* Security Center & Forced First-Login Password Change Modal */}
      <SecurityCenterModal
        isOpen={mustChangePassword || securityModalOpen}
        forcedFirstLogin={mustChangePassword}
        currentUsername={loginUser}
        authRequired={authRequired}
        recentLoginPassword={recentLoginPassword}
        onClose={() => setSecurityModalOpen(false)}
        onUpdated={(res) => {
          setLoginUser(res.username);
          setAuthRequired(res.authRequired);
          setMustChangePassword(res.mustChangePassword);
          setRecentLoginPassword('');
          loadSystemStatus();
          loadTasks();
        }}
        onLogout={handleLogout}
        onNotify={notify}
      />

      {/* Floating Toasts (dismissible + hover-pause + Light/Dark theme-safe) */}
      <div className="fixed bottom-14 sm:bottom-9 right-4 z-[70] flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onMouseEnter={() => {
              const timer = toastTimersRef.current.get(t.id);
              if (timer) {
                clearTimeout(timer);
                toastTimersRef.current.delete(t.id);
              }
            }}
            onMouseLeave={() => scheduleToastRemoval(t.id, 2000)}
            className={`pointer-events-auto flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl shadow-xl border text-xs font-medium backdrop-blur-md animate-toast-in ${
              t.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-300 text-emerald-900 dark:bg-emerald-950/95 dark:border-emerald-700/80 dark:text-emerald-200'
                : t.type === 'error'
                  ? 'bg-rose-50/95 border-rose-300 text-rose-900 dark:bg-rose-950/95 dark:border-rose-700/80 dark:text-rose-200'
                  : 'bg-slate-900/95 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {t.type === 'success' ? (
                <CheckCircle2 className={`w-4 h-4 shrink-0 ${TEXT_TONES.emerald}`} />
              ) : t.type === 'error' ? (
                <XCircle className={`w-4 h-4 shrink-0 ${TEXT_TONES.rose}`} />
              ) : (
                <Activity className={`w-4 h-4 shrink-0 ${TEXT_TONES.sky}`} />
              )}
              <span className="break-words">{t.text}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label={tr('关闭提示', '關閉提示', 'Dismiss')}
              className="opacity-60 hover:opacity-100 p-0.5 rounded shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
