import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Filter,
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
import { formatBytes, formatDateTime, formatEta, formatSpeed } from '../utils/format';

interface TasksViewProps {
  tasks: TransferTask[];
  remotes: RemoteInfo[];
  globalBwLimit: string;
  globalExclude: string;
  totalSpeed: number;
  onRefreshTasks: () => void;
  onOpenFilterModal: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  remotes,
  globalBwLimit,
  globalExclude,
  totalSpeed,
  onRefreshTasks,
  onOpenFilterModal,
  onNotify,
}) => {
  const { tr } = useI18n();
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [showNewModal, setShowNewModal] = useState(false);

  // New task form state
  const [name, setName] = useState('');
  const [operation, setOperation] = useState<TransferOperation>('copy');
  const [srcRemote, setSrcRemote] = useState(remotes[0]?.name || '@media');
  const [srcPath, setSrcPath] = useState('');
  const [dstRemote, setDstRemote] = useState(remotes[1]?.name || remotes[0]?.name || '@media');
  const [dstPath, setDstPath] = useState('Backups');
  const [dryRun, setDryRun] = useState(false);
  const [bwlimit, setBwlimit] = useState('');
  const [transfers, setTransfers] = useState(4);
  const [exclude, setExclude] = useState('');
  const [createEmptySrcDirs, setCreateEmptySrcDirs] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const bwOptions = [
    { label: tr('不限速 (Unlimited)', '不限速 (Unlimited)', 'Unlimited'), value: 'off' },
    { label: '1 MB/s', value: '1M' },
    { label: '2 MB/s', value: '2M' },
    { label: '5 MB/s', value: '5M' },
    { label: '10 MB/s', value: '10M' },
    { label: '20 MB/s', value: '20M' },
    { label: '50 MB/s', value: '50M' },
    { label: '100 MB/s', value: '100M' },
  ];

  const toggleLogs = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBwLimitChange = async (val: string) => {
    try {
      await api.setGlobalBwLimit(val);
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

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createTask({
        name: name.trim() || undefined,
        operation,
        srcRemote,
        srcPath,
        dstRemote,
        dstPath,
        options: {
          dryRun,
          bwlimit: bwlimit.trim() || undefined,
          transfers,
          exclude: exclude.trim() || undefined,
          createEmptySrcDirs,
        },
      });
      setShowNewModal(false);
      setName('');
      onNotify(
        tr(
          '任务已加入队列并开始执行',
          '任務已加入佇列並開始執行',
          'Task queued and started'
        ),
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

  const handleCancel = async (id: string) => {
    try {
      await api.cancelTask(id);
      onNotify(tr('已取消该任务', '已取消該任務', 'Task cancelled'), 'info');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('取消失败', '取消失敗', 'Failed to cancel task'), 'error');
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

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTask(id);
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('删除失败', '刪除失敗', 'Delete failed'), 'error');
    }
  };

  const handleClearCompleted = async () => {
    try {
      await api.clearCompletedTasks();
      onNotify(
        tr('已清理历史完成的任务记录', '已清理歷史完成的任務記錄', 'Cleared finished tasks'),
        'info'
      );
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('清理失败', '清理失敗', 'Clear failed'), 'error');
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {tr('运行 / 暂停 / 排队任务', '執行 / 暫停 / 排隊任務', 'Active / Paused / Queued')}
            </p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{runningCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {tr('实时总传输速度', '即時總傳輸速度', 'Live Transfer Speed')}
            </p>
            <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
              {formatSpeed(totalSpeed)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Gauge className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">
              {tr('已完成 / 失败任务', '已完成 / 失敗任務', 'Completed / Failed')}
            </p>
            <p className="text-2xl font-bold text-slate-100 mt-1">
              <span className="text-emerald-400">{completedCount}</span>
              <span className="text-slate-600 mx-1.5">/</span>
              <span className="text-rose-400">{failedCount}</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
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
          <select
            value={globalBwLimit}
            onChange={(e) => handleBwLimitChange(e.target.value)}
            className="mt-2 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {bwOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-1">
          {[
            { id: 'all', label: `${tr('全部', '全部', 'All')} (${tasks.length})` },
            { id: 'active', label: `${tr('进行中', '進行中', 'Active')} (${runningCount})` },
            { id: 'completed', label: `${tr('已完成', '已完成', 'Completed')} (${completedCount})` },
            { id: 'failed', label: `${tr('异常/取消', '異常/取消', 'Failed/Cancelled')} (${failedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenFilterModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-sky-300 text-xs font-medium transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>
              {tr('全局过滤规则', '全域過濾規則', 'Filter Rules')} (
              {parseExcludePatterns(globalExclude).length})
            </span>
          </button>
          {(completedCount > 0 || failedCount > 0) && (
            <button
              onClick={handleClearCompleted}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{tr('清理已结束记录', '清理已結束記錄', 'Clear Finished')}</span>
            </button>
          )}
          <button
            onClick={() => setShowNewModal(true)}
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

            return (
              <div
                key={task.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 transition-all space-y-3"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Status Icon */}
                    {task.status === 'running' && (
                      <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                    )}
                    {task.status === 'queued' && (
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    {task.status === 'paused' && (
                      <Pause className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    {task.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    {task.status === 'failed' && (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    {task.status === 'cancelled' && (
                      <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                    )}

                    {/* Operation Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        task.operation === 'sync'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : task.operation === 'move'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      }`}
                    >
                      {task.operation}
                    </span>

                    {isPaused && (
                      <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                        {tr('已暂停', '已暫停', 'PAUSED')}
                      </span>
                    )}

                    {task.options.dryRun && (
                      <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                        DRY-RUN
                      </span>
                    )}

                    {task.triggeredBy === 'schedule' && (
                      <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px]">
                        {tr('定时任务', '排程任務', 'Scheduled')}
                      </span>
                    )}

                    <h4 className="text-sm font-semibold text-slate-100">{task.name}</h4>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleLogs(task.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                        isLogsOpen
                          ? 'bg-slate-800 border-sky-500/50 text-sky-300'
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-sky-300 border border-slate-800 text-xs transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>.log</span>
                    </a>

                    {isRunningOrQueued ? (
                      <>
                        <button
                          onClick={() => handlePause(task.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-medium"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>{tr('暂停', '暫停', 'Pause')}</span>
                        </button>
                        <button
                          onClick={() => handleCancel(task.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>{tr('取消', '取消', 'Cancel')}</span>
                        </button>
                      </>
                    ) : isPaused ? (
                      <>
                        <button
                          onClick={() => handleResume(task.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-medium"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>{tr('恢复', '恢復', 'Resume')}</span>
                        </button>
                        <button
                          onClick={() => handleCancel(task.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium"
                        >
                          <Square className="w-3 h-3 fill-current" />
                          <span>{tr('取消', '取消', 'Cancel')}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRetry(task.id)}
                          title={tr('重新执行此任务', '重新執行此任務', 'Retry Task')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>{tr('重试', '重試', 'Retry')}</span>
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          title={tr('删除记录', '刪除記錄', 'Delete Record')}
                          className="p-1 rounded-lg bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Source -> Destination Path Info */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono bg-slate-950/70 border border-slate-800/80 rounded-lg px-3 py-2 text-slate-300">
                  <span className="text-sky-400">{task.srcRemote}:</span>
                  <span>/{task.srcPath}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 mx-1 shrink-0" />
                  <span className="text-emerald-400">{task.dstRemote}:</span>
                  <span>/{task.dstPath}</span>
                </div>

                {/* Progress Bar & Metrics */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-slate-300">
                      <span className="font-semibold text-sky-400">{task.progress}%</span>
                      <span>
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
                          <span className="text-emerald-400">{formatSpeed(task.speed)}</span>
                          <span className="text-slate-400">ETA: {formatEta(task.eta)}</span>
                        </>
                      )}
                      {task.status === 'paused' && (
                        <span className="text-amber-400">
                          {tr('已暂停传输', '已暫停傳輸', 'Paused')}
                        </span>
                      )}
                      {task.completedAt && (
                        <span className="text-slate-500 text-[11px]">
                          {tr('结束于', '結束於', 'Finished at')} {formatDateTime(task.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all duration-300 ${
                        task.status === 'completed'
                          ? 'bg-emerald-500'
                          : task.status === 'failed'
                            ? 'bg-rose-500'
                            : task.status === 'paused'
                              ? 'bg-amber-500'
                              : task.status === 'cancelled'
                                ? 'bg-slate-600'
                                : 'bg-gradient-to-r from-sky-500 to-indigo-500'
                      }`}
                      style={{ width: `${Math.max(2, task.progress)}%` }}
                    />
                  </div>
                </div>

                {/* Active Transferring Sub-files */}
                {task.activeFiles && task.activeFiles.length > 0 && (
                  <div className="bg-slate-950/50 border border-slate-800/60 rounded-lg p-2.5 space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-400">
                      {tr('正在传输文件', '正在傳輸檔案', 'Transferring files')} (
                      {task.activeFiles.length}):
                    </p>
                    {task.activeFiles.slice(0, 4).map((af, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] gap-2">
                        <span className="text-slate-300 truncate font-mono">{af.name}</span>
                        <span className="text-slate-400 shrink-0 font-mono">
                          {af.percentage}% ({formatSpeed(af.speed)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error Alert & Failed Files List */}
                {(task.error || (task.failedFiles && task.failedFiles.length > 0)) && (
                  <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded-lg p-3 space-y-2">
                    {task.failedFiles && task.failedFiles.length > 0 ? (
                      <>
                        <div className="flex items-center justify-between font-semibold text-rose-200">
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
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
                              className="p-2 rounded bg-slate-950/80 border border-rose-900/60 flex flex-col gap-0.5 select-text"
                            >
                              <span className="text-rose-200 font-semibold break-all">
                                📄 {ff.file}
                              </span>
                              <span className="text-rose-400/90 break-all">{ff.error}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="font-mono select-text">
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
                        <span className="text-sky-300">
                          /config/logs/{task.logFileName || `${task.id}.log`}
                        </span>
                      </span>
                      <div className="flex items-center gap-3 shrink-0">
                        <a
                          href={api.getTaskLogDownloadUrl(task.id, true)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-slate-300 hover:text-sky-400"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>{tr('新窗口查看完整日志', '新視窗檢視完整日誌', 'View Raw .log')}</span>
                        </a>
                        <a
                          href={api.getTaskLogDownloadUrl(task.id, false)}
                          download={task.logFileName || `task-${task.id}.log`}
                          className="inline-flex items-center gap-1 text-sky-400 hover:underline font-medium"
                        >
                          <Download className="w-3 h-3" />
                          <span>{tr('下载完整 .log', '下載完整 .log', 'Download Full .log')}</span>
                        </a>
                      </div>
                    </div>
                    <div className="p-3 max-h-60 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 select-text">
                      {task.logs.length === 0 ? (
                        <p className="text-slate-500">
                          {tr('暂无日志输出...', '暫無日誌輸出...', 'No logs yet...')}
                        </p>
                      ) : (
                        task.logs.map((line, idx) => (
                          <div
                            key={idx}
                            className={
                              line.includes('[ERROR]') || line.includes('[FAILED]')
                                ? 'text-rose-400'
                                : line.includes('[SUCCESS]') || line.includes('[RESUMED]')
                                  ? 'text-emerald-400'
                                  : line.includes('[PAUSED]')
                                    ? 'text-amber-400'
                                    : line.includes('[CMD]') || line.includes('[PROXY]')
                                      ? 'text-sky-400'
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
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateTask}
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
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
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {tr('操作类型 (Operation)', '操作類型 (Operation)', 'Operation')}
                  </label>
                  <select
                    value={operation}
                    onChange={(e) => setOperation(e.target.value as TransferOperation)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              {/* Source */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <p className="font-semibold text-sky-400">
                  {tr('源端 (Source)', '來源端 (Source)', 'Source')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-slate-400 mb-1">
                      {tr('源 Remote', '來源 Remote', 'Source Remote')}
                    </label>
                    <select
                      value={srcRemote}
                      onChange={(e) => setSrcRemote(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
                    >
                      {remotes.map((r) => (
                        <option key={r.name} value={r.name}>
                          {r.name === '@media'
                            ? tr('本地 (/media)', '本機 (/media)', 'Local (/media)')
                            : `${r.name}: (${r.type})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 mb-1">
                      {tr('源路径', '來源路徑', 'Source Path')}
                    </label>
                    <input
                      type="text"
                      value={srcPath}
                      onChange={(e) => setSrcPath(e.target.value)}
                      placeholder="Documents"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Destination */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <p className="font-semibold text-emerald-400">
                  {tr('目标端 (Destination)', '目標端 (Destination)', 'Destination')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-slate-400 mb-1">
                      {tr('目标 Remote', '目標 Remote', 'Destination Remote')}
                    </label>
                    <select
                      value={dstRemote}
                      onChange={(e) => setDstRemote(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
                    >
                      {remotes.map((r) => (
                        <option key={r.name} value={r.name}>
                          {r.name === '@media'
                            ? tr('本地 (/media)', '本機 (/media)', 'Local (/media)')
                            : `${r.name}: (${r.type})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 mb-1">
                      {tr('目标路径', '目標路徑', 'Destination Path')}
                    </label>
                    <input
                      type="text"
                      value={dstPath}
                      onChange={(e) => setDstPath(e.target.value)}
                      placeholder="Backups/2026"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                    />
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
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
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
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
                    className="text-sky-400 hover:underline font-medium"
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

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                {tr('取消', '取消', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>{tr('立即启动任务', '立即啟動任務', 'Start Task')}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
