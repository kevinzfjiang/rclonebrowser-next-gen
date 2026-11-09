import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CalendarClock,
  CheckCircle2,
  Cloud,
  Filter,
  FolderTree,
  Globe,
  Lock,
  LogOut,
  Palette,
  Shield,
  Terminal,
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
import { ExplorerTab, FilePane } from './components/FilePane';
import { FilterRulesModal } from './components/FilterRulesModal';
import { PreviewModal } from './components/PreviewModal';
import { RemotesView } from './components/RemotesView';
import { SchedulesView } from './components/SchedulesView';
import { SecurityCenterModal } from './components/SecurityCenterModal';
import { TasksView } from './components/TasksView';
import { LOCALE_OPTIONS, LocaleCode, THEME_OPTIONS, ThemeId, useI18n } from './i18n';
import { formatSpeed } from './utils/format';

type NavSection = 'explorer' | 'tasks' | 'remotes' | 'schedules';

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

export const App: React.FC = () => {
  const { locale, setLocale, theme, setTheme, tr } = useI18n();

  // Auth state
  const [authChecking, setAuthChecking] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [recentLoginPassword, setRecentLoginPassword] = useState<string>('');
  const [loginUser, setLoginUser] = useState('admin');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  // Navigation & layout
  const [activeNav, setActiveNav] = useState<NavSection>('explorer');
  const [dualPane, setDualPane] = useState<boolean>(true);

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
  const [schedules, setSchedules] = useState<ScheduleJob[]>([]);

  // Explorer Dual-Pane Multi-Tab State
  const [leftTabs, setLeftTabs] = useState<ExplorerTab[]>([
    { id: 'left-1', remote: '@media', path: '' },
    { id: 'left-2', remote: '@media', path: 'Documents' },
  ]);
  const [leftActiveId, setLeftActiveId] = useState<string>('left-1');

  const [rightTabs, setRightTabs] = useState<ExplorerTab[]>([
    { id: 'right-1', remote: '@media', path: 'Backups' },
  ]);
  const [rightActiveId, setRightActiveId] = useState<string>('right-1');

  const [refreshSignal, setRefreshSignal] = useState<number>(0);
  const prevRunningCountRef = useRef<number>(0);

  // Preview Modal
  const [previewTarget, setPreviewTarget] = useState<{
    remote: string;
    entry: FileEntry;
  } | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const notify = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const loadRemotes = useCallback(async () => {
    try {
      const res = await api.getRemotes();
      setRemotes(res.remotes);
      setTemplates(res.templates);
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') setAuthenticated(false);
    }
  }, []);

  const loadTasksAndStatus = useCallback(async () => {
    try {
      const [tasksRes, sysRes] = await Promise.all([api.getTasks(), api.getSystemStatus()]);
      setTasks(tasksRes.tasks);
      setGlobalBwLimit(tasksRes.globalBwLimit);
      if (typeof tasksRes.globalExclude === 'string') {
        setGlobalExclude(tasksRes.globalExclude);
      }
      setTotalSpeed(tasksRes.activeStats.totalSpeed);
      setSystemStatus(sysRes);

      const runningNow = tasksRes.tasks.filter(
        (t) => t.status === 'running' || t.status === 'queued'
      ).length;
      if (prevRunningCountRef.current > 0 && runningNow < prevRunningCountRef.current) {
        setRefreshSignal((s) => s + 1);
      }
      prevRunningCountRef.current = runningNow;
    } catch (err: any) {
      if (err.message === 'UNAUTHORIZED') setAuthenticated(false);
    }
  }, []);

  const loadSchedules = useCallback(async () => {
    try {
      const res = await api.getSchedules();
      setSchedules(res.schedules);
    } catch {
      // Ignore schedule load errors
    }
  }, []);

  useEffect(() => {
    api
      .getAuthStatus()
      .then((res) => {
        setAuthRequired(res.authRequired);
        setAuthenticated(res.authenticated);
        setMustChangePassword(Boolean(res.mustChangePassword));
        setLoginUser(res.username || 'admin');
      })
      .catch(() => {})
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    loadRemotes();
    loadTasksAndStatus();
    loadSchedules();

    const timer = setInterval(() => {
      loadTasksAndStatus();
    }, 1200);

    return () => clearInterval(timer);
  }, [authenticated, loadRemotes, loadTasksAndStatus, loadSchedules]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const usedPass = loginPass;
      const res = await api.login(loginUser, usedPass);
      setAuthToken(res.token);
      setLoginUser(res.username || loginUser);
      setAuthRequired(res.authRequired);
      setMustChangePassword(Boolean(res.mustChangePassword));
      setRecentLoginPassword(usedPass);
      setAuthenticated(true);
      setLoginPass('');
    } catch (err: any) {
      setLoginError(err.message || tr('登录失败', '登入失敗', 'Login failed'));
    }
  };

  const handleLogout = () => {
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
    items?: { path: string; name: string; isDir: boolean }[];
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
          `已启动 ${res.tasks.length} 个 ${params.operation.toUpperCase()} 传输任务`,
          `已啟動 ${res.tasks.length} 個 ${params.operation.toUpperCase()} 傳輸任務`,
          `Started ${res.tasks.length} ${params.operation.toUpperCase()} task(s)`
        ),
        'success'
      );
      loadTasksAndStatus();
    } catch (err: any) {
      notify(
        err.message || tr('启动传输任务失败', '啟動傳輸任務失敗', 'Failed to start transfer task'),
        'error'
      );
    }
  };

  const handleOpenRemoteInExplorer = (remoteName: string) => {
    const newId = `tab-${Date.now()}`;
    setLeftTabs((prev) => [...prev, { id: newId, remote: remoteName, path: '' }]);
    setLeftActiveId(newId);
    setActiveNav('explorer');
  };

  const activeTasksCount = tasks.filter(
    (t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused'
  ).length;

  const enabledSchedulesCount = schedules.filter((s) => s.enabled).length;
  const displayAppVersion = systemStatus?.appVersion || '2.5';
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
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
        {tr(
          '正在初始化 RcloneBrowser Next Gen...',
          '正在初始化 RcloneBrowser Next Gen...',
          'Initializing RcloneBrowser Next Gen...'
        )}
      </div>
    );
  }

  if (authRequired && !authenticated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 p-4">
        <form
          onSubmit={handleLogin}
          className="bg-slate-900 border border-slate-800 rounded-2xl p-7 w-full max-w-md shadow-2xl space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-sky-500/15 text-sky-400">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-base font-bold text-slate-100">RcloneBrowser Next Gen</h1>
                  <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[10px] font-mono text-sky-300">
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
          </div>

          {loginError && (
            <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
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
              <input
                type="password"
                required
                autoFocus
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder={tr(
                  '首次登录请输入容器日志输出的初始随机密码',
                  '首次登入請輸入容器日誌輸出的初始隨機密碼',
                  'First login? Enter initial password from container logs'
                )}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold transition-colors shadow"
          >
            {tr('登录控制台', '登入控制台', 'Sign In')}
          </button>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-1.5 text-slate-300 font-medium">
              <Terminal className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>
                {tr(
                  '首次启动：查看容器 Console 初始密码',
                  '首次啟動：查看容器 Console 初始密碼',
                  'First-time setup: View initial password in container logs'
                )}
              </span>
            </div>
            <code className="block font-mono text-[10px] text-sky-300 bg-slate-900 px-2 py-1 rounded border border-slate-800 select-all">
              docker logs rclonebrowser-next
            </code>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Navigation Header: 3-column grid locks center navigation in place */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2 bg-slate-900/90 border-b border-slate-800/90 shrink-0">
        {/* Left: Brand Logo */}
        <div className="flex items-center gap-2.5 justify-self-start min-w-0 whitespace-nowrap">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-700 flex items-center justify-center shadow-lg shadow-sky-600/20 shrink-0">
            <Cloud className="w-4 h-4 text-white" />
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-slate-100 truncate">
              RcloneBrowser <span className="text-sky-400">Next Gen</span>
            </h1>
            <span className="px-1.5 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[10px] font-mono text-sky-300 shrink-0">
              v{displayAppVersion}
            </span>
          </div>
        </div>

        {/* Center: Main Navigation (Always anchored at dead-center) */}
        <nav className="justify-self-center flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800 whitespace-nowrap">
          <button
            onClick={() => setActiveNav('explorer')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeNav === 'explorer'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5 shrink-0" />
            <span>{tr('文件管理', '檔案管理', 'Explorer')}</span>
          </button>

          <button
            onClick={() => setActiveNav('tasks')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeNav === 'tasks'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span>{tr('传输中心', '傳輸中心', 'Transfers')}</span>
            {activeTasksCount > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold animate-pulse">
                {activeTasksCount}
              </span>
            ) : tasks.length > 0 ? (
              <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                {tasks.length}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setActiveNav('remotes')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeNav === 'remotes'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <Cloud className="w-3.5 h-3.5 shrink-0" />
            <span>{tr('存储源', '儲存源', 'Remotes')}</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[10px]">
              {remotes.length}
            </span>
          </button>

          <button
            onClick={() => setActiveNav('schedules')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeNav === 'schedules'
                ? 'bg-sky-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
            <span>{tr('定时任务', '排程任務', 'Scheduler')}</span>
            {enabledSchedulesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                {enabledSchedulesCount}
              </span>
            )}
          </button>
        </nav>

        {/* Right: Global Controls (Theme, Language, Filter Rules, Security Center, Logout) */}
        <div className="flex items-center gap-1.5 justify-self-end whitespace-nowrap">
          {/* Theme Selector */}
          <div className="relative flex items-center">
            <Palette className="w-3.5 h-3.5 text-sky-400 absolute left-2.5 pointer-events-none" />
            <select
              value={theme}
              onChange={(e) => setTheme(e.target.value as ThemeId)}
              title={tr('切换界面风格主题', '切換介面風格主題', 'Switch UI Theme')}
              className="bg-slate-950 border border-slate-800 hover:border-sky-500/50 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {tr(opt.zhCN, opt.zhTW, opt.en)}
                </option>
              ))}
            </select>
          </div>

          {/* Language Selector */}
          <div className="relative flex items-center">
            <Globe className="w-3.5 h-3.5 text-emerald-400 absolute left-2.5 pointer-events-none" />
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleCode)}
              title={tr('切换语言', '切換語言', 'Switch Language')}
              className="bg-slate-950 border border-slate-800 hover:border-sky-500/50 rounded-lg pl-7 pr-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              {LOCALE_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Rules Button */}
          <button
            onClick={() => setFilterModalOpen(true)}
            title={tr(
              `全局文件/文件夹过滤规则 (已启用 ${activeFilterCount} 项，如群晖 @eaDir、#recycle)`,
              `全域檔案/資料夾過濾規則 (已啟用 ${activeFilterCount} 項，如群暉 @eaDir、#recycle)`,
              `Global Exclude Filter Rules (${activeFilterCount} active, e.g. Synology @eaDir)`
            )}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-950 border border-slate-800 text-sky-400 hover:border-sky-500/50 transition-colors"
          >
            <Filter className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">
              {tr('过滤规则', '過濾規則', 'Filters')}
            </span>
            {activeFilterCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-sky-500/20 text-sky-300 text-[10px] font-mono">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Security Center Button */}
          <button
            onClick={() => setSecurityModalOpen(true)}
            title={tr(
              '安全与密码中心 (/config/auth.json)',
              '安全與密碼中心 (/config/auth.json)',
              'Security & Password Center (/config/auth.json)'
            )}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              authRequired
                ? 'bg-slate-950 border-slate-800 text-emerald-400 hover:border-emerald-500/50'
                : 'bg-amber-950/30 border-amber-700/50 text-amber-300 hover:border-amber-500'
            }`}
          >
            <Shield className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden lg:inline">
              {tr('安全中心', '安全中心', 'Security')}
            </span>
          </button>

          {authRequired && (
            <button
              onClick={handleLogout}
              title={tr('退出登录', '登出', 'Sign Out')}
              className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-rose-400"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content Workspace */}
      <main className="flex-1 p-3 overflow-hidden">
        {activeNav === 'explorer' && (
          <div
            className={`h-full grid gap-3 ${
              dualPane ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
            }`}
          >
            <FilePane
              paneSide={dualPane ? 'left' : 'single'}
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
              onPreviewFile={(remote, entry) => setPreviewTarget({ remote, entry })}
              onTriggerTransfer={handleTriggerExplorerTransfer}
              onNotify={notify}
              refreshSignal={refreshSignal}
              globalExclude={globalExclude}
              hideFilteredInExplorer={hideFilteredInExplorer}
              onOpenFilterModal={() => setFilterModalOpen(true)}
              dualPane={dualPane}
              onToggleDualPane={() => setDualPane(!dualPane)}
            />

            {dualPane && (
              <FilePane
                paneSide="right"
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
                onPreviewFile={(remote, entry) => setPreviewTarget({ remote, entry })}
                onTriggerTransfer={handleTriggerExplorerTransfer}
                onNotify={notify}
                refreshSignal={refreshSignal}
                globalExclude={globalExclude}
                hideFilteredInExplorer={hideFilteredInExplorer}
                onOpenFilterModal={() => setFilterModalOpen(true)}
                dualPane={dualPane}
                onToggleDualPane={() => setDualPane(!dualPane)}
              />
            )}
          </div>
        )}

        {activeNav === 'tasks' && (
          <TasksView
            tasks={tasks}
            remotes={remotes}
            globalBwLimit={globalBwLimit}
            globalExclude={globalExclude}
            totalSpeed={totalSpeed}
            onRefreshTasks={loadTasksAndStatus}
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
            onRefreshSchedules={loadSchedules}
            onRefreshTasks={loadTasksAndStatus}
            onSwitchToTasks={() => setActiveNav('tasks')}
            onOpenFilterModal={() => setFilterModalOpen(true)}
            onNotify={notify}
          />
        )}
      </main>

      {/* Bottom Live Status Bar */}
      <footer className="flex flex-wrap items-center justify-between gap-2 px-4 py-1.5 bg-slate-900 border-t border-slate-800/90 text-[11px] text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                systemStatus?.rcloneAvailable ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            <strong className="text-slate-200 font-mono">
              Rclone {systemStatus?.rcloneVersion || '...'}
              {systemStatus?.rcloneUpdateAvailable && systemStatus?.rcloneLatestVersion ? (
                <>
                  <span className="text-slate-400 mx-1">/</span>
                  <span className="text-amber-300">{systemStatus.rcloneLatestVersion}</span>
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
              onClick={() => setActiveNav('tasks')}
              className="flex items-center gap-1.5 text-sky-400 hover:underline font-mono"
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

      {/* File Preview Modal */}
      {previewTarget && (
        <PreviewModal
          remote={previewTarget.remote}
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
          loadTasksAndStatus();
        }}
        onLogout={handleLogout}
        onNotify={notify}
      />

      {/* Floating Toasts */}
      <div className="fixed bottom-9 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 px-3.5 py-2.5 rounded-xl shadow-xl border text-xs font-medium backdrop-blur-md transition-all ${
              t.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-700/80 text-emerald-200'
                : t.type === 'error'
                  ? 'bg-rose-950/90 border-rose-700/80 text-rose-200'
                  : 'bg-slate-900/95 border-slate-700 text-slate-200'
            }`}
          >
            {t.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : t.type === 'error' ? (
              <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <Activity className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
