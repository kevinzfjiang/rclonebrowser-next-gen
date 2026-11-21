import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Filter,
  FolderSearch,
  Gauge,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  RemoteInfo,
  TransferOperation,
  TransferTask,
} from '../../shared/types';
import {
  FILTER_PRESETS,
  mergeExcludePatterns,
  parseExcludePatterns,
} from '../../shared/filterPresets';
import { api } from '../api';
import { useI18n } from '../i18n';
import {
  formatBytes,
  formatDateTime,
  formatEta,
  formatRemoteFullPath,
  formatSpeed,
} from '../utils/format';
import { ALERT_TONES, BADGE_TONES, TEXT_TONES, TINT_BUTTON_TONES } from '../utils/themeStyles';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Modal } from './ui/Modal';
import { PathPickerModal } from './ui/PathPickerModal';
import { RemoteSelect } from './ui/RemoteSelect';
import { Sparkline } from './ui/Sparkline';

interface TasksViewProps {
  tasks: TransferTask[];
  remotes: RemoteInfo[];
  globalBwLimit: string;
  globalExclude: string;
  totalSpeed: number;
  speedHistory: number[];
  highlightTaskId?: string | null;
  onClearHighlightTask?: () => void;
  onRefreshTasks: () => void;
  onOpenFilterModal: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const BW_PRESET_VALUES = ['off', '1M', '2M', '5M', '10M', '20M', '50M', '100M'];

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  remotes,
  globalBwLimit,
  globalExclude,
  totalSpeed,
  speedHistory,
  highlightTaskId,
  onClearHighlightTask,
  onRefreshTasks,
  onOpenFilterModal,
  onNotify,
}) => {
  const { locale, tr } = useI18n();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [logErrorOnly, setLogErrorOnly] = useState<Record<string, boolean>>({});
  const [logAutoFollow, setLogAutoFollow] = useState<Record<string, boolean>>({});
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [expandedActiveFiles, setExpandedActiveFiles] = useState<Set<string>>(new Set());
  const [showNewModal, setShowNewModal] = useState(false);

  // Custom global bandwidth editor
  const [editingCustomBw, setEditingCustomBw] = useState(false);
  const [customBwVal, setCustomBwVal] = useState('');

  // Confirmation dialog state
  const [confirmState, setConfirmState] = useState<{
    type: 'cancel' | 'delete' | 'clear';
    task?: TransferTask;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // New task form state
  const [name, setName] = useState('');
  const [operation, setOperation] = useState<TransferOperation>('copy');
  const [srcRemote, setSrcRemote] = useState(remotes[0]?.name || '@media');
  const [srcPath, setSrcPath] = useState('');
  const [dstRemote, setDstRemote] = useState(remotes[1]?.name || remotes[0]?.name || '@media');
  const [dstPath, setDstPath] = useState('');
  const [dryRun, setDryRun] = useState(false);
  const [bwlimit, setBwlimit] = useState('');
  const [transfers, setTransfers] = useState(4);
  const [exclude, setExclude] = useState('');
  const [createEmptySrcDirs, setCreateEmptySrcDirs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pathPickerSide, setPathPickerSide] = useState<'src' | 'dst' | null>(null);

  const taskCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const logContainerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Deep-link highlight & auto-expand logs from SchedulesView
  useEffect(() => {
    if (!highlightTaskId) return;
    setFilter('all');
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      next.add(highlightTaskId);
      return next;
    });
    const timer = setTimeout(() => {
      const el = taskCardRefs.current[highlightTaskId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      onClearHighlightTask?.();
    }, 100);
    return () => clearTimeout(timer);
  }, [highlightTaskId, onClearHighlightTask]);

  // Auto-scroll open logs for running tasks when Follow is enabled (default true)
  useEffect(() => {
    for (const task of tasks) {
      if (!expandedLogs.has(task.id)) continue;
      const shouldFollow = logAutoFollow[task.id] ?? task.status === 'running';
      if (!shouldFollow) continue;
      const el = logContainerRefs.current[task.id];
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [tasks, expandedLogs, logAutoFollow]);

  const bwOptions = useMemo(
    () => [
      { label: tr('不限速 (Unlimited)', '不限速 (Unlimited)', 'Unlimited'), value: 'off' },
      { label: '1 MB/s', value: '1M' },
      { label: '2 MB/s', value: '2M' },
      { label: '5 MB/s', value: '5M' },
      { label: '10 MB/s', value: '10M' },
      { label: '20 MB/s', value: '20M' },
      { label: '50 MB/s', value: '50M' },
      { label: '100 MB/s', value: '100M' },
    ],
    [tr]
  );

  const isCustomBwActive = !BW_PRESET_VALUES.includes(globalBwLimit);
  const peakSpeed = useMemo(() => Math.max(...speedHistory, totalSpeed, 0), [speedHistory, totalSpeed]);

  const openNewTaskModal = () => {
    setName('');
    setOperation('copy');
    setSrcRemote(remotes[0]?.name || '@media');
    setSrcPath('');
    setDstRemote(remotes[1]?.name || remotes[0]?.name || '@media');
    setDstPath('');
    setDryRun(false);
    setBwlimit('');
    setTransfers(4);
    setExclude('');
    setCreateEmptySrcDirs(true);
    setShowNewModal(true);
  };

  const toggleLogs = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyLogs = async (task: TransferTask) => {
    try {
      await navigator.clipboard.writeText(task.logs.join('\n'));
      setCopiedLogId(task.id);
      setTimeout(() => setCopiedLogId(null), 1600);
    } catch {
      onNotify(tr('复制日志失败', '複製日誌失敗', 'Failed to copy logs'), 'error');
    }
  };

  const handleBwLimitChange = async (val: string) => {
    if (val === '__custom__') {
      setCustomBwVal(globalBwLimit === 'off' ? '15M' : globalBwLimit);
      setEditingCustomBw(true);
      return;
    }
    try {
      await api.setGlobalBwLimit(val);
      setEditingCustomBw(false);
      const label = val === 'off' ? tr('不限速', '不限速', 'Unlimited') : val;
      onNotify(
        tr(
          `全局带宽限制已更新为: ${label}`,
          `全域頻寬限制已更新為: ${label}`,
          `Global bandwidth limit set to: ${label}`
        ),
        'success'
      );
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('设置限速失败', '設定限速失敗', 'Failed to set limit'), 'error');
    }
  };

  const handleSubmitCustomBw = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customBwVal.trim();
    if (!cleaned) return;
    await handleBwLimitChange(cleaned);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createTask({
        name: name.trim() || undefined,
        operation,
        srcRemote,
        srcPath: srcPath.trim(),
        dstRemote,
        dstPath: dstPath.trim(),
        options: {
          dryRun,
          bwlimit: bwlimit.trim() || undefined,
          transfers: Math.max(1, Math.min(32, Number(transfers) || 4)),
          exclude: exclude.trim() || undefined,
          createEmptySrcDirs,
        },
      });
      setShowNewModal(false);
      onNotify(
        tr('任务已加入队列并开始执行', '任務已加入佇列並開始執行', 'Task queued and started'),
        'success'
      );
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('创建任务失败', '建立任務失敗', 'Failed to create task'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePause = async (id: string) => {
    try {
      await api.pauseTask(id);
      onNotify(tr('任务已暂停', '任務已暫停', 'Task paused'), 'info');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('暂停失败', '暫停失敗', 'Failed to pause task'), 'error');
    }
  };

  const handleResume = async (id: string) => {
    try {
      await api.resumeTask(id);
      onNotify(tr('任务已恢复执行', '任務已恢復執行', 'Task resumed'), 'success');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('恢复失败', '恢復失敗', 'Failed to resume task'), 'error');
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await api.retryTask(id);
      onNotify(tr('已重新提交任务', '已重新提交任務', 'Task restarted'), 'success');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('重试失败', '重試失敗', 'Failed to retry task'), 'error');
    }
  };

  const executeConfirmAction = async () => {
    if (!confirmState) return;
    setConfirmBusy(true);
    try {
      if (confirmState.type === 'cancel' && confirmState.task) {
        await api.cancelTask(confirmState.task.id);
        onNotify(tr('已取消该任务', '已取消該任務', 'Task cancelled'), 'info');
      } else if (confirmState.type === 'delete' && confirmState.task) {
        await api.deleteTask(confirmState.task.id);
        onNotify(tr('已删除任务记录', '已刪除任務記錄', 'Task record deleted'), 'info');
      } else if (confirmState.type === 'clear') {
        await api.clearCompletedTasks();
        onNotify(
          tr('已清理历史完成的任务记录', '已清理歷史完成的任務記錄', 'Cleared finished tasks'),
          'info'
        );
      }
      setConfirmState(null);
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('操作失败', '操作失敗', 'Action failed'), 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active')
      return t.status === 'running' || t.status === 'queued' || t.status === 'paused';
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'failed') return t.status === 'failed' || t.status === 'cancelled';
    return true;
  });

  const runningCount = tasks.filter(
    (t) => t.status === 'running' || t.status === 'queued' || t.status === 'paused'
  ).length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled').length;

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Top KPI Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {tr('运行 / 暂停 / 排队任务', '執行 / 暫停 / 排隊任務', 'Active / Paused / Queued')}
            </p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{runningCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* Live Transfer Speed with Sparkline */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-400">
                {tr('实时总传输速度', '即時總傳輸速度', 'Live Transfer Speed')}
              </p>
              <p className={`text-xl font-bold font-mono mt-0.5 truncate ${TEXT_TONES.emerald}`}>
                {formatSpeed(totalSpeed)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 inline-flex">
                <Gauge className="w-4 h-4" />
              </div>
              {peakSpeed > 0 && (
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  Peak {formatSpeed(peakSpeed)}
                </div>
              )}
            </div>
          </div>
          <Sparkline data={speedHistory} height={24} />
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {tr('已完成 / 失败任务', '已完成 / 失敗任務', 'Completed / Failed')}
            </p>
            <p className="text-2xl font-bold text-slate-100 mt-1">
              <span className={TEXT_TONES.emerald}>{completedCount}</span>
              <span className="text-slate-600 mx-1.5">/</span>
              <span className={TEXT_TONES.rose}>{failedCount}</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {tr(
                '默认全局带宽限速 (--bwlimit)',
                '預設全域頻寬限速 (--bwlimit)',
                'Global Bandwidth Limit (--bwlimit)'
              )}
            </span>
          </div>
          {editingCustomBw ? (
            <form onSubmit={handleSubmitCustomBw} className="mt-2 flex items-center gap-1.5">
              <input
                type="text"
                autoFocus
                value={customBwVal}
                onChange={(e) => setCustomBwVal(e.target.value)}
                placeholder="e.g. 8M / 500K"
                className="flex-1 min-w-0 bg-slate-950 border border-sky-500 rounded-lg px-2 py-1 text-xs font-mono text-slate-100 focus:outline-none"
              />
              <button
                type="submit"
                className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setEditingCustomBw(false)}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>
          ) : (
            <select
              value={globalBwLimit}
              onChange={(e) => handleBwLimitChange(e.target.value)}
              className="mt-2 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              {isCustomBwActive && (
                <option value={globalBwLimit}>
                  {tr('自定义', '自訂', 'Custom')}: {globalBwLimit}
                </option>
              )}
              {bwOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="__custom__">
                ✎ {tr('输入自定义限速...', '輸入自訂限速...', 'Custom limit...')}
              </option>
            </select>
          )}
        </div>
      </div>

      {/* Filter & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-2.5 shrink-0 select-none">
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { id: 'all', label: `${tr('全部', '全部', 'All')} (${tasks.length})` },
            { id: 'active', label: `${tr('进行中', '進行中', 'Active')} (${runningCount})` },
            { id: 'completed', label: `${tr('已完成', '已完成', 'Completed')} (${completedCount})` },
            { id: 'failed', label: `${tr('异常/取消', '異常/取消', 'Failed/Cancelled')} (${failedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.id
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenFilterModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-sky-600 dark:text-sky-300 text-xs font-medium transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>
              {tr('全局过滤规则', '全域過濾規則', 'Filter Rules')} (
              {parseExcludePatterns(globalExclude).length})
            </span>
          </button>
          {(completedCount > 0 || failedCount > 0) && (
            <button
              type="button"
              onClick={() => setConfirmState({ type: 'clear' })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{tr('清理已结束记录', '清理已結束記錄', 'Clear Finished')}</span>
            </button>
          )}
          <button
            type="button"
            onClick={openNewTaskModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-lg shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('新建传输 / 同步任务', '新增傳輸 / 同步任務', 'New Transfer / Sync Task')}</span>
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-slate-900/40 border border-slate-800/60 rounded-xl text-slate-500 gap-2">
            <Activity className="w-8 h-8 stroke-1 text-slate-600" />
            <p className="text-xs">
              {tr(
                '暂无符合条件的传输或同步任务',
                '暫無符合條件的傳輸或同步任務',
                'No transfer or sync tasks found'
              )}
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isLogsOpen = expandedLogs.has(task.id);
            const isRunningOrQueued = task.status === 'running' || task.status === 'queued';
            const isPaused = task.status === 'paused';
            const showErrorsOnly = Boolean(logErrorOnly[task.id]);
            const followLogs = logAutoFollow[task.id] ?? task.status === 'running';
            const displayedLogs = showErrorsOnly
              ? task.logs.filter((l) => l.includes('[ERROR]') || l.includes('[FAILED]'))
              : task.logs;
            const activeFilesExpanded = expandedActiveFiles.has(task.id);
            const visibleActiveFiles = activeFilesExpanded
              ? task.activeFiles
              : task.activeFiles.slice(0, 4);

            const opBadge =
              task.operation === 'sync'
                ? BADGE_TONES.emerald
                : task.operation === 'move'
                  ? BADGE_TONES.amber
                  : task.operation === 'check'
                    ? BADGE_TONES.cyan
                    : BADGE_TONES.sky;

            return (
              <div
                key={task.id}
                ref={(el) => {
                  taskCardRefs.current[task.id] = el;
                }}
                className={`bg-slate-900/80 border rounded-xl p-4 transition-all space-y-3 ${
                  highlightTaskId === task.id
                    ? 'border-sky-500 ring-2 ring-sky-500/30'
                    : 'border-slate-800 hover:border-slate-700/80'
                }`}
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Status Icon */}
                    {task.status === 'running' && (
                      <Loader2 className={`w-4 h-4 animate-spin shrink-0 ${TEXT_TONES.sky}`} />
                    )}
                    {task.status === 'queued' && (
                      <Clock className={`w-4 h-4 shrink-0 ${TEXT_TONES.amber}`} />
                    )}
                    {task.status === 'paused' && (
                      <Pause className={`w-4 h-4 shrink-0 ${TEXT_TONES.amber}`} />
                    )}
                    {task.status === 'completed' && (
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${TEXT_TONES.emerald}`} />
                    )}
                    {task.status === 'failed' && (
                      <AlertCircle className={`w-4 h-4 shrink-0 ${TEXT_TONES.rose}`} />
                    )}
                    {task.status === 'cancelled' && (
                      <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                    )}

                    {/* Operation Badge */}
                    <span
                      className={`px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${opBadge}`}
                    >
                      {task.operation}
                    </span>

                    {isPaused && (
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-bold ${BADGE_TONES.amber}`}
                      >
                        {tr('已暂停', '已暫停', 'PAUSED')}
                      </span>
                    )}

                    {task.options.dryRun && (
                      <span
                        className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${BADGE_TONES.purple}`}
                      >
                        DRY-RUN
                      </span>
                    )}

                    {task.triggeredBy === 'schedule' && (
                      <span className={`px-2 py-0.5 rounded border text-[10px] ${BADGE_TONES.indigo}`}>
                        {tr('定时任务', '排程任務', 'Scheduled')}
                      </span>
                    )}

                    <h4 className="text-sm font-semibold text-slate-100">{task.name}</h4>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => toggleLogs(task.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                        isLogsOpen
                          ? 'bg-sky-500/15 border-sky-500/40 text-sky-700 dark:text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>
                        {tr('日志', '日誌', 'Logs')} ({task.logs.length})
                      </span>
                    </button>

                    <a
                      href={api.getTaskLogDownloadUrl(task.id, false)}
                      download={task.logFileName || `task-${task.id}.log`}
                      title={tr(
                        `下载完整日志文件 (/config/logs/${task.logFileName || ''})`,
                        `下載完整日誌檔案 (/config/logs/${task.logFileName || ''})`,
                        `Download full log file (/config/logs/${task.logFileName || ''})`
                      )}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-sky-500 dark:hover:text-sky-300 border border-slate-800 text-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>.log</span>
                    </a>

                    {isRunningOrQueued ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePause(task.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${TINT_BUTTON_TONES.amber}`}
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>{tr('暂停', '暫停', 'Pause')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmState({ type: 'cancel', task })}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${TINT_BUTTON_TONES.rose}`}
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>{tr('取消', '取消', 'Cancel')}</span>
                        </button>
                      </>
                    ) : isPaused ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleResume(task.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${TINT_BUTTON_TONES.emerald}`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{tr('恢复', '恢復', 'Resume')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmState({ type: 'cancel', task })}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${TINT_BUTTON_TONES.rose}`}
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>{tr('取消', '取消', 'Cancel')}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRetry(task.id)}
                          title={tr('重新执行此任务', '重新執行此任務', 'Retry Task')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{tr('重试', '重試', 'Retry')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmState({ type: 'delete', task })}
                          aria-label={tr('删除记录', '刪除記錄', 'Delete Record')}
                          title={tr('删除记录', '刪除記錄', 'Delete Record')}
                          className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 border border-slate-800 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Source -> Destination Path Info */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono bg-slate-950/70 border border-slate-800/80 rounded-lg px-3 py-2 text-slate-300">
                  <span className={TEXT_TONES.sky}>
                    {formatRemoteFullPath(task.srcRemote, task.srcPath, remotes)}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 mx-0.5 shrink-0" />
                  <span className={TEXT_TONES.emerald}>
                    {formatRemoteFullPath(task.dstRemote, task.dstPath, remotes)}
                  </span>
                </div>

                {/* Progress Bar & Metrics */}
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-3 text-slate-300">
                      <span className={`font-semibold font-mono ${TEXT_TONES.sky}`}>
                        {task.status === 'queued'
                          ? tr('排队中', '排隊中', 'Queued')
                          : `${task.progress}%`}
                      </span>
                      <span className="font-mono">
                        {formatBytes(task.transferredBytes)}
                        {task.totalBytes > 0 ? ` / ${formatBytes(task.totalBytes)}` : ''}
                      </span>
                      {task.totalFiles > 0 && (
                        <span className="text-slate-400">
                          ({task.filesTransferred}/{task.totalFiles} {tr('文件', '檔案', 'files')})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                      {task.status === 'running' && (
                        <>
                          <span className={TEXT_TONES.emerald}>{formatSpeed(task.speed)}</span>
                          <span className="text-slate-400">ETA: {formatEta(task.eta)}</span>
                        </>
                      )}
                      {task.status === 'paused' && (
                        <span className={TEXT_TONES.amber}>
                          {tr('已暂停传输', '已暫停傳輸', 'Paused')}
                        </span>
                      )}
                      {task.completedAt && (
                        <span className="text-slate-400 text-[11px]">
                          {tr('结束于', '結束於', 'Finished at')}{' '}
                          {formatDateTime(task.completedAt, locale)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
                    {task.status === 'queued' || (task.status === 'running' && task.progress === 0) ? (
                      <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-sky-500/40 via-sky-500 to-indigo-500/40 animate-indeterminate" />
                    ) : (
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          task.status === 'completed'
                            ? 'bg-emerald-500'
                            : task.status === 'failed'
                              ? 'bg-rose-500'
                              : task.status === 'paused'
                                ? 'bg-amber-500'
                                : task.status === 'cancelled'
                                  ? 'bg-slate-500'
                                  : 'bg-gradient-to-r from-sky-500 to-indigo-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, task.progress))}%` }}
                      />
                    )}
                  </div>
                </div>

                {/* Active Transferring Sub-files with mini progress bars */}
                {task.activeFiles && task.activeFiles.length > 0 && (
                  <div className="bg-slate-950/50 border border-slate-800/70 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-slate-400">
                        {tr('正在传输文件', '正在傳輸檔案', 'Transferring files')} (
                        {task.activeFiles.length})
                      </span>
                      {task.activeFiles.length > 4 && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedActiveFiles((prev) => {
                              const next = new Set(prev);
                              if (next.has(task.id)) next.delete(task.id);
                              else next.add(task.id);
                              return next;
                            })
                          }
                          className="inline-flex items-center gap-0.5 text-sky-600 dark:text-sky-400 hover:underline"
                        >
                          {activeFilesExpanded ? (
                            <>
                              <ChevronUp className="w-3 h-3" />
                              <span>{tr('收起', '收起', 'Collapse')}</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3 h-3" />
                              <span>
                                {tr(
                                  `展开其余 ${task.activeFiles.length - 4} 个`,
                                  `展開其餘 ${task.activeFiles.length - 4} 個`,
                                  `+${task.activeFiles.length - 4} more`
                                )}
                              </span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      {visibleActiveFiles.map((af, i) => (
                        <div key={`${af.name}-${i}`} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[11px] gap-2">
                            <span className="text-slate-300 truncate font-mono" title={af.name}>
                              {af.name}
                            </span>
                            <span className="text-slate-400 shrink-0 font-mono">
                              {af.percentage}% · {formatSpeed(af.speed)}
                            </span>
                          </div>
                          <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-sky-500 rounded-full transition-all duration-300"
                              style={{ width: `${Math.min(100, Math.max(0, af.percentage))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error Alert & Failed Files List */}
                {(task.error || (task.failedFiles && task.failedFiles.length > 0)) && (
                  <div className={`text-xs border rounded-lg p-3 space-y-2 ${ALERT_TONES.error}`}>
                    {task.failedFiles && task.failedFiles.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between font-semibold">
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className={`w-3.5 h-3.5 shrink-0 ${TEXT_TONES.rose}`} />
                            <span>
                              {tr(
                                `以下 ${task.failedFiles.length} 个文件传输失败：`,
                                `以下 ${task.failedFiles.length} 個檔案傳輸失敗：`,
                                `Failed to transfer ${task.failedFiles.length} file(s):`
                              )}
                            </span>
                          </span>
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 font-mono text-[11px]">
                          {task.failedFiles.map((ff, idx) => (
                            <div
                              key={`${ff.file}-${idx}`}
                              className="p-2 rounded bg-slate-950/75 border border-rose-500/30 flex flex-col gap-0.5 select-text"
                            >
                              <span className="text-slate-100 font-semibold break-all">
                                {ff.file}
                              </span>
                              <span className={`break-all ${TEXT_TONES.rose}`}>{ff.error}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="font-mono select-text break-all">
                        {tr('错误详情', '錯誤詳情', 'Error')}: {task.error}
                      </div>
                    )}
                  </div>
                )}

                {/* Terminal Logs Drawer */}
                {isLogsOpen && (
                  <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] text-slate-400">
                      <span className="font-mono truncate">
                        {tr('日志文件', '日誌檔案', 'Log File')}:{' '}
                        <span className={TEXT_TONES.sky}>
                          /config/logs/{task.logFileName || `${task.id}.log`}
                        </span>
                      </span>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <button
                          type="button"
                          onClick={() =>
                            setLogErrorOnly((prev) => ({ ...prev, [task.id]: !prev[task.id] }))
                          }
                          className={`px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${
                            showErrorsOnly
                              ? BADGE_TONES.rose
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {showErrorsOnly
                            ? tr('仅错误', '僅錯誤', 'Errors Only')
                            : tr('全部日志', '全部日誌', 'All Logs')}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setLogAutoFollow((prev) => ({ ...prev, [task.id]: !followLogs }))
                          }
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-colors ${
                            followLogs
                              ? BADGE_TONES.sky
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <ArrowDownToLine className="w-3 h-3" />
                          <span>{tr('自动滚动', '自動捲動', 'Follow')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyLogs(task)}
                          className="inline-flex items-center gap-1 text-slate-300 hover:text-sky-400"
                        >
                          {copiedLogId === task.id ? (
                            <Check className={`w-3 h-3 ${TEXT_TONES.emerald}`} />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>
                            {copiedLogId === task.id
                              ? tr('已复制', '已複製', 'Copied')
                              : tr('复制', '複製', 'Copy')}
                          </span>
                        </button>

                        <a
                          href={api.getTaskLogDownloadUrl(task.id, true)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-slate-300 hover:text-sky-400"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>{tr('新窗口', '新視窗', 'Raw')}</span>
                        </a>
                        <a
                          href={api.getTaskLogDownloadUrl(task.id, false)}
                          download={task.logFileName || `task-${task.id}.log`}
                          className={`inline-flex items-center gap-1 hover:underline font-medium ${TEXT_TONES.sky}`}
                        >
                          <Download className="w-3 h-3" />
                          <span>{tr('下载 .log', '下載 .log', '.log')}</span>
                        </a>
                      </div>
                    </div>

                    <div
                      ref={(el) => {
                        logContainerRefs.current[task.id] = el;
                      }}
                      className="p-3 max-h-60 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 select-text"
                    >
                      {displayedLogs.length === 0 ? (
                        <p className="text-slate-500">
                          {showErrorsOnly
                            ? tr('当前日志中没有错误记录', '目前日誌中沒有錯誤記錄', 'No error lines in logs')
                            : tr('暂无日志输出...', '暫無日誌輸出...', 'No logs yet...')}
                        </p>
                      ) : (
                        displayedLogs.map((line, idx) => (
                          <div
                            key={idx}
                            className={
                              line.includes('[ERROR]') || line.includes('[FAILED]')
                                ? TEXT_TONES.rose
                                : line.includes('[SUCCESS]') || line.includes('[RESUMED]')
                                  ? TEXT_TONES.emerald
                                  : line.includes('[PAUSED]')
                                    ? TEXT_TONES.amber
                                    : line.includes('[CMD]') || line.includes('[PROXY]')
                                      ? TEXT_TONES.sky
                                      : 'text-slate-300'
                            }
                          >
                            {line}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create New Task Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        closeDisabled={submitting}
        maxWidthClass="max-w-xl"
        ariaLabel={tr('新建传输任务', '新增傳輸任務', 'Create Transfer Task')}
      >
        <form onSubmit={handleCreateTask} className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 shrink-0">
            <h3 className="text-sm font-semibold text-slate-100">
              {tr(
                '新建 Rclone 传输 / 同步任务',
                '新增 Rclone 傳輸 / 同步任務',
                'Create Rclone Transfer / Sync Task'
              )}
            </h3>
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              aria-label={tr('关闭', '關閉', 'Close')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto text-xs flex-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {tr('操作类型 (Operation)', '操作類型 (Operation)', 'Operation')}
                </label>
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value as TransferOperation)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  <option value="copy">
                    {tr(
                      'COPY (增量复制，不删目标文件)',
                      'COPY (增量複製，不刪目標檔案)',
                      'COPY (Incremental copy, keep extra dest files)'
                    )}
                  </option>
                  <option value="sync">
                    {tr(
                      'SYNC (镜像同步，保持目标与源一致)',
                      'SYNC (鏡像同步，保持目標與來源一致)',
                      'SYNC (Mirror source to destination)'
                    )}
                  </option>
                  <option value="move">
                    {tr(
                      'MOVE (移动文件，完成后清理源文件)',
                      'MOVE (移動檔案，完成後清理來源檔案)',
                      'MOVE (Move files and delete from source)'
                    )}
                  </option>
                  <option value="check">
                    {tr(
                      'CHECK (校验源和目标文件哈希/大小)',
                      'CHECK (校驗來源與目標檔案雜湊/大小)',
                      'CHECK (Verify hashes and sizes)'
                    )}
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {tr('任务名称 (可选)', '任務名稱 (選填)', 'Task Name (Optional)')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tr(
                    '留空自动生成描述名称',
                    '留空自動產生描述名稱',
                    'Leave blank to auto-generate'
                  )}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Source */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
              <p className={`font-semibold ${TEXT_TONES.sky}`}>
                {tr('源端 (Source)', '來源端 (Source)', 'Source')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">
                    {tr('源 Remote', '來源 Remote', 'Source Remote')}
                  </label>
                  <RemoteSelect
                    remotes={remotes}
                    value={srcRemote}
                    onChange={setSrcRemote}
                    className="w-full py-2 bg-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">
                    {tr('源路径', '來源路徑', 'Source Path')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={srcPath}
                      onChange={(e) => setSrcPath(e.target.value)}
                      placeholder={tr('留空表示根目录', '留空表示根目錄', 'Leave blank for root')}
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setPathPickerSide('src')}
                      title={tr('浏览选择目录', '瀏覽選擇目錄', 'Browse folder')}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-sky-400 border border-slate-700 shrink-0 transition-colors"
                    >
                      <FolderSearch className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Destination */}
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
              <p className={`font-semibold ${TEXT_TONES.emerald}`}>
                {tr('目标端 (Destination)', '目標端 (Destination)', 'Destination')}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">
                    {tr('目标 Remote', '目標 Remote', 'Destination Remote')}
                  </label>
                  <RemoteSelect
                    remotes={remotes}
                    value={dstRemote}
                    onChange={setDstRemote}
                    className="w-full py-2 bg-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">
                    {tr('目标路径', '目標路徑', 'Destination Path')}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={dstPath}
                      onChange={(e) => setDstPath(e.target.value)}
                      placeholder="Backups/2026"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => setPathPickerSide('dst')}
                      title={tr('浏览选择目录', '瀏覽選擇目錄', 'Browse folder')}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-sky-400 border border-slate-700 shrink-0 transition-colors"
                    >
                      <FolderSearch className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Advanced Options */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">
                  {tr('并发数 (--transfers)', '並行數 (--transfers)', 'Concurrency (--transfers)')}
                </label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={transfers}
                  onChange={(e) => setTransfers(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  {tr('单任务限速 (--bwlimit)', '單任務限速 (--bwlimit)', 'Task Limit (--bwlimit)')}
                </label>
                <input
                  type="text"
                  value={bwlimit}
                  onChange={(e) => setBwlimit(e.target.value)}
                  placeholder="10M"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">
                  {tr('额外排除规则 (--exclude)', '額外排除規則 (--exclude)', 'Extra Exclude (--exclude)')}
                </label>
                <input
                  type="text"
                  value={exclude}
                  onChange={(e) => setExclude(e.target.value)}
                  placeholder="@eaDir/**, *.bak"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Quick Filter Preset Chips */}
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-400">
                  {tr(
                    `已自动叠加全局过滤规则 (${parseExcludePatterns(globalExclude).length} 项，含群晖 @eaDir/#recycle 等)`,
                    `已自動疊加全域過濾規則 (${parseExcludePatterns(globalExclude).length} 項，含群暉 @eaDir/#recycle 等)`,
                    `Global filter rules (${parseExcludePatterns(globalExclude).length} patterns incl. Synology @eaDir) are applied automatically`
                  )}
                </span>
                <button
                  type="button"
                  onClick={onOpenFilterModal}
                  className="text-sky-600 dark:text-sky-400 hover:underline font-medium"
                >
                  {tr('管理全局过滤规则 →', '管理全域過濾規則 →', 'Manage Global Rules →')}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-500">
                  {tr('快捷追加:', '捷徑追加:', 'Quick add:')}
                </span>
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      setExclude((prev) =>
                        mergeExcludePatterns(prev, preset.patterns.join(', '))
                      )
                    }
                    className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 transition-colors"
                  >
                    + {tr(preset.zhCN.split(' ')[0], preset.zhTW.split(' ')[0], preset.en.split(' ')[0])}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setExclude((prev) => mergeExcludePatterns(prev, 'node_modules/**, .git/**'))
                  }
                  className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 transition-colors"
                >
                  + node_modules/.git
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-sky-500"
                />
                <span className="text-slate-300">
                  {tr(
                    '启用模拟测试 (--dry-run，不实际改动文件)',
                    '啟用模擬測試 (--dry-run，不實際改動檔案)',
                    'Enable Dry-Run (--dry-run, simulate without modifying files)'
                  )}
                </span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createEmptySrcDirs}
                  onChange={(e) => setCreateEmptySrcDirs(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950 text-sky-500"
                />
                <span className="text-slate-300">
                  {tr(
                    '同步空目录结构 (--create-empty-src-dirs)',
                    '同步空目錄結構 (--create-empty-src-dirs)',
                    'Create empty source directories (--create-empty-src-dirs)'
                  )}
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 shrink-0">
            <button
              type="button"
              onClick={() => setShowNewModal(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
            >
              {tr('取消', '取消', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{tr('立即启动任务', '立即啟動任務', 'Start Task')}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Path Picker Modal */}
      <PathPickerModal
        isOpen={pathPickerSide !== null}
        title={
          pathPickerSide === 'src'
            ? tr('选择源目录', '選擇來源目錄', 'Select Source Folder')
            : tr('选择目标目录', '選擇目標目錄', 'Select Destination Folder')
        }
        remotes={remotes}
        initialRemote={pathPickerSide === 'src' ? srcRemote : dstRemote}
        initialPath={pathPickerSide === 'src' ? srcPath : dstPath}
        onSelect={(r, p) => {
          if (pathPickerSide === 'src') {
            setSrcRemote(r);
            setSrcPath(p);
          } else if (pathPickerSide === 'dst') {
            setDstRemote(r);
            setDstPath(p);
          }
        }}
        onClose={() => setPathPickerSide(null)}
      />

      {/* Cancel / Delete / Clear Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(confirmState)}
        tone={confirmState?.type === 'cancel' ? 'warning' : 'danger'}
        loading={confirmBusy}
        title={
          confirmState?.type === 'cancel'
            ? tr('中止正在执行的传输任务？', '中止正在執行的傳輸任務？', 'Cancel Active Transfer?')
            : confirmState?.type === 'clear'
              ? tr('清理所有已结束的任务记录？', '清理所有已結束的任務記錄？', 'Clear All Finished Tasks?')
              : tr('删除此任务记录？', '刪除此任務記錄？', 'Delete Task Record?')
        }
        message={
          confirmState?.type === 'cancel'
            ? tr(
                `确定要中止任务 "${confirmState.task?.name || ''}" 吗？当前未传输完成的文件将会停止。`,
                `確定要中止任務 "${confirmState.task?.name || ''}" 嗎？目前未傳輸完成的檔案將會停止。`,
                `Are you sure you want to cancel "${confirmState.task?.name || ''}"? In-progress transfers will be stopped.`
              )
            : confirmState?.type === 'clear'
              ? tr(
                  `将清除 ${completedCount + failedCount} 条已完成/已失败/已取消的历史任务记录（运行中或已暂停的任务不受影响）。`,
                  `將清除 ${completedCount + failedCount} 條已完成/已失敗/已取消的歷史任務記錄（執行中或已暫停的任務不受影響）。`,
                  `This will remove ${completedCount + failedCount} finished task record(s). Active and paused tasks are unaffected.`
                )
              : tr(
                  `确定要删除任务 "${confirmState?.task?.name || ''}" 的历史记录吗？`,
                  `確定要刪除任務 "${confirmState?.task?.name || ''}" 的歷史記錄嗎？`,
                  `Remove task record "${confirmState?.task?.name || ''}" from history?`
                )
        }
        confirmLabel={
          confirmState?.type === 'cancel'
            ? tr('确认中止', '確認中止', 'Stop Task')
            : tr('确认清理', '確認清理', 'Confirm')
        }
        onConfirm={executeConfirmAction}
        onClose={() => setConfirmState(null)}
      />
    </div>
  );
};
